from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException

from app.services.assistant_apply import apply_assistant_conversation_to_graph, run_assistant_chat
from app.services.skill_url_fetch import fetch_skill_text

from .context import assistant_load_source_context, branch_guard
from .llm_utils import llm_assistant_apply, llm_assistant_chat
from .schemas import (
    AssistantApplyRequest,
    AssistantApplyResponse,
    AssistantChatRequest,
    AssistantChatResponse,
    FetchSkillUrlRequest,
    FetchSkillUrlResponse,
)

router = APIRouter()


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
    source_context = assistant_load_source_context(
        project_id=req.project_id,
        include_project_sources=bool(req.include_project_sources),
        source_max_chars=int(req.source_max_chars or 0),
        source_file_ids=req.source_file_ids,
    )
    try:
        llm = llm_assistant_chat()
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
    branch_guard(req.full_nodes, req.branch_root_id)
    source_context = assistant_load_source_context(
        project_id=req.project_id,
        include_project_sources=bool(req.include_project_sources),
        source_max_chars=int(req.source_max_chars or 0),
        source_file_ids=req.source_file_ids,
    )
    msgs = [m.model_dump() for m in req.messages]
    custom = [s.model_dump() for s in req.custom_skills]
    try:
        llm = llm_assistant_apply()
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
