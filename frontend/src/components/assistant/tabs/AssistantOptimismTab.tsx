import { memo, useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Plus } from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";
import type { MindmapJson } from "../../../types/mindmap";
import { readFetchDetailMessage } from "../assistantFetchDetail";
import {
  branchExtractToMeterInputs,
  deriveMetricsFromMeterInputs,
  formatMoneyShort,
  snapDeltaPct,
  type BranchFinancialExtract,
  type MeterInputs,
  type OptimismMetric,
  type AffectedNodeHint
} from "../../../lib/optimismMeter";

function parseOptNumber(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

type OptimismPreview = {
  before: Record<OptimismMetric, number | null>;
  after: Record<OptimismMetric, number | null>;
  pctLabel: Record<OptimismMetric, string | null>;
};

type OptimismBaselineExplainOut = {
  summary: string;
  computation_steps: string[];
  driver_notes: { field: string; note: string; evidence_node_id?: string | null }[];
  caveats: string[];
  confidence: string;
};

export type AssistantOptimismTabProps = {
  branchRootId: string | undefined;
  branchRootDisplayName: string;
  branchFinancial: BranchFinancialExtract | null;
  optimismMetricsAvailable: OptimismMetric[];
  optimismFocus: OptimismMetric | null;
  setOptimismFocus: Dispatch<SetStateAction<OptimismMetric | null>>;
  currency: string;
  setCurrency: (v: string) => void;
  optimismDeltaPct: number;
  setOptimismDeltaPct: Dispatch<SetStateAction<number>>;
  optimismPreview: OptimismPreview | null;
  optimismAffected: AffectedNodeHint[];
  simBusy: boolean;
  onApplyOptimism: () => void;
  meterInputs: MeterInputs | null;
  setMeterInputs: Dispatch<SetStateAction<MeterInputs | null>>;
  backendBase: string;
  combinedGraphForOptimism: MindmapJson;
};

function moneyOrZero(n: number | null | undefined, currency: string): string {
  if (n == null || !Number.isFinite(n)) return formatMoneyShort(0, currency);
  return formatMoneyShort(n, currency);
}

/** Same semantics as computeMeterPreview pct(); extend with explicit 0% when values equal. */
function pctChangeLabel(before: number | null, after: number | null): string {
  if (before == null || after == null) return "—";
  if (!Number.isFinite(before) || !Number.isFinite(after)) return "—";
  if (before === 0) {
    if (after === 0) return "0.0%";
    return "—";
  }
  const p = ((after - before) / before) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

function metricPctDisplay(
  preview: OptimismPreview | null,
  metric: OptimismMetric,
  before: number | null,
  after: number | null
): string {
  const fromPreview = preview?.pctLabel[metric];
  if (fromPreview != null) return fromPreview;
  return pctChangeLabel(before, after);
}

function pctDeltaTone(pctStr: string): string {
  if (pctStr === "—") return "text-slate-500 dark:text-slate-400";
  const m = pctStr.match(/^([+-]?\d+(?:\.\d+)?)%/);
  if (!m) return "text-slate-600 dark:text-slate-300";
  const v = Number(m[1]);
  if (!Number.isFinite(v) || v === 0) return "text-slate-600 dark:text-slate-400";
  return v > 0
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
}

function AssistantOptimismTabInner(props: AssistantOptimismTabProps) {
  const {
    branchRootId,
    branchRootDisplayName,
    branchFinancial,
    optimismMetricsAvailable,
    optimismFocus,
    setOptimismFocus,
    currency,
    setCurrency,
    optimismDeltaPct,
    setOptimismDeltaPct,
    optimismPreview,
    optimismAffected,
    simBusy,
    onApplyOptimism,
    meterInputs,
    setMeterInputs,
    backendBase,
    combinedGraphForOptimism
  } = props;

  const { t } = useI18n();
  const [copyFlash, setCopyFlash] = useState(false);

  const snap = snapDeltaPct(optimismDeltaPct);
  const meterDisabled = optimismMetricsAvailable.length === 0 || !optimismFocus;
  const bubbleLeftPct = (snap + 100) / 2;

  const metricsListStr = useMemo(
    () => optimismMetricsAvailable.join(" · ") || "—",
    [optimismMetricsAvailable]
  );

  const derivedFromInputs = useMemo(
    () => (meterInputs ? deriveMetricsFromMeterInputs(meterInputs) : null),
    [meterInputs]
  );

  const tamBefore =
    optimismPreview?.before.TAM ?? derivedFromInputs?.TAM ?? branchFinancial?.tam ?? null;
  const tamAfter = optimismPreview?.after.TAM ?? derivedFromInputs?.TAM ?? tamBefore;
  const somBefore =
    optimismPreview?.before.SOM ?? derivedFromInputs?.SOM ?? branchFinancial?.som ?? null;
  const somAfter = optimismPreview?.after.SOM ?? derivedFromInputs?.SOM ?? somBefore;
  const arrBefore =
    optimismPreview?.before.ARR ?? derivedFromInputs?.ARR ?? branchFinancial?.arr ?? null;
  const arrAfter = optimismPreview?.after.ARR ?? derivedFromInputs?.ARR ?? arrBefore;

  const tamPctStr = metricPctDisplay(optimismPreview, "TAM", tamBefore, tamAfter);
  const somPctStr = metricPctDisplay(optimismPreview, "SOM", somBefore, somAfter);
  const arrPctStr = metricPctDisplay(optimismPreview, "ARR", arrBefore, arrAfter);

  const showSimulatedBadge = Boolean(optimismPreview && snap !== 0);

  const copyMetricsTemplate = useCallback(() => {
    const id = branchRootId || "YOUR_NODE_ID";
    const name = branchRootDisplayName || id;
    const body = [
      `// Add as critical_values on node "${name}" (${id})`,
      `[`,
      `  { "label": "TAM", "value": "e.g. 1200000000" },`,
      `  { "label": "SOM", "value": "e.g. 480000000" },`,
      `  { "label": "ARR", "value": "e.g. 12000000" }`,
      `]`
    ].join("\n");
    void navigator.clipboard.writeText(body).then(() => {
      setCopyFlash(true);
      window.setTimeout(() => setCopyFlash(false), 2000);
    });
  }, [branchRootDisplayName, branchRootId]);

  const ctaName = branchRootDisplayName || branchRootId || t("opt_audit_branch_missing");

  const somFromTamSegment = Boolean(
    meterInputs?.tam_total != null && meterInputs?.target_segment_pct != null
  );

  const patchInputs = useCallback(
    (partial: Partial<MeterInputs>) => {
      setMeterInputs((prev) => {
        if (!prev) return prev;
        let next: MeterInputs = { ...prev, ...partial };
        if (next.tam_total != null && next.target_segment_pct != null) {
          next = { ...next, baseline_som_override: null };
        }
        return next;
      });
    },
    [setMeterInputs]
  );

  const resetMeterInputs = useCallback(() => {
    if (!branchFinancial) return;
    setMeterInputs(branchExtractToMeterInputs(branchFinancial));
  }, [branchFinancial, setMeterInputs]);

  const [explainBusy, setExplainBusy] = useState(false);
  const [explainError, setExplainError] = useState("");
  const [explainResult, setExplainResult] = useState<OptimismBaselineExplainOut | null>(null);

  const runExplainBaseline = useCallback(async () => {
    if (!backendBase || !branchRootId || !meterInputs) return;
    setExplainBusy(true);
    setExplainError("");
    try {
      const derived = deriveMetricsFromMeterInputs(meterInputs);
      const res = await fetch(`${backendBase}/assistant/simulate/optimism/explain-baseline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_root_id: branchRootId,
          full_nodes: combinedGraphForOptimism.nodes,
          full_edges: combinedGraphForOptimism.edges,
          currency,
          meter: {
            tam_total: meterInputs.tam_total ?? undefined,
            target_segment_pct: meterInputs.target_segment_pct ?? undefined,
            arpa_year: meterInputs.arpa_year ?? undefined,
            customers_total: meterInputs.customers_total ?? undefined,
            penetration_pct: meterInputs.penetration_pct ?? undefined,
            baseline_som_override: meterInputs.baseline_som_override ?? undefined
          },
          derived_tam: derived.TAM ?? undefined,
          derived_som: derived.SOM ?? undefined,
          derived_arr: derived.ARR ?? undefined
        })
      });
      if (!res.ok) throw new Error(await readFetchDetailMessage(res, "Explain failed"));
      const data = (await res.json()) as OptimismBaselineExplainOut;
      setExplainResult(data);
    } catch (e) {
      setExplainError(e instanceof Error ? e.message : "Request failed");
      setExplainResult(null);
    } finally {
      setExplainBusy(false);
    }
  }, [backendBase, branchRootId, combinedGraphForOptimism.edges, combinedGraphForOptimism.nodes, currency, meterInputs]);

  return (
    <div className="mb-1 space-y-4">
      <div>
        <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{t("opt_title")}</div>
        <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300">{t("opt_intro")}</p>
      </div>

      {/* Branch audit — glass card */}
      <div className="rounded-xl border border-slate-200/80 bg-white/45 px-3 py-3 shadow-sm backdrop-blur-md dark:border-slate-600/50 dark:bg-slate-950/45">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          {t("opt_audit_title")}
        </div>
        <ul className="mt-2 space-y-2">
          <li className="flex items-start gap-2 text-[11px] leading-snug text-slate-700 dark:text-slate-200">
            <span className="mt-0.5 shrink-0 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              [✓]
            </span>
            <span>
              {branchRootId
                ? t("opt_audit_branch_ok", { id: branchRootId })
                : t("opt_audit_branch_missing")}
            </span>
          </li>
          <li className="flex items-start gap-2 text-[11px] leading-snug text-slate-700 dark:text-slate-200">
            <span
              className={[
                "mt-0.5 shrink-0 font-mono text-[10px] font-semibold",
                optimismMetricsAvailable.length === 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              ].join(" ")}
            >
              {optimismMetricsAvailable.length === 0 ? "[!]" : "[✓]"}
            </span>
            <span>
              {optimismMetricsAvailable.length === 0
                ? t("opt_audit_metrics_warn")
                : t("opt_audit_metrics_ok", { list: metricsListStr })}
            </span>
          </li>
        </ul>
        <button
          type="button"
          className="ios-button-secondary mt-3 flex w-full items-center justify-center gap-1.5 py-2 text-[10px] font-medium"
          disabled={!branchRootId}
          onClick={copyMetricsTemplate}
        >
          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("opt_add_metrics_cta", { name: ctaName })}
        </button>
        {copyFlash ? (
          <p className="mt-1.5 text-center text-[9px] text-emerald-600 dark:text-emerald-400">{t("opt_add_metrics_copied")}</p>
        ) : null}
      </div>

      {/* Currency + stress target */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[6rem] flex-1 text-[10px] text-slate-600 dark:text-slate-300">
          {t("opt_currency")}
          <input
            className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white/80 px-2 py-1.5 text-[11px] text-slate-800 outline-none dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("opt_stress")}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {(["TAM", "SOM", "ARR"] as const).map((k) => {
              const on = optimismMetricsAvailable.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!on}
                  className={[
                    "rounded-full px-2.5 py-0.5 text-[10px] font-medium transition",
                    optimismFocus === k
                      ? "bg-sky-600 text-white dark:bg-sky-500"
                      : on
                        ? "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                        : "cursor-not-allowed border border-slate-100 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-600"
                  ].join(" ")}
                  onClick={() => on && setOptimismFocus(k)}
                >
                  {k}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {meterInputs ? (
        <div className="rounded-xl border border-slate-200/80 bg-white/40 px-3 py-3 shadow-sm backdrop-blur-md dark:border-slate-600/50 dark:bg-slate-950/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              {t("opt_vars_title")}
            </div>
            <button
              type="button"
              className="ios-button-ghost px-2 py-1 text-[9px] font-medium"
              disabled={!branchFinancial}
              onClick={resetMeterInputs}
            >
              {t("opt_var_reset")}
            </button>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-slate-600 dark:text-slate-400">{t("opt_vars_intro")}</p>

          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="block text-[10px] text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">{t("opt_var_tam")}</span>
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white/90 px-2 py-1.5 font-mono text-[11px] text-slate-800 outline-none dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100"
                value={meterInputs.tam_total == null ? "" : String(meterInputs.tam_total)}
                onChange={(e) => patchInputs({ tam_total: parseOptNumber(e.target.value) })}
              />
            </label>
            <label className="block text-[10px] text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">{t("opt_var_segment")}</span>
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white/90 px-2 py-1.5 font-mono text-[11px] text-slate-800 outline-none dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100"
                placeholder={t("opt_var_segment_ph")}
                value={meterInputs.target_segment_pct == null ? "" : String(meterInputs.target_segment_pct)}
                onChange={(e) => {
                  const v = parseOptNumber(e.target.value);
                  patchInputs({
                    target_segment_pct: v == null ? null : Math.max(0, Math.min(100, v))
                  });
                }}
              />
            </label>
            <label className="block text-[10px] text-slate-600 dark:text-slate-300 sm:col-span-2">
              <span className="font-medium text-slate-700 dark:text-slate-200">{t("opt_var_som_direct")}</span>
              <input
                type="text"
                inputMode="decimal"
                disabled={somFromTamSegment}
                title={somFromTamSegment ? t("opt_var_som_derived_hint") : undefined}
                className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white/90 px-2 py-1.5 font-mono text-[11px] text-slate-800 outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100"
                value={meterInputs.baseline_som_override == null ? "" : String(meterInputs.baseline_som_override)}
                onChange={(e) => patchInputs({ baseline_som_override: parseOptNumber(e.target.value) })}
              />
              {somFromTamSegment ? (
                <span className="mt-1 block text-[9px] text-slate-500 dark:text-slate-500">{t("opt_var_som_derived_hint")}</span>
              ) : null}
            </label>
            <label className="block text-[10px] text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">{t("opt_var_customers")}</span>
              <input
                type="text"
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white/90 px-2 py-1.5 font-mono text-[11px] text-slate-800 outline-none dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100"
                value={meterInputs.customers_total == null ? "" : String(meterInputs.customers_total)}
                onChange={(e) =>
                  patchInputs({
                    customers_total: (() => {
                      const v = parseOptNumber(e.target.value);
                      return v == null ? null : Math.max(0, Math.round(v));
                    })()
                  })
                }
              />
            </label>
            <label className="block text-[10px] text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">{t("opt_var_penetration")}</span>
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white/90 px-2 py-1.5 font-mono text-[11px] text-slate-800 outline-none dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100"
                value={meterInputs.penetration_pct == null ? "" : String(meterInputs.penetration_pct)}
                onChange={(e) => {
                  const v = parseOptNumber(e.target.value);
                  patchInputs({
                    penetration_pct: v == null ? null : Math.max(0, Math.min(100, v))
                  });
                }}
              />
            </label>
            <label className="block text-[10px] text-slate-600 dark:text-slate-300 sm:col-span-2">
              <span className="font-medium text-slate-700 dark:text-slate-200">{t("opt_var_arpa")}</span>
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white/90 px-2 py-1.5 font-mono text-[11px] text-slate-800 outline-none dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100"
                value={meterInputs.arpa_year == null ? "" : String(meterInputs.arpa_year)}
                onChange={(e) => patchInputs({ arpa_year: parseOptNumber(e.target.value) })}
              />
            </label>
          </div>

          <div className="mt-3 space-y-1 rounded-lg bg-slate-100/70 px-2 py-2 text-[9px] leading-snug text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
            <p className="font-medium text-slate-700 dark:text-slate-300">{t("opt_vars_breakdown")}</p>
            <p>
              {t("opt_vars_derived_som")}:{" "}
              <span className="font-mono text-[10px] text-slate-800 dark:text-slate-200">
                {derivedFromInputs?.SOM != null ? formatMoneyShort(derivedFromInputs.SOM, currency) : "—"}
              </span>
            </p>
            <p>
              {t("opt_vars_derived_arr")}:{" "}
              <span className="font-mono text-[10px] text-slate-800 dark:text-slate-200">
                {derivedFromInputs?.ARR != null ? formatMoneyShort(derivedFromInputs.ARR, currency) : "—"}
              </span>
            </p>
            <p className="text-slate-500 dark:text-slate-500">{t("opt_var_formula_arr_full")}</p>
            <p className="text-slate-500 dark:text-slate-500">{t("opt_var_formula_arr_som")}</p>
          </div>

          <div className="mt-3 border-t border-slate-200/80 pt-3 dark:border-slate-600/50">
            <button
              type="button"
              className="ios-button-secondary w-full py-2 text-[10px] font-medium"
              disabled={explainBusy || !branchRootId || simBusy}
              onClick={() => void runExplainBaseline()}
            >
              {explainBusy ? t("opt_explain_busy") : t("opt_explain_ai")}
            </button>
            {explainError ? (
              <p className="mt-2 text-[10px] text-red-600 dark:text-red-400">{explainError}</p>
            ) : null}
            {explainResult ? (
              <div className="mt-2 space-y-2 text-[10px] leading-snug text-slate-700 dark:text-slate-300">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("opt_explain_confidence", { c: explainResult.confidence })}
                </p>
                <p>{explainResult.summary}</p>
                {explainResult.computation_steps.length > 0 ? (
                  <div>
                    <div className="font-semibold text-slate-600 dark:text-slate-400">{t("opt_explain_steps")}</div>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                      {explainResult.computation_steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                {explainResult.driver_notes.length > 0 ? (
                  <div>
                    <div className="font-semibold text-slate-600 dark:text-slate-400">{t("opt_explain_drivers")}</div>
                    <ul className="mt-1 space-y-1">
                      {explainResult.driver_notes.map((d, i) => (
                        <li key={i}>
                          <span className="font-mono text-[9px] text-sky-700 dark:text-sky-400">{d.field}</span>
                          {d.evidence_node_id ? (
                            <span className="ml-1 font-mono text-[9px] text-slate-500">
                              ({d.evidence_node_id})
                            </span>
                          ) : null}
                          : {d.note}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {explainResult.caveats.length > 0 ? (
                  <div className="text-amber-800 dark:text-amber-200/90">
                    <div className="font-semibold">{t("opt_explain_caveats")}</div>
                    <ul className="mt-1 list-disc pl-4">
                      {explainResult.caveats.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Hero meter */}
      <div>
        <div className="relative pt-7 pb-0.5">
          <output
            className="pointer-events-none absolute bottom-[calc(100%-0.75rem)] left-0 z-10 font-mono text-[1.15rem] font-bold leading-none tabular-nums tracking-tight text-slate-900 dark:text-slate-50"
            style={{ left: `${bubbleLeftPct}%`, transform: "translateX(-50%)" }}
            aria-live="polite"
          >
            {snap >= 0 ? `+${snap}` : `${snap}`}%
          </output>
          <div className="mm-opt-meter">
            <input
              type="range"
              min={-100}
              max={100}
              step={10}
              value={snap}
              disabled={meterDisabled}
              aria-label={t("opt_optimism", { p: String(snap) })}
              onChange={(e) => setOptimismDeltaPct(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="mt-1 flex justify-between gap-1 text-[9px] font-medium leading-tight text-slate-500 dark:text-slate-400">
          <span className="max-w-[32%] text-left">{t("opt_meter_label_left")}</span>
          <span className="shrink-0 text-center">{t("opt_meter_label_mid")}</span>
          <span className="max-w-[32%] text-right">{t("opt_meter_label_right")}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {[-40, -20, -10, 10, 20, 40].map((step) => (
            <button
              key={step}
              type="button"
              disabled={meterDisabled}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => setOptimismDeltaPct((d) => snapDeltaPct(d + step))}
            >
              {step > 0 ? `+${step}%` : `${step}%`}
            </button>
          ))}
          <button
            type="button"
            disabled={meterDisabled}
            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => setOptimismDeltaPct(0)}
          >
            {t("opt_reset")}
          </button>
        </div>
      </div>

      {/* Scoreboard */}
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          {t("opt_scoreboard_section")}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 bg-white/60 px-2.5 py-2 dark:border-slate-700/80 dark:bg-slate-900/50">
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{t("opt_scoreboard_tam")}</div>
            <div className="mt-1 space-y-0.5 font-mono text-[10px] leading-snug text-slate-800 dark:text-slate-200">
              <div>
                <span className="text-slate-500 dark:text-slate-400">{t("opt_scoreboard_baseline_lbl")}: </span>
                {moneyOrZero(tamBefore, currency)}
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">{t("opt_scoreboard_adjusted_lbl")}: </span>
                <span className="mm-opt-score-adjusted font-semibold">{moneyOrZero(tamAfter, currency)}</span>
              </div>
              <div className="pt-0.5">
                <span className="text-slate-500 dark:text-slate-400">{t("opt_scoreboard_pct_delta_lbl")}: </span>
                <span className={`font-semibold tabular-nums ${pctDeltaTone(tamPctStr)}`}>{tamPctStr}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/60 px-2.5 py-2 dark:border-slate-700/80 dark:bg-slate-900/50">
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{t("opt_scoreboard_som")}</div>
            <div className="mt-1 space-y-0.5 font-mono text-[10px] leading-snug text-slate-800 dark:text-slate-200">
              <div>
                <span className="text-slate-500 dark:text-slate-400">{t("opt_scoreboard_baseline_lbl")}: </span>
                {moneyOrZero(somBefore, currency)}
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">{t("opt_scoreboard_adjusted_lbl")}: </span>
                <span className="mm-opt-score-adjusted font-semibold">{moneyOrZero(somAfter, currency)}</span>
              </div>
              <div className="pt-0.5">
                <span className="text-slate-500 dark:text-slate-400">{t("opt_scoreboard_pct_delta_lbl")}: </span>
                <span className={`font-semibold tabular-nums ${pctDeltaTone(somPctStr)}`}>{somPctStr}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/60 px-2.5 py-2 dark:border-slate-700/80 dark:bg-slate-900/50">
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{t("opt_scoreboard_arr")}</div>
            <div className="mt-1 space-y-0.5 font-mono text-[10px] leading-snug text-slate-800 dark:text-slate-200">
              <div>
                <span className="text-slate-500 dark:text-slate-400">{t("opt_scoreboard_baseline_lbl")}: </span>
                {moneyOrZero(arrBefore, currency)}
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">{t("opt_scoreboard_adjusted_lbl")}: </span>
                <span className="mm-opt-score-adjusted font-semibold">{moneyOrZero(arrAfter, currency)}</span>
              </div>
              <div className="pt-0.5">
                <span className="text-slate-500 dark:text-slate-400">{t("opt_scoreboard_pct_delta_lbl")}: </span>
                <span className={`font-semibold tabular-nums ${pctDeltaTone(arrPctStr)}`}>{arrPctStr}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Impact tree */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          {t("opt_impact_title")}
        </div>
        {optimismFocus ? (
          <p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">{t("opt_impact_stress", { metric: optimismFocus })}</p>
        ) : null}
        {optimismAffected.length === 0 ? (
          <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">{t("opt_impact_empty")}</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-[11px] text-slate-700 dark:text-slate-200">
            {optimismAffected.map((a) => (
              <li key={a.nodeId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0 leading-snug">
                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">{a.nodeId}:</span>
                <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-100">{a.label}</span>
                <span
                  className={[
                    "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide",
                    showSimulatedBadge
                      ? "bg-cyan-500/15 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300"
                      : "bg-slate-500/10 text-slate-600 dark:bg-slate-400/15 dark:text-slate-400"
                  ].join(" ")}
                >
                  {showSimulatedBadge ? t("opt_badge_simulated") : t("opt_badge_review")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        className="w-full ios-button-primary py-2.5 text-[11px]"
        disabled={simBusy || !optimismFocus || optimismMetricsAvailable.length === 0}
        onClick={() => void onApplyOptimism()}
      >
        {simBusy ? t("footer_applying") : t("opt_apply")}
      </button>
    </div>
  );
}

export default memo(AssistantOptimismTabInner);
