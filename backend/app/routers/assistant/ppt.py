from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.ppt_framework import (
    run_ppt_enrich_batch,
    run_ppt_framework_chat,
    run_ppt_reconcile,
    run_ppt_skeleton,
)

from .llm_utils import llm_ppt_chat, llm_ppt_enrich, llm_ppt_reconcile, llm_ppt_skeleton
from .schemas import (
    PptEnrichBatchRequest,
    PptFrameworkChatRequest,
    PptFrameworkChatResponse,
    PptFrameworkGenerateRequest,
    PptFrameworkGenerateResponse,
    PptReconcileRequest,
    PptReconcileResponse,
    PptSlideOut,
)

router = APIRouter()


@router.post("/assistant/ppt-framework/skeleton", response_model=PptFrameworkGenerateResponse)
def assistant_ppt_framework_skeleton(req: PptFrameworkGenerateRequest) -> PptFrameworkGenerateResponse:
    try:
        llm = llm_ppt_skeleton()
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
        raise HTTPException(status_code=500, detail=f"PPT skeleton failed: {e}") from e
    return PptFrameworkGenerateResponse(
        slides=[PptSlideOut(**{**s, "beat": s.get("beat", "")}) for s in slides]
    )


@router.post("/assistant/ppt-framework/enrich-batch", response_model=PptFrameworkGenerateResponse)
def assistant_ppt_framework_enrich_batch(req: PptEnrichBatchRequest) -> PptFrameworkGenerateResponse:
    try:
        llm = llm_ppt_enrich()
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
        raise HTTPException(status_code=500, detail=f"PPT enrich batch failed: {e}") from e
    return PptFrameworkGenerateResponse(
        slides=[PptSlideOut(**{**s, "beat": s.get("beat", "")}) for s in out]
    )


@router.post("/assistant/ppt-framework/reconcile", response_model=PptReconcileResponse)
def assistant_ppt_framework_reconcile(req: PptReconcileRequest) -> PptReconcileResponse:
    try:
        llm = llm_ppt_reconcile()
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
        raise HTTPException(status_code=500, detail=f"PPT reconcile failed: {e}") from e
    return PptReconcileResponse(
        reply=reply,
        slides=[PptSlideOut(**{**s, "beat": s.get("beat", "")}) for s in slides],
    )


@router.post("/assistant/ppt-framework/chat", response_model=PptFrameworkChatResponse)
def assistant_ppt_framework_chat(req: PptFrameworkChatRequest) -> PptFrameworkChatResponse:
    try:
        llm = llm_ppt_chat()
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
        raise HTTPException(status_code=500, detail=f"PPT framework chat failed: {e}") from e
    return PptFrameworkChatResponse(reply=reply, slides=[PptSlideOut(**s) for s in out_slides])
