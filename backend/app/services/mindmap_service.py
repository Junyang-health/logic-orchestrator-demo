from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Iterable, Optional

from app.models import MindmapJson


@dataclass(frozen=True)
class EvidenceItem:
    filename: str
    snippet: str
    page_number: Optional[int] = None


SYSTEM_PROMPT = """You generate mindmap JSON only.

Hard requirements:
- Output MUST be valid JSON (no markdown, no code fences, no commentary).
- Output MUST match exactly this schema:
  {
    "nodes": [{"id": "string", "type": "string", "label": "string", "metadata": {}}],
    "edges": [{"source": "string", "target": "string", "label": "string"}]
  }
- Node ids MUST be unique strings.
- Node types MUST be ONLY these two values (case-sensitive):
  - "Evidence"
  - "Inferred"
- Do NOT output any other node types (no Root/Topic/Insight/Action/etc).
- Include EXACTLY ONE hub Inferred node with metadata {"is_root": true} whose label is a short map title (use the user goal / material).
- That hub is the mindmap root: use edges parent(source) → child(target) so every other node is reachable from the hub by following targets outward (tree or DAG is fine; no orphan nodes).
- Structure for readability (the UI lays out left→right by depth):
  - Think in **clear levels**: Level 1 = only the root hub. Level 2 = a **small** set of major branches (typically 3–6 Inferred nodes) each with a **short label** (≤ ~8 words) naming one theme, chapter, or claim cluster.
  - Level 3+ = supporting Inferred synthesis and Evidence nodes under those branches. Prefer **depth over fan-out**: avoid attaching more than ~6 children to any single node unless the material truly requires it; split themes instead of one mega-node with many edges.
  - Prefer a **near-tree** from the hub (few cross-links). If you use a DAG, keep cross-links rare and meaningful.
  - **Labels must stay concise** (titles only); put verbatim quotes and long text only in Evidence `text_snippet` / short Inferred summaries—do not paste paragraphs into `label`.
  - Use **distinct, short edge labels** on every edge (e.g. "supports", "summarizes", "grounds", "contrasts") so the map reads as a leveled argument, not a hairball.
- For EVERY node with type "Evidence", metadata MUST include:
    {"source_filename": "...", "text_snippet": "..."}
- If the evidence comes from a paged document (e.g. PDF), include:
    {"page_number": 1}
- Evidence snippets MUST be short (<= 240 chars) and drawn from the provided material.
- Do not invent filenames or citations.
- For EVERY node (Evidence or Inferred), when the summaries or evidence snippets contain concrete figures, thresholds, dates, percentages, monetary amounts, KPIs, article/clause references, or other business- or compliance-critical data that this node reflects, you MUST add:
    "critical_values": [ {"label": "short field name", "value": "verbatim or tightly paraphrased value from the material"} ]
  Use at most 6 entries per node; use an empty array [] when no such values apply to that node.
  Never invent numbers or citations; values MUST be traceable to the provided summaries or evidence lines.
"""


def _truncate(s: str, n: int) -> str:
    s2 = " ".join((s or "").split())
    return s2 if len(s2) <= n else s2[: n - 1] + "…"


def _normalize_critical_values(md: dict[str, Any]) -> None:
    """Keep structured critical figures on nodes; cap count and string lengths."""
    raw = md.get("critical_values")
    out: list[dict[str, str]] = []
    if isinstance(raw, list):
        for item in raw[:10]:
            if isinstance(item, dict):
                lab = str(item.get("label") or "").strip()
                val = str(item.get("value") or "").strip()
                if lab or val:
                    out.append(
                        {
                            "label": _truncate(lab, 72),
                            "value": _truncate(val, 160),
                        }
                    )
            elif isinstance(item, str):
                s = item.strip()
                if ":" in s:
                    a, b = s.split(":", 1)
                    la, vb = a.strip(), b.strip()
                    if la or vb:
                        out.append({"label": _truncate(la, 72), "value": _truncate(vb, 160)})
                elif s:
                    out.append({"label": "Value", "value": _truncate(s, 160)})
    md["critical_values"] = out[:6]


def build_mindmap_prompt(*, summaries: list[str], evidence: Iterable[EvidenceItem]) -> str:
    # Optional user intent is included as a summary entry upstream.
    ev_lines = []
    for e in list(evidence)[:60]:
        loc = f"p.{e.page_number}" if e.page_number else ""
        ev_lines.append(f"- ({e.filename}{(' ' + loc) if loc else ''}) {_truncate(e.snippet, 260)}")

    return "\n".join(
        [
            "Material summaries:",
            *[f"\n---\n{s.strip()}\n" for s in summaries if s.strip()],
            "\nEvidence snippets (cite these for Evidence nodes):",
            *ev_lines,
            "\nTask:",
            "Create a mindmap with 8-24 total nodes, organized into **clear, leveled layers** from the single root hub outward.",
            "First expand the hub into **3–6** second-level Inferred nodes (major themes only, very short labels). Then attach Evidence and finer Inferred nodes under those themes—**do not** connect dozens of nodes directly to the hub.",
            "Keep each node's `label` short and scannable; reserve length for Evidence snippets and brief Inferred summaries in metadata if needed.",
            "Start from one Inferred hub with metadata.is_root=true; use parent(source)→child(target) edges so depth matches conceptual levels.",
            "Use Evidence nodes to ground claims from the material; use Inferred nodes for interpretations/claims not directly quoted.",
            "Where a node reflects measurable or binding facts, capture them in metadata.critical_values (see system rules).",
            "Connect edges logically with explicit edge labels (Evidence supports Inferred; Inferred can summarize other Inferred).",
            "Return JSON only.",
        ]
    ).strip()


def _root_label_from_summaries(summaries: list[str]) -> str:
    for block in summaries:
        s = (block or "").strip()
        if not s:
            continue
        if s.lower().startswith("user intent") or s.lower().startswith("user goal"):
            for line in s.splitlines()[1:]:
                t = line.strip()
                if t:
                    return _truncate(t, 96)
        first = s.splitlines()[0].strip()
        if first:
            return _truncate(first, 96)
    return "Overview"


def _ensure_mindmap_root(*, data: dict[str, Any], summaries: list[str]) -> None:
    """Guarantee one Inferred root hub (metadata.is_root) that reaches prior top-level nodes."""
    raw_nodes = data.get("nodes")
    raw_edges = data.get("edges")
    if not isinstance(raw_nodes, list):
        return
    if not isinstance(raw_edges, list):
        data["edges"] = []
        raw_edges = data["edges"]

    nodes: list[dict[str, Any]] = [n for n in raw_nodes if isinstance(n, dict) and str(n.get("id") or "").strip()]
    if not nodes:
        return

    ids = {str(n["id"]) for n in nodes}
    edges: list[dict[str, Any]] = []
    for e in raw_edges:
        if not isinstance(e, dict):
            continue
        s, t = str(e.get("source") or "").strip(), str(e.get("target") or "").strip()
        if s in ids and t in ids:
            edges.append({"source": s, "target": t, **{k: v for k, v in e.items() if k not in ("source", "target")}})

    def clear_root_flags() -> None:
        for n in nodes:
            md = n.get("metadata")
            if isinstance(md, dict) and "is_root" in md:
                del md["is_root"]

    def set_root_flag(nid: str) -> None:
        clear_root_flags()
        for n in nodes:
            if str(n["id"]) != nid:
                continue
            md = n.get("metadata")
            if not isinstance(md, dict):
                n["metadata"] = md = {}
            md["is_root"] = True
            break

    def in_degrees() -> dict[str, int]:
        deg = {str(n["id"]): 0 for n in nodes}
        for e in edges:
            t = str(e["target"])
            if t in deg:
                deg[t] += 1
        return deg

    def node_by_id(nid: str) -> Optional[dict[str, Any]]:
        for n in nodes:
            if str(n["id"]) == nid:
                return n
        return None

    def add_hub_and_edges(target_ids: list[str]) -> str:
        hub_id = "n_root"
        while hub_id in ids:
            hub_id = f"{hub_id}_"
        ids.add(hub_id)
        hub: dict[str, Any] = {
            "id": hub_id,
            "type": "Inferred",
            "label": _root_label_from_summaries(summaries),
            "metadata": {"is_root": True},
        }
        nodes.insert(0, hub)
        for tid in target_ids:
            if tid == hub_id:
                continue
            edges.append({"source": hub_id, "target": tid, "label": ""})
        return hub_id

    # Prefer a single Inferred node already flagged is_root if valid.
    flagged = [
        n
        for n in nodes
        if n.get("type") == "Inferred"
        and isinstance(n.get("metadata"), dict)
        and n.get("metadata", {}).get("is_root") is True
    ]
    if len(flagged) > 1:
        clear_root_flags()

    deg = in_degrees()
    roots = sorted([nid for nid, d in deg.items() if d == 0])

    # Exactly one structural root and it is Inferred: mark it.
    if len(roots) == 1:
        r = roots[0]
        n = node_by_id(r)
        if n and n.get("type") == "Inferred":
            set_root_flag(r)
            data["nodes"] = nodes
            data["edges"] = edges
            return
        if n and n.get("type") == "Evidence":
            # Parent Inferred hub above the lone evidence root.
            hub_id = add_hub_and_edges([r])
            set_root_flag(hub_id)
            data["nodes"] = nodes
            data["edges"] = edges
            return

    # Multiple top-level nodes or none (e.g. cycle): add one hub.
    if len(roots) > 1:
        hub_id = add_hub_and_edges(roots)
        set_root_flag(hub_id)
    elif len(roots) == 0:
        # Weakly connected components: attach hub to one node per component.
        adj: dict[str, set[str]] = {i: set() for i in ids}
        for e in edges:
            s, t = str(e["source"]), str(e["target"])
            if s in adj and t in adj:
                adj[s].add(t)
                adj[t].add(s)
        seen: set[str] = set()
        reps: list[str] = []
        for nid in sorted(ids):
            if nid in seen:
                continue
            stack = [nid]
            comp: set[str] = set()
            while stack:
                cur = stack.pop()
                if cur in comp:
                    continue
                comp.add(cur)
                seen.add(cur)
                for nb in adj.get(cur, ()):
                    if nb not in comp:
                        stack.append(nb)
            # Representative: prefer Inferred, else smallest id
            inf = sorted(
                [
                    x
                    for x in comp
                    if (nb := node_by_id(x)) is not None and nb.get("type") == "Inferred"
                ]
            )
            reps.append(inf[0] if inf else min(comp))
        hub_id = add_hub_and_edges(reps)
        set_root_flag(hub_id)

    data["nodes"] = nodes
    data["edges"] = edges


def generate_mindmap_json(*, claude, summaries: list[str], evidence: list[EvidenceItem]) -> MindmapJson:
    user_prompt = build_mindmap_prompt(summaries=summaries, evidence=evidence)
    data = claude.generate_json(system=SYSTEM_PROMPT, user=user_prompt)

    # Minimal validation / normalization.
    if not isinstance(data, dict):
        raise ValueError("Claude response was not a JSON object")
    if "nodes" not in data or "edges" not in data:
        raise ValueError("Claude response missing nodes/edges")
    if not isinstance(data["nodes"], list) or not isinstance(data["edges"], list):
        raise ValueError("Claude response nodes/edges wrong types")

    # Ensure Evidence node metadata requirements.
    # If the model omits metadata, backfill using provided evidence snippets (never inventing).
    fallback = evidence[0] if evidence else None
    for node in data["nodes"]:
        if not isinstance(node, dict):
            continue
        t = str(node.get("type") or "").strip()
        tl = t.lower()
        if tl == "evidence":
            node["type"] = "Evidence"
        elif tl in ("inferred", "inference", "insight", "topic", "action", "root"):
            node["type"] = "Inferred"
        else:
            node["type"] = "Inferred"

        md = node.get("metadata")
        if not isinstance(md, dict):
            node["metadata"] = md = {}

        if node.get("type") == "Evidence":
            src = str(md.get("source_filename", "") or "").strip()
            snip = str(md.get("text_snippet", "") or "").strip()
            page = md.get("page_number")
            if (not src or not snip) and fallback:
                src = src or fallback.filename
                snip = snip or fallback.snippet
                if page in ("", None) and fallback.page_number:
                    page = fallback.page_number
            md["source_filename"] = src
            md["text_snippet"] = _truncate(snip, 240)
            if isinstance(page, int) and page > 0:
                md["page_number"] = page
            if md.get("is_root"):
                del md["is_root"]

        _normalize_critical_values(md)

    _ensure_mindmap_root(data=data, summaries=summaries)

    # Make sure payload is JSON-serializable.
    json.dumps(data)
    return data  # type: ignore[return-value]

