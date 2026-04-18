from __future__ import annotations

import copy
import json
import re
from typing import Any

from app.services.llm_client import LlmClient
from app.services.mindmap_service import _normalize_critical_values


def collect_branch_node_ids(*, root_id: str, edges: list[dict[str, Any]], all_ids: set[str]) -> set[str]:
    if root_id not in all_ids:
        return set()
    seen: set[str] = {root_id}
    queue = [root_id]
    while queue:
        cur = queue.pop()
        for e in edges:
            if not isinstance(e, dict):
                continue
            if str(e.get("source") or "") != cur:
                continue
            tid = str(e.get("target") or "")
            if tid in all_ids and tid not in seen:
                seen.add(tid)
                queue.append(tid)
    return seen


def _norm_type(t: Any) -> str:
    tl = str(t or "").strip().lower()
    if tl == "evidence":
        return "Evidence"
    return "Inferred"


def _ensure_node_dict(n: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(n.get("metadata"), dict):
        n["metadata"] = {}
    n["type"] = _norm_type(n.get("type"))
    if n["type"] == "Evidence":
        md = n["metadata"]
        src = str(md.get("source_filename", "") or "").strip()
        snip = str(md.get("text_snippet", "") or "").strip()
        if not src:
            md["source_filename"] = "review_notes.txt"
        if not snip:
            md["text_snippet"] = (str(n.get("label") or "Evidence note"))[:220]
    _normalize_critical_values(n["metadata"])
    return n


def _dedupe_edges(edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    keys: set[str] = set()
    for e in edges:
        if not isinstance(e, dict):
            continue
        s, t = str(e.get("source", "")), str(e.get("target", ""))
        lab = str(e.get("label") or "")
        k = f"{s}→{t}::{lab}"
        if k in keys or not s or not t:
            continue
        keys.add(k)
        out.append({"source": s, "target": t, "label": lab, **{k2: v2 for k2, v2 in e.items() if k2 not in ("source", "target", "label")}})
    return out


def merge_review_patch(
    *,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    branch_root_id: str,
    branch_ids: set[str],
    patch: dict[str, Any],
) -> dict[str, Any]:
    nodes_by_id: dict[str, dict[str, Any]] = {}
    for n in full_nodes:
        if isinstance(n, dict) and str(n.get("id") or "").strip():
            nid = str(n["id"])
            nodes_by_id[nid] = copy.deepcopy(n)

    edges_list = [copy.deepcopy(e) for e in full_edges if isinstance(e, dict)]

    remove_ids = []
    if isinstance(patch.get("remove_node_ids"), list):
        for x in patch["remove_node_ids"]:
            if isinstance(x, str) and x in branch_ids and x != branch_root_id:
                remove_ids.append(x)

    for rid in remove_ids:
        nodes_by_id.pop(rid, None)
        edges_list = [
            e
            for e in edges_list
            if str(e.get("source")) != rid and str(e.get("target")) != rid
        ]

    if isinstance(patch.get("update_nodes"), list):
        for u in patch["update_nodes"]:
            if not isinstance(u, dict):
                continue
            nid = str(u.get("id") or "")
            if nid not in nodes_by_id or nid not in branch_ids:
                continue
            base = nodes_by_id[nid]
            if "label" in u and u["label"] is not None:
                base["label"] = str(u["label"])
            if "type" in u and u["type"] is not None:
                base["type"] = _norm_type(u["type"])
            if isinstance(u.get("metadata"), dict):
                md = dict(base.get("metadata") or {})
                md.update(u["metadata"])
                base["metadata"] = md
            if "status" in u and u["status"] is not None:
                base["status"] = str(u["status"])
            _ensure_node_dict(base)

    existing_ids = set(nodes_by_id.keys())
    if isinstance(patch.get("add_nodes"), list):
        for n in patch["add_nodes"]:
            if not isinstance(n, dict):
                continue
            nid = str(n.get("id") or "").strip()
            if not nid or nid in existing_ids:
                continue
            if not re.match(r"^rev_[a-zA-Z0-9_-]+$", nid):
                nid2 = f"rev_{nid[:48].lstrip('_')}" if nid else f"rev_{abs(hash(nid)) % 10**8}"
                while nid2 in existing_ids:
                    nid2 = f"{nid2}_"
                nid = nid2
            node = {
                "id": nid,
                "label": str(n.get("label") or "Revision"),
                "type": _norm_type(n.get("type")),
                "metadata": dict(n.get("metadata") or {}) if isinstance(n.get("metadata"), dict) else {},
                "status": str(n.get("status") or "firm"),
            }
            _ensure_node_dict(node)
            nodes_by_id[nid] = node
            existing_ids.add(nid)

    if isinstance(patch.get("add_edges"), list):
        for e in patch["add_edges"]:
            if not isinstance(e, dict):
                continue
            s, t = str(e.get("source") or ""), str(e.get("target") or "")
            if s in existing_ids and t in existing_ids:
                edges_list.append(
                    {
                        "source": s,
                        "target": t,
                        "label": str(e.get("label") or ""),
                        **{k: v for k, v in e.items() if k not in ("source", "target", "label")},
                    }
                )

    edges_list = _dedupe_edges(edges_list)

    out_nodes = list(nodes_by_id.values())
    for n in out_nodes:
        _ensure_node_dict(n)

    return {"nodes": out_nodes, "edges": edges_list}


APPLY_SYSTEM = """You apply persona reviewer feedback to a mindmap branch. Return JSON only. No markdown.

Schema:
{
  "update_nodes": [{"id": "existing_id", "label": "string", "type": "Evidence"|"Inferred", "metadata": {}}],
  "add_nodes": [{"id": "rev_something_unique", "label": "string", "type": "Evidence"|"Inferred", "metadata": {}}],
  "add_edges": [{"source": "id", "target": "id", "label": "string"}],
  "remove_node_ids": ["id"]
}

Rules:
- Types ONLY "Evidence" or "Inferred".
- For EVERY Evidence node (new or updated), metadata MUST include source_filename and text_snippet. Reuse real filenames from the branch when the evidence is grounded there; otherwise use source_filename "review_notes.txt" and a short honest text_snippet summarizing the reviewer point (no fake legal citations).
- update_nodes: only ids listed in the branch nodes you were given. Include only nodes you actually change.
- add_nodes: every new id MUST start with "rev_" and be unique (e.g. rev_mitigation_1). Prefer Inferred nodes that capture mitigations, clarifications, or reworked claims. Add edges so they attach to the branch (usually from the commented node or its parent).
- add_edges: only between node ids that exist after adds (existing + new).
- remove_node_ids: optional; only branch node ids (never the branch root id); use sparingly when a node is truly redundant after revision.
- Address the reviewer comments with concrete graph edits (revised labels, new child nodes, refined metadata.critical_values when relevant).
"""


def build_apply_user_prompt(
    *,
    persona: str,
    branch_root_id: str,
    branch_nodes: list[dict[str, Any]],
    branch_edges: list[dict[str, Any]],
    comments: list[dict[str, str]],
) -> str:
    node_lines = []
    for n in branch_nodes:
        node_lines.append(
            f"- id={n.get('id')} type={n.get('type') or ''} label={n.get('label') or ''} metadata={n.get('metadata')!r}"
        )
    edge_lines = []
    for e in branch_edges:
        edge_lines.append(f"- {e.get('source')} -> {e.get('target')} label={e.get('label') or ''}")
    c_lines = [f"- node_id={c.get('node_id')} :: {c.get('text')}" for c in comments]

    return "\n".join(
        [
            f"Persona: {persona.strip() or 'Reviewer'}",
            f"Branch root id (do not remove): {branch_root_id}",
            "",
            "Branch nodes:",
            *node_lines,
            "",
            "Branch edges (parent -> child):",
            *edge_lines,
            "",
            "Reviewer comments to implement:",
            *c_lines,
            "",
            "Task: Return the JSON patch object only.",
        ]
    ).strip()


def apply_review_comments_to_graph(
    *,
    llm: LlmClient,
    persona: str,
    branch_root_id: str,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    comments: list[dict[str, str]],
) -> dict[str, Any]:
    all_ids = {str(n["id"]) for n in full_nodes if isinstance(n, dict) and n.get("id")}
    edges_raw = [e for e in full_edges if isinstance(e, dict)]
    branch_ids = collect_branch_node_ids(root_id=branch_root_id, edges=edges_raw, all_ids=all_ids)
    if not branch_ids:
        raise ValueError("branch_root_id not in graph or empty branch")

    branch_nodes = [n for n in full_nodes if isinstance(n, dict) and str(n.get("id")) in branch_ids]
    branch_edges = [
        e for e in edges_raw if str(e.get("source", "")) in branch_ids and str(e.get("target", "")) in branch_ids
    ]

    user_prompt = build_apply_user_prompt(
        persona=persona,
        branch_root_id=branch_root_id,
        branch_nodes=branch_nodes,
        branch_edges=branch_edges,
        comments=comments,
    )
    data = llm.generate_json(system=APPLY_SYSTEM, user=user_prompt)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return a JSON object")

    merged = merge_review_patch(
        full_nodes=full_nodes,
        full_edges=full_edges,
        branch_root_id=branch_root_id,
        branch_ids=branch_ids,
        patch=data,
    )
    json.dumps(merged)
    return merged
