from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.llm_client import LlmClient

router = APIRouter()

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _load_framework_excerpt() -> str:
    p = _DATA_DIR / "consulting_analysis_framework_excerpt.md"
    try:
        return p.read_text(encoding="utf-8")
    except Exception:
        return (
            "Follow professional consulting report Phase 1: chapter skeleton with "
            "Analysis Objective, Analysis Logic (named frameworks), Core Hypothesis, "
            "data requirements, visualization plan."
        )


_FRAMEWORK_EXCERPT = _load_framework_excerpt()


class WordReportNode(BaseModel):
    id: str
    label: Optional[str] = None
    type: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    status: Optional[str] = None
    violation_summary: Optional[str] = None
    inferred_consequences: Optional[str] = None


class WordReportEdge(BaseModel):
    source: str
    target: str
    label: Optional[str] = None


class WordChapter(BaseModel):
    id: str
    title: str = ""
    analysis_objective: str = ""
    analysis_logic: str = ""
    core_hypothesis: str = ""
    data_requirements: str = ""
    visualization_plan: str = ""


# --- generate framework ---


class WordFrameworkGenerateRequest(BaseModel):
    intent: str = Field(..., min_length=1)
    target_audience: str = Field(default="")
    output_locale: str = Field(default="en")
    source_corpus: str = Field(default="", description="Optional text from project files / uploads")
    nodes: List[WordReportNode] = Field(default_factory=list)
    edges: List[WordReportEdge] = Field(default_factory=list)


class WordFrameworkGenerateResponse(BaseModel):
    framework_selection: str = ""
    chapters: List[WordChapter]


# --- chat refine ---


class WordChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class WordFrameworkChatRequest(BaseModel):
    intent: str = Field(default="")
    target_audience: str = Field(default="")
    source_corpus: str = Field(default="")
    framework_selection: str = Field(default="")
    nodes: List[WordReportNode] = Field(default_factory=list)
    edges: List[WordReportEdge] = Field(default_factory=list)
    chapters: List[WordChapter] = Field(default_factory=list)
    messages: List[WordChatMessage] = Field(default_factory=list)
    target_chapter_id: Optional[str] = None  # null = whole framework


class WordFrameworkChatResponse(BaseModel):
    reply: str
    chapters: List[WordChapter]
    framework_selection: str = ""


# --- gap review ---


class WordGapRequest(BaseModel):
    intent: str = Field(default="")
    target_audience: str = Field(default="")
    source_corpus: str = Field(default="")
    nodes: List[WordReportNode] = Field(default_factory=list)
    edges: List[WordReportEdge] = Field(default_factory=list)
    framework_selection: str = Field(default="")
    chapters: List[WordChapter] = Field(default_factory=list)


class WordGapItem(BaseModel):
    area: str
    issue: str
    needed_data_or_action: str
    # Exact mindmap node id(s) this gap is meant to address (from NODES: digest).
    target_node_ids: List[str] = Field(default_factory=list)


class WordNodePromptItem(BaseModel):
    node_id: str
    node_label: str = ""
    prompt: str


class WordGapResponse(BaseModel):
    sufficient: bool
    summary: str
    gaps: List[WordGapItem]
    assistant_completion_prompt: str
    # One copy-paste block per target node, ordered to match the mindmap digest.
    node_assistant_prompts: List[WordNodePromptItem] = Field(default_factory=list)


# --- final markdown ---


class WordFinalMarkdownRequest(BaseModel):
    intent: str = Field(default="")
    target_audience: str = Field(default="")
    source_corpus: str = Field(default="")
    nodes: List[WordReportNode] = Field(default_factory=list)
    edges: List[WordReportEdge] = Field(default_factory=list)
    framework_selection: str = Field(default="")
    chapters: List[WordChapter] = Field(default_factory=list)
    include_chapter_writing_prompts: bool = True
    include_visual_ideas: bool = True


class WordFinalMarkdownResponse(BaseModel):
    markdown: str
    filename: str = "word-export-report.md"


def _mm_digest(nodes: List[WordReportNode], edges: List[WordReportEdge]) -> str:
    lines_n = [f"- {n.id} | {n.type} | {n.label}" for n in nodes[:400]]
    lines_e = [f"- {e.source} -> {e.target} | {e.label}" for e in edges[:800]]
    return "\n".join(["NODES:", *lines_n, "", "EDGES (parent->child):", *lines_e])


def _node_label_by_id(nodes: List[WordReportNode]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for n in nodes:
        if not n.id:
            continue
        out[str(n.id)] = (str(n.label or "").strip() or str(n.id))
    return out


def _order_node_prompts(
    items: List[WordNodePromptItem], nodes: List[WordReportNode]
) -> List[WordNodePromptItem]:
    order = {str(n.id): i for i, n in enumerate(nodes) if n.id}

    def sort_key(x: WordNodePromptItem) -> tuple[int, int, str]:
        if x.node_id.startswith("_"):
            return (1, 0, x.node_id)
        return (0, order.get(x.node_id, 10_000), x.node_id)

    return sorted(items, key=sort_key)


def _fallback_node_assistant_prompts(
    gaps: List[WordGapItem],
    nodes: List[WordReportNode],
    summary: str,
) -> List[WordNodePromptItem]:
    """Group gaps by target_node_ids when the model does not return node_assistant_prompts."""
    labels = _node_label_by_id(nodes)
    by_id: dict[str, List[WordGapItem]] = defaultdict(list)
    unassigned: List[WordGapItem] = []
    for g in gaps:
        ids = [str(x).strip() for x in (g.target_node_ids or []) if str(x).strip()]
        placed = False
        for nid in ids:
            if nid in labels:
                by_id[nid].append(g)
                placed = True
        if not placed:
            unassigned.append(g)
    out: List[WordNodePromptItem] = []
    for nid, items in sorted(by_id.items()):
        lines: List[str] = [
            "You are in the in-app mindmap **Assistant** (sandbox is fine if you prefer).",
            f"**Target node:** `{nid}` — {labels.get(nid, nid)}",
        ]
        if summary:
            s = summary[:700] + ("…" if len(summary) > 700 else "")
            lines.append(f"**Data check summary:** {s}")
        lines.extend(["", "Close these report-framework gaps (Evidence/Inferred children, source files):"])
        for it in items:
            lines.append(f"- **{it.area}**: {it.issue}\n  → {it.needed_data_or_action}")
        out.append(WordNodePromptItem(node_id=nid, node_label=labels.get(nid, ""), prompt="\n".join(lines)))
    if unassigned:
        u_lines = [
            "You are in the in-app mindmap **Assistant**.",
            "**These gaps are not tied to a single node id** (or node ids were missing). Address under the right branch or add evidence in Source:",
        ]
        for g in unassigned:
            u_lines.append(f"- **{g.area}**: {g.issue} → {g.needed_data_or_action}")
        out.append(
            WordNodePromptItem(
                node_id="_general",
                node_label="(general / pick branch)",
                prompt="\n".join(u_lines),
            )
        )
    return _order_node_prompts(out, nodes)


def _chapters_to_json_list(ch: List[WordChapter]) -> List[dict[str, Any]]:
    return [c.model_dump() for c in ch]


def _normalize_chapters(data: Any) -> List[WordChapter]:
    if not isinstance(data, list):
        return []
    out: List[WordChapter] = []
    for i, row in enumerate(data):
        if not isinstance(row, dict):
            continue
        cid = str(row.get("id") or f"ch_{i + 1}").strip() or f"ch_{i + 1}"
        out.append(
            WordChapter(
                id=cid,
                title=str(row.get("title") or "")[:500],
                analysis_objective=str(row.get("analysis_objective") or "")[:8000],
                analysis_logic=str(row.get("analysis_logic") or "")[:8000],
                core_hypothesis=str(row.get("core_hypothesis") or "")[:8000],
                data_requirements=str(row.get("data_requirements") or "")[:8000],
                visualization_plan=str(row.get("visualization_plan") or "")[:8000],
            )
        )
    return out


@router.post("/export/word/generate-framework", response_model=WordFrameworkGenerateResponse)
def word_generate_framework(req: WordFrameworkGenerateRequest) -> WordFrameworkGenerateResponse:
    if not req.nodes:
        raise HTTPException(status_code=400, detail="No mindmap nodes in selection")
    system = f"""You are a senior strategy consultant. Design a Phase-1 **analysis framework** (NOT the final report).
Use this methodology reference (abridged):
---
{_FRAMEWORK_EXCERPT}
---

Return **JSON only** (no markdown fences). Schema:
{{
  "framework_selection": "markdown string - table of chapters vs frameworks",
  "chapters": [
    {{
      "id": "ch_1",
      "title": "string",
      "analysis_objective": "string",
      "analysis_logic": "string - must name frameworks explicitly",
      "core_hypothesis": "string",
      "data_requirements": "string - bullets or short text",
      "visualization_plan": "string - chart/table ideas without inventing numbers"
    }}
  ]
}}
Rules:
- 4-10 chapters typically; align with the mindmap structure and user intent.
- **analysis_logic** must reference the consulting frameworks from the skill (e.g. Porter, TAM-SAM-SOM).
- If output_locale is zh or zh_CN, use professional Chinese for user-facing strings.
- Do not invent market statistics; framework phase may describe what data to find, not numbers.
""".strip()

    user = "\n".join(
        [
            f"User intent: {req.intent.strip()}",
            f"Target audience: {req.target_audience.strip() or 'General executive audience'}",
            f"output_locale: {req.output_locale.strip() or 'en'}",
            "",
            "Source / corpus (may be empty):",
            (req.source_corpus or "")[:120000],
            "",
            "Selected mindmap subgraph:",
            _mm_digest(req.nodes, req.edges),
        ]
    )

    try:
        llm = LlmClient()
        raw = llm.generate_json(
            system=system,
            user=user,
            max_output_tokens=8192,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e

    if not isinstance(raw, dict):
        raise HTTPException(status_code=500, detail="LLM returned non-object JSON")

    fs = str(raw.get("framework_selection") or "")
    ch = _normalize_chapters(raw.get("chapters"))
    if not ch:
        raise HTTPException(status_code=500, detail="LLM returned no chapters")
    return WordFrameworkGenerateResponse(framework_selection=fs, chapters=ch)


@router.post("/export/word/chat-framework", response_model=WordFrameworkChatResponse)
def word_chat_framework(req: WordFrameworkChatRequest) -> WordFrameworkChatResponse:
    if not req.chapters:
        raise HTTPException(status_code=400, detail="chapters required")
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages required")

    system = f"""You refine a consulting **analysis framework** (Phase 1). Methodology:
---
{_FRAMEWORK_EXCERPT}
---
Return JSON only. Schema:
{{
  "reply": "short assistant message to the user",
  "framework_selection": "optional - update if you changed global framework table; can be empty string to keep",
  "chapters": [ full updated chapter array with same fields as input ]
}}
If target_chapter_id is set in the user payload, change primarily that chapter but keep the framework coherent.
Preservation: keep chapter ids stable when possible. If you merge/split, assign new ids ch_1, ch_2...
""".strip()

    ch_json = json.dumps(_chapters_to_json_list(req.chapters), ensure_ascii=False)
    msg_lines = [f"- {m.role}: {m.content[:20000]}" for m in req.messages[-16:]]
    user = "\n".join(
        [
            f"User intent: {req.intent.strip()}",
            f"Target audience: {req.target_audience.strip()}",
            f"source_corpus excerpt: {(req.source_corpus or '')[:40000]}",
            "",
            "Mindmap digest:",
            _mm_digest(req.nodes, req.edges),
            "",
            f"target_chapter_id: {req.target_chapter_id!r}",
            "",
            "Current framework_selection (may be empty):",
            (req.framework_selection or "")[:20000],
            "Current chapters JSON:",
            ch_json,
            "",
            "Conversation (latest last):",
            *msg_lines,
        ]
    )

    try:
        llm = LlmClient()
        raw = llm.generate_json(system=system, user=user, max_output_tokens=8192)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e

    if not isinstance(raw, dict):
        raise HTTPException(status_code=500, detail="LLM returned non-object JSON")
    reply = str(raw.get("reply") or "").strip() or "Updated."
    fs_new = str(raw.get("framework_selection") or "").strip()
    fs_out = fs_new if fs_new else (req.framework_selection or "")
    ch_out = _normalize_chapters(raw.get("chapters"))
    if not ch_out:
        ch_out = req.chapters
    return WordFrameworkChatResponse(
        reply=reply,
        chapters=ch_out,
        framework_selection=fs_out,
    )


@router.post("/export/word/gap-review", response_model=WordGapResponse)
def word_gap_review(req: WordGapRequest) -> WordGapResponse:
    if not req.chapters:
        raise HTTPException(status_code=400, detail="chapters required")

    system = """You check whether a consulting report framework can be executed given the **mindmap** and **source corpus**.

Return JSON only. Schema:
{
  "sufficient": boolean,
  "summary": "one short paragraph",
  "gaps": [
    {
      "area": "e.g. Chapter 2 or theme",
      "issue": "what is missing",
      "needed_data_or_action": "concrete next step",
      "target_node_ids": ["exact_id_from_mindmap_digest", "…"]
    }
  ],
  "node_assistant_prompts": [
    {
      "node_id": "exact_id_from_NODES_line",
      "node_label": "short label from mindmap",
      "prompt": "Standalone copy-paste block for the Assistant focused ONLY on this node: what to add, which evidence, children to create"
    }
  ],
  "assistant_completion_prompt": "Optional one combined prompt; can be shorter if node_assistant_prompts is complete."
}

Rules:
- **target_node_ids**: use only node `id` values that appear in the **NODES:** list in the user message. If a gap applies to several nodes, repeat the gap with different targets or list multiple ids (max 6 per gap).
- **node_assistant_prompts**: one entry per **distinct** node that needs work. **Order** entries in the same order those nodes first appear in the NODES: list. Skip nodes that need no work.
- Each **prompt** under node_assistant_prompts must be self-contained (user copies only that block for that branch).
- If data is clearly insufficient, set sufficient false. Do not fabricate that data exists.
""".strip()

    user = "\n".join(
        [
            f"Intent: {req.intent.strip()}",
            f"Audience: {req.target_audience.strip()}",
            "",
            "Source corpus (may be empty):",
            (req.source_corpus or "")[:120000],
            "",
            "Framework selection:",
            (req.framework_selection or "")[:20000],
            "",
            "Chapters JSON:",
            json.dumps(_chapters_to_json_list(req.chapters), ensure_ascii=False)[:80000],
            "",
            "Mindmap:",
            _mm_digest(req.nodes, req.edges),
        ]
    )

    try:
        llm = LlmClient()
        raw = llm.generate_json(system=system, user=user, max_output_tokens=4096)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e

    if not isinstance(raw, dict):
        raise HTTPException(status_code=500, detail="LLM returned non-object JSON")
    suff = bool(raw.get("sufficient"))
    summary = str(raw.get("summary") or "").strip()
    prompt = str(raw.get("assistant_completion_prompt") or "").strip()
    gaps_raw = raw.get("gaps")
    gaps: List[WordGapItem] = []
    if isinstance(gaps_raw, list):
        for g in gaps_raw[:40]:
            if not isinstance(g, dict):
                continue
            t_raw = g.get("target_node_ids")
            tids: List[str] = []
            if isinstance(t_raw, list):
                tids = [str(x).strip() for x in t_raw if str(x).strip()][:16]
            elif isinstance(t_raw, str) and t_raw.strip():
                tids = [t_raw.strip()][:1]
            gaps.append(
                WordGapItem(
                    area=str(g.get("area") or "")[:400],
                    issue=str(g.get("issue") or "")[:2000],
                    needed_data_or_action=str(
                        g.get("needed_data_or_action") or g.get("needed") or ""
                    )[:2000],
                    target_node_ids=tids,
                )
            )
    labels = _node_label_by_id(list(req.nodes))
    node_prompts: List[WordNodePromptItem] = []
    nps_raw = raw.get("node_assistant_prompts")
    if isinstance(nps_raw, list):
        for p in nps_raw[:32]:
            if not isinstance(p, dict):
                continue
            nid = str(p.get("node_id") or p.get("id") or "").strip()
            if not nid:
                continue
            plab = str(p.get("node_label") or "").strip()
            if not plab and nid in labels:
                plab = labels[nid]
            pr = str(p.get("prompt") or "").strip()
            if not pr:
                continue
            node_prompts.append(
                WordNodePromptItem(
                    node_id=nid[:200],
                    node_label=plab[:500],
                    prompt=pr[:12000],
                )
            )
    if not node_prompts and gaps:
        node_prompts = _fallback_node_assistant_prompts(gaps, list(req.nodes), summary)
    else:
        ordered = _order_node_prompts(node_prompts, list(req.nodes))
        node_prompts = []
        for np in ordered:
            if not np.node_label and np.node_id in labels:
                node_prompts.append(
                    WordNodePromptItem(
                        node_id=np.node_id,
                        node_label=labels[np.node_id],
                        prompt=np.prompt,
                    )
                )
            else:
                node_prompts.append(np)
    if not prompt:
        if node_prompts:
            prompt = "\n\n---\n\n".join(
                f"### {p.node_id} — {p.node_label or p.node_id}\n\n{p.prompt}" for p in node_prompts
            )
        else:
            prompt = (
                "In the Assistant, add Evidence nodes with source filenames and snippets for: "
                + (summary or "the metrics and citations implied by the framework.")
            )
    return WordGapResponse(
        sufficient=suff,
        summary=summary or ("OK" if suff else "See gaps below."),
        gaps=gaps,
        assistant_completion_prompt=prompt,
        node_assistant_prompts=node_prompts,
    )


@router.post("/export/word/final-markdown", response_model=WordFinalMarkdownResponse)
def word_final_markdown(req: WordFinalMarkdownRequest) -> WordFinalMarkdownResponse:
    if not req.chapters:
        raise HTTPException(status_code=400, detail="chapters required")

    system = """You produce a single Markdown document for download.

Sections:
1. Title, intent, audience, locale note
2. Framework selection (user content, passed in)
3. For each chapter: title, then **Analysis Objective**, **Analysis Logic**, **Core Hypothesis**
4. If include_chapter_writing_prompts: for each chapter add ### Writing prompt for report phase with bullet instructions (no fake data)
5. If include_visual_ideas: add ### Suggested visuals with chart types / axes (no numbers)

Output **only** the markdown body. No JSON. Use professional consulting tone. Reference Data Authenticity: final writing must not invent numbers beyond sources.

The mindmap and corpus are for context in prompts only.
""".strip()

    ch_blocks = []
    for c in req.chapters:
        ch_blocks.append(
            "\n".join(
                [
                    f"## {c.title or c.id}",
                    f"**Analysis Objective**: {c.analysis_objective}",
                    f"**Analysis Logic**: {c.analysis_logic}",
                    f"**Core Hypothesis**: {c.core_hypothesis}",
                    f"**Data requirements**: {c.data_requirements}",
                    f"**Visualization plan**: {c.visualization_plan}",
                ]
            )
        )

    user = "\n".join(
        [
            f"# Report framework export – intent: {req.intent}",
            f"**Audience**: {req.target_audience}",
            "",
            "## Framework selection (from user)",
            req.framework_selection or "(none)",
            "",
            *ch_blocks,
            "",
            "Mindmap digest (context):",
            _mm_digest(req.nodes, req.edges)[:20000],
            "",
            "Source corpus excerpt:",
            (req.source_corpus or "")[:20000],
        ]
    )

    llm = LlmClient()
    system2 = system + '\n\nReturn JSON: { "markdown": "...full markdown..." } only.'
    user2 = user
    try:
        raw = llm.generate_json(
            system=system2,
            user=user2,
            max_output_tokens=16384,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not isinstance(raw, dict) or not str(raw.get("markdown") or "").strip():
        # Fallback: stitch manually
        md = "\n\n".join(
            [
                f"# {req.intent or 'Report framework'}",
                f"**Target audience:** {req.target_audience or '—'}",
                "",
                req.framework_selection,
                "",
                *ch_blocks,
            ]
        )
    else:
        md = str(raw.get("markdown") or "").strip()

    safe = re.sub(r"[^\w\-]+", "-", (req.intent or "report")[:40]).strip("-").lower() or "report"
    return WordFinalMarkdownResponse(markdown=md, filename=f"word-export-{safe}.md")


@router.get("/export/word/skill-excerpt")
def word_skill_excerpt() -> Dict[str, str]:
    return {"excerpt": _FRAMEWORK_EXCERPT, "source_url": "https://github.com/bytedance/deer-flow/blob/main/skills/public/consulting-analysis/SKILL.md"}
