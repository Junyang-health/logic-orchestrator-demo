from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.assistant_roundtable import apply_roundtable_patch, propose_roundtable_edits, run_roundtable_round

from .context import branch_guard
from .llm_utils import llm_assistant_apply, llm_assistant_chat
from .schemas import (
    AssistantApplyResponse,
    RoundtableApplyRequest,
    RoundtableProposeRequest,
    RoundtableProposeResponse,
    RoundtableRoundRequest,
    RoundtableRoundResponse,
    RoundtableSpeechOut,
)

router = APIRouter()


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
        llm = llm_assistant_chat()
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
        speeches=[
            RoundtableSpeechOut(persona=str(s.get("persona", "")), content=str(s.get("content", "")))
            for s in speeches
            if isinstance(s, dict)
        ],
        round_title=str(out.get("round_title") or ""),
    )


@router.post("/assistant/roundtable/propose", response_model=RoundtableProposeResponse)
def assistant_roundtable_propose(req: RoundtableProposeRequest) -> RoundtableProposeResponse:
    branch_guard(req.full_nodes, req.branch_root_id)
    custom = [s.model_dump() for s in req.custom_skills]
    transcript = [t.model_dump() for t in req.transcript]
    try:
        llm = llm_assistant_apply()
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
    branch_guard(req.full_nodes, req.branch_root_id)
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
