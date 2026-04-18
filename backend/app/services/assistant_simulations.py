from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.services.llm_client import LlmClient
from app.services.review_apply import collect_branch_node_ids, merge_review_patch


SIM_PATCH_SYSTEM = """You generate a JSON patch to update a mindmap branch based on a simulation report.

Return JSON only. No markdown.
Schema:
{
  "update_nodes": [{"id": "existing_id", "label": "string", "type": "Evidence"|"Inferred", "metadata": {}}],
  "add_nodes": [{"id": "rev_something_unique", "label": "string", "type": "Evidence"|"Inferred", "metadata": {}}],
  "add_edges": [{"source": "id", "target": "id", "label": "string"}],
  "remove_node_ids": ["id"]
}

Rules:
- Types ONLY "Evidence" or "Inferred".
- add_nodes: every new id MUST start with "rev_" and be unique.
- Prefer Inferred nodes for structure; use Evidence nodes for externally verifiable claims.
- For EVERY Evidence node, metadata MUST include:
    {"source_filename": "...", "text_snippet": "..."}
- Use metadata.critical_values when you include figures (TAM/ARR/penetration/%/$/dates).
- Keep labels concise; do not invent citations (no fake URLs).
"""


@dataclass(frozen=True)
class OptimismInputs:
    currency: str = "USD"
    tam_total: float | None = None
    target_segment_pct: float | None = None  # 0-100
    arpa_year: float | None = None
    customers_total: float | None = None
    penetration_pct: float | None = None  # 0-100


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _fmt_money(x: float, currency: str) -> str:
    cur = (currency or "USD").upper()
    sign = "$" if cur in ("USD", "CAD", "AUD") else ""
    if abs(x) >= 1e9:
        return f"{sign}{x/1e9:.2f}B {cur}"
    if abs(x) >= 1e6:
        return f"{sign}{x/1e6:.2f}M {cur}"
    if abs(x) >= 1e3:
        return f"{sign}{x/1e3:.2f}K {cur}"
    return f"{sign}{x:.0f} {cur}"


def compute_optimism_meter_scenario(
    *,
    focus_metric: str,
    delta_pct: int,
    inp: OptimismInputs,
    baseline_som_override: float | None = None,
) -> dict[str, Any]:
    """Relative % change vs baseline on one of TAM / SOM (SAM) / ARR. delta_pct in [-100, 100], snapped to 10s."""
    dp = int(round(float(delta_pct) / 10.0) * 10)
    dp = int(_clamp(dp, -100, 100))
    m = 1.0 + dp / 100.0

    def val(x: float | None) -> float | None:
        if x is None:
            return None
        try:
            return float(x)
        except Exception:
            return None

    tam = val(inp.tam_total)
    seg = val(inp.target_segment_pct)
    arpa = val(inp.arpa_year)
    customers = val(inp.customers_total)
    pen = val(inp.penetration_pct)

    sam: float | None = None
    if tam is not None and seg is not None:
        sam = float(tam) * (_clamp(float(seg), 0, 100) / 100.0)
    elif baseline_som_override is not None:
        try:
            sam = float(baseline_som_override)
        except Exception:
            sam = None

    arr_base: float | None = None
    if customers is not None and pen is not None and arpa is not None:
        arr_base = float(customers) * (_clamp(float(pen), 0, 100) / 100.0) * float(arpa)
    elif sam is not None and pen is not None and arpa is None:
        arr_base = float(sam) * (_clamp(float(pen), 0, 100) / 100.0)

    before = {"TAM": tam, "SOM": sam, "ARR": arr_base}
    after = {"TAM": tam, "SOM": sam, "ARR": arr_base}

    f = (focus_metric or "").strip().upper()
    if f == "SAM":
        f = "SOM"

    if f == "TAM" and tam is not None:
        nt = float(tam) * m
        after["TAM"] = nt
        if seg is not None:
            after["SOM"] = nt * (_clamp(float(seg), 0, 100) / 100.0)
        if customers is not None and pen is not None and arpa is not None:
            after["ARR"] = float(customers) * (_clamp(float(pen), 0, 100) / 100.0) * float(arpa)
        elif after["SOM"] is not None and pen is not None and arpa is None:
            after["ARR"] = float(after["SOM"]) * (_clamp(float(pen), 0, 100) / 100.0)
    elif f in ("SOM", "SAM") and sam is not None:
        ns = float(sam) * m
        after["SOM"] = ns
        if tam is not None and seg is not None and float(seg) > 0:
            after["TAM"] = ns / (_clamp(float(seg), 0, 100) / 100.0)
        if customers is not None and pen is not None and arpa is not None:
            after["ARR"] = float(customers) * (_clamp(float(pen), 0, 100) / 100.0) * float(arpa)
        elif after["SOM"] is not None and pen is not None and arpa is None:
            after["ARR"] = float(after["SOM"]) * (_clamp(float(pen), 0, 100) / 100.0)
    elif f == "ARR" and arr_base is not None:
        after["ARR"] = float(arr_base) * m

    def pct_change(old: float | None, new: float | None) -> str | None:
        if old is None or new is None or old == 0:
            return None
        try:
            p = (float(new) - float(old)) / float(old) * 100.0
            return f"{p:+.1f}%"
        except Exception:
            return None

    return {
        "mode": "meter",
        "focus": f,
        "delta_pct": dp,
        "multiplier": m,
        "before": before,
        "after": after,
        "pct_change_vs_baseline": {
            "TAM": pct_change(before["TAM"], after["TAM"]),
            "SOM": pct_change(before["SOM"], after["SOM"]),
            "ARR": pct_change(before["ARR"], after["ARR"]),
        },
    }


def compute_optimism_scenarios(*, optimism: int, inp: OptimismInputs) -> dict[str, Any]:
    """Compute low/base/high scenarios. optimism: 0..100 (higher = more aggressive)."""
    o = int(_clamp(float(optimism), 0, 100))
    # Confidence span: pessimistic vs optimistic multipliers.
    # At low optimism, penalize more; at high optimism, boost more.
    low_mult = 0.70 - (o / 100) * 0.10  # 0.70 -> 0.60
    high_mult = 1.10 + (o / 100) * 0.40  # 1.10 -> 1.50

    def val(x: float | None) -> float | None:
        if x is None:
            return None
        try:
            return float(x)
        except Exception:
            return None

    tam_total = val(inp.tam_total)
    seg_pct = val(inp.target_segment_pct)
    arpa = val(inp.arpa_year)
    customers = val(inp.customers_total)
    pen_pct = val(inp.penetration_pct)

    sam = None
    if tam_total is not None and seg_pct is not None:
        sam = tam_total * (_clamp(seg_pct, 0, 100) / 100.0)

    # ARR can be derived either from (customers * penetration * arpa) or from (SAM * penetration) if arpa absent.
    arr_base = None
    if customers is not None and pen_pct is not None and arpa is not None:
        arr_base = customers * (_clamp(pen_pct, 0, 100) / 100.0) * arpa
    elif sam is not None and pen_pct is not None and arpa is None:
        # Interpret SAM as yearly revenue pool; penetration maps to ARR.
        arr_base = sam * (_clamp(pen_pct, 0, 100) / 100.0)

    def scenario(mult: float) -> dict[str, Any]:
        out: dict[str, Any] = {"multiplier": mult}
        if sam is not None:
            out["SAM"] = sam * mult
        if arr_base is not None:
            out["ARR"] = arr_base * mult
        return out

    return {
        "optimism": o,
        "inputs": {
            "currency": (inp.currency or "USD").upper(),
            "TAM": tam_total,
            "target_segment_pct": seg_pct,
            "ARPA_year": arpa,
            "customers_total": customers,
            "penetration_pct": pen_pct,
        },
        "derived": {"SAM": sam, "ARR_base": arr_base},
        "scenarios": {
            "low": scenario(low_mult),
            "base": scenario(1.0),
            "high": scenario(high_mult),
        },
    }


def _branch_context_lines(*, branch_root_id: str, full_nodes: list[dict[str, Any]], full_edges: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    all_ids = {str(n.get("id")) for n in full_nodes if isinstance(n, dict) and n.get("id")}
    edges_raw = [e for e in full_edges if isinstance(e, dict)]
    branch_ids = collect_branch_node_ids(root_id=branch_root_id, edges=edges_raw, all_ids=all_ids)
    branch_nodes = [n for n in full_nodes if isinstance(n, dict) and str(n.get("id")) in branch_ids]
    branch_edges = [e for e in edges_raw if str(e.get("source", "")) in branch_ids and str(e.get("target", "")) in branch_ids]
    return branch_nodes, branch_edges


def simulate_optimism_and_patch(
    *,
    llm: LlmClient,
    branch_root_id: str,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    optimism: int,
    inputs: OptimismInputs,
    focus_metric: str | None = None,
    delta_pct: int | None = None,
    baseline_som_override: float | None = None,
    affected_nodes: list[dict[str, str]] | None = None,
) -> tuple[dict[str, Any], str]:
    branch_nodes, branch_edges = _branch_context_lines(branch_root_id=branch_root_id, full_nodes=full_nodes, full_edges=full_edges)
    cur = (inputs.currency or "USD").upper()

    def money(v: Any) -> str:
        return _fmt_money(float(v), cur) if v is not None else "—"

    use_meter = focus_metric is not None and delta_pct is not None
    if use_meter:
        scenario = compute_optimism_meter_scenario(
            focus_metric=str(focus_metric),
            delta_pct=int(delta_pct),
            inp=inputs,
            baseline_som_override=baseline_som_override,
        )
        before = scenario["before"]
        after = scenario["after"]
        pc = scenario.get("pct_change_vs_baseline") or {}
        report_lines = [
            f"Optimism meter: adjust {scenario['focus']} by {scenario['delta_pct']:+d}% vs branch baseline (step 10%).",
            f"- TAM: {money(before.get('TAM'))} → {money(after.get('TAM'))} ({pc.get('TAM') or '—'})",
            f"- SOM/SAM: {money(before.get('SOM'))} → {money(after.get('SOM'))} ({pc.get('SOM') or '—'})",
            f"- ARR: {money(before.get('ARR'))} → {money(after.get('ARR'))} ({pc.get('ARR') or '—'})",
        ]
        report = "\n".join(report_lines)
        aff = affected_nodes or []
        aff_lines = [f"- node_id={a.get('node_id','')} label={a.get('label','')} reason={a.get('reason','')}" for a in aff[:40]]
        prompt = "\n".join(
            [
                f"Branch root id (do not remove): {branch_root_id}",
                "",
                "Simulation: Optimism meter (user-chosen % change on TAM, SOM/SAM, or ARR vs branch baseline).",
                "Goal: Update metadata.critical_values (and labels only if necessary) on branch nodes so figures match the AFTER row.",
                "Prioritise nodes that already carry TAM/SOM/ARR; update the listed affected nodes if their figures are now inconsistent.",
                "Prefer update_nodes over add_nodes; add at most 1-2 small Evidence nodes only if needed to note the assumption change.",
                "",
                "Computed scenario JSON:",
                json.dumps(scenario, ensure_ascii=False),
                "",
                "Report:",
                report,
                "",
                "Potentially affected branch nodes (review / align):",
                *(aff_lines or ["(none listed)"]),
                "",
                "Branch nodes:",
                *[
                    f"- id={n.get('id')} type={n.get('type') or ''} label={n.get('label') or ''} metadata={n.get('metadata')!r}"
                    for n in branch_nodes[:120]
                ],
                "",
                "Branch edges:",
                *[f"- {e.get('source')} -> {e.get('target')} label={e.get('label') or ''}" for e in branch_edges[:240]],
                "",
                "Task: Return ONLY the patch JSON object.",
            ]
        ).strip()
    else:
        scenario = compute_optimism_scenarios(optimism=optimism, inp=inputs)

        low = scenario["scenarios"]["low"]
        base = scenario["scenarios"]["base"]
        high = scenario["scenarios"]["high"]

        report_lines = [
            f"Optimism Meter = {scenario['optimism']}/100",
            f"- SAM (base): {money(scenario['derived']['SAM'])}",
            f"- ARR (base): {money(scenario['derived']['ARR_base'])}",
            f"- Scenario ARR: low {money(low.get('ARR'))}, base {money(base.get('ARR'))}, high {money(high.get('ARR'))}",
        ]
        report = "\n".join(report_lines)

        node_lines = [
            f"- id={n.get('id')} type={n.get('type') or ''} label={n.get('label') or ''} metadata={n.get('metadata')!r}"
            for n in branch_nodes[:120]
        ]
        edge_lines = [f"- {e.get('source')} -> {e.get('target')} label={e.get('label') or ''}" for e in branch_edges[:240]]

        prompt = "\n".join(
            [
                f"Branch root id (do not remove): {branch_root_id}",
                "",
                "Simulation: Optimism Meter (financial sensitivity).",
                "Goal: Add or update nodes under the branch root that capture the computed SAM/ARR scenarios and key assumptions.",
                "Prefer adding 2-6 new nodes total; keep it readable.",
                "",
                "Computed scenario JSON:",
                json.dumps(scenario, ensure_ascii=False),
                "",
                "Report (for labels):",
                report,
                "",
                "Branch nodes:",
                *node_lines,
                "",
                "Branch edges:",
                *edge_lines,
                "",
                "Task: Return ONLY the patch JSON object.",
            ]
        ).strip()

    patch = llm.generate_json(system=SIM_PATCH_SYSTEM, user=prompt)
    if not isinstance(patch, dict):
        raise ValueError("LLM did not return a JSON patch object")

    all_ids = {str(n.get("id")) for n in full_nodes if isinstance(n, dict) and n.get("id")}
    edges_raw = [e for e in full_edges if isinstance(e, dict)]
    branch_ids = collect_branch_node_ids(root_id=branch_root_id, edges=edges_raw, all_ids=all_ids)
    merged = merge_review_patch(
        full_nodes=full_nodes,
        full_edges=full_edges,
        branch_root_id=branch_root_id,
        branch_ids=branch_ids,
        patch=patch,
    )
    return merged, report


def simulate_black_swan_and_patch(
    *,
    llm: LlmClient,
    branch_root_id: str,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
) -> tuple[dict[str, Any], str]:
    branch_nodes, branch_edges = _branch_context_lines(branch_root_id=branch_root_id, full_nodes=full_nodes, full_edges=full_edges)
    node_lines = [
        f"- id={n.get('id')} type={n.get('type') or ''} label={n.get('label') or ''} metadata={n.get('metadata')!r}"
        for n in branch_nodes[:160]
    ]
    edge_lines = [f"- {e.get('source')} -> {e.get('target')} label={e.get('label') or ''}" for e in branch_edges[:280]]

    report = "Black Swan simulation: identify 3 plausible rare events that would most disrupt this branch, then stress test assumptions and propose mitigations."

    prompt = "\n".join(
        [
            f"Branch root id (do not remove): {branch_root_id}",
            "",
            "Simulation: Black Swan stress test.",
            "Step 1: Select the 3 closest/most relevant black swan events for THIS branch context (not generic).",
            "Step 2: For each event, list what breaks (assumptions, dependencies) and propose mitigations.",
            "Step 3: Update the mindmap branch by adding 4-10 nodes total:",
            "- 3 event nodes (Inferred) with concise labels",
            "- 1-3 impact nodes",
            "- 2-4 mitigation nodes (actions/contingencies)",
            "Connect them under the branch root with clear edge labels (e.g. 'risk', 'impact', 'mitigation').",
            "Do not invent citations/URLs; use Evidence nodes only if the branch already includes evidence snippets to cite.",
            "",
            "Branch nodes:",
            *node_lines,
            "",
            "Branch edges:",
            *edge_lines,
            "",
            "Task: Return ONLY the patch JSON object.",
        ]
    ).strip()

    patch = llm.generate_json(system=SIM_PATCH_SYSTEM, user=prompt)
    if not isinstance(patch, dict):
        raise ValueError("LLM did not return a JSON patch object")

    all_ids = {str(n.get("id")) for n in full_nodes if isinstance(n, dict) and n.get("id")}
    edges_raw = [e for e in full_edges if isinstance(e, dict)]
    branch_ids = collect_branch_node_ids(root_id=branch_root_id, edges=edges_raw, all_ids=all_ids)
    merged = merge_review_patch(
        full_nodes=full_nodes,
        full_edges=full_edges,
        branch_root_id=branch_root_id,
        branch_ids=branch_ids,
        patch=patch,
    )
    return merged, report

