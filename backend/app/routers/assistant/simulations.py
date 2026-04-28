from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException

from app.services.assistant_simulations import (
    OptimismInputs,
    black_swan_apply_mitigations_patch,
    black_swan_run_simulation,
    black_swan_scan_scenarios,
    simulate_optimism_and_patch,
)

from .context import branch_guard
from .llm_utils import llm_assistant_apply, llm_assistant_apply_compact
from .schemas import (
    BlackSwanApplyRequest,
    BlackSwanGapOut,
    BlackSwanMitigationOut,
    BlackSwanRunRequest,
    BlackSwanRunResponse,
    BlackSwanScanRequest,
    BlackSwanScanResponse,
    BlackSwanScenarioOut,
    BlackSwanScenarioResultOut,
    OptimismSimRequest,
    SimResponse,
)

router = APIRouter()


@router.post("/assistant/simulate/optimism", response_model=SimResponse)
def simulate_optimism(req: OptimismSimRequest) -> SimResponse:
    branch_guard(req.full_nodes, req.branch_root_id)
    try:
        llm = llm_assistant_apply()
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


@router.post("/assistant/simulate/black-swan/scan", response_model=BlackSwanScanResponse)
def simulate_black_swan_scan(req: BlackSwanScanRequest) -> BlackSwanScanResponse:
    nodes = [dict(n) for n in req.full_nodes if isinstance(n, dict)]
    edges = [dict(e) for e in req.full_edges if isinstance(e, dict)]
    branch_guard(nodes, req.branch_root_id)
    try:
        llm = llm_assistant_apply_compact()
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
    branch_guard(nodes, req.branch_root_id)
    try:
        llm = llm_assistant_apply()
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
                    addresses_gaps=list(m.get("addresses_gaps") or [])
                    if isinstance(m.get("addresses_gaps"), list)
                    else [],
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
    branch_guard(nodes, req.branch_root_id)
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
        llm = llm_assistant_apply()
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
