from __future__ import annotations

import json
from typing import Any

from app.services.assistant_apply import ASSISTANT_APPLY_SYSTEM, _sandbox_apply_extra, _skills_block
from app.services.llm_client import LlmClient
from app.services.review_apply import collect_branch_node_ids, merge_review_patch

ROUNDTABLE_ROUND_SYSTEM = """You simulate a roundtable where several personas discuss ONE selected mindmap node.
Return JSON only. No markdown fences.

Schema:
{
  "speeches": [
    {"persona": "string (exact display name)", "content": "string"}
  ],
  "round_title": "string (very short, e.g. Round 3)"
}

Rules:
- You will receive the persona list IN ORDER. Emit exactly one speech per persona, in the SAME order. persona field must match the given name exactly.
- Each speech: 2–6 sentences in that persona's voice per their instruction. Focus on the selected node's label, type, metadata, and how it fits the surrounding map. If little to add, still give 1–2 sentences (agree, pass, or one concrete angle).
- Do NOT propose JSON graph patches here; discussion only.
- If a user steering message is present, incorporate it as the topic for this round.
"""


def _format_roundtable_transcript(rows: list[dict[str, Any]], *, max_chars: int = 32000) -> str:
    lines: list[str] = []
    for r in rows:
        role = (r.get("role") or "").strip().lower()
        content = (r.get("content") or "").strip()
        if not content:
            continue
        if role == "user":
            lines.append(f"User: {content}")
        else:
            pn = (r.get("persona_name") or r.get("persona") or "Persona").strip()
            lines.append(f"{pn}: {content}")
    text = "\n\n".join(lines)
    if len(text) > max_chars:
        text = text[-max_chars:]
        text = "…(truncated)\n\n" + text
    return text or "(no prior transcript)"


def _node_snapshot(nodes: list[dict[str, Any]], node_id: str) -> str:
    for n in nodes:
        if not isinstance(n, dict):
            continue
        if str(n.get("id") or "") != node_id:
            continue
        return json.dumps(
            {
                "id": n.get("id"),
                "label": n.get("label"),
                "type": n.get("type"),
                "metadata": n.get("metadata"),
            },
            ensure_ascii=False,
        )
    return f"(node id {node_id!r} not found in snapshot)"


def _compact_graph_context(
    *,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    selected_node_id: str,
    max_nodes: int = 48,
) -> str:
    """Short neighbor context: selected node + labels of linked nodes."""
    by_id: dict[str, dict[str, Any]] = {}
    for n in full_nodes:
        if isinstance(n, dict) and str(n.get("id") or "").strip():
            by_id[str(n["id"])] = n
    sel = by_id.get(selected_node_id)
    if not sel:
        return "(selected node missing)"
    neighbors: list[str] = []
    for e in full_edges:
        if not isinstance(e, dict):
            continue
        s, t = str(e.get("source", "")), str(e.get("target", ""))
        lab = str(e.get("label") or "")
        if s == selected_node_id and t in by_id:
            neighbors.append(f"out→ {by_id[t].get('label')!s} [{t}] ({lab})")
        elif t == selected_node_id and s in by_id:
            neighbors.append(f"in← {by_id[s].get('label')!s} [{s}] ({lab})")
    lines = [
        f"SELECTED id={selected_node_id}",
        f"label={sel.get('label')!r} type={sel.get('type')!r}",
        f"metadata={json.dumps(sel.get('metadata'), ensure_ascii=False)[:1200]}",
        "",
        "Local links:",
        *(neighbors[:max_nodes] or ["(none)"]),
    ]
    return "\n".join(lines)


def run_roundtable_round(
    *,
    llm: LlmClient,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    selected_node_id: str,
    personas: list[dict[str, Any]],
    transcript: list[dict[str, Any]],
    user_steering: str | None,
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
    sandbox_mode: bool = False,
) -> dict[str, Any]:
    if not selected_node_id.strip():
        raise ValueError("selected_node_id is required")
    cleaned: list[dict[str, str]] = []
    for p in personas:
        if not isinstance(p, dict):
            continue
        name = str(p.get("name") or "").strip()
        instr = str(p.get("instruction") or "").strip()
        if not name or not instr:
            continue
        cleaned.append({"name": name, "instruction": instr})
    if len(cleaned) < 1:
        raise ValueError("At least one persona with name and instruction is required")
    if len(cleaned) > 12:
        raise ValueError("Too many personas (max 12)")

    persona_block = "\n".join(
        [f"{i + 1}. **{p['name']}**: {p['instruction']}" for i, p in enumerate(cleaned)]
    )
    steer = (user_steering or "").strip()
    sandbox_note = ""
    if sandbox_mode:
        sandbox_note = (
            "Sandbox: the graph may include draft nodes; personas may reference them as hypotheses.\n\n"
        )

    user_prompt = "\n".join(
        [
            sandbox_note + "Personas (speak in order):",
            persona_block,
            "",
            "Graph context (selected + local links):",
            _compact_graph_context(
                full_nodes=full_nodes,
                full_edges=full_edges,
                selected_node_id=selected_node_id.strip(),
            ),
            "",
            "Full selected node JSON:",
            _node_snapshot(full_nodes, selected_node_id.strip()),
            "",
            "Prior transcript:",
            _format_roundtable_transcript(transcript),
            "",
            "Optional user steering for THIS round:",
            steer if steer else "(none — open the next discussion round on the selected node.)",
            "",
            "Enabled skills (optional lenses; stay in persona voice):",
            _skills_block(custom_skills=custom_skills, builtin_skills=builtin_skills),
        ]
    )

    data = llm.generate_json(system=ROUNDTABLE_ROUND_SYSTEM, user=user_prompt)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return a JSON object")
    speeches = data.get("speeches")
    if not isinstance(speeches, list) or not speeches:
        raise ValueError('LLM response missing "speeches" array')
    out_speeches: list[dict[str, str]] = []
    for i, p in enumerate(cleaned):
        sp = speeches[i] if i < len(speeches) else None
        content = ""
        if isinstance(sp, dict):
            content = str(sp.get("content") or "").strip()
        if not content and isinstance(sp, dict):
            content = str(sp.get("text") or "").strip()
        if not content:
            content = "(No response.)"
        out_speeches.append({"persona": p["name"], "content": content})
    round_title = data.get("round_title")
    return {
        "speeches": out_speeches,
        "round_title": round_title if isinstance(round_title, str) else "",
    }


ROUNDTABLE_PROPOSE_SYSTEM = (
    ASSISTANT_APPLY_SYSTEM
    + "\n\nAdditional keys for this task ONLY (still one JSON object):\n"
    + '- "discussion_summary": string — concise synthesis of the roundtable.\n'
    + '- "recommended_mindmap_changes": string — numbered, actionable edits the user should confirm.\n'
    + "The graph patch keys (update_nodes, add_nodes, add_edges, remove_node_ids) must align with "
    + "recommended_mindmap_changes and the branch rules above."
)


def build_roundtable_propose_user_prompt(
    *,
    branch_root_id: str,
    branch_nodes: list[dict[str, Any]],
    branch_edges: list[dict[str, Any]],
    selected_node_id: str,
    transcript: list[dict[str, Any]],
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
    sandbox_mode: bool,
) -> str:
    node_lines = []
    for n in branch_nodes:
        node_lines.append(
            f"- id={n.get('id')} type={n.get('type') or ''} label={n.get('label') or ''} metadata={n.get('metadata')!r}"
        )
    edge_lines = []
    for e in branch_edges:
        edge_lines.append(f"- {e.get('source')} -> {e.get('target')} label={e.get('label') or ''}")

    extra = _sandbox_apply_extra(sandbox_mode=sandbox_mode)
    head: list[str] = [
        f"Branch root id (do not remove): {branch_root_id}",
        f"Roundtable focus node id: {selected_node_id}",
        "",
    ]
    if extra:
        head.extend([extra, ""])

    return "\n".join(
        [
            *head,
            "Enabled skills / instructions:",
            _skills_block(custom_skills=custom_skills, builtin_skills=builtin_skills),
            "",
            "Branch nodes:",
            *(node_lines or ["(none)"]),
            "",
            "Branch edges:",
            *(edge_lines or ["(none)"]),
            "",
            "Roundtable transcript:",
            _format_roundtable_transcript(transcript),
            "",
            "Task: Return ONE JSON object including discussion_summary, recommended_mindmap_changes, "
            "and the patch keys (update_nodes, add_nodes, add_edges, remove_node_ids) implementing "
            "the consensus that fits this branch. If no graph edits are needed, use empty arrays.",
        ]
    )


def _patch_keys_only(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "update_nodes": data.get("update_nodes") if isinstance(data.get("update_nodes"), list) else [],
        "add_nodes": data.get("add_nodes") if isinstance(data.get("add_nodes"), list) else [],
        "add_edges": data.get("add_edges") if isinstance(data.get("add_edges"), list) else [],
        "remove_node_ids": data.get("remove_node_ids") if isinstance(data.get("remove_node_ids"), list) else [],
    }


def propose_roundtable_edits(
    *,
    llm: LlmClient,
    branch_root_id: str,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    selected_node_id: str,
    transcript: list[dict[str, Any]],
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
    sandbox_mode: bool = False,
) -> dict[str, Any]:
    all_ids = {str(n["id"]) for n in full_nodes if isinstance(n, dict) and n.get("id")}
    edges_raw = [e for e in full_edges if isinstance(e, dict)]
    branch_ids = collect_branch_node_ids(root_id=branch_root_id, edges=edges_raw, all_ids=all_ids)
    if not branch_ids:
        raise ValueError("branch_root_id not in graph or empty branch")
    if str(selected_node_id).strip() not in branch_ids:
        raise ValueError("selected_node_id must lie within the branch rooted at branch_root_id")

    branch_nodes = [n for n in full_nodes if isinstance(n, dict) and str(n.get("id")) in branch_ids]
    branch_edges = [
        e for e in edges_raw if str(e.get("source", "")) in branch_ids and str(e.get("target", "")) in branch_ids
    ]

    user_prompt = build_roundtable_propose_user_prompt(
        branch_root_id=branch_root_id,
        branch_nodes=branch_nodes,
        branch_edges=branch_edges,
        selected_node_id=str(selected_node_id).strip(),
        transcript=transcript,
        custom_skills=custom_skills,
        builtin_skills=builtin_skills,
        sandbox_mode=sandbox_mode,
    )
    data = llm.generate_json(system=ROUNDTABLE_PROPOSE_SYSTEM, user=user_prompt)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return a JSON object")

    summary = data.get("discussion_summary")
    if not isinstance(summary, str):
        summary = str(summary or "").strip()
    rec = data.get("recommended_mindmap_changes")
    if not isinstance(rec, str):
        rec = str(rec or "").strip()

    patch = _patch_keys_only(data)
    # Validate merge will work — merge_review_patch raises on bad structure? It tolerates.
    return {
        "discussion_summary": summary.strip(),
        "recommended_mindmap_changes": rec.strip(),
        "patch": patch,
    }


def apply_roundtable_patch(
    *,
    branch_root_id: str,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    patch: dict[str, Any],
) -> dict[str, Any]:
    all_ids = {str(n["id"]) for n in full_nodes if isinstance(n, dict) and n.get("id")}
    edges_raw = [e for e in full_edges if isinstance(e, dict)]
    branch_ids = collect_branch_node_ids(root_id=branch_root_id, edges=edges_raw, all_ids=all_ids)
    if not branch_ids:
        raise ValueError("branch_root_id not in graph or empty branch")
    merged = merge_review_patch(
        full_nodes=full_nodes,
        full_edges=full_edges,
        branch_root_id=branch_root_id,
        branch_ids=branch_ids,
        patch=patch if isinstance(patch, dict) else {},
    )
    return merged
