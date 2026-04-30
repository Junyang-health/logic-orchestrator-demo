import { areaTitleToDimTag, type AreaLeaderboardRow } from "../counselVoteConsensus";
import CounselPatchImpactTree from "../CounselPatchImpactTree";
import { useI18n } from "../../../i18n/useI18n";

export type CounselPhaseFinalizeProps = {
  finalizeResult: {
    recommendation: string;
    patch: Record<string, unknown>;
  };
  voteLeaderboards: AreaLeaderboardRow[];
  strategicPatchTouches: number;
  projectId: string;
  busy: boolean;
  onApplyAll: () => void;
};

export default function CounselPhaseFinalize(props: CounselPhaseFinalizeProps) {
  const { t } = useI18n();
  const {
    finalizeResult,
    voteLeaderboards,
    strategicPatchTouches,
    projectId,
    busy,
    onApplyAll
  } = props;

  return (
    <div className="space-y-4">
      <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {t("counsel_master_strategy")}
      </div>
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-white/50 via-cyan-50/20 to-transparent p-4 backdrop-blur-[18px] dark:border-cyan-500/15 dark:from-slate-900/50 dark:via-cyan-950/20 dark:to-transparent">
        <div className="relative space-y-3 pl-4 before:absolute before:left-1.5 before:top-1 before:h-[calc(100%-4px)] before:w-px before:bg-cyan-400/35 dark:before:bg-cyan-500/30">
          {voteLeaderboards.length > 0 ? (
            voteLeaderboards.map((row) => (
              <div key={row.areaId} className="relative">
                <span className="absolute -left-[15px] top-1.5 h-2 w-2 rounded-full bg-cyan-500/70 dark:bg-cyan-400/65" />
                <div className="font-mono text-[10px] font-bold leading-relaxed tracking-tight text-slate-900 dark:text-slate-100">
                  {areaTitleToDimTag(row.areaTitle)}:{" "}
                  <span className="text-cyan-700 dark:text-cyan-300">[{row.winner.label}]</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{t("counsel_strategy_fallback")}</p>
          )}
        </div>
      </div>
      <details className="rounded-xl border border-slate-200/60 bg-white/30 dark:border-slate-600/50 dark:bg-slate-900/30">
        <summary className="cursor-pointer px-3 py-2 font-mono text-[8px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t("counsel_recommendation_detail")}
        </summary>
        <div className="border-t border-slate-200/50 px-3 py-2 dark:border-slate-700/50">
          <p className="whitespace-pre-wrap text-[10px] leading-relaxed text-slate-700 dark:text-slate-200">
            {finalizeResult.recommendation}
          </p>
        </div>
      </details>
      <CounselPatchImpactTree patch={finalizeResult.patch} />
      <button
        type="button"
        className="ios-button-primary w-full py-2.5 text-[11px] font-semibold"
        disabled={busy || !projectId}
        onClick={() => void onApplyAll()}
      >
        {strategicPatchTouches > 0
          ? t("counsel_apply_strategic_patch", { n: strategicPatchTouches })
          : t("counsel_apply_and_minutes")}
      </button>
    </div>
  );
}
