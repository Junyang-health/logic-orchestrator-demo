import { memo } from "react";
import {
  formatMoneyShort,
  snapDeltaPct,
  type BranchFinancialExtract,
  type OptimismMetric,
  type AffectedNodeHint
} from "../../../lib/optimismMeter";

type OptimismPreview = {
  before: Record<OptimismMetric, number | null>;
  after: Record<OptimismMetric, number | null>;
  pctLabel: Record<OptimismMetric, string | null>;
};

export type AssistantOptimismTabProps = {
  branchFinancial: BranchFinancialExtract | null;
  optimismMetricsAvailable: OptimismMetric[];
  optimismFocus: OptimismMetric | null;
  setOptimismFocus: (m: OptimismMetric) => void;
  currency: string;
  setCurrency: (v: string) => void;
  optimismDeltaPct: number;
  setOptimismDeltaPct: React.Dispatch<React.SetStateAction<number>>;
  optimismPreview: OptimismPreview | null;
  optimismAffected: AffectedNodeHint[];
  simBusy: boolean;
  onApplyOptimism: () => void;
};

function AssistantOptimismTabInner(props: AssistantOptimismTabProps) {
  const {
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
    onApplyOptimism
  } = props;

  return (
    <div className="mb-3 ios-card p-3">
      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">Optimism meter</div>
      <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
        Select a branch node whose subtree includes <span className="font-medium">TAM</span>,{" "}
        <span className="font-medium">SOM</span> (or SAM), or <span className="font-medium">ARR</span> in{" "}
        <span className="font-medium">critical values</span>. Baseline numbers load from that branch; adjust −100% to +100%
        in 10% steps, review recomputed figures and impacted nodes, then apply.
      </p>
      {optimismMetricsAvailable.length === 0 ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-[10px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          No TAM / SOM / ARR figures detected in this branch. Add them as{" "}
          <code className="font-mono">critical_values</code> on a node, or put a keyword + amount in a node label (e.g.{" "}
          <span className="italic">市场规模 50亿美元</span>, <span className="italic">TAM: $1.2B</span>,{" "}
          <span className="italic">ARR 8000万</span>) under the selected root, then switch away and back to Optimism.
        </p>
      ) : (
        <>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Branch baseline (ground zero)
          </div>
          <ul className="mt-1 space-y-0.5 text-[10px] text-slate-700 dark:text-slate-200">
            {(["TAM", "SOM", "ARR"] as const).map((k) => {
              const v = branchFinancial?.[k === "TAM" ? "tam" : k === "SOM" ? "som" : "arr"];
              const sid = branchFinancial?.sourceNodeId[k];
              if (v == null) return null;
              return (
                <li key={k}>
                  <span className="font-mono">{k}</span>: {formatMoneyShort(v, currency)}
                  {sid ? <span className="text-slate-500 dark:text-slate-400"> · node {sid}</span> : null}
                </li>
              );
            })}
          </ul>
          {(branchFinancial?.targetSegmentPct != null ||
            branchFinancial?.arpaYear != null ||
            branchFinancial?.customersTotal != null ||
            branchFinancial?.penetrationPct != null) && (
            <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
              Drivers detected:{" "}
              {[
                branchFinancial?.targetSegmentPct != null ? `segment ${branchFinancial.targetSegmentPct}%` : null,
                branchFinancial?.penetrationPct != null ? `penetration ${branchFinancial.penetrationPct}%` : null,
                branchFinancial?.customersTotal != null ? `customers ${branchFinancial.customersTotal}` : null,
                branchFinancial?.arpaYear != null ? `ARPA ${formatMoneyShort(branchFinancial.arpaYear, currency)}` : null
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <label className="mt-2 block text-[11px] text-slate-700 dark:text-slate-200">
            Currency (display)
            <input className="mt-1 ios-input py-1.5" value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </label>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Stress metric
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {(["TAM", "SOM", "ARR"] as const).map((k) => {
              const on = optimismMetricsAvailable.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!on}
                  className={[
                    "rounded-full px-2.5 py-0.5 text-[10px] font-medium",
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
          <label className="mt-2 block text-[11px] text-slate-700 dark:text-slate-200">
            Optimism vs baseline: <span className="font-mono">{snapDeltaPct(optimismDeltaPct)}%</span>
            <input
              type="range"
              min={-100}
              max={100}
              step={10}
              value={snapDeltaPct(optimismDeltaPct)}
              onChange={(e) => setOptimismDeltaPct(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </label>
          <div className="mt-1 flex flex-wrap gap-1">
            {[-40, -20, -10, 10, 20, 40].map((step) => (
              <button
                key={step}
                type="button"
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setOptimismDeltaPct((d) => snapDeltaPct(d + step))}
              >
                {step > 0 ? `+${step}%` : `${step}%`}
              </button>
            ))}
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => setOptimismDeltaPct(0)}
            >
              Reset 0%
            </button>
          </div>
          {optimismPreview ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white/90 p-2 dark:border-slate-600 dark:bg-slate-950/80">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Recomputed (vs baseline)
              </div>
              <table className="mt-1 w-full border-collapse text-[10px]">
                <thead>
                  <tr className="text-left text-slate-500 dark:text-slate-400">
                    <th className="py-0.5 pr-2">Metric</th>
                    <th className="py-0.5 pr-2">Before</th>
                    <th className="py-0.5 pr-2">After</th>
                    <th className="py-0.5">Δ%</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800 dark:text-slate-100">
                  {(["TAM", "SOM", "ARR"] as const).map((k) => (
                    <tr key={k}>
                      <td className="py-0.5 pr-2 font-mono">{k}</td>
                      <td className="py-0.5 pr-2">
                        {optimismPreview.before[k] != null ? formatMoneyShort(optimismPreview.before[k]!, currency) : "—"}
                      </td>
                      <td className="py-0.5 pr-2">
                        {optimismPreview.after[k] != null ? formatMoneyShort(optimismPreview.after[k]!, currency) : "—"}
                      </td>
                      <td className="py-0.5 font-mono text-sky-700 dark:text-sky-300">{optimismPreview.pctLabel[k] ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {optimismAffected.length > 0 ? (
            <div className="mt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Branch nodes to review ({optimismAffected.length})
              </div>
              <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto text-[9px] text-slate-600 dark:text-slate-300">
                {optimismAffected.map((a) => (
                  <li
                    key={a.nodeId}
                    className="rounded border border-slate-100 bg-slate-50/80 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900/60"
                  >
                    <span className="font-mono text-slate-500">{a.nodeId}</span> — {a.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-[9px] text-slate-500 dark:text-slate-400">
              No other branch nodes auto-flagged; downstream metrics still update in the table above.
            </p>
          )}
          <button
            type="button"
            className="mt-3 w-full ios-button-primary"
            disabled={simBusy || !optimismFocus || optimismMetricsAvailable.length === 0}
            onClick={() => void onApplyOptimism()}
          >
            {simBusy ? "Applying…" : "Apply optimism to mindmap"}
          </button>
        </>
      )}
    </div>
  );
}

export default memo(AssistantOptimismTabInner);
