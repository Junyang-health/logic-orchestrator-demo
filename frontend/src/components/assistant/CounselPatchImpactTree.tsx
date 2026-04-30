import type { ReactNode } from "react";
import { useI18n } from "../../i18n/useI18n";
import { patchImpactTotalCount, summarizePatchImpact, type PatchImpactSummary } from "./counselPatchImpact";

function ImpactBranch({
  title,
  count,
  barClass,
  titleClass,
  children
}: {
  title: string;
  count: number;
  barClass: string;
  titleClass: string;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="relative pl-4">
      <span className={`absolute left-0 top-2 h-[calc(100%-6px)] w-px ${barClass}`} aria-hidden />
      <div className={`font-mono text-[8px] font-bold uppercase tracking-wider ${titleClass}`}>
        {title}{" "}
        <span className="tabular-nums opacity-80">({count})</span>
      </div>
      <div className="mt-1.5 space-y-1 border-l border-slate-200/60 pl-3 dark:border-slate-600/50">{children}</div>
    </div>
  );
}

function ImpactRow({ id, label, sub }: { id: string; label?: string; sub?: string }) {
  return (
    <div className="relative flex flex-col gap-0.5 text-[10px] leading-snug">
      <div className="font-mono text-[9px] text-slate-600 dark:text-slate-400">
        <span className="text-slate-400 dark:text-slate-500">{id}</span>
        {label ? <span className="ml-1.5 font-sans font-medium text-slate-800 dark:text-slate-100">{label}</span> : null}
      </div>
      {sub ? <div className="text-[8px] text-slate-500 dark:text-slate-500">{sub}</div> : null}
    </div>
  );
}

export default function CounselPatchImpactTree(props: { patch: Record<string, unknown> }) {
  const { t } = useI18n();
  const summary: PatchImpactSummary = summarizePatchImpact(props.patch);
  const total = patchImpactTotalCount(summary);

  if (total === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200/80 bg-white/20 px-3 py-2.5 text-center text-[10px] text-slate-500 dark:border-slate-600/60 dark:bg-slate-900/25 dark:text-slate-400">
        {t("counsel_impact_empty")}
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-white/45 via-emerald-50/15 to-transparent p-4 shadow-inner backdrop-blur-[12px] dark:border-emerald-500/12 dark:from-slate-900/40 dark:via-emerald-950/15 dark:to-transparent">
      <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-emerald-800/90 dark:text-emerald-300/90">
        {t("counsel_impact_title")}
      </div>
      <div className="mm-assistant-thin-scrollbar mt-3 max-h-[min(48vh,22rem)] space-y-4 overflow-y-auto pr-1">
        <ImpactBranch
          title={t("counsel_impact_add")}
          count={summary.adds.length}
          barClass="bg-emerald-500/50"
          titleClass="text-emerald-800 dark:text-emerald-300/95"
        >
          {summary.adds.map((a) => (
            <ImpactRow key={`a-${a.id}`} id={a.id} label={a.label} sub={a.type ? `${t("counsel_impact_type")}: ${a.type}` : undefined} />
          ))}
        </ImpactBranch>
        <ImpactBranch
          title={t("counsel_impact_update")}
          count={summary.updates.length}
          barClass="bg-amber-500/50"
          titleClass="text-amber-900/95 dark:text-amber-200/95"
        >
          {summary.updates.map((u) => (
            <ImpactRow key={`u-${u.id}`} id={u.id} label={u.label} sub={u.type ? `${t("counsel_impact_type")}: ${u.type}` : undefined} />
          ))}
        </ImpactBranch>
        <ImpactBranch
          title={t("counsel_impact_remove")}
          count={summary.removes.length}
          barClass="bg-rose-500/45"
          titleClass="text-rose-900/95 dark:text-rose-200/95"
        >
          {summary.removes.map((id) => (
            <ImpactRow key={`r-${id}`} id={id} />
          ))}
        </ImpactBranch>
        <ImpactBranch
          title={t("counsel_impact_edges")}
          count={summary.edges.length}
          barClass="bg-sky-500/45"
          titleClass="text-sky-900/95 dark:text-sky-200/95"
        >
          {summary.edges.map((e, i) => (
            <div key={`e-${e.source}-${e.target}-${i}`} className="font-mono text-[9px] text-slate-700 dark:text-slate-300">
              <span className="text-slate-500 dark:text-slate-500">{e.source}</span>
              <span className="mx-1 text-sky-600 dark:text-sky-400">→</span>
              <span className="text-slate-500 dark:text-slate-500">{e.target}</span>
              {e.label ? <span className="ml-1.5 font-sans text-[8px] text-slate-600 dark:text-slate-400">({e.label})</span> : null}
            </div>
          ))}
        </ImpactBranch>
      </div>
    </div>
  );
}
