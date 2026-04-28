from __future__ import annotations

import os
from typing import Any, Dict, List, Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.assistant_apply import apply_assistant_conversation_to_graph, run_assistant_chat
from app.services.project_source_text import load_for_assistant_prompt
from app.services.assistant_roundtable import apply_roundtable_patch, propose_roundtable_edits, run_roundtable_round
from app.services.assistant_mece import (
    mece_apply_selected_modifications,
    mece_check_evidence,
    mece_scan_two_levels,
)
from app.services.assistant_simulations import (
    OptimismInputs,
    black_swan_apply_mitigations_patch,
    black_swan_run_simulation,
    black_swan_scan_scenarios,
    simulate_optimism_and_patch,
)
from app.services.tavily_search import tavily_search
from app.services.llm_client import LlmClient, LlmConfig
from app.services.model_registry import get_active_model
from app.services.ppt_framework import (
    run_ppt_enrich_batch,
    run_ppt_reconcile,
    run_ppt_skeleton,
    run_ppt_framework_chat,
)
from app.services.skill_url_fetch import fetch_skill_text

router = APIRouter()


def _assistant_load_source_context(
    *,
    project_id: Optional[str],
    include_project_sources: bool,
    source_max_chars: int,
    source_file_ids: Optional[List[str]],
) -> Optional[str]:
    if not include_project_sources or source_max_chars <= 0:
        return None
    if source_file_ids is not None and len(source_file_ids) == 0:
        return None
    fids: Optional[List[str]]
    if source_file_ids is None:
        fids = None
    else:
        fids = [str(x).strip() for x in source_file_ids[:64] if str(x).strip()]
        if not fids:
            return None
    return load_for_assistant_prompt(
        project_id,
        include=True,
        max_chars=source_max_chars,
        file_ids=fids,
    )


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1)


class CustomSkillIn(BaseModel):
    name: str = Field(default="", max_length=120)
    instruction: str = Field(..., min_length=1, max_length=8000)
    enabled: bool = True


class AssistantChatRequest(BaseModel):
    messages: List[ChatMessageIn] = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    selected_node_id: Optional[str] = None
    web_search_query: Optional[str] = Field(
        default=None,
        description="When webSearch is on: one Tavily query per non-empty line (max ~12). If empty, the latest user message is used; use multiple lines there for multi-search.",
    )
    custom_skills: List[CustomSkillIn] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    sandbox_mode: bool = Field(
        default=False,
        description="User is exploring in sandbox; draft nodes may appear in the graph snapshot.",
    )
    project_id: Optional[str] = Field(
        default=None,
        description="When set, server may load extracted project file text and append to the model prompt.",
    )
    include_project_sources: bool = Field(
        default=True,
        description="If true and project_id is set, append MarkItDown / extracted text (truncated).",
    )
    source_max_chars: int = Field(
        default=40_000,
        ge=0,
        le=100_000,
        description="Cap on source text in the prompt; 0 disables attachment.",
    )
    source_file_ids: Optional[List[str]] = Field(
        default=None,
        description="Restrict to these project file ids (order preserved). Empty list = no files. Omitted = all files when sources are enabled.",
        max_length=64,
    )


class AssistantChatResponse(BaseModel):
    reply: str


class FetchSkillUrlRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2000)


class FetchSkillUrlResponse(BaseModel):
    instruction: str = Field(..., max_length=8000)
    suggested_name: str = Field(default="Remote skill", max_length=120)
    fetched_url: str = Field(default="", description="Final URL after redirects (for display).")


class PptSourceSnippetIn(BaseModel):
    name: str = Field(default="file", max_length=500)
    text: str = Field(default="", max_length=150000)


PptDeckStyle = Literal["consulting_mbb", "government", "academic", "creative"]


class PptFrameworkGenerateRequest(BaseModel):
    mindmap_markdown: str = Field(..., min_length=1, max_length=200000)
    intent: str = Field(..., min_length=1, max_length=8000)
    audience: str = Field(default="", max_length=4000)
    page_count: int = Field(default=8, ge=1, le=40)
    deck_style: PptDeckStyle = Field(
        default="consulting_mbb",
        description="Preset: consulting/MBB, government, academic, or creative; drives tone, titles, and visual conventions.",
    )
    style: str = Field(default="", max_length=2000)
    custom_skills: List[CustomSkillIn] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    source_snippets: List[PptSourceSnippetIn] = Field(default_factory=list)
    web_search_query: Optional[str] = None


class PptSlideOut(BaseModel):
    id: str
    title: str
    subtitle: str
    beat: str = Field(
        default="",
        description="One-line story beat: how this slide advances the arc (skeleton; optional in exports).",
    )
    main: str
    visual: str = Field(
        default="",
        description="Visual anchor and how content is shown (infographics, charts, tables for highlight/contrast).",
    )


class PptFrameworkGenerateResponse(BaseModel):
    slides: List[PptSlideOut]


class PptChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=60000)


class PptFrameworkChatRequest(BaseModel):
    messages: List[PptChatMessageIn] = Field(..., min_length=1)
    slides: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Current full deck; may be empty before first generation.",
    )
    mindmap_markdown: str = Field(..., min_length=1, max_length=200000)
    intent: str = Field(default="", max_length=8000)
    audience: str = Field(default="", max_length=4000)
    page_count: int = Field(default=8, ge=1, le=40)
    deck_style: PptDeckStyle = Field(
        default="consulting_mbb",
        description="Same presets as generate; keep refinements on-style.",
    )
    style: str = Field(default="", max_length=2000)
    target_slide_index: Optional[int] = Field(
        default=None,
        description="Optional 0-based index to focus edits on that slide; full slides still returned.",
    )
    custom_skills: List[CustomSkillIn] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    source_snippets: List[PptSourceSnippetIn] = Field(default_factory=list)
    web_search_query: Optional[str] = None


class PptFrameworkChatResponse(BaseModel):
    reply: str
    slides: List[PptSlideOut]


class PptEnrichBatchRequest(PptFrameworkGenerateRequest):
    slides: List[Dict[str, Any]] = Field(
        ...,
        min_length=1,
        description="Full current deck (skeleton+partial detail); only indices are enriched.",
    )
    indices: List[int] = Field(
        ...,
        min_length=1,
        max_length=8,
        description="0-based slide indices to fill with main+visual in this request.",
    )


class PptReconcileRequest(PptFrameworkGenerateRequest):
    slides: List[Dict[str, Any]] = Field(..., min_length=1, description="Full deck after enrichment.")


class PptReconcileResponse(BaseModel):
    reply: str
    slides: List[PptSlideOut]


class AssistantApplyRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    messages: List[ChatMessageIn] = Field(..., min_length=1)
    custom_skills: List[CustomSkillIn] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    sandbox_mode: bool = Field(
        default=False,
        description="Consolidate sandbox chat + draft graph edits into the branch under the root.",
    )
    project_id: Optional[str] = None
    include_project_sources: bool = Field(default=True, description="Append extracted file text to apply prompt when project_id is set.")
    source_max_chars: int = Field(default=40_000, ge=0, le=100_000)
    source_file_ids: Optional[List[str]] = Field(
        default=None,
        description="Restrict to these project file ids. Empty = none. Omitted = all files.",
        max_length=64,
    )


class AssistantApplyResponse(BaseModel):
    mindmap: Dict[str, Any]


class OptimismAffectedNodeIn(BaseModel):
    node_id: str = Field(..., min_length=1)
    label: str = Field(default="", max_length=500)
    reason: str = Field(default="", max_length=800)


class OptimismSimRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    optimism: int = Field(
        default=50,
        ge=0,
        le=100,
        description="Legacy 0–100 scenario spread; ignored when focus_metric and delta_pct are set.",
    )
    currency: str = Field(default="USD", max_length=8)
    tam_total: Optional[float] = None
    target_segment_pct: Optional[float] = None
    arpa_year: Optional[float] = None
    customers_total: Optional[float] = None
    penetration_pct: Optional[float] = None
    focus_metric: Optional[Literal["TAM", "SOM", "ARR"]] = Field(
        default=None,
        description="Meter mode: which baseline metric to stress (with delta_pct).",
    )
    delta_pct: Optional[int] = Field(
        default=None,
        ge=-100,
        le=100,
        description="Signed percent change vs baseline; server snaps to nearest 10%.",
    )
    baseline_som_override: Optional[float] = Field(
        default=None,
        description="When SOM cannot be derived from TAM × segment %, pass branch-parsed SOM.",
    )
    affected_nodes: List[OptimismAffectedNodeIn] = Field(default_factory=list)


class SimResponse(BaseModel):
    mindmap: Dict[str, Any]
    report: str


class BlackSwanScenarioOut(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    mece_axis: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=240)
    summary: str = Field(..., min_length=1, max_length=2000)
    why_relevant: str = Field(default="", max_length=800)


class BlackSwanScanRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)


class BlackSwanScanResponse(BaseModel):
    scenarios: List[BlackSwanScenarioOut]
    report: str = ""


class BlackSwanRunRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    scenarios: List[BlackSwanScenarioOut] = Field(..., min_length=1)


class BlackSwanGapOut(BaseModel):
    id: str
    description: str
    severity: str = "medium"


class BlackSwanMitigationOut(BaseModel):
    id: str
    title: str
    description: str
    addresses_gaps: List[str] = Field(default_factory=list)


class BlackSwanScenarioResultOut(BaseModel):
    scenario_id: str
    potential_impacts: List[str]
    gaps_to_address: List[BlackSwanGapOut]
    mitigations: List[BlackSwanMitigationOut]


class BlackSwanRunResponse(BaseModel):
    results: List[BlackSwanScenarioResultOut]
    executive_summary: str = ""
    report: str = ""


class BlackSwanMitigationPickIn(BaseModel):
    scenario_id: str = Field(..., min_length=1)
    mitigation_id: str = Field(..., min_length=1)


class BlackSwanApplyRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    scenarios: List[BlackSwanScenarioOut] = Field(..., min_length=1)
    run: Dict[str, Any] = Field(..., description="Payload from /black-swan/run (results + executive_summary).")
    selections: List[BlackSwanMitigationPickIn] = Field(..., min_length=1)


class MeceScanRequest(BaseModel):
    mece_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)


class MeceScanResponse(BaseModel):
    mece_assessment: Dict[str, Any]
    level1_node_ids: List[str]
    level2_node_ids: List[str]
    gaps: List[Dict[str, Any]]
    proposed_modifications: List[Dict[str, Any]]


class MeceEvidenceRequest(BaseModel):
    mece_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    scan: Dict[str, Any] = Field(..., description="Full JSON from /assistant/mece/scan")
    modification_ids: List[str] = Field(..., min_length=1)
    project_id: Optional[str] = Field(
        default=None,
        max_length=120,
        description="Optional project id to read stored source files for evidence.",
    )


class MeceEvidenceResponse(BaseModel):
    results: List[Dict[str, Any]]
    corpus_stats: Dict[str, Any] = Field(default_factory=dict)


class MeceApplyRequest(BaseModel):
    mece_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    scan: Dict[str, Any] = Field(..., description="Full JSON from /assistant/mece/scan")
    evidence: Dict[str, Any] = Field(..., description="Full JSON from /assistant/mece/evidence")
    modification_ids: List[str] = Field(..., min_length=1)
    web_hints: Dict[str, str] = Field(
        default_factory=dict,
        description="Optional map modification_id -> pasted web research text from user.",
    )


class MeceWebSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)


class MeceWebSearchResponse(BaseModel):
    query: str
    results: List[Dict[str, str]]


class RoundtablePersonaIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    instruction: str = Field(..., min_length=1, max_length=4000)


class RoundtableTranscriptRowIn(BaseModel):
    role: Literal["user", "persona"]
    persona_name: Optional[str] = Field(default=None, max_length=120)
    content: str = Field(..., min_length=1, max_length=32000)


class RoundtableRoundRequest(BaseModel):
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    selected_node_id: str = Field(..., min_length=1)
    personas: List[RoundtablePersonaIn] = Field(..., min_length=1, max_length=12)
    transcript: List[RoundtableTranscriptRowIn] = Field(default_factory=list)
    user_steering: Optional[str] = Field(default=None, max_length=8000)
    custom_skills: List[CustomSkillIn] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    sandbox_mode: bool = False


class RoundtableSpeechOut(BaseModel):
    persona: str
    content: str


class RoundtableRoundResponse(BaseModel):
    speeches: List[RoundtableSpeechOut]
    round_title: str = ""


class RoundtableProposeRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    selected_node_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    transcript: List[RoundtableTranscriptRowIn] = Field(..., min_length=1)
    custom_skills: List[CustomSkillIn] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    sandbox_mode: bool = False


class RoundtableProposeResponse(BaseModel):
    discussion_summary: str
    recommended_mindmap_changes: str
    patch: Dict[str, Any]


class RoundtableApplyRequest(BaseModel):
    branch_root_id: str = Field(..., min_length=1)
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    patch: Dict[str, Any] = Field(default_factory=dict)


@router.post("/assistant/fetch-skill-url", response_model=FetchSkillUrlResponse)
def assistant_fetch_skill_url(req: FetchSkillUrlRequest) -> FetchSkillUrlResponse:
    """Server-side fetch for GitHub raw / gist URLs (avoids browser CORS)."""
    try:
        text, name, final_url = fetch_skill_text(req.url)
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not download URL (HTTP {e.response.status_code}).",
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Fetch failed: {e}") from e
    return FetchSkillUrlResponse(
        instruction=text,
        suggested_name=name or "Remote skill",
        fetched_url=(final_url or req.url.strip())[:2000],
    )


@router.post("/assistant/chat", response_model=AssistantChatResponse)
def assistant_chat(req: AssistantChatRequest) -> AssistantChatResponse:
    msgs = [m.model_dump() for m in req.messages]
    custom = [s.model_dump() for s in req.custom_skills]
    source_context = _assistant_load_source_context(
        project_id=req.project_id,
        include_project_sources=bool(req.include_project_sources),
        source_max_chars=int(req.source_max_chars or 0),
        source_file_ids=req.source_file_ids,
    )
    try:
        max_chat = min(8192, int(os.getenv("LLM_MAX_TOKENS_CHAT", "4096")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_chat))
        reply = run_assistant_chat(
            llm=llm,
            full_nodes=[dict(n) for n in req.full_nodes if isinstance(n, dict)],
            full_edges=[dict(e) for e in req.full_edges if isinstance(e, dict)],
            selected_node_id=(req.selected_node_id or "").strip() or None,
            web_search_query=(req.web_search_query or "").strip() or None,
            messages=msgs,
            custom_skills=custom,
            builtin_skills=dict(req.builtin_skills or {}),
            sandbox_mode=bool(req.sandbox_mode),
            source_context=source_context,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Assistant chat failed: {e}") from e
    return AssistantChatResponse(reply=reply or "…")


@router.post("/assistant/apply", response_model=AssistantApplyResponse)
def assistant_apply(req: AssistantApplyRequest) -> AssistantApplyResponse:
    if not req.full_nodes:
        raise HTTPException(status_code=400, detail="full_nodes is empty")

    ids = {str(n.get("id")) for n in req.full_nodes if isinstance(n, dict) and n.get("id")}
    if req.branch_root_id not in ids:
        raise HTTPException(status_code=400, detail="branch_root_id not found in full_nodes")

    source_context = _assistant_load_source_context(
        project_id=req.project_id,
        include_project_sources=bool(req.include_project_sources),
        source_max_chars=int(req.source_max_chars or 0),
        source_file_ids=req.source_file_ids,
    )
    msgs = [m.model_dump() for m in req.messages]
    custom = [s.model_dump() for s in req.custom_skills]
    try:
        max_tok = min(16384, int(os.getenv("LLM_MAX_TOKENS_APPLY", "8192")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        merged = apply_assistant_conversation_to_graph(
            llm=llm,
            branch_root_id=req.branch_root_id,
            full_nodes=[dict(n) for n in req.full_nodes if isinstance(n, dict)],
            full_edges=[dict(e) for e in req.full_edges if isinstance(e, dict)],
            messages=msgs,
            custom_skills=custom,
            builtin_skills=dict(req.builtin_skills or {}),
            sandbox_mode=bool(req.sandbox_mode),
            source_context=source_context,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Assistant apply failed: {e}") from e

    return AssistantApplyResponse(mindmap=merged)


@router.post("/assistant/simulate/optimism", response_model=SimResponse)
def simulate_optimism(req: OptimismSimRequest) -> SimResponse:
    if not req.full_nodes:
        raise HTTPException(status_code=400, detail="full_nodes is empty")
    ids = {str(n.get("id")) for n in req.full_nodes if isinstance(n, dict) and n.get("id")}
    if req.branch_root_id not in ids:
        raise HTTPException(status_code=400, detail="branch_root_id not found in full_nodes")
    try:
        max_tok = min(16384, int(os.getenv("LLM_MAX_TOKENS_APPLY", "8192")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        merged, report = simulate_optimism_and_patch(
            llm=llm,
            branch_root_id=req.branch_root_id,
            full_nodes=[dict(n) for n in req.full_nodes if isinstance(n, dict)],
            full_edges=[dict(e) for e in req.full_edges if isinstance(e, dict)],
            optimism=int(req.optimism),
            inputs=OptimismInputs(
                currency=req.currency,
                tam_total=req.tam_total,
                target_segment_pct=req.target_segment_pct,
                arpa_year=req.arpa_year,
                customers_total=req.customers_total,
                penetration_pct=req.penetration_pct,
            ),
            focus_metric=req.focus_metric,
            delta_pct=req.delta_pct,
            baseline_som_override=req.baseline_som_override,
            affected_nodes=[a.model_dump() for a in req.affected_nodes],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimism simulation failed: {e}") from e
    return SimResponse(mindmap=merged, report=report)


@router.post("/assistant/roundtable/round", response_model=RoundtableRoundResponse)
def assistant_roundtable_round(req: RoundtableRoundRequest) -> RoundtableRoundResponse:
    if not req.full_nodes:
        raise HTTPException(status_code=400, detail="full_nodes is empty")
    ids = {str(n.get("id")) for n in req.full_nodes if isinstance(n, dict) and n.get("id")}
    sid = (req.selected_node_id or "").strip()
    if sid not in ids:
        raise HTTPException(status_code=400, detail="selected_node_id not found in full_nodes")
    custom = [s.model_dump() for s in req.custom_skills]
    personas = [p.model_dump() for p in req.personas]
    transcript = [t.model_dump() for t in req.transcript]
    try:
        max_chat = min(8192, int(os.getenv("LLM_MAX_TOKENS_CHAT", "4096")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_chat))
        out = run_roundtable_round(
            llm=llm,
            full_nodes=[dict(n) for n in req.full_nodes if isinstance(n, dict)],
            full_edges=[dict(e) for e in req.full_edges if isinstance(e, dict)],
            selected_node_id=sid,
            personas=personas,
            transcript=transcript,
            user_steering=(req.user_steering or "").strip() or None,
            custom_skills=custom,
            builtin_skills=dict(req.builtin_skills or {}),
            sandbox_mode=bool(req.sandbox_mode),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Roundtable round failed: {e}") from e
    speeches = out.get("speeches") or []
    return RoundtableRoundResponse(
        speeches=[RoundtableSpeechOut(persona=str(s.get("persona", "")), content=str(s.get("content", ""))) for s in speeches if isinstance(s, dict)],
        round_title=str(out.get("round_title") or ""),
    )


@router.post("/assistant/roundtable/propose", response_model=RoundtableProposeResponse)
def assistant_roundtable_propose(req: RoundtableProposeRequest) -> RoundtableProposeResponse:
    if not req.full_nodes:
        raise HTTPException(status_code=400, detail="full_nodes is empty")
    ids = {str(n.get("id")) for n in req.full_nodes if isinstance(n, dict) and n.get("id")}
    if req.branch_root_id not in ids:
        raise HTTPException(status_code=400, detail="branch_root_id not found in full_nodes")
    custom = [s.model_dump() for s in req.custom_skills]
    transcript = [t.model_dump() for t in req.transcript]
    try:
        max_tok = min(16384, int(os.getenv("LLM_MAX_TOKENS_APPLY", "8192")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        out = propose_roundtable_edits(
            llm=llm,
            branch_root_id=req.branch_root_id,
            full_nodes=[dict(n) for n in req.full_nodes if isinstance(n, dict)],
            full_edges=[dict(e) for e in req.full_edges if isinstance(e, dict)],
            selected_node_id=(req.selected_node_id or "").strip(),
            transcript=transcript,
            custom_skills=custom,
            builtin_skills=dict(req.builtin_skills or {}),
            sandbox_mode=bool(req.sandbox_mode),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Roundtable propose failed: {e}") from e
    patch = out.get("patch") if isinstance(out.get("patch"), dict) else {}
    return RoundtableProposeResponse(
        discussion_summary=str(out.get("discussion_summary") or ""),
        recommended_mindmap_changes=str(out.get("recommended_mindmap_changes") or ""),
        patch=patch,
    )


@router.post("/assistant/roundtable/apply", response_model=AssistantApplyResponse)
def assistant_roundtable_apply(req: RoundtableApplyRequest) -> AssistantApplyResponse:
    if not req.full_nodes:
        raise HTTPException(status_code=400, detail="full_nodes is empty")
    ids = {str(n.get("id")) for n in req.full_nodes if isinstance(n, dict) and n.get("id")}
    if req.branch_root_id not in ids:
        raise HTTPException(status_code=400, detail="branch_root_id not found in full_nodes")
    try:
        merged = apply_roundtable_patch(
            branch_root_id=req.branch_root_id,
            full_nodes=[dict(n) for n in req.full_nodes if isinstance(n, dict)],
            full_edges=[dict(e) for e in req.full_edges if isinstance(e, dict)],
            patch=dict(req.patch or {}),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Roundtable apply failed: {e}") from e
    return AssistantApplyResponse(mindmap=merged)


def _branch_guard(nodes: List[Dict[str, Any]], branch_root_id: str) -> None:
    if not nodes:
        raise HTTPException(status_code=400, detail="full_nodes is empty")
    ids = {str(n.get("id")) for n in nodes if isinstance(n, dict) and n.get("id")}
    if branch_root_id not in ids:
        raise HTTPException(status_code=400, detail="branch_root_id not found in full_nodes")


@router.post("/assistant/simulate/black-swan/scan", response_model=BlackSwanScanResponse)
def simulate_black_swan_scan(req: BlackSwanScanRequest) -> BlackSwanScanResponse:
    nodes = [dict(n) for n in req.full_nodes if isinstance(n, dict)]
    edges = [dict(e) for e in req.full_edges if isinstance(e, dict)]
    _branch_guard(nodes, req.branch_root_id)
    try:
        max_tok = min(8192, int(os.getenv("LLM_MAX_TOKENS_APPLY", "8192")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        scenarios_raw, report = black_swan_scan_scenarios(
            llm=llm,
            branch_root_id=req.branch_root_id,
            full_nodes=nodes,
            full_edges=edges,
        )
        scenarios = [BlackSwanScenarioOut(**s) for s in scenarios_raw]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Black swan scan failed: {e}") from e
    return BlackSwanScanResponse(scenarios=scenarios, report=report)


@router.post("/assistant/simulate/black-swan/run", response_model=BlackSwanRunResponse)
def simulate_black_swan_run(req: BlackSwanRunRequest) -> BlackSwanRunResponse:
    nodes = [dict(n) for n in req.full_nodes if isinstance(n, dict)]
    edges = [dict(e) for e in req.full_edges if isinstance(e, dict)]
    _branch_guard(nodes, req.branch_root_id)
    try:
        max_tok = min(16384, int(os.getenv("LLM_MAX_TOKENS_APPLY", "8192")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        sel = [s.model_dump() for s in req.scenarios]
        bundle, report = black_swan_run_simulation(
            llm=llm,
            branch_root_id=req.branch_root_id,
            full_nodes=nodes,
            full_edges=edges,
            selected_scenarios=sel,
        )
        summary = str(bundle.get("executive_summary") or "")
        results_out: List[BlackSwanScenarioResultOut] = []
        for block in bundle.get("results", []):
            if not isinstance(block, dict):
                continue
            gaps = [
                BlackSwanGapOut(
                    id=str(g.get("id", "")),
                    description=str(g.get("description", "")),
                    severity=str(g.get("severity", "medium")),
                )
                for g in (block.get("gaps_to_address") or [])
                if isinstance(g, dict)
            ]
            mits = [
                BlackSwanMitigationOut(
                    id=str(m.get("id", "")),
                    title=str(m.get("title", "")),
                    description=str(m.get("description", "")),
                    addresses_gaps=list(m.get("addresses_gaps") or []) if isinstance(m.get("addresses_gaps"), list) else [],
                )
                for m in (block.get("mitigations") or [])
                if isinstance(m, dict)
            ]
            results_out.append(
                BlackSwanScenarioResultOut(
                    scenario_id=str(block.get("scenario_id", "")),
                    potential_impacts=[str(x) for x in (block.get("potential_impacts") or []) if str(x).strip()],
                    gaps_to_address=gaps,
                    mitigations=mits,
                )
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Black swan run failed: {e}") from e
    return BlackSwanRunResponse(results=results_out, executive_summary=summary, report=report)


@router.post("/assistant/simulate/black-swan/apply", response_model=SimResponse)
def simulate_black_swan_apply(req: BlackSwanApplyRequest) -> SimResponse:
    nodes = [dict(n) for n in req.full_nodes if isinstance(n, dict)]
    edges = [dict(e) for e in req.full_edges if isinstance(e, dict)]
    _branch_guard(nodes, req.branch_root_id)
    run_raw = dict(req.run or {})
    results = run_raw.get("results")
    if not isinstance(results, list) or not results:
        raise HTTPException(status_code=400, detail="run.results is required")
    allowed: set[tuple[str, str]] = set()
    for block in results:
        if not isinstance(block, dict):
            continue
        sid = str(block.get("scenario_id") or "")
        for m in block.get("mitigations") or []:
            if isinstance(m, dict) and m.get("id"):
                allowed.add((sid, str(m.get("id"))))
    picks: List[tuple[str, str]] = []
    for p in req.selections:
        pair = (p.scenario_id, p.mitigation_id)
        if pair not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown mitigation selection: scenario={p.scenario_id!r} mitigation={p.mitigation_id!r}",
            )
        picks.append(pair)
    try:
        max_tok = min(16384, int(os.getenv("LLM_MAX_TOKENS_APPLY", "8192")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        merged, report = black_swan_apply_mitigations_patch(
            llm=llm,
            branch_root_id=req.branch_root_id,
            full_nodes=nodes,
            full_edges=edges,
            scenarios=[s.model_dump() for s in req.scenarios],
            run_bundle=run_raw,
            selections=picks,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Black swan apply failed: {e}") from e
    return SimResponse(mindmap=merged, report=report)


@router.post("/assistant/mece/scan", response_model=MeceScanResponse)
def assistant_mece_scan(req: MeceScanRequest) -> MeceScanResponse:
    nodes = [dict(n) for n in req.full_nodes if isinstance(n, dict)]
    edges = [dict(e) for e in req.full_edges if isinstance(e, dict)]
    _branch_guard(nodes, req.mece_root_id)
    try:
        max_tok = min(8192, int(os.getenv("LLM_MAX_TOKENS_APPLY", "8192")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        out = mece_scan_two_levels(llm=llm, mece_root_id=req.mece_root_id, full_nodes=nodes, full_edges=edges)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MECE scan failed: {e}") from e
    return MeceScanResponse(
        mece_assessment=dict(out.get("mece_assessment") or {}),
        level1_node_ids=list(out.get("level1_node_ids") or []),
        level2_node_ids=list(out.get("level2_node_ids") or []),
        gaps=list(out.get("gaps") or []),
        proposed_modifications=list(out.get("proposed_modifications") or []),
    )


@router.post("/assistant/mece/evidence", response_model=MeceEvidenceResponse)
def assistant_mece_evidence(req: MeceEvidenceRequest) -> MeceEvidenceResponse:
    nodes = [dict(n) for n in req.full_nodes if isinstance(n, dict)]
    edges = [dict(e) for e in req.full_edges if isinstance(e, dict)]
    _branch_guard(nodes, req.mece_root_id)
    scan = dict(req.scan or {})
    if not scan.get("proposed_modifications"):
        raise HTTPException(status_code=400, detail="scan.proposed_modifications is required")
    try:
        max_tok = min(8192, int(os.getenv("LLM_MAX_TOKENS_APPLY", "8192")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        bundle = mece_check_evidence(
            llm=llm,
            mece_root_id=req.mece_root_id,
            full_nodes=nodes,
            full_edges=edges,
            scan_bundle=scan,
            modification_ids=[str(x) for x in req.modification_ids if str(x).strip()],
            project_id=req.project_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MECE evidence check failed: {e}") from e
    return MeceEvidenceResponse(
        results=list(bundle.get("results") or []),
        corpus_stats=dict(bundle.get("corpus_stats") or {}),
    )


@router.post("/assistant/mece/web-search", response_model=MeceWebSearchResponse)
def assistant_mece_web_search(req: MeceWebSearchRequest) -> MeceWebSearchResponse:
    try:
        rows = tavily_search(query=req.query.strip(), max_results=5)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Web search failed: {e}") from e
    return MeceWebSearchResponse(
        query=req.query.strip(),
        results=[{"title": r.title, "url": r.url, "content": r.content} for r in rows],
    )


@router.post("/assistant/mece/apply", response_model=SimResponse)
def assistant_mece_apply(req: MeceApplyRequest) -> SimResponse:
    nodes = [dict(n) for n in req.full_nodes if isinstance(n, dict)]
    edges = [dict(e) for e in req.full_edges if isinstance(e, dict)]
    _branch_guard(nodes, req.mece_root_id)
    scan = dict(req.scan or {})
    ev = dict(req.evidence or {})
    if not scan.get("proposed_modifications"):
        raise HTTPException(status_code=400, detail="scan.proposed_modifications is required")
    if not ev.get("results"):
        raise HTTPException(status_code=400, detail="evidence.results is required")
    try:
        max_tok = min(16384, int(os.getenv("LLM_MAX_TOKENS_APPLY", "8192")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        merged, report = mece_apply_selected_modifications(
            llm=llm,
            mece_root_id=req.mece_root_id,
            full_nodes=nodes,
            full_edges=edges,
            scan_bundle=scan,
            evidence_bundle=ev,
            modification_ids=[str(x) for x in req.modification_ids if str(x).strip()],
            web_hints=dict(req.web_hints or {}),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MECE apply failed: {e}") from e
    return SimResponse(mindmap=merged, report=report)


@router.post("/assistant/ppt-framework/skeleton", response_model=PptFrameworkGenerateResponse)
def assistant_ppt_framework_skeleton(req: PptFrameworkGenerateRequest) -> PptFrameworkGenerateResponse:
    try:
        max_tok = min(12288, int(os.getenv("LLM_MAX_TOKENS_PPT_SKELETON", "8192")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        custom = [s.model_dump() for s in req.custom_skills]
        source = [s.model_dump() for s in req.source_snippets]
        slides = run_ppt_skeleton(
            llm=llm,
            mindmap_markdown=req.mindmap_markdown,
            intent=req.intent.strip(),
            audience=req.audience.strip(),
            page_count=req.page_count,
            style=req.style.strip(),
            custom_skills=custom,
            builtin_skills=dict(req.builtin_skills or {}),
            source_snippets=source,
            web_search_query=(req.web_search_query or "").strip() or None,
            deck_style=req.deck_style,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"PPT skeleton failed: {e}"
        ) from e
    return PptFrameworkGenerateResponse(slides=[PptSlideOut(**{**s, "beat": s.get("beat", "")}) for s in slides])


@router.post("/assistant/ppt-framework/enrich-batch", response_model=PptFrameworkGenerateResponse)
def assistant_ppt_framework_enrich_batch(req: PptEnrichBatchRequest) -> PptFrameworkGenerateResponse:
    try:
        max_tok = min(12288, int(os.getenv("LLM_MAX_TOKENS_PPT_ENRICH", "10240")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        custom = [s.model_dump() for s in req.custom_skills]
        source = [s.model_dump() for s in req.source_snippets]
        out = run_ppt_enrich_batch(
            llm=llm,
            mindmap_markdown=req.mindmap_markdown,
            intent=req.intent.strip(),
            audience=req.audience.strip(),
            page_count=req.page_count,
            style=req.style.strip(),
            custom_skills=custom,
            builtin_skills=dict(req.builtin_skills or {}),
            source_snippets=source,
            web_search_query=(req.web_search_query or "").strip() or None,
            deck_style=req.deck_style,
            slides=[dict(s) for s in req.slides] if req.slides else [],
            indices=[int(x) for x in req.indices],
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"PPT enrich batch failed: {e}"
        ) from e
    return PptFrameworkGenerateResponse(
        slides=[PptSlideOut(**{**s, "beat": s.get("beat", "")}) for s in out]
    )


@router.post("/assistant/ppt-framework/reconcile", response_model=PptReconcileResponse)
def assistant_ppt_framework_reconcile(req: PptReconcileRequest) -> PptReconcileResponse:
    try:
        max_tok = min(12288, int(os.getenv("LLM_MAX_TOKENS_PPT_RECONCILE", "10240")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        custom = [s.model_dump() for s in req.custom_skills]
        source = [s.model_dump() for s in req.source_snippets]
        reply, slides = run_ppt_reconcile(
            llm=llm,
            mindmap_markdown=req.mindmap_markdown,
            intent=req.intent.strip(),
            audience=req.audience.strip(),
            page_count=req.page_count,
            style=req.style.strip(),
            custom_skills=custom,
            builtin_skills=dict(req.builtin_skills or {}),
            source_snippets=source,
            web_search_query=(req.web_search_query or "").strip() or None,
            deck_style=req.deck_style,
            slides=[dict(s) for s in req.slides] if req.slides else [],
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"PPT reconcile failed: {e}"
        ) from e
    return PptReconcileResponse(
        reply=reply,
        slides=[PptSlideOut(**{**s, "beat": s.get("beat", "")}) for s in slides],
    )


@router.post("/assistant/ppt-framework/chat", response_model=PptFrameworkChatResponse)
def assistant_ppt_framework_chat(req: PptFrameworkChatRequest) -> PptFrameworkChatResponse:
    try:
        max_tok = min(16384, int(os.getenv("LLM_MAX_TOKENS_PPT", "12288")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        custom = [s.model_dump() for s in req.custom_skills]
        source = [s.model_dump() for s in req.source_snippets]
        msgs = [m.model_dump() for m in req.messages]
        reply, out_slides = run_ppt_framework_chat(
            llm=llm,
            messages=msgs,
            slides=[dict(s) for s in req.slides] if req.slides else [],
            mindmap_markdown=req.mindmap_markdown,
            audience=req.audience.strip(),
            intent=req.intent.strip(),
            page_count=req.page_count,
            style=req.style.strip(),
            target_slide_index=req.target_slide_index,
            custom_skills=custom,
            builtin_skills=dict(req.builtin_skills or {}),
            source_snippets=source,
            web_search_query=(req.web_search_query or "").strip() or None,
            deck_style=req.deck_style,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"PPT framework chat failed: {e}"
        ) from e
    return PptFrameworkChatResponse(
        reply=reply, slides=[PptSlideOut(**s) for s in out_slides]
    )
