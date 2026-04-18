from __future__ import annotations

import os
from typing import Any, Dict, List, Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.assistant_apply import apply_assistant_conversation_to_graph, run_assistant_chat
from app.services.assistant_roundtable import apply_roundtable_patch, propose_roundtable_edits, run_roundtable_round
from app.services.assistant_simulations import OptimismInputs, simulate_black_swan_and_patch, simulate_optimism_and_patch
from app.services.llm_client import LlmClient, LlmConfig
from app.services.model_registry import get_active_model
from app.services.skill_url_fetch import fetch_skill_text

router = APIRouter()


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
        description="Optional explicit query to use when builtin_skills.webSearch is enabled.",
    )
    custom_skills: List[CustomSkillIn] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    sandbox_mode: bool = Field(
        default=False,
        description="User is exploring in sandbox; draft nodes may appear in the graph snapshot.",
    )


class AssistantChatResponse(BaseModel):
    reply: str


class FetchSkillUrlRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2000)


class FetchSkillUrlResponse(BaseModel):
    instruction: str = Field(..., max_length=8000)
    suggested_name: str = Field(default="Remote skill", max_length=120)
    fetched_url: str = Field(default="", description="Final URL after redirects (for display).")


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


@router.post("/assistant/simulate/black-swan", response_model=SimResponse)
def simulate_black_swan(req: AssistantApplyRequest) -> SimResponse:
    # Reuse AssistantApplyRequest fields: branch_root_id, full_nodes, full_edges, etc.
    if not req.full_nodes:
        raise HTTPException(status_code=400, detail="full_nodes is empty")
    ids = {str(n.get("id")) for n in req.full_nodes if isinstance(n, dict) and n.get("id")}
    if req.branch_root_id not in ids:
        raise HTTPException(status_code=400, detail="branch_root_id not found in full_nodes")
    try:
        max_tok = min(16384, int(os.getenv("LLM_MAX_TOKENS_APPLY", "8192")))
        llm = LlmClient(LlmConfig(model=get_active_model(), max_tokens=max_tok))
        merged, report = simulate_black_swan_and_patch(
            llm=llm,
            branch_root_id=req.branch_root_id,
            full_nodes=[dict(n) for n in req.full_nodes if isinstance(n, dict)],
            full_edges=[dict(e) for e in req.full_edges if isinstance(e, dict)],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Black Swan simulation failed: {e}") from e
    return SimResponse(mindmap=merged, report=report)
