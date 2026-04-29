from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.routers.assistant.context import assistant_load_source_context, branch_guard
from app.routers.assistant.llm_utils import llm_assistant_apply, llm_assistant_chat
from app.routers.assistant.schemas import AssistantApplyResponse
from app.services import assistant_counsel

router = APIRouter()


class CounselPersonaIn(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=120)
    instruction: str = Field(..., min_length=1, max_length=8000)


class CounselTranscriptPairIn(BaseModel):
    role: str = Field(..., description="host | user")
    content: str = Field(..., min_length=1, max_length=16000)


class CounselGraphIn(BaseModel):
    full_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    full_edges: List[Dict[str, Any]] = Field(default_factory=list)
    selected_node_id: str = Field(..., min_length=1)
    branch_root_id: Optional[str] = Field(
        default=None,
        description="Defaults to selected_node_id when applying patches.",
    )


class CounselProblemTurnBody(CounselGraphIn):
    user_problem_draft: str = Field(default="", max_length=16000)
    transcript: List[CounselTranscriptPairIn] = Field(default_factory=list)
    project_id: Optional[str] = None
    source_file_ids: Optional[List[str]] = None
    source_max_chars: int = Field(default=32_000, ge=0, le=100_000)


class CounselProblemTurnResponse(BaseModel):
    kind: str
    message: str


@router.post("/assistant/counsel/problem-turn", response_model=CounselProblemTurnResponse)
def counsel_problem_turn_api(body: CounselProblemTurnBody) -> CounselProblemTurnResponse:
    source = assistant_load_source_context(
        project_id=body.project_id,
        include_project_sources=bool(body.project_id) and body.source_max_chars > 0,
        source_max_chars=body.source_max_chars,
        source_file_ids=body.source_file_ids,
    )
    try:
        llm = llm_assistant_chat()
        out = assistant_counsel.counsel_problem_turn(
            llm=llm,
            full_nodes=[dict(n) for n in body.full_nodes if isinstance(n, dict)],
            full_edges=[dict(e) for e in body.full_edges if isinstance(e, dict)],
            selected_node_id=body.selected_node_id.strip(),
            source_context=source,
            user_problem_draft=body.user_problem_draft,
            transcript=[t.model_dump() for t in body.transcript],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Counsel problem turn failed: {e}") from e
    return CounselProblemTurnResponse(kind=str(out["kind"]), message=str(out["message"]))


class CounselFactBody(CounselGraphIn):
    persona_id: str
    persona_name: str
    persona_instruction: str = Field(..., min_length=1, max_length=8000)
    problem_summary: str = Field(..., min_length=1, max_length=16000)
    questions_asked_so_far: int = Field(default=0, ge=0, le=3)
    thread: List[Dict[str, str]] = Field(default_factory=list)
    project_id: Optional[str] = None
    source_file_ids: Optional[List[str]] = None
    source_max_chars: int = Field(default=24_000, ge=0, le=100_000)


class CounselFactResponse(BaseModel):
    question: Optional[str]


@router.post("/assistant/counsel/fact-question", response_model=CounselFactResponse)
def counsel_fact_question_api(body: CounselFactBody) -> CounselFactResponse:
    source = assistant_load_source_context(
        project_id=body.project_id,
        include_project_sources=bool(body.project_id) and body.source_max_chars > 0,
        source_max_chars=body.source_max_chars,
        source_file_ids=body.source_file_ids,
    )
    try:
        llm = llm_assistant_chat()
        out = assistant_counsel.counsel_fact_next_question(
            llm=llm,
            persona_name=body.persona_name.strip(),
            persona_instruction=body.persona_instruction,
            problem_summary=body.problem_summary,
            questions_asked_so_far=body.questions_asked_so_far,
            thread=body.thread,
            source_context=source,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Counsel fact question failed: {e}") from e
    return CounselFactResponse(question=out.get("question"))


class CounselNgtBody(CounselGraphIn):
    persona_name: str
    persona_instruction: str = Field(..., min_length=1, max_length=8000)
    problem_summary: str = Field(..., min_length=1, max_length=16000)
    fact_digest: str = Field(..., min_length=1, max_length=32000)
    project_id: Optional[str] = None
    source_file_ids: Optional[List[str]] = None
    source_max_chars: int = Field(default=24_000, ge=0, le=100_000)


class CounselNgtResponse(BaseModel):
    opinion: str


@router.post("/assistant/counsel/ngt-opinion", response_model=CounselNgtResponse)
def counsel_ngt_opinion_api(body: CounselNgtBody) -> CounselNgtResponse:
    source = assistant_load_source_context(
        project_id=body.project_id,
        include_project_sources=bool(body.project_id) and body.source_max_chars > 0,
        source_max_chars=body.source_max_chars,
        source_file_ids=body.source_file_ids,
    )
    try:
        llm = llm_assistant_chat()
        out = assistant_counsel.counsel_ngt_opinion(
            llm=llm,
            persona_name=body.persona_name.strip(),
            persona_instruction=body.persona_instruction,
            problem_summary=body.problem_summary,
            fact_digest=body.fact_digest,
            source_context=source,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Counsel NGT opinion failed: {e}") from e
    return CounselNgtResponse(opinion=str(out["opinion"]))


class CounselPublicFigureBody(BaseModel):
    person_name: str = Field(..., min_length=1, max_length=160)


class CounselPublicFigureResponse(BaseModel):
    instruction: str


@router.post("/assistant/counsel/public-figure-instruction", response_model=CounselPublicFigureResponse)
def counsel_public_figure_instruction_api(body: CounselPublicFigureBody) -> CounselPublicFigureResponse:
    try:
        llm = llm_assistant_chat()
        out = assistant_counsel.counsel_public_figure_instruction(
            llm=llm,
            person_name=body.person_name.strip(),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Public figure persona failed: {e}") from e
    return CounselPublicFigureResponse(instruction=str(out["instruction"]))


class CounselCollisionsBody(BaseModel):
    problem_summary: str = Field(..., min_length=1, max_length=16000)
    personas: List[CounselPersonaIn] = Field(..., min_length=4, max_length=8)
    opinions: Dict[str, str] = Field(..., description="persona_id -> opinion text")


class CounselCollisionsResponse(BaseModel):
    areas: List[Dict[str, Any]]


@router.post("/assistant/counsel/collisions", response_model=CounselCollisionsResponse)
def counsel_collisions_api(body: CounselCollisionsBody) -> CounselCollisionsResponse:
    try:
        llm = llm_assistant_chat()
        plist = [p.model_dump() for p in body.personas]
        out = assistant_counsel.counsel_collision_areas(
            llm=llm,
            problem_summary=body.problem_summary,
            personas=plist,
            opinions=dict(body.opinions),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Counsel collisions failed: {e}") from e
    return CounselCollisionsResponse(areas=list(out.get("areas") or []))


class CounselDebateLineIn(BaseModel):
    speaker: str
    content: str


class CounselDebateStepBody(CounselGraphIn):
    problem_summary: str = Field(..., min_length=1, max_length=16000)
    area: Dict[str, Any] = Field(..., description="Collision area object")
    personas: List[CounselPersonaIn] = Field(..., min_length=4, max_length=8)
    transcript: List[CounselDebateLineIn] = Field(default_factory=list)


class CounselDebateStepResponse(BaseModel):
    next_speaker: str
    utterance: str
    passed: bool = False
    off_track: bool = False


@router.post("/assistant/counsel/debate-step", response_model=CounselDebateStepResponse)
def counsel_debate_step_api(body: CounselDebateStepBody) -> CounselDebateStepResponse:
    try:
        llm = llm_assistant_chat()
        out = assistant_counsel.counsel_debate_step(
            llm=llm,
            problem_summary=body.problem_summary,
            area=body.area,
            personas=[p.model_dump() for p in body.personas],
            transcript=[t.model_dump() for t in body.transcript],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Counsel debate step failed: {e}") from e
    return CounselDebateStepResponse(
        next_speaker=str(out.get("next_speaker") or ""),
        utterance=str(out.get("utterance") or ""),
        passed=bool(out.get("passed")),
        off_track=bool(out.get("off_track")),
    )


class CounselVoteOptionsBody(BaseModel):
    problem_summary: str = Field(..., min_length=1, max_length=16000)
    selected_areas: List[Dict[str, Any]] = Field(..., min_length=1, max_length=8)
    debate_digest: str = Field(..., min_length=1, max_length=48000)


class CounselVoteOptionsResponse(BaseModel):
    areas: List[Dict[str, Any]]


@router.post("/assistant/counsel/vote-options", response_model=CounselVoteOptionsResponse)
def counsel_vote_options_api(body: CounselVoteOptionsBody) -> CounselVoteOptionsResponse:
    try:
        llm = llm_assistant_chat()
        out = assistant_counsel.counsel_vote_options(
            llm=llm,
            problem_summary=body.problem_summary,
            selected_areas=body.selected_areas,
            debate_digest=body.debate_digest,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Counsel vote options failed: {e}") from e
    raw = out.get("areas")
    if not isinstance(raw, list):
        raw = []
    return CounselVoteOptionsResponse(areas=raw)


class CounselRankVotesBody(BaseModel):
    problem_summary: str = Field(..., min_length=1, max_length=16000)
    personas: List[CounselPersonaIn] = Field(..., min_length=4, max_length=8)
    options_payload: List[Dict[str, Any]] = Field(
        ...,
        description="Each item: { area_id, options: [{ id, label }] }",
    )


class CounselRankVotesResponse(BaseModel):
    votes: List[Dict[str, Any]]


@router.post("/assistant/counsel/rank-votes", response_model=CounselRankVotesResponse)
def counsel_rank_votes_api(body: CounselRankVotesBody) -> CounselRankVotesResponse:
    try:
        llm = llm_assistant_chat()
        out = assistant_counsel.counsel_simulate_rank_votes(
            llm=llm,
            problem_summary=body.problem_summary,
            personas=[p.model_dump() for p in body.personas],
            options_payload=body.options_payload,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Counsel rank votes failed: {e}") from e
    votes = out.get("votes")
    return CounselRankVotesResponse(votes=list(votes) if isinstance(votes, list) else [])


class CounselFinalizeBody(CounselGraphIn):
    problem_summary: str = Field(..., min_length=1, max_length=16000)
    vote_summary_text: str = Field(..., min_length=1, max_length=48000)
    custom_skills: List[Dict[str, Any]] = Field(default_factory=list)
    builtin_skills: Dict[str, bool] = Field(default_factory=dict)
    sandbox_mode: bool = False


class CounselFinalizeResponse(BaseModel):
    recommendation: str
    discussion_summary: str
    recommended_mindmap_changes: str
    patch: Dict[str, Any]


@router.post("/assistant/counsel/finalize", response_model=CounselFinalizeResponse)
def counsel_finalize_api(body: CounselFinalizeBody) -> CounselFinalizeResponse:
    branch = (body.branch_root_id or body.selected_node_id).strip()
    branch_guard(body.full_nodes, branch)
    try:
        llm = llm_assistant_apply()
        out = assistant_counsel.counsel_propose_final(
            llm=llm,
            branch_root_id=branch,
            full_nodes=[dict(n) for n in body.full_nodes if isinstance(n, dict)],
            full_edges=[dict(e) for e in body.full_edges if isinstance(e, dict)],
            selected_node_id=body.selected_node_id.strip(),
            problem_summary=body.problem_summary,
            vote_summary_text=body.vote_summary_text,
            custom_skills=[dict(s) for s in body.custom_skills if isinstance(s, dict)],
            builtin_skills=dict(body.builtin_skills or {}),
            sandbox_mode=bool(body.sandbox_mode),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Counsel finalize failed: {e}") from e
    return CounselFinalizeResponse(
        recommendation=out["recommendation"],
        discussion_summary=out["discussion_summary"],
        recommended_mindmap_changes=out["recommended_mindmap_changes"],
        patch=dict(out["patch"]),
    )


class CounselApplyBody(CounselGraphIn):
    patch: Dict[str, Any]


@router.post("/assistant/counsel/apply", response_model=AssistantApplyResponse)
def counsel_apply_api(body: CounselApplyBody) -> AssistantApplyResponse:
    branch = (body.branch_root_id or body.selected_node_id).strip()
    branch_guard(body.full_nodes, branch)
    try:
        merged = assistant_counsel.apply_counsel_patch(
            branch_root_id=branch,
            full_nodes=[dict(n) for n in body.full_nodes if isinstance(n, dict)],
            full_edges=[dict(e) for e in body.full_edges if isinstance(e, dict)],
            patch=dict(body.patch or {}),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return AssistantApplyResponse(mindmap=merged)
