from __future__ import annotations

import json
from typing import Any

from app.services.llm_client import LlmClient
from app.services.review_apply import collect_branch_node_ids, merge_review_patch
from app.services.tavily_search import format_results_for_prompt, tavily_search

ASSISTANT_APPLY_SYSTEM = """You update a mindmap subtree based on a user–assistant conversation and optional skill instructions. Return JSON only. No markdown.

Schema:
{
  "update_nodes": [{"id": "existing_id", "label": "string", "type": "Evidence"|"Inferred", "metadata": {}}],
  "add_nodes": [{"id": "rev_something_unique", "label": "string", "type": "Evidence"|"Inferred", "metadata": {}}],
  "add_edges": [{"source": "id", "target": "id", "label": "string"}],
  "remove_node_ids": ["id"]
}

Rules:
- Types ONLY "Evidence" or "Inferred".
- For EVERY Evidence node (new or updated), metadata MUST include source_filename and text_snippet. Reuse real filenames from the branch when grounded there; otherwise use source_filename "assistant_notes.txt" and a short honest text_snippet.
- update_nodes: only ids in the branch you were given. Include only nodes you actually change.
- add_nodes: every new id MUST start with "rev_" and be unique. Prefer Inferred nodes for structure; use Evidence when citing or grounding claims.
- add_edges: only between ids that exist after adds.
- remove_node_ids: optional; only branch node ids (never the branch root id); use sparingly.
- Implement what the user and assistant agreed or what the latest assistant plan implies—concrete graph edits, not vague commentary.
- Respect custom skills (user-defined) as lenses or constraints. Respect builtin hints if present (e.g. financial framing, suggesting external evidence when claims need support).
"""


def _format_conversation(messages: list[dict[str, str]], *, max_chars: int = 24000) -> str:
    lines: list[str] = []
    for m in messages:
        role = (m.get("role") or "").strip().lower()
        content = (m.get("content") or "").strip()
        if not content:
            continue
        label = "User" if role == "user" else "Assistant"
        lines.append(f"{label}: {content}")
    text = "\n\n".join(lines)
    if len(text) > max_chars:
        text = text[-max_chars:]
        text = "…(truncated)\n\n" + text
    return text or "(no conversation text)"


def _skills_block(
    *,
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
) -> str:
    parts: list[str] = []
    for s in custom_skills:
        if not isinstance(s, dict):
            continue
        if s.get("enabled") is False:
            continue
        name = str(s.get("name") or "Skill").strip() or "Skill"
        instr = str(s.get("instruction") or "").strip()
        if not instr:
            continue
        parts.append(f"- **{name}**: {instr}")
    if builtin_skills.get("webSearch"):
        parts.append(
            "- **Web search (builtin)**: You MAY use provided Tavily results when present. "
            "Do not invent URLs or sources; only cite links from the results block."
        )
    if builtin_skills.get("financialAnalyst"):
        parts.append(
            "- **Financial analyst (builtin)**: Prefer metrics, risks, and structured reasoning in labels and child nodes."
        )
    if not parts:
        return "(no extra skills enabled)"
    return "\n".join(parts)


def _sandbox_apply_extra(*, sandbox_mode: bool) -> str:
    if not sandbox_mode:
        return ""
    return (
        "Sandbox session: The user worked in sandbox mode. The branch may include draft nodes (status draft) "
        "created while exploring. Summarize the dialogue conclusions, reconcile them with those drafts, and "
        "return a patch that consolidates the branch into coherent firm-ready content. Update or merge draft "
        "nodes as needed via update_nodes; use remove_node_ids only for true duplicates. Prefer setting "
        "finalized nodes to status \"firm\" in update_nodes where the schema allows."
    )


def build_assistant_apply_user_prompt(
    *,
    branch_root_id: str,
    branch_nodes: list[dict[str, Any]],
    branch_edges: list[dict[str, Any]],
    messages: list[dict[str, str]],
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
    sandbox_mode: bool = False,
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
            *node_lines,
            "",
            "Branch edges (parent -> child):",
            *edge_lines,
            "",
            "Conversation (most recent context matters):",
            _format_conversation(messages),
            "",
            "Task: Return the JSON patch object only, implementing the conversation outcome on this branch.",
        ]
    ).strip()


CHAT_SYSTEM = """You are a helpful assistant for editing a strategic / argument mindmap.

You see a snapshot of the current graph (nodes and edges), optional focus node, and optional skill instructions.
Reply in clear, concise prose. You may propose concrete edits, but the user applies them via a separate action.
When suggesting structural changes, mention node ids from the snapshot when possible.

If a section titled "Tavily web search results" is present in the user prompt:
- You MUST include a final "Sources:" section in your reply with 1-5 bullet lines.
- Each bullet MUST contain a URL exactly as shown in the results.
- If the results section says "(search failed: ...)", you MUST explicitly say web search failed and include the reason.

Return JSON only. No markdown.
Schema: { "reply": "string" }
The "reply" field is your message to the user (plain text, can use short bullet lines with - if helpful).
"""


def build_assistant_chat_user_prompt(
    *,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    selected_node_id: str | None,
    messages: list[dict[str, str]],
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
    sandbox_mode: bool = False,
) -> str:
    node_lines = []
    for n in full_nodes[:400]:
        if not isinstance(n, dict):
            continue
        node_lines.append(
            f"- id={n.get('id')} type={n.get('type') or ''} label={n.get('label') or ''} metadata={n.get('metadata')!r}"
        )
    edge_lines = []
    for e in full_edges[:800]:
        if not isinstance(e, dict):
            continue
        edge_lines.append(f"- {e.get('source')} -> {e.get('target')} label={e.get('label') or ''}")

    focus = selected_node_id.strip() if selected_node_id else ""
    focus_line = f"User selected / focus node id: {focus}" if focus else "No node selected (user may be asking globally)."
    mode_line = (
        "Workspace: SANDBOX — new canvas edits are drafts; the user will summarize and apply to a branch root when ready."
        if sandbox_mode
        else "Workspace: MAIN — graph edits go to the firm map unless the UI is in sandbox mode."
    )

    return "\n".join(
        [
            focus_line,
            mode_line,
            "",
            "Enabled skills / instructions:",
            _skills_block(custom_skills=custom_skills, builtin_skills=builtin_skills),
            "",
            "Current mindmap nodes:",
            *node_lines,
            "",
            "Edges (source -> target):",
            *edge_lines,
            "",
            "Conversation so far (respond to the latest user message):",
            _format_conversation(messages, max_chars=16000),
            "",
            "Task: Return JSON with a single key \"reply\" containing your assistant message.",
        ]
    ).strip()


def apply_assistant_conversation_to_graph(
    *,
    llm: LlmClient,
    branch_root_id: str,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    messages: list[dict[str, str]],
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
    sandbox_mode: bool = False,
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

    user_prompt = build_assistant_apply_user_prompt(
        branch_root_id=branch_root_id,
        branch_nodes=branch_nodes,
        branch_edges=branch_edges,
        messages=messages,
        custom_skills=custom_skills,
        builtin_skills=builtin_skills,
        sandbox_mode=sandbox_mode,
    )
    data = llm.generate_json(system=ASSISTANT_APPLY_SYSTEM, user=user_prompt)
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


def run_assistant_chat(
    *,
    llm: LlmClient,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    selected_node_id: str | None,
    web_search_query: str | None,
    messages: list[dict[str, str]],
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
    sandbox_mode: bool = False,
) -> str:
    user_prompt = build_assistant_chat_user_prompt(
        full_nodes=full_nodes,
        full_edges=full_edges,
        selected_node_id=selected_node_id,
        messages=messages,
        custom_skills=custom_skills,
        builtin_skills=builtin_skills,
        sandbox_mode=sandbox_mode,
    )
    if builtin_skills.get("webSearch"):
        q = (web_search_query or "").strip()
        if not q:
            # Fallback query: latest user message.
            last_user = ""
            for m in reversed(messages):
                if (m.get("role") or "").strip().lower() == "user":
                    last_user = (m.get("content") or "").strip()
                    if last_user:
                        break
            q = last_user
        try:
            results = tavily_search(query=q[:240], max_results=5)
            user_prompt = "\n".join(
                [
                    user_prompt,
                    "",
                    "Tavily web search results (top 5):",
                    format_results_for_prompt(results),
                ]
            )
        except Exception as e:
            # Don't fail chat if search is not configured or temporarily down.
            user_prompt = "\n".join([user_prompt, "", "Tavily web search results:", f"(search failed: {e})"])
    data = llm.generate_json(system=CHAT_SYSTEM, user=user_prompt)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return a JSON object")
    reply = data.get("reply")
    if not isinstance(reply, str):
        raise ValueError('LLM response missing string "reply"')
    return reply.strip()
