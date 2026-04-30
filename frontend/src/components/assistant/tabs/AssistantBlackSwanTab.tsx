import { memo, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";
import {
  bsMitKey,
  type BlackSwanGap,
  type BlackSwanRunBundle,
  type BlackSwanScenario,
  type BlackSwanResultBlock
} from "../assistantTypes";

export type AssistantBlackSwanTabProps = {
  selectedNodeId: string | undefined;
  /** Canvas node label (or id) for target / radar UX */
  anchorLabel: string;
  simBusy: boolean;
  bsScenarios: BlackSwanScenario[] | null;
  bsSelectedScenarioIds: Set<string>;
  onToggleScenario: (scenarioId: string) => void;
  bsRunBundle: BlackSwanRunBundle | null;
  bsMitigationPick: Set<string>;
  onToggleMitigation: (key: string) => void;
  onScan: () => void;
  onRun: () => void;
  onApply: () => void;
  onBackFromResults: () => void;
};

function scenarioBackdropGlyph(s: BlackSwanScenario): string {
  const blob = `${s.mece_axis} ${s.title} ${s.summary}`.toLowerCase();
  if (/regul|policy|legal|law|compliance|politic|government|legislat|geopolit/.test(blob)) return "⚖️";
  if (/tech|technology|digital|ai|\bml\b|cyber|platform|software|system|solar flare|infrastructure/.test(blob))
    return "⚡";
  return "🦢";
}

function severityBadgeClass(sev: string | undefined): string {
  const u = (sev || "medium").toLowerCase();
  if (u === "high")
    return "bg-red-500/20 font-mono text-[9px] font-semibold uppercase text-red-800 dark:text-red-300";
  if (u === "low")
    return "bg-emerald-500/15 font-mono text-[9px] font-semibold uppercase text-emerald-800 dark:text-emerald-300";
  return "bg-amber-500/20 font-mono text-[9px] font-semibold uppercase text-amber-900 dark:text-amber-200";
}

/** Pull headline metric fragments from executive summary for the briefing strip. */
function extractImpactChips(summary: string): { text: string; negative: boolean }[] {
  const s = summary || "";
  const out: { text: string; negative: boolean }[] = [];
  const seen = new Set<string>();
  const push = (text: string, negative: boolean) => {
    const k = text.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(k) || out.length >= 8) return;
    seen.add(k);
    out.push({ text, negative });
  };

  const pctRe = /\b(TAM|SOM|SAM|ARR|NRR)\b\s*[:,：]?\s*([-+−]?\d+(?:\.\d+)?\s*%)/gi;
  let m: RegExpExecArray | null;
  while ((m = pctRe.exec(s)) !== null) {
    const pct = m[2].replace(/\s/g, "").replace("−", "-");
    const n = parseFloat(pct);
    const neg = Number.isFinite(n) ? n < 0 : /decline|drop|down|loss|contraction|negative/i.test(s.slice(Math.max(0, m.index - 48), m.index + 24));
    push(`${m[1]}: ${pct}`, neg);
  }

  const moneyRe = /\b(ARR|TAM|SOM|Revenue|revenue)\b\s*[:,：]?\s*([-−]?\$[\d.,]+\s*[KMBkmb]?)/gi;
  while ((m = moneyRe.exec(s)) !== null) {
    const val = m[2].replace(/\s/g, "").replace("−", "-");
    push(`${m[1]}: ${val}`, /^[-−]/.test(val));
  }

  const orphanMoney = s.match(/(?:^|[\s|])([-−]?\$[\d.,]+\s*[KMBkmb](?:\s*USD)?)/i);
  if (orphanMoney && out.length < 8) {
    const val = orphanMoney[1].replace("−", "-");
    push(val.trim(), /^[-−]/.test(val));
  }

  return out;
}

const glassCard =
  "rounded-2xl border border-white/45 bg-white/35 shadow-sm backdrop-blur-[20px] dark:border-white/10 dark:bg-slate-950/40 dark:shadow-black/20";

function AssistantBlackSwanTabInner(props: AssistantBlackSwanTabProps) {
  const {
    selectedNodeId,
    anchorLabel,
    simBusy,
    bsScenarios,
    bsSelectedScenarioIds,
    onToggleScenario,
    bsRunBundle,
    bsMitigationPick,
    onToggleMitigation,
    onScan,
    onRun,
    onApply,
    onBackFromResults
  } = props;

  const { t } = useI18n();

  const stage2 = Boolean(bsRunBundle && bsRunBundle.results.length > 0);
  const showRadar = simBusy && !stage2;

  const targetDisplay = anchorLabel.trim() || selectedNodeId || "—";

  const impactChips = useMemo(
    () => extractImpactChips(bsRunBundle?.executive_summary || ""),
    [bsRunBundle?.executive_summary]
  );

  const summaryNarrative = (bsRunBundle?.executive_summary || "").trim();

  return (
    <div className="mb-3 space-y-4">
      {!stage2 ? (
        <>
          <header className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">
              {t("bs_stage_header_scan")}
            </div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{t("bs_title")}</div>
            <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">{t("bs_intro_short")}</p>
          </header>

          {!selectedNodeId ? (
            <p className="text-[10px] text-amber-700 dark:text-amber-300">{t("bs_select")}</p>
          ) : (
            <div
              className={[
                "relative rounded-xl border border-slate-200/80 bg-white/40 px-3 py-2.5 dark:border-slate-600/50 dark:bg-slate-900/40",
                showRadar ? "bs-target-radar" : ""
              ].join(" ")}
            >
              {showRadar ? (
                <>
                  <span className="bs-target-radar__ring" aria-hidden />
                  <span className="bs-target-radar__ring bs-target-radar__ring--delayed" aria-hidden />
                </>
              ) : null}
              <div className="bs-target-radar__label text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("bs_target_node")}
              </div>
              <div className="mt-0.5 truncate font-mono text-[11px] font-medium text-slate-900 dark:text-slate-100" title={targetDisplay}>
                {targetDisplay}
              </div>
            </div>
          )}

          <button
            type="button"
            className="w-full rounded-xl border border-sky-400/50 bg-sky-500/15 py-2.5 text-[11px] font-semibold text-sky-900 backdrop-blur-md transition hover:bg-sky-500/25 disabled:opacity-45 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-100 dark:hover:bg-sky-500/20"
            disabled={simBusy || !selectedNodeId}
            onClick={() => void onScan()}
          >
            {simBusy ? t("bs_busy") : t("bs_scan_cta")}
          </button>

          {bsScenarios && bsScenarios.length > 0 ? (
            <div className="space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {t("bs_pick")}
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {bsScenarios.map((s) => {
                  const selected = bsSelectedScenarioIds.has(s.id);
                  const glyph = scenarioBackdropGlyph(s);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onToggleScenario(s.id)}
                      className={[
                        glassCard,
                        "relative overflow-hidden px-3 py-3 text-left transition",
                        "hover:bg-white/45 dark:hover:bg-slate-950/55",
                        selected
                          ? "ring-2 ring-cyan-400/95 ring-offset-2 ring-offset-white dark:ring-cyan-400/90 dark:ring-offset-slate-950 shadow-[0_10px_40px_-12px_rgba(30,64,175,0.55)] dark:shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_12px_40px_-8px_rgba(34,211,238,0.2)]"
                          : "ring-1 ring-transparent"
                      ].join(" ")}
                    >
                      <span
                        className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl leading-none opacity-[0.08] select-none"
                        aria-hidden
                      >
                        {glyph}
                      </span>
                      <div className="relative z-[1]">
                        <span className="inline-flex rounded-md border border-slate-200/80 bg-white/50 px-1.5 py-0.5 font-mono text-[9px] font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                          {s.mece_axis}
                        </span>
                        <div className="mt-1.5 text-[11px] font-semibold leading-snug text-slate-900 dark:text-slate-50">{s.title}</div>
                        <p className="mt-1 line-clamp-4 text-[10px] leading-snug text-slate-600 dark:text-slate-300">{s.summary}</p>
                        {s.why_relevant ? (
                          <p className="mt-1 line-clamp-2 text-[9px] text-slate-500 dark:text-slate-400">{s.why_relevant}</p>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="w-full rounded-xl border border-slate-300/80 bg-slate-900/5 py-2.5 text-[11px] font-semibold text-slate-800 backdrop-blur-md transition hover:bg-slate-900/10 disabled:opacity-45 dark:border-slate-600 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
                disabled={simBusy || bsSelectedScenarioIds.size < 1}
                onClick={() => void onRun()}
              >
                {simBusy && bsScenarios ? t("bs_run_busy") : t("bs_run_cta")}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {stage2 && bsRunBundle ? (
        <div className="space-y-4">
          <button
            type="button"
            className="flex items-center gap-1.5 text-[10px] font-medium text-sky-700 transition hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300"
            onClick={onBackFromResults}
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("bs_back_scenarios")}
          </button>

          <section className={[glassCard, "flex flex-col gap-3 p-3 sm:flex-row sm:items-stretch"].join(" ")}>
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {t("bs_bottom_line")}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-800 dark:text-slate-100">
                {summaryNarrative || "—"}
              </p>
            </div>
            <div className="shrink-0 sm:w-[min(100%,14rem)] sm:border-l sm:border-slate-200/80 sm:pl-3 dark:sm:border-slate-600/60">
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {t("bs_impact_metrics")}
              </div>
              {impactChips.length > 0 ? (
                <ul className="mt-2 space-y-1 font-mono text-[11px] font-bold leading-snug">
                  {impactChips.map((c, i) => (
                    <li
                      key={i}
                      className={
                        c.negative ? "text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-slate-100"
                      }
                    >
                      {c.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500">—</p>
              )}
            </div>
          </section>

          {bsRunBundle.results.map((block: BlackSwanResultBlock) => {
            const scen = bsScenarios?.find((x) => x.id === block.scenario_id);
            return (
              <article key={block.scenario_id} className="space-y-3">
                <h3 className="border-b border-slate-200/80 pb-1 text-[11px] font-semibold text-slate-800 dark:border-slate-600/50 dark:text-slate-100">
                  {scen?.title || block.scenario_id}
                </h3>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className={[glassCard, "p-3"].join(" ")}>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      {t("bs_audit_impacts")}
                    </div>
                    <ul className="mt-2 space-y-2 text-[10px] leading-snug text-slate-700 dark:text-slate-200">
                      {block.potential_impacts.map((line, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="shrink-0 text-[11px]" aria-hidden>
                            ⚠️
                          </span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={[glassCard, "p-3"].join(" ")}>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      {t("bs_audit_gaps")}
                    </div>
                    <ul className="mt-2 space-y-2 text-[10px] leading-snug text-slate-700 dark:text-slate-200">
                      {(block.gaps_to_address as BlackSwanGap[]).map((g) => (
                        <li key={g.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{g.id}</span>
                          <span className={severityBadgeClass(g.severity)}>({g.severity || "medium"})</span>
                          <span className="min-w-0 flex-1">{g.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    {t("bs_mitigations")}
                  </div>
                  <div className="space-y-2">
                    {block.mitigations.map((m) => {
                      const k = bsMitKey(block.scenario_id, m.id);
                      const checked = bsMitigationPick.has(k);
                      const refLine =
                        m.addresses_gaps && m.addresses_gaps.length > 0
                          ? t("bs_mit_ref_line", { gaps: m.addresses_gaps.join(", ") })
                          : "";
                      const inputId = `bs-mit-${block.scenario_id}-${m.id}`;
                      return (
                        <label
                          key={m.id}
                          htmlFor={inputId}
                          className={[
                            glassCard,
                            "flex cursor-pointer gap-3 px-3 py-2.5 transition",
                            checked
                              ? "border-cyan-400/50 bg-cyan-500/15 ring-2 ring-cyan-400/60 dark:border-cyan-500/40 dark:bg-cyan-500/10"
                              : "hover:bg-white/40 dark:hover:bg-slate-900/55"
                          ].join(" ")}
                        >
                          <input
                            id={inputId}
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 dark:border-slate-500"
                            checked={checked}
                            onChange={() => onToggleMitigation(k)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11px] font-semibold text-slate-900 dark:text-slate-50">{m.title}</span>
                            {refLine ? (
                              <span className="mt-0.5 block text-[9px] text-slate-500 dark:text-slate-500">{refLine}</span>
                            ) : null}
                            <span className="mt-1 block text-[10px] leading-snug text-slate-600 dark:text-slate-300">
                              {m.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })}

          <button
            type="button"
            className="w-full rounded-xl border border-sky-500/40 bg-sky-500 py-2.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-sky-600 disabled:opacity-45 dark:bg-sky-600 dark:hover:bg-sky-500"
            disabled={simBusy || bsMitigationPick.size < 1}
            onClick={() => void onApply()}
          >
            {simBusy ? t("footer_applying") : t("bs_apply")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default memo(AssistantBlackSwanTabInner);
