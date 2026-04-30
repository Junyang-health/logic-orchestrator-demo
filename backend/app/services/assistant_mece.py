from __future__ import annotations

import json
from typing import Any

from app.services import project_storage
from app.services.llm_client import LlmClient
from app.services.project_source_text import collect_project_source_text
from app.services.review_apply import collect_branch_node_ids, merge_review_patch
from app.services.assistant_simulations import SIM_PATCH_SYSTEM


MECE_SCAN_SYSTEM = """You return JSON only. No markdown.

Schema:
{
  "mece_assessment": {
    "mutually_exclusive": "pass|partial|fail",
    "collectively_exhaustive": "pass|partial|fail",
    "rationale": "string",
    "overlap_pairs": [{"node_ids":["idA","idB"],"issue":"string"}],
    "coverage_gaps": ["string"]
  },
  "gaps": [{"id":"gap_1","description":"string","severity":"high|medium|low"}],
  "proposed_modifications": [
    {
      "id": "mod_1",
      "target_node_id": "existing_id",
      "target_level": 1,
      "action": "relabel|refine_metadata|split_concept|merge_duplicate|add_missing_bucket|edge_fix",
      "summary": "short",
      "detail": "what to change on the map",
      "suggested_label": "optional new label text",
      "addresses_gaps": ["gap_1"]
    }
  ]
}

Rules:
- Focus ONLY on the provided level-1 and level-2 child nodes (two hops from the anchor). Do not invent node ids.
- proposed_modifications: 3–12 items when issues exist; fewer if structure is already strong.
- Each modification MUST include addresses_gaps: list of one or more gap ids from gaps[].id that this patch fixes (never invent gap ids).
- target_node_id MUST be one of the provided level-1 or level-2 node ids.
- target_level is 1 or 2 matching that node.
- MECE: call out overlaps (same bucket twice) and missing buckets vs the anchor theme.
"""


MECE_EVIDENCE_SYSTEM = """You return JSON only. No markdown.

Schema:
{
  "results": [
    {
      "modification_id": "mod_1",
      "supported": true,
      "confidence": "high|medium|low",
      "supporting_evidence": [{"source_filename":"file.pdf","text_snippet":"short quote"}],
      "web_search_recommended": false,
      "suggested_search_query": ""
    }
  ]
}

Rules:
- Include exactly one result per input modification_id.
- supported=true only if SOURCE CORPUS (project files and/or graph evidence below) substantively backs the change direction.
- supporting_evidence: 0–4 items; each text_snippet must be copied or tightly paraphrased from the corpus (no fabrication). Use source_filename from corpus headers.
- If evidence is thin or absent, supported=false, confidence=low, web_search_recommended=true, and suggested_search_query must be a concrete web search string (not empty).
"""


def _children_map(edges: list[dict[str, Any]], all_ids: set[str]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for e in edges:
        if not isinstance(e, dict):
            continue
        s, t = str(e.get("source") or ""), str(e.get("target") or "")
        if s in all_ids and t in all_ids and s != t:
            out.setdefault(s, []).append(t)
    return out


def two_level_child_node_ids(
    *, root_id: str, full_edges: list[dict[str, Any]], all_ids: set[str]
) -> tuple[list[str], list[str]]:
    """Direct children (level 1) and their children (level 2), deduped, excluding root."""
    cmap = _children_map(full_edges, all_ids)
    if root_id not in all_ids:
        return [], []
    level1 = [tid for tid in cmap.get(root_id, []) if tid in all_ids]
    level1 = list(dict.fromkeys(level1))
    level2_raw: list[str] = []
    for p in level1:
        for tid in cmap.get(p, []):
            if tid in all_ids and tid != root_id and tid not in level1:
                level2_raw.append(tid)
    level2 = list(dict.fromkeys(level2_raw))
    return level1, level2


def _node_by_id(full_nodes: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for n in full_nodes:
        if isinstance(n, dict) and str(n.get("id") or "").strip():
            out[str(n["id"])] = n
    return out


def _pack_subtree_for_prompt(
    *,
    root_id: str,
    level1_ids: list[str],
    level2_ids: list[str],
    nodes_by_id: dict[str, dict[str, Any]],
) -> str:
    def pack(nid: str, lvl: int) -> dict[str, Any]:
        n = nodes_by_id.get(nid) or {}
        md = n.get("metadata") if isinstance(n.get("metadata"), dict) else {}
        return {
            "id": nid,
            "level": lvl,
            "type": n.get("type"),
            "label": (n.get("label") or "")[:400],
            "metadata_excerpt": json.dumps(md, ensure_ascii=False)[:600],
        }

    root = nodes_by_id.get(root_id) or {}
    root_pack = {
        "id": root_id,
        "type": root.get("type"),
        "label": (root.get("label") or "")[:400],
    }
    payload = {
        "anchor": root_pack,
        "level_1": [pack(i, 1) for i in level1_ids],
        "level_2": [pack(i, 2) for i in level2_ids],
    }
    return json.dumps(payload, ensure_ascii=False)


def _graph_evidence_corpus(*, root_id: str, full_nodes: list[dict[str, Any]], full_edges: list[dict[str, Any]]) -> str:
    all_ids = {str(n.get("id")) for n in full_nodes if isinstance(n, dict) and n.get("id")}
    edges_raw = [e for e in full_edges if isinstance(e, dict)]
    branch_ids = collect_branch_node_ids(root_id=root_id, edges=edges_raw, all_ids=all_ids)
    lines: list[str] = []
    for n in full_nodes:
        if not isinstance(n, dict):
            continue
        nid = str(n.get("id") or "")
        if nid not in branch_ids:
            continue
        if str(n.get("type") or "").strip().lower() != "evidence":
            continue
        md = n.get("metadata") if isinstance(n.get("metadata"), dict) else {}
        fn = str(md.get("source_filename") or "").strip()
        sn = str(md.get("text_snippet") or "").strip() or str(n.get("label") or "").strip()
        if not sn:
            continue
        lines.append(f"### EvidenceNode {nid} file={fn or 'unknown'}\n{sn[:900]}")
    return "\n\n".join(lines[:80]) if lines else "(no Evidence nodes in this subtree)"


def _validate_scan_payload(
    data: Any,
    *,
    allowed_targets: set[str],
) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("MECE scan: expected JSON object")
    assess = data.get("mece_assessment")
    if not isinstance(assess, dict):
        raise ValueError("MECE scan: missing mece_assessment")
    gaps_raw = data.get("gaps")
    if not isinstance(gaps_raw, list):
        gaps_raw = []
    gaps: list[dict[str, Any]] = []
    for g in gaps_raw[:24]:
        if not isinstance(g, dict):
            continue
        gid = str(g.get("id") or "").strip() or f"gap_{len(gaps)+1}"
        desc = str(g.get("description") or "").strip()
        if not desc:
            continue
        sev = str(g.get("severity") or "medium").lower()
        if sev not in ("high", "medium", "low"):
            sev = "medium"
        gaps.append({"id": gid[:48], "description": desc[:1200], "severity": sev})
    gap_ids_allowed = {g["id"] for g in gaps}
    mods_raw = data.get("proposed_modifications")
    if not isinstance(mods_raw, list) or len(mods_raw) < 1:
        raise ValueError("MECE scan: expected proposed_modifications")
    mods: list[dict[str, Any]] = []
    seen: set[str] = set()
    for m in mods_raw[:24]:
        if not isinstance(m, dict):
            continue
        mid = str(m.get("id") or "").strip() or f"mod_{len(mods)+1}"
        if mid in seen:
            mid = f"{mid}_{len(mods)}"
        seen.add(mid)
        tid = str(m.get("target_node_id") or "").strip()
        if tid not in allowed_targets:
            continue
        lvl = int(m.get("target_level") or 1)
        if lvl not in (1, 2):
            lvl = 1
        summary = str(m.get("summary") or "").strip()
        detail = str(m.get("detail") or "").strip()
        action = str(m.get("action") or "relabel").strip()
        if not summary and not detail:
            continue
        addrs_raw = m.get("addresses_gaps")
        if not isinstance(addrs_raw, list):
            addrs_raw = []
        addresses_gaps = []
        for x in addrs_raw[:8]:
            gx = str(x or "").strip()[:48]
            if gx and gx in gap_ids_allowed:
                addresses_gaps.append(gx)
        addresses_gaps = list(dict.fromkeys(addresses_gaps))
        blob = f"{summary}\n{detail}"
        if not addresses_gaps:
            blob_lower = blob.lower()
            for g in gaps:
                gid = g["id"]
                if gid.lower() in blob_lower:
                    addresses_gaps.append(gid)
        mods.append(
            {
                "id": mid[:64],
                "target_node_id": tid,
                "target_level": lvl,
                "action": action[:64],
                "summary": (summary or detail)[:400],
                "detail": detail[:2400],
                "suggested_label": str(m.get("suggested_label") or "").strip()[:400],
                "addresses_gaps": addresses_gaps,
            }
        )
    if len(mods) < 1:
        raise ValueError("MECE scan: no valid modifications (check target_node_id matches level-1/2 children)")
    return {
        "mece_assessment": {
            "mutually_exclusive": str(assess.get("mutually_exclusive") or "partial")[:16],
            "collectively_exhaustive": str(assess.get("collectively_exhaustive") or "partial")[:16],
            "rationale": str(assess.get("rationale") or "")[:4000],
            "overlap_pairs": assess.get("overlap_pairs") if isinstance(assess.get("overlap_pairs"), list) else [],
            "coverage_gaps": [str(x) for x in (assess.get("coverage_gaps") or []) if str(x).strip()][:24],
        },
        "gaps": gaps,
        "proposed_modifications": mods,
    }


def mece_scan_two_levels(
    *,
    llm: LlmClient,
    mece_root_id: str,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
) -> dict[str, Any]:
    all_ids = {str(n.get("id")) for n in full_nodes if isinstance(n, dict) and n.get("id")}
    if mece_root_id not in all_ids:
        raise ValueError("mece_root_id not found in graph")
    level1, level2 = two_level_child_node_ids(root_id=mece_root_id, full_edges=full_edges, all_ids=all_ids)
    if not level1 and not level2:
        raise ValueError("No level-1 or level-2 children found under this node (add children first)")
    nodes_by_id = _node_by_id(full_nodes)
    subtree_json = _pack_subtree_for_prompt(
        root_id=mece_root_id, level1_ids=level1, level2_ids=level2, nodes_by_id=nodes_by_id
    )
    allowed = set(level1) | set(level2)
    prompt = "\n".join(
        [
            f"MECE anchor node id: {mece_root_id}",
            "Analyze ONLY the following two-level child subtree (level-1 and level-2 nodes).",
            "",
            "Subtree JSON:",
            subtree_json,
            "",
            "Return ONLY the JSON object matching the system schema.",
        ]
    ).strip()
    raw = llm.generate_json(system=MECE_SCAN_SYSTEM, user=prompt)
    validated = _validate_scan_payload(raw, allowed_targets=allowed)
    validated["level1_node_ids"] = level1
    validated["level2_node_ids"] = level2
    return validated


def _validate_evidence_payload(data: Any, expected_ids: list[str]) -> list[dict[str, Any]]:
    if not isinstance(data, dict):
        raise ValueError("MECE evidence: expected JSON object")
    rows = data.get("results")
    if not isinstance(rows, list):
        raise ValueError("MECE evidence: missing results")
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        mid = str(row.get("modification_id") or "").strip()
        if not mid:
            continue
        sup = bool(row.get("supported"))
        conf = str(row.get("confidence") or "low").lower()
        if conf not in ("high", "medium", "low"):
            conf = "low"
        ev = row.get("supporting_evidence")
        ev_out: list[dict[str, str]] = []
        if isinstance(ev, list):
            for it in ev[:6]:
                if not isinstance(it, dict):
                    continue
                fn = str(it.get("source_filename") or "").strip()[:240]
                sn = str(it.get("text_snippet") or "").strip()[:600]
                if sn:
                    ev_out.append({"source_filename": fn or "unknown", "text_snippet": sn})
        wsr = bool(row.get("web_search_recommended"))
        q = str(row.get("suggested_search_query") or "").strip()[:400]
        if not sup and not q:
            wsr = True
            q = f"evidence for restructuring MECE child node map ({mid})"
        by_id[mid] = {
            "modification_id": mid,
            "supported": sup,
            "confidence": conf,
            "supporting_evidence": ev_out,
            "web_search_recommended": wsr or not sup,
            "suggested_search_query": q if (wsr or not sup) else q,
        }
    out_list: list[dict[str, Any]] = []
    for eid in expected_ids:
        out_list.append(by_id.get(eid) or {
            "modification_id": eid,
            "supported": False,
            "confidence": "low",
            "supporting_evidence": [],
            "web_search_recommended": True,
            "suggested_search_query": "supporting data for MECE map refinement",
        })
    return out_list


def mece_check_evidence(
    *,
    llm: LlmClient,
    mece_root_id: str,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    scan_bundle: dict[str, Any],
    modification_ids: list[str],
    project_id: str | None,
) -> dict[str, Any]:
    if not modification_ids:
        raise ValueError("Select at least one modification")
    mods = scan_bundle.get("proposed_modifications")
    if not isinstance(mods, list):
        raise ValueError("Invalid scan bundle")
    by_mid = {str(m.get("id")): m for m in mods if isinstance(m, dict) and str(m.get("id") or "").strip()}
    missing = [mid for mid in modification_ids if mid not in by_mid]
    if missing:
        raise ValueError(f"Unknown modification_id(s): {', '.join(missing[:8])}")
    selected = [by_mid[mid] for mid in modification_ids]

    graph_ev = _graph_evidence_corpus(root_id=mece_root_id, full_nodes=full_nodes, full_edges=full_edges)
    proj_corpus = collect_project_source_text((project_id or "").strip(), max_chars=50_000)
    corpus = "\n\n--- PROJECT FILES ---\n" + proj_corpus + "\n\n--- GRAPH EVIDENCE NODES (subtree) ---\n" + graph_ev

    mod_json = json.dumps(selected, ensure_ascii=False)
    prompt = "\n".join(
        [
            "Assess whether each proposed modification is supported by the SOURCE CORPUS below.",
            "",
            "Modifications JSON:",
            mod_json,
            "",
            "SOURCE CORPUS (excerpts; filenames in headers):",
            corpus[:95000],
            "",
            "Return ONLY the JSON object with results for every modification_id listed in the modifications JSON.",
        ]
    ).strip()
    raw = llm.generate_json(system=MECE_EVIDENCE_SYSTEM, user=prompt)
    results = _validate_evidence_payload(raw, expected_ids=modification_ids)
    return {"results": results, "corpus_stats": {"graph_evidence_chars": len(graph_ev), "project_chars": len(proj_corpus)}}


def mece_apply_selected_modifications(
    *,
    llm: LlmClient,
    mece_root_id: str,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    scan_bundle: dict[str, Any],
    evidence_bundle: dict[str, Any],
    modification_ids: list[str],
    web_hints: dict[str, str] | None = None,
) -> tuple[dict[str, Any], str]:
    if not modification_ids:
        raise ValueError("Select at least one modification to apply")
    mods = scan_bundle.get("proposed_modifications")
    if not isinstance(mods, list):
        raise ValueError("Invalid scan bundle")
    by_mid = {str(m.get("id")): m for m in mods if isinstance(m, dict) and str(m.get("id") or "").strip()}
    missing = [mid for mid in modification_ids if mid not in by_mid]
    if missing:
        raise ValueError(f"Unknown modification_id(s): {', '.join(missing[:8])}")
    selected = [by_mid[mid] for mid in modification_ids]

    ev_rows = evidence_bundle.get("results")
    ev_by: dict[str, dict[str, Any]] = {}
    if isinstance(ev_rows, list):
        for r in ev_rows:
            if isinstance(r, dict) and r.get("modification_id"):
                ev_by[str(r["modification_id"])] = r

    hints = web_hints or {}
    apply_payload: list[dict[str, Any]] = []
    for m in selected:
        mid = str(m.get("id"))
        apply_payload.append(
            {
                "modification": m,
                "evidence_check": ev_by.get(mid, {}),
                "optional_web_hint": (hints.get(mid) or "").strip()[:8000],
            }
        )

    all_ids = {str(n.get("id")) for n in full_nodes if isinstance(n, dict) and n.get("id")}
    edges_raw = [e for e in full_edges if isinstance(e, dict)]
    branch_ids = collect_branch_node_ids(root_id=mece_root_id, edges=edges_raw, all_ids=all_ids)
    nodes_by_id = _node_by_id(full_nodes)
    node_lines = [
        f"- id={nid} type={nodes_by_id.get(nid, {}).get('type')} label={(nodes_by_id.get(nid, {}).get('label') or '')[:200]!r}"
        for nid in sorted(branch_ids)[:200]
    ]
    edge_lines = [f"- {e.get('source')} -> {e.get('target')} label={e.get('label') or ''}" for e in edges_raw[:320]]

    prompt = "\n".join(
        [
            f"Branch root id (MECE anchor; do not remove): {mece_root_id}",
            "",
            "Apply ONLY the user-selected MECE modifications below to the mindmap branch.",
            "Use update_nodes for relabels/metadata; add_nodes/add_edges for missing buckets or structure;",
            "remove_node_ids only when merge_duplicate truly removes a redundant node id.",
            "Respect Evidence node rules from the system schema.",
            "",
            "Selected modifications + evidence context JSON:",
            json.dumps(apply_payload, ensure_ascii=False)[:60000],
            "",
            "Branch nodes:",
            *node_lines,
            "",
            "Branch edges:",
            *edge_lines,
            "",
            "Task: Return ONLY the patch JSON object.",
        ]
    ).strip()

    patch = llm.generate_json(system=SIM_PATCH_SYSTEM, user=prompt)
    if not isinstance(patch, dict):
        raise ValueError("LLM did not return a JSON patch object")
    merged = merge_review_patch(
        full_nodes=full_nodes,
        full_edges=full_edges,
        branch_root_id=mece_root_id,
        branch_ids=branch_ids,
        patch=patch,
    )
    report = f"Applied {len(selected)} MECE modification(s) under anchor {mece_root_id}."
    return merged, report
