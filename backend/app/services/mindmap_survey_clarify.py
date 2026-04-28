from __future__ import annotations

import re
from typing import Any

from app.services.llm_client import LlmClient

SYSTEM = """You help design a short follow-up survey BEFORE generating a structured mindmap.
The mindmap has one hub (root) and level-2 branches are major themes directly under the hub.

Your job:
1) Read the user's stated intent/goal and any file hints.
2) Infer what is ambiguous or important for structuring those level-2 branches.
3) Propose clarifying questions — mostly multiple-choice (users may pick ONE OR MORE per question where allowed).

Rules for OUTPUT:
- Return a single JSON object only (no markdown, no code fences).
- Use this exact shape:
{
  "intro": "short welcome for step 2 (1 sentence)",
  "clarification_note": "1-2 sentences: what you inferred was ambiguous or underspecified in the user's goal, and how these questions clarify level-2 branches",
  "questions": [ ... exactly 4 objects ... ],
  "open_followup": { "prompt": "...", "placeholder": "..." }
}

Each element of "questions" must be:
{
  "id": "stable_snake_case_id",
  "prompt": "clear question text",
  "allow_multiple": true,
  "options": [ { "id": "opt_a", "label": "short label" }, ... ]
}

- Exactly 4 questions. ALL 4 MUST have "allow_multiple": true so the user can pick one OR more options where it makes sense.
- Each question: between 4 and 7 options. Options must be mutually readable standalone (no "see above").
- Ids: use lowercase letters, digits, underscores only; keep unique across all options in the whole survey (prefix with q1_, q2_, etc. if needed).
- Tailor every question and option to the user's intent — draw plausible_level-2_themes, stakes, or lenses from what they wrote (no generic "Option/B/C" labels).
- The ONLY open-ended field in this step is "open_followup" (~20% of the step). Keep its prompt short. placeholder may be "".
- Keep all strings concise; labels under ~80 chars.
"""


def _slug(s: str) -> str:
    x = (s or "").strip().lower()
    x = re.sub(r"[^a-z0-9_]+", "_", x)
    x = re.sub(r"_+", "_", x).strip("_")
    return x or "item"


def _fallback_payload(*, intent: str) -> dict[str, Any]:
    hint = (intent or "").strip()[:120]
    return {
        "intro": "Fine-tune how the main themes under the hub should be shaped.",
        "clarification_note": "Your goal can be read several ways; these choices narrow the level-2 branch focus.",
        "questions": [
            {
                "id": "q_level2_focus",
                "prompt": "Which dimensions should dominate the main branches under the hub?",
                "allow_multiple": True,
                "options": [
                    {"id": "q1_strategy", "label": "Strategy & recommendations"},
                    {"id": "q1_risks", "label": "Risks, constraints & mitigations"},
                    {"id": "q1_evidence", "label": "Evidence / fact base & citations"},
                    {"id": "q1_stakeholders", "label": "Stakeholders & decisions"},
                    {"id": "q1_process", "label": "Process, timeline & execution"},
                    {"id": "q1_metrics", "label": "Metrics, targets & value case"},
                ],
            },
            {
                "id": "q_branch_breadth",
                "prompt": "How many main themes (level-2 branches) feel right under the hub?",
                "allow_multiple": True,
                "options": [
                    {"id": "q2_auto", "label": "Let the model decide from the material"},
                    {"id": "q2_three", "label": "About three focused themes"},
                    {"id": "q2_four_five", "label": "About four to five themes"},
                    {"id": "q2_six", "label": "Up to six if the material supports it"},
                    {"id": "q2_minimal", "label": "As few as possible — prioritize depth over breadth"},
                ],
            },
            {
                "id": "q_audience_tone",
                "prompt": "Who is the primary audience for this map?",
                "allow_multiple": True,
                "options": [
                    {"id": "q3_exec", "label": "Executives / board"},
                    {"id": "q3_legal", "label": "Legal / compliance"},
                    {"id": "q3_technical", "label": "Technical / product"},
                    {"id": "q3_ops", "label": "Operations"},
                    {"id": "q3_investor", "label": "Investors / finance"},
                    {"id": "q3_general", "label": "General business reader"},
                ],
            },
            {
                "id": "q_emphasis",
                "prompt": "What should we emphasize vs de-emphasize in the branch labels?",
                "allow_multiple": True,
                "options": [
                    {"id": "q4_actions", "label": "Concrete actions & next steps"},
                    {"id": "q4_diagnosis", "label": "Root-cause / diagnosis"},
                    {"id": "q4_synopsis", "label": "High-level synopsis only"},
                    {"id": "q4_debate", "label": "Trade-offs & opposing views"},
                    {"id": "q4_compliance", "label": "Regulatory / policy alignment"},
                ],
            },
        ],
        "open_followup": {
            "prompt": "Anything else we should respect when naming level-2 branches?",
            "placeholder": hint or "Optional — constraints, jargon to use or avoid…",
        },
    }


def _normalize_question(q: Any, idx: int) -> dict[str, Any] | None:
    if not isinstance(q, dict):
        return None
    pid = _slug(str(q.get("id") or f"q_{idx}"))
    prompt = str(q.get("prompt") or "").strip()
    if not prompt:
        return None
    # Product policy: all MCQs in this step allow multiple selections (~80% MCQ vs one open field).
    allow_multiple = True
    raw_opts = q.get("options")
    if not isinstance(raw_opts, list):
        return None
    options: list[dict[str, str]] = []
    seen: set[str] = set()
    for j, o in enumerate(raw_opts):
        if not isinstance(o, dict):
            continue
        oid = _slug(str(o.get("id") or f"{pid}_opt_{j}"))
        if oid in seen:
            oid = f"{pid}_opt_{j}"
        seen.add(oid)
        lab = str(o.get("label") or "").strip()
        if not lab:
            continue
        options.append({"id": oid, "label": lab[:200]})
    if len(options) < 3:
        return None
    options = options[:7]
    return {"id": pid, "prompt": prompt[:500], "allow_multiple": allow_multiple, "options": options}


def normalize_llm_survey(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        return _fallback_payload(intent="")
    intro = str(data.get("intro") or "").strip() or "Align structure before generating the mindmap."
    note = str(data.get("clarification_note") or "").strip() or "These choices refine level-2 branches under the hub."
    qs_raw = data.get("questions")
    questions: list[dict[str, Any]] = []
    if isinstance(qs_raw, list):
        for i, q in enumerate(qs_raw):
            nq = _normalize_question(q, i)
            if nq:
                questions.append(nq)
    while len(questions) < 4:
        fb = _fallback_payload(intent="")
        for j, fq in enumerate(fb["questions"]):
            if len(questions) >= 4:
                break
            nq = _normalize_question(fq, len(questions) + j)
            if nq and nq["id"] not in {x["id"] for x in questions}:
                questions.append(nq)
    questions = questions[:4]

    open_raw = data.get("open_followup")
    if not isinstance(open_raw, dict):
        open_raw = {}
    open_followup = {
        "prompt": str(open_raw.get("prompt") or "Anything else we should know?").strip()[:400],
        "placeholder": str(open_raw.get("placeholder") or "").strip()[:240],
    }

    return {
        "intro": intro[:400],
        "clarification_note": note[:600],
        "questions": questions,
        "open_followup": open_followup,
    }


def build_clarification_survey(
    *,
    intent: str,
    has_queued_files: bool,
    queued_filenames: list[str],
    has_stored_selection: bool,
    stored_filenames: list[str],
) -> dict[str, Any]:
    intent = (intent or "").strip()
    ctx_parts = [
        f"User intent / goal:\n{intent or '(empty)'}",
        f"Has files queued for upload in the UI: {bool(has_queued_files)}",
    ]
    if queued_filenames:
        ctx_parts.append("Queued filenames:\n- " + "\n- ".join(queued_filenames[:25]))
    ctx_parts.append(f"User selected existing project files for this run: {bool(has_stored_selection)}")
    if stored_filenames:
        ctx_parts.append("Selected stored filenames:\n- " + "\n- ".join(stored_filenames[:25]))
    user_block = "\n\n".join(ctx_parts)

    llm = LlmClient()
    try:
        raw = llm.generate_json(
            system=SYSTEM,
            user=user_block,
            max_output_tokens=4096,
        )
        return normalize_llm_survey(raw)
    except Exception:
        return normalize_llm_survey(_fallback_payload(intent=intent))

