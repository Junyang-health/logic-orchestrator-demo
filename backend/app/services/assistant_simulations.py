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


BLACK_SWAN_MECE_AXES = ("Technology", "Market", "Policy", "Operations", "Financial")

BLACK_SWAN_SCAN_SYSTEM = """You return JSON only. No markdown.

Schema:
{"scenarios":[{"id":"bs_1","mece_axis":"Technology","title":"string","summary":"string","why_relevant":"string"}]}

Rules:
- Exactly 5 scenarios.
- Each mece_axis MUST be one of: Technology, Market, Policy, Operations, Financial — use each label exactly once (MECE lenses).
- Black-swan style: plausible-but-rare, high-impact shocks in a 1–3 year horizon for THIS branch (not generic trivia).
- ids: stable unique strings (e.g. bs_1..bs_5).
- title: <=120 chars. summary: 1–3 sentences. why_relevant: 1 sentence tied to branch content.
"""


BLACK_SWAN_RUN_SYSTEM = """You return JSON only. No markdown.

Schema:
{
  "results": [
    {
      "scenario_id": "bs_1",
      "potential_impacts": ["string"],
      "gaps_to_address": [{"id":"g1","description":"string","severity":"high"}],
      "mitigations": [{"id":"m1","title":"string","description":"string","addresses_gaps":["g1"]}]
    }
  ],
  "executive_summary": "string"
}

Rules:
- results MUST contain one entry per input scenario (same scenario_id values).
- Each scenario: >=2 potential_impacts; >=2 gaps_to_address; >=2 mitigations.
- gaps need unique ids per scenario (e.g. g1, g2). mitigations need unique ids per scenario (e.g. m1, m2).
- addresses_gaps lists gap ids that mitigation closes or materially reduces.
- severity: one of high, medium, low.
- executive_summary: <=6 sentences across all selected scenarios.
"""


def _validate_scan_scenarios(data: Any) -> list[dict[str, Any]]:
    if not isinstance(data, dict):
        raise ValueError("Black swan scan: expected a JSON object")
    raw = data.get("scenarios")
    if not isinstance(raw, list) or len(raw) != 5:
        raise ValueError("Black swan scan: expected exactly 5 scenarios")
    axes = set(BLACK_SWAN_MECE_AXES)
    seen_axes: set[str] = set()
    out: list[dict[str, Any]] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ValueError("Black swan scan: each scenario must be an object")
        sid = str(item.get("id") or "").strip() or f"bs_{i + 1}"
        axis = str(item.get("mece_axis") or "").strip()
        if axis not in axes:
            raise ValueError(f"Black swan scan: invalid mece_axis {axis!r}")
        if axis in seen_axes:
            raise ValueError(f"Black swan scan: duplicate mece_axis {axis!r} (MECE requires each once)")
        seen_axes.add(axis)
        title = str(item.get("title") or "").strip()
        summary = str(item.get("summary") or "").strip()
        if not title or not summary:
            raise ValueError("Black swan scan: each scenario needs title and summary")
        wr = str(item.get("why_relevant") or "").strip()
        out.append({"id": sid, "mece_axis": axis, "title": title[:200], "summary": summary[:1200], "why_relevant": wr[:600]})
    if seen_axes != axes:
        missing = axes - seen_axes
        raise ValueError(f"Black swan scan: missing MECE axes: {', '.join(sorted(missing))}")
    return out


def _validate_run_payload(data: Any, expected_ids: set[str]) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("Black swan run: expected a JSON object")
    results = data.get("results")
    if not isinstance(results, list) or len(results) != len(expected_ids):
        raise ValueError("Black swan run: results length must match selected scenarios")
    got_ids: set[str] = set()
    norm_results: list[dict[str, Any]] = []
    for block in results:
        if not isinstance(block, dict):
            raise ValueError("Black swan run: each result must be an object")
        sid = str(block.get("scenario_id") or "").strip()
        if sid not in expected_ids:
            raise ValueError(f"Black swan run: unexpected scenario_id {sid!r}")
        got_ids.add(sid)
        impacts = block.get("potential_impacts")
        if not isinstance(impacts, list) or len(impacts) < 2:
            raise ValueError(f"Black swan run: at least 2 potential_impacts required for {sid}")
        impacts_s = [str(x).strip() for x in impacts if str(x).strip()][:24]
        if len(impacts_s) < 2:
            raise ValueError(f"Black swan run: potential_impacts too short for {sid}")
        gaps_raw = block.get("gaps_to_address")
        if not isinstance(gaps_raw, list) or len(gaps_raw) < 2:
            raise ValueError(f"Black swan run: at least 2 gaps_to_address required for {sid}")
        gaps: list[dict[str, Any]] = []
        for g in gaps_raw[:12]:
            if not isinstance(g, dict):
                continue
            gid = str(g.get("id") or "").strip()
            desc = str(g.get("description") or "").strip()
            if not gid or not desc:
                continue
            sev = str(g.get("severity") or "medium").strip().lower()
            if sev not in ("high", "medium", "low"):
                sev = "medium"
            gaps.append({"id": gid[:32], "description": desc[:800], "severity": sev})
        mits_raw = block.get("mitigations")
        if not isinstance(mits_raw, list) or len(mits_raw) < 2:
            raise ValueError(f"Black swan run: at least 2 mitigations required for {sid}")
        mits: list[dict[str, Any]] = []
        for m in mits_raw[:16]:
            if not isinstance(m, dict):
                continue
            mid = str(m.get("id") or "").strip()
            title = str(m.get("title") or "").strip()
            desc = str(m.get("description") or "").strip()
            if not mid or not title or not desc:
                continue
            ag = m.get("addresses_gaps")
            ag_list: list[str] = []
            if isinstance(ag, list):
                ag_list = [str(x).strip() for x in ag if str(x).strip()][:16]
            mits.append(
                {
                    "id": mid[:32],
                    "title": title[:200],
                    "description": desc[:1600],
                    "addresses_gaps": ag_list,
                }
            )
        if len(gaps) < 2 or len(mits) < 2:
            raise ValueError(f"Black swan run: incomplete gaps/mitigations for {sid}")
        norm_results.append(
            {
                "scenario_id": sid,
                "potential_impacts": impacts_s,
                "gaps_to_address": gaps,
                "mitigations": mits,
            }
        )
    if got_ids != expected_ids:
        raise ValueError("Black swan run: scenario_id set must match selected scenarios")
    summary = str(data.get("executive_summary") or "").strip()[:4000]
    return {"results": norm_results, "executive_summary": summary}


def black_swan_scan_scenarios(
    *,
    llm: LlmClient,
    branch_root_id: str,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], str]:
    branch_nodes, branch_edges = _branch_context_lines(branch_root_id=branch_root_id, full_nodes=full_nodes, full_edges=full_edges)
    node_lines = [
        f"- id={n.get('id')} type={n.get('type') or ''} label={n.get('label') or ''} metadata={n.get('metadata')!r}"
        for n in branch_nodes[:160]
    ]
    edge_lines = [f"- {e.get('source')} -> {e.get('target')} label={e.get('label') or ''}" for e in branch_edges[:280]]

    prompt = "\n".join(
        [
            f"Branch root id (context anchor): {branch_root_id}",
            "",
            "Task: Propose the top 5 black-swan-style scenarios for stress testing this branch.",
            "Use the MECE axis assignment exactly as specified in the system schema (each axis once).",
            "",
            "Branch nodes:",
            *node_lines,
            "",
            "Branch edges:",
            *edge_lines,
            "",
            "Return ONLY the JSON object with key scenarios (5 items).",
        ]
    ).strip()

    data = llm.generate_json(system=BLACK_SWAN_SCAN_SYSTEM, user=prompt)
    scenarios = _validate_scan_scenarios(data)
    report = "Scan complete: 5 MECE-scoped black swan candidates for this branch."
    return scenarios, report


def black_swan_run_simulation(
    *,
    llm: LlmClient,
    branch_root_id: str,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    selected_scenarios: list[dict[str, Any]],
) -> tuple[dict[str, Any], str]:
    if not selected_scenarios:
        raise ValueError("At least one scenario is required")
    branch_nodes, branch_edges = _branch_context_lines(branch_root_id=branch_root_id, full_nodes=full_nodes, full_edges=full_edges)
    node_lines = [
        f"- id={n.get('id')} type={n.get('type') or ''} label={n.get('label') or ''} metadata={n.get('metadata')!r}"
        for n in branch_nodes[:160]
    ]
    edge_lines = [f"- {e.get('source')} -> {e.get('target')} label={e.get('label') or ''}" for e in branch_edges[:280]]

    expected_ids = {str(s.get("id") or "").strip() for s in selected_scenarios if isinstance(s, dict) and str(s.get("id") or "").strip()}
    if not expected_ids:
        raise ValueError("Selected scenarios must include ids")

    prompt = "\n".join(
        [
            f"Branch root id (context anchor): {branch_root_id}",
            "",
            "Selected black swan scenarios (simulate only these):",
            json.dumps(selected_scenarios, ensure_ascii=False),
            "",
            "For EACH selected scenario, estimate potential impacts on this branch, capability gaps to address,",
            "and concrete mitigations. Mitigations should be actionable and map to gap ids.",
            "",
            "Branch nodes:",
            *node_lines,
            "",
            "Branch edges:",
            *edge_lines,
            "",
            "Return ONLY the JSON object matching the system schema (results + executive_summary).",
        ]
    ).strip()

    data = llm.generate_json(system=BLACK_SWAN_RUN_SYSTEM, user=prompt)
    bundle = _validate_run_payload(data, expected_ids)
    report = bundle.get("executive_summary") or "Simulation complete: impacts, gaps, and mitigations per scenario."
    if not isinstance(report, str):
        report = str(report)
    return bundle, report


def black_swan_apply_mitigations_patch(
    *,
    llm: LlmClient,
    branch_root_id: str,
    full_nodes: list[dict[str, Any]],
    full_edges: list[dict[str, Any]],
    scenarios: list[dict[str, Any]],
    run_bundle: dict[str, Any],
    selections: list[tuple[str, str]],
) -> tuple[dict[str, Any], str]:
    """selections: (scenario_id, mitigation_id) pairs validated by caller."""
    if not selections:
        raise ValueError("Select at least one mitigation to apply")

    results = run_bundle.get("results")
    if not isinstance(results, list):
        raise ValueError("run_bundle missing results")

    by_sid: dict[str, dict[str, Any]] = {}
    for block in results:
        if isinstance(block, dict) and block.get("scenario_id"):
            by_sid[str(block["scenario_id"])] = block

    scenario_by_id = {str(s.get("id")): s for s in scenarios if isinstance(s, dict) and s.get("id")}

    chosen: list[dict[str, Any]] = []
    for sid, mid in selections:
        block = by_sid.get(sid)
        if not block:
            continue
        mits = block.get("mitigations")
        if not isinstance(mits, list):
            continue
        mit = next((m for m in mits if isinstance(m, dict) and str(m.get("id")) == mid), None)
        if not mit:
            raise ValueError(f"Mitigation {mid!r} not found for scenario {sid!r}")
        scen = scenario_by_id.get(sid, {})
        gaps = block.get("gaps_to_address") if isinstance(block.get("gaps_to_address"), list) else []
        chosen.append(
            {
                "scenario_id": sid,
                "scenario_title": scen.get("title", ""),
                "mece_axis": scen.get("mece_axis", ""),
                "potential_impacts": block.get("potential_impacts", []),
                "gaps_to_address": gaps,
                "mitigation": mit,
            }
        )

    branch_nodes, branch_edges = _branch_context_lines(branch_root_id=branch_root_id, full_nodes=full_nodes, full_edges=full_edges)
    node_lines = [
        f"- id={n.get('id')} type={n.get('type') or ''} label={n.get('label') or ''} metadata={n.get('metadata')!r}"
        for n in branch_nodes[:160]
    ]
    edge_lines = [f"- {e.get('source')} -> {e.get('target')} label={e.get('label') or ''}" for e in branch_edges[:280]]

    report = f"Applied {len(chosen)} mitigation(s) from black swan simulation to the branch."

    prompt = "\n".join(
        [
            f"Branch root id (do not remove): {branch_root_id}",
            "",
            "Black Swan — user-selected mitigations to materialize on the mindmap.",
            "Add structured nodes under the branch root so the map captures:",
            "- each scenario title (or a short 'risk lens' parent)",
            "- key impacts (brief)",
            "- each chosen mitigation as actionable items (Inferred)",
            "- optional links from mitigation to related gaps (labels on edges).",
            "Prefer 6–14 new nodes total across all mitigations; stay readable.",
            "Do not invent citations/URLs; Evidence nodes only if citing existing branch snippets with metadata.source_filename + text_snippet.",
            "",
            "Chosen mitigations JSON:",
            json.dumps(chosen, ensure_ascii=False),
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

