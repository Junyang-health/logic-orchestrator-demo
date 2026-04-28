from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.assistant_mece import (
    mece_apply_selected_modifications,
    mece_check_evidence,
    mece_scan_two_levels,
)
from app.services.tavily_search import tavily_search

from .context import branch_guard
from .llm_utils import llm_assistant_apply, llm_assistant_apply_compact
from .schemas import (
    MeceApplyRequest,
    MeceEvidenceRequest,
    MeceEvidenceResponse,
    MeceScanRequest,
    MeceScanResponse,
    MeceWebSearchRequest,
    MeceWebSearchResponse,
    SimResponse,
)

router = APIRouter()


@router.post("/assistant/mece/scan", response_model=MeceScanResponse)
def assistant_mece_scan(req: MeceScanRequest) -> MeceScanResponse:
    nodes = [dict(n) for n in req.full_nodes if isinstance(n, dict)]
    edges = [dict(e) for e in req.full_edges if isinstance(e, dict)]
    branch_guard(nodes, req.mece_root_id)
    try:
        llm = llm_assistant_apply_compact()
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
    branch_guard(nodes, req.mece_root_id)
    scan = dict(req.scan or {})
    if not scan.get("proposed_modifications"):
        raise HTTPException(status_code=400, detail="scan.proposed_modifications is required")
    try:
        llm = llm_assistant_apply_compact()
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
    branch_guard(nodes, req.mece_root_id)
    scan = dict(req.scan or {})
    ev = dict(req.evidence or {})
    if not scan.get("proposed_modifications"):
        raise HTTPException(status_code=400, detail="scan.proposed_modifications is required")
    if not ev.get("results"):
        raise HTTPException(status_code=400, detail="evidence.results is required")
    try:
        llm = llm_assistant_apply()
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
