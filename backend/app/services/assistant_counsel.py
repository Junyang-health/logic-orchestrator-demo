"""
Structured multi-phase "Counsel" session: Host + 4–8 personas, NGT, debate, ranked votes, mindmap patch.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.services.assistant_apply import ASSISTANT_APPLY_SYSTEM, _sandbox_apply_extra, _skills_block
from app.services.assistant_roundtable import _node_snapshot, _subtree_graph_context
from app.services.llm_client import LlmClient
from app.services.review_apply import collect_branch_node_ids, merge_review_patch

HOST_NAME = "Host"

COUNSEL_PROBLEM_SYSTEM = """You are the Host (neutral facilitator) helping structure a problem for a counsel session.
Return JSON only. No markdown.

Schema:
{
  "kind": "question" | "summary_ready",
  "message": "string"
}

Rules:
- If you need more clarity from the user, use kind "question" and ask ONE focused follow-up in "message".
- When the problem is clear enough to brief the counsel (goal, scope, key constraints), use kind "summary_ready".
  In "message", give a concise structured draft (3–8 bullet points or short paragraphs) the user can edit next.
- Stay neutral; do not advocate for one solution.
"""


COUNSEL_FACT_SYSTEM = """You are one counsel persona (see name and instruction). You may ask the user factual/clarifying questions.
Return JSON only. No markdown.

Schema:
{ "question": "string" }  OR  { "question": null }

Rules:
- You have a budget: at most 3 questions from you in this phase total (the user message states how many you already asked).
- If you must ask another question and budget allows, return a single sharp "question" string.
- If you have no further questions, or budget is exhausted, return question null.
- Questions only; no lecturing.
"""


COUNSEL_NGT_SYSTEM = """You are one counsel persona (name + instruction). You previously could not see other personas' private notes.
Return JSON only. No markdown.

Schema:
{ "opinion": "string" }

Rules:
- Give your independent opinion on the stated problem (3–8 sentences). Be substantive and in-character.
- Do not refer to what other personas might think (you cannot see them).
"""


COUNSEL_COLLISIONS_SYSTEM = """You are the Host. Given a problem summary and each persona's blind opinion, identify tension areas.
Return JSON only. No markdown.

Schema:
{
  "areas": [
    {
      "id": "area_1",
      "title": "short label",
      "positions": [
        { "persona_id": "string", "persona_label": "display name", "stance": "one sentence" }
      ]
    }
  ]
}

Rules:
- Produce at most 5 areas (fewer if genuine disagreements are limited).
- Each area must reflect opposing or diverging stakes; cite which personas (by persona_id/persona_label) align where.
- persona_id must match ids from the input list exactly.
"""


COUNSEL_DEBATE_SYSTEM = (
    "You are simulating one turn of an OPEN debate for ONE collision area. "
    + HOST_NAME
    + " (you) picks who speaks next.\nReturn JSON only. No markdown.\n\nSchema:\n"
    '{"next_speaker": "string (exact persona name OR Host)", "utterance": "string (max 3 sentences; empty if pass)", '
    '"passed": false, "off_track": false}\n\n'
    "Rules:\n"
    "- The public transcript so far is visible to all.\n"
    f"- {HOST_NAME} should only be next_speaker when giving a brief intervention — max 2 sentences.\n"
    "- Any persona may pass: set passed=true and utterance=\"\".\n"
    "- Otherwise next_speaker delivers utterance in their voice, at most 3 sentences.\n"
    f"- If off_track, next_speaker should be {HOST_NAME} with a corrective utterance.\n"
    "- Choose next_speaker strategically (Host's choice).\n"
)


COUNSEL_OPTIONS_SYSTEM = """You are the Host. After debate on collision areas, propose decision options for ranked voting.
Return JSON only. No markdown.

Schema:
{
  "areas": [
    {
      "area_id": "string",
      "options": [
        { "id": "opt_area_x_1", "label": "short option text" }
      ]
    }
  ]
}

Rules:
- For EACH input area_id, give 1–2 options (at most 2 per area, fewer than 3).
- Options should be distinct, actionable directions derived from the debate.
- option ids must be unique across all areas (e.g. opt_a1_1, opt_a2_1).
"""


COUNSEL_PUBLIC_FIGURE_SYSTEM = """You write a single "persona instruction" string for a multi-person counsel / roundtable LLM session.
Return JSON only. No markdown.

Schema:
{ "instruction": "string" }

Rules:
- The user names a real public figure. You receive short excerpts from open-web search (news, encyclopedias, interviews, speeches). Ground speaking style, argument patterns, and visible expertise themes ONLY in those excerpts. Where excerpts are thin or ambiguous, say so inside the instruction and stay conservative.
- The instruction tells the model to roleplay in the *spirit* of that figure for professional discussion: do not claim to be the actual person, do not fabricate private facts, do not defame, do not give medical/legal authority.
- Include: (1) voice and phrasing when supported by excerpts; (2) how they structure arguments when visible; (3) domains of expertise or recurring values from excerpts; (4) an explicit line that this is an approximate simulation for brainstorming and may be incomplete.
- Write in imperative second person ("You are…", "You prioritize…"). Target 800–2500 characters unless excerpts justify more (cap at ~3500 characters of text in "instruction").
- Default language: match the user's need; if excerpts are mostly English, write the instruction in English.
"""


COUNSEL_VOTES_SYSTEM = """You simulate ranked voting: each counsel persona submits a strict ranking of options WITHIN each area.
Return JSON only. No markdown.

Schema:
{
  "votes": [
    {
      "persona_id": "string",
      "rankings": [
        {
          "area_id": "string",
          "ranked_option_ids": ["best", "second", ...],
          "rationale": "One concise sentence explaining why this ordering for this area, in character for that persona."
        }
      ]
    }
  ]
}

Rules:
- Every input persona must appear exactly once in votes.
- For each area, include ALL option ids for that area in ranked_option_ids, best first. No ties. No omissions.
- For each ranking object, rationale must be exactly one short sentence (max ~200 characters), first person or neutral, tied to that persona's lens.
- Vote in line with each persona's stated instruction and the debate/opinions.
"""


COUNSEL_FINAL_SYSTEM = (
    ASSISTANT_APPLY_SYSTEM
    + "\n\nAdditional keys for Counsel finalize ONLY (one JSON object):\n"
    + '- "recommendation": string — executive summary for the user.\n'
    + '- "discussion_summary": string — what was decided / voted.\n'
    + '- "recommended_mindmap_changes": string — numbered edits aligned with the patch.\n'
    + "Patch keys must implement the recommendation under branch rules."
)


def _patch_keys_only(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "update_nodes": data.get("update_nodes") if isinstance(data.get("update_nodes"), list) else [],
        "add_nodes": data.get("add_nodes") if isinstance(data.get("add_nodes"), list) else [],
        "add_edges": data.get("add_edges") if isinstance(data.get("add_edges"), list) else [],
        "remove_node_ids": data.get("remove_node_ids") if isinstance(data.get("remove_node_ids"), list) else [],
    }


def counsel_problem_turn(
    *,
    llm: LlmClient,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    selected_node_id: str,
    source_context: str | None,
    user_problem_draft: str,
    transcript: list[dict[str, Any]],
) -> dict[str, Any]:
    ctx = _subtree_graph_context(
        full_nodes=full_nodes,
        full_edges=full_edges,
        selected_node_id=selected_node_id.strip(),
    )
    snap = _node_snapshot(full_nodes, selected_node_id.strip())
    lines = [
        "Selected node snapshot:",
        snap,
        "",
        "Subtree context:",
        ctx,
        "",
        "User's problem draft / elaboration:",
        (user_problem_draft or "").strip() or "(none)",
        "",
        "Prior Host–User exchange:",
        _counsel_pair_transcript(transcript),
    ]
    if source_context:
        lines.extend(["", "Relevant source excerpts:", source_context[:60000]])
    user_prompt = "\n".join(lines)
    data = llm.generate_json(system=COUNSEL_PROBLEM_SYSTEM, user=user_prompt, max_output_tokens=2048)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return an object")
    kind = str(data.get("kind") or "").strip().lower()
    if kind not in ("question", "summary_ready"):
        kind = "question"
    msg = str(data.get("message") or "").strip()
    if not msg:
        raise ValueError("Empty Host message")
    return {"kind": kind, "message": msg}


def _counsel_pair_transcript(rows: list[dict[str, Any]], *, max_chars: int = 12000) -> str:
    lines: list[str] = []
    for r in rows:
        role = (r.get("role") or "").strip().lower()
        content = (r.get("content") or "").strip()
        if not content:
            continue
        tag = HOST_NAME if role == "host" else "User"
        lines.append(f"{tag}: {content}")
    text = "\n".join(lines)
    if len(text) > max_chars:
        text = "…(truncated)\n" + text[-max_chars:]
    return text or "(none)"


def counsel_fact_next_question(
    *,
    llm: LlmClient,
    persona_name: str,
    persona_instruction: str,
    problem_summary: str,
    questions_asked_so_far: int,
    thread: list[dict[str, Any]],
    source_context: str | None,
) -> dict[str, Any]:
    budget_left = max(0, 3 - int(questions_asked_so_far))
    lines = [
        f"Persona name: {persona_name}",
        f"Persona instruction: {persona_instruction}",
        "",
        f"Agreed problem summary:\n{problem_summary.strip()}",
        "",
        f"Questions you already asked in this phase: {questions_asked_so_far} (max 3; you may ask at most {budget_left} more).",
        "",
        "Thread (you / user):",
        _counsel_fact_thread(thread),
    ]
    if source_context:
        lines.extend(["", "Sources (truncated):", source_context[:20000]])
    data = llm.generate_json(system=COUNSEL_FACT_SYSTEM, user="\n".join(lines), max_output_tokens=512)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return an object")
    q = data.get("question")
    if q is None:
        return {"question": None}
    qs = str(q).strip()
    if not qs or budget_left <= 0:
        return {"question": None}
    return {"question": qs}


def _counsel_fact_thread(thread: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for r in thread:
        role = (r.get("role") or "").strip().lower()
        c = (r.get("content") or "").strip()
        if not c:
            continue
        lines.append(f"{('Persona' if role == 'persona' else 'User')}: {c}")
    return "\n".join(lines) or "(start)"


def counsel_ngt_opinion(
    *,
    llm: LlmClient,
    persona_name: str,
    persona_instruction: str,
    problem_summary: str,
    fact_digest: str,
    source_context: str | None,
) -> dict[str, Any]:
    lines = [
        f"Persona name: {persona_name}",
        f"Persona instruction: {persona_instruction}",
        "",
        f"Problem summary:\n{problem_summary.strip()}",
        "",
        "Fact-finding digest (all Q&A, shared):",
        fact_digest[:12000],
    ]
    if source_context:
        lines.extend(["", "Sources:", source_context[:20000]])
    data = llm.generate_json(system=COUNSEL_NGT_SYSTEM, user="\n".join(lines), max_output_tokens=1024)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return an object")
    op = str(data.get("opinion") or "").strip()
    if not op:
        raise ValueError("Empty opinion")
    return {"opinion": op}


def counsel_collision_areas(
    *,
    llm: LlmClient,
    problem_summary: str,
    personas: list[dict[str, Any]],
    opinions: dict[str, str],
) -> dict[str, Any]:
    plist = []
    for p in personas:
        pid = str(p.get("id") or "").strip()
        name = str(p.get("name") or "").strip()
        if pid and name:
            plist.append(f"- id={pid} name={name}")
    opin_lines = []
    for pid, text in opinions.items():
        opin_lines.append(f"Persona id {pid}:\n{text.strip()}")
    user_prompt = "\n".join(
        [
            f"Problem summary:\n{problem_summary.strip()}",
            "",
            "Personas:",
            "\n".join(plist),
            "",
            "Blind opinions:",
            "\n\n".join(opin_lines) or "(none)",
        ]
    )
    data = llm.generate_json(system=COUNSEL_COLLISIONS_SYSTEM, user=user_prompt, max_output_tokens=4096)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return an object")
    areas = data.get("areas")
    if not isinstance(areas, list):
        raise ValueError("missing areas")
    out: list[dict[str, Any]] = []
    for i, a in enumerate(areas[:5]):
        if not isinstance(a, dict):
            continue
        aid = str(a.get("id") or f"area_{i+1}").strip()
        title = str(a.get("title") or aid).strip()
        pos = a.get("positions")
        if not isinstance(pos, list):
            pos = []
        out.append({"id": aid, "title": title, "positions": pos})
    if not out:
        raise ValueError("no collision areas parsed")
    return {"areas": out}


def counsel_debate_step(
    *,
    llm: LlmClient,
    problem_summary: str,
    area: dict[str, Any],
    personas: list[dict[str, Any]],
    transcript: list[dict[str, Any]],
) -> dict[str, Any]:
    persona_names = [str(p.get("name") or "").strip() for p in personas if str(p.get("name") or "").strip()]
    lines = [
        f"Problem summary:\n{problem_summary.strip()}",
        "",
        "Collision area:",
        json.dumps(area, ensure_ascii=False, indent=2)[:8000],
        "",
        "Personas (names matter for next_speaker):",
        ", ".join(persona_names),
        "",
        "Public debate transcript:",
        _debate_transcript(transcript),
    ]
    data = llm.generate_json(system=COUNSEL_DEBATE_SYSTEM, user="\n".join(lines), max_output_tokens=1024)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return an object")
    return {
        "next_speaker": str(data.get("next_speaker") or HOST_NAME).strip(),
        "utterance": str(data.get("utterance") or "").strip(),
        "passed": bool(data.get("passed")),
        "off_track": bool(data.get("off_track")),
    }


def _debate_transcript(transcript: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for r in transcript:
        sp = (r.get("speaker") or "").strip()
        c = (r.get("content") or "").strip()
        if sp and c:
            lines.append(f"{sp}: {c}")
    return "\n".join(lines) or "(debate starting)"


def counsel_vote_options(
    *,
    llm: LlmClient,
    problem_summary: str,
    selected_areas: list[dict[str, Any]],
    debate_digest: str,
) -> dict[str, Any]:
    lines = [
        f"Problem summary:\n{problem_summary.strip()}",
        "",
        "Collision areas (selected):",
        json.dumps(selected_areas, ensure_ascii=False, indent=2)[:12000],
        "",
        "Debate digest (per area):",
        debate_digest[:20000],
    ]
    data = llm.generate_json(system=COUNSEL_OPTIONS_SYSTEM, user="\n".join(lines), max_output_tokens=2048)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return an object")
    areas = data.get("areas")
    if not isinstance(areas, list):
        raise ValueError("missing areas")
    return {"areas": areas}


def counsel_simulate_rank_votes(
    *,
    llm: LlmClient,
    problem_summary: str,
    personas: list[dict[str, Any]],
    options_payload: list[dict[str, Any]],
) -> dict[str, Any]:
    lines = [
        f"Problem summary:\n{problem_summary.strip()}",
        "",
        "Personas:",
        json.dumps(personas, ensure_ascii=False)[:8000],
        "",
        "Areas and options to rank:",
        json.dumps(options_payload, ensure_ascii=False)[:12000],
    ]
    data = llm.generate_json(system=COUNSEL_VOTES_SYSTEM, user="\n".join(lines), max_output_tokens=4096)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return an object")
    votes = data.get("votes")
    if not isinstance(votes, list):
        raise ValueError("missing votes")
    return {"votes": votes}


def counsel_propose_final(
    *,
    llm: LlmClient,
    branch_root_id: str,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    selected_node_id: str,
    problem_summary: str,
    vote_summary_text: str,
    custom_skills: list[dict[str, Any]],
    builtin_skills: dict[str, bool],
    sandbox_mode: bool,
) -> dict[str, Any]:
    all_ids = {str(n["id"]) for n in full_nodes if isinstance(n, dict) and n.get("id")}
    edges_raw = [e for e in full_edges if isinstance(e, dict)]
    branch_ids = collect_branch_node_ids(root_id=branch_root_id, edges=edges_raw, all_ids=all_ids)
    if not branch_ids:
        raise ValueError("branch_root_id invalid")
    branch_nodes = [n for n in full_nodes if isinstance(n, dict) and str(n.get("id")) in branch_ids]
    branch_edges = [
        e for e in edges_raw if str(e.get("source", "")) in branch_ids and str(e.get("target", "")) in branch_ids
    ]
    extra = _sandbox_apply_extra(sandbox_mode=sandbox_mode)
    node_lines = [f"- id={n.get('id')} label={n.get('label')!r}" for n in branch_nodes]
    edge_lines = [f"- {e.get('source')} -> {e.get('target')}" for e in branch_edges]
    head = [
        f"Branch root: {branch_root_id}",
        f"Focus node: {selected_node_id}",
        "",
        f"Problem summary:\n{problem_summary.strip()}",
        "",
        "Votes / synthesis:",
        vote_summary_text.strip()[:16000],
        "",
    ]
    if extra:
        head.append(extra + "\n")
    user = "\n".join(
        [
            *head,
            "Skills:",
            _skills_block(custom_skills=custom_skills, builtin_skills=builtin_skills),
            "",
            "Branch nodes:",
            *node_lines[:80],
            "",
            "Branch edges:",
            *edge_lines[:120],
            "",
            "Return recommendation, discussion_summary, recommended_mindmap_changes, and patch keys.",
        ]
    )
    data = llm.generate_json(system=COUNSEL_FINAL_SYSTEM, user=user, max_output_tokens=8192)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return an object")
    rec = str(data.get("recommendation") or "").strip()
    disc = str(data.get("discussion_summary") or "").strip()
    rm = str(data.get("recommended_mindmap_changes") or "").strip()
    patch = _patch_keys_only(data)
    return {
        "recommendation": rec,
        "discussion_summary": disc,
        "recommended_mindmap_changes": rm,
        "patch": patch,
    }


def apply_counsel_patch(
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
        raise ValueError("branch_root_id invalid")
    return merge_review_patch(
        full_nodes=full_nodes,
        full_edges=full_edges,
        branch_root_id=branch_root_id,
        branch_ids=branch_ids,
        patch=patch,
    )


def counsel_public_figure_instruction(
    *,
    llm: LlmClient,
    person_name: str,
) -> dict[str, Any]:
    """Use Tavily open-web snippets + LLM to draft a persona instruction grounded in public sources."""
    from app.services.tavily_search import TavilyResult, format_multi_queries_for_prompt, tavily_search

    name = (person_name or "").strip()
    if not name:
        raise ValueError("person_name is required")

    queries = (
        f"{name} Wikipedia biography",
        f"{name} interviews speeches public statements",
    )
    sections: list[tuple[str, list[TavilyResult]]] = []
    for q in queries:
        try:
            rows = tavily_search(query=q, max_results=5)
        except RuntimeError as e:
            raise ValueError(str(e)) from e
        sections.append((q, rows))

    total_hits = sum(len(r[1]) for r in sections)
    if total_hits == 0:
        raise ValueError(
            "No web search results for this name. Try a fuller name or a different spelling. "
            "Ensure TAVILY_API_KEY / session setup includes Tavily."
        )

    blob = format_multi_queries_for_prompt(sections)
    user = (
        f"The user wants a counsel / roundtable persona based on this public figure: {name}\n\n"
        f"Open-web excerpts (may be incomplete or erroneous; treat as leads only):\n{blob}\n"
    )
    data = llm.generate_json(system=COUNSEL_PUBLIC_FIGURE_SYSTEM, user=user, max_output_tokens=2400)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return an object")
    ins = str(data.get("instruction") or "").strip()
    if not ins:
        raise ValueError("Empty instruction from model")
    if len(ins) > 8000:
        ins = ins[:7999] + "…"
    return {"instruction": ins, "source_queries": list(queries)}


def build_counsel_minutes_markdown(
    *,
    problem_keywords: str,
    problem_summary: str,
    recommendation: str,
    discussion_summary: str,
    vote_summary: str,
) -> str:
    slug = (problem_keywords or "session").strip()[:120]
    lines = [
        f"# Counsel minutes: {slug}",
        "",
        "## Agreed problem",
        problem_summary.strip() or "—",
        "",
        "## Discussion summary",
        discussion_summary.strip() or "—",
        "",
        "## Voting",
        vote_summary.strip() or "—",
        "",
        "## Recommendation",
        recommendation.strip() or "—",
        "",
    ]
    return "\n".join(lines)


def slugify_counsel_filename_base(keywords: str) -> str:
    s = (keywords or "session").strip().lower()
    s = re.sub(r"[^\w\-.]+", "_", s, flags=re.UNICODE)
    s = re.sub(r"_+", "_", s).strip("_")
    return (s or "session")[:80]
