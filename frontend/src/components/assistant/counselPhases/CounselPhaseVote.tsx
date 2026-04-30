import CounselConsensusMatrix from "../CounselConsensusMatrix";
import { useI18n } from "../../../i18n/useI18n";
import type { AreaLeaderboardRow } from "../counselVoteConsensus";

export type CounselPhaseVoteProps = {
  voteOptionAreas: { area_id: string; options: { id: string; label: string }[] }[];
  collisionAreas: { id: string; title: string }[];
  rawVotes: unknown[] | null;
  busy: boolean;
  voteLeaderboards: AreaLeaderboardRow[];
  onLoadVoteOptions: () => void;
  onRunRankVotes: () => void;
  onFinalize: () => void;
};

export default function CounselPhaseVote(props: CounselPhaseVoteProps) {
  const { t } = useI18n();
  const {
    voteOptionAreas,
    collisionAreas,
    rawVotes,
    busy,
    voteLeaderboards,
    onLoadVoteOptions,
    onRunRankVotes,
    onFinalize
  } = props;

  return (
    <div className="space-y-3">
      {voteOptionAreas.length === 0 ? (
        <div className="space-y-2 rounded-2xl border border-white/25 bg-white/35 p-4 backdrop-blur-[16px] dark:border-white/10 dark:bg-slate-900/35">
          {busy ? (
            <p className="text-[10px] text-slate-600 dark:text-slate-400">{t("counsel_vote_generating")}</p>
          ) : (
            <button type="button" className="ios-button-primary w-full py-2" disabled={busy} onClick={() => void onLoadVoteOptions()}>
              {t("counsel_regen_options")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {t("counsel_consensus_heading")}
          </div>
          {!rawVotes?.length ? (
            <div className="flex flex-col gap-3">
              {voteOptionAreas.map((a) => {
                const areaHead = collisionAreas.find((c) => c.id === a.area_id)?.title || a.area_id;
                return (
                  <div
                    key={a.area_id}
                    className="rounded-2xl border border-white/30 bg-white/40 p-3 backdrop-blur-[16px] dark:border-white/10 dark:bg-slate-900/40"
                  >
                    <div className="font-mono text-[8px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {areaHead}
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {a.options.map((o, idx) => (
                        <li
                          key={o.id}
                          className={[
                            "text-[11px] leading-snug",
                            idx === 0
                              ? "font-medium text-cyan-700 dark:text-cyan-300"
                              : "text-slate-600/75 dark:text-slate-400/75"
                          ].join(" ")}
                        >
                          <span className="font-mono tabular-nums text-[9px] text-slate-400">{idx + 1}.</span> {o.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <button type="button" className="ios-button w-full py-1.5 text-[9px]" disabled={busy} onClick={() => void onLoadVoteOptions()}>
                {t("counsel_regen_options")}
              </button>
              <button
                type="button"
                className="ios-button-primary w-full py-2.5 text-[11px]"
                disabled={busy}
                onClick={() => void onRunRankVotes()}
              >
                {t("counsel_simulate_votes")}
              </button>
            </div>
          ) : (
            <>
              <CounselConsensusMatrix
                leaderboards={voteLeaderboards}
                rationaleHoverHint={t("counsel_vote_rationale_hint")}
                emptyLabel={t("counsel_vote_results_empty")}
              />
              <button
                type="button"
                className="ios-button-primary w-full py-2.5 text-[11px]"
                disabled={busy}
                onClick={() => void onFinalize()}
              >
                {t("counsel_finalize")}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
