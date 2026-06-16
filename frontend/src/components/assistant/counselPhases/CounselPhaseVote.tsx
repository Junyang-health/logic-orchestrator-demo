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
          <div className="rounded-2xl border border-slate-200/55 bg-white/40 p-3 dark:border-slate-600/45 dark:bg-slate-900/28">
            <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Decision options
            </div>
            <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
              Each area should resolve into a small number of concrete directions. Review the options before simulating votes.
            </div>
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
                    <ul className="mt-2 space-y-2">
                      {a.options.map((o, idx) => (
                        <li
                          key={o.id}
                          className={[
                            "rounded-xl px-2 py-2 text-[11px] leading-snug",
                            idx === 0
                              ? "bg-cyan-50/55 font-medium text-cyan-700 dark:bg-cyan-950/20 dark:text-cyan-300"
                              : "bg-slate-100/60 text-slate-600/75 dark:bg-slate-800/60 dark:text-slate-400/75"
                          ].join(" ")}
                        >
                          <div>
                            <span className="font-mono tabular-nums text-[9px] text-slate-400">{idx + 1}.</span> {o.label}
                          </div>
                          <div className="mt-1 text-[9px] opacity-75">
                            {idx === 0 ? "Leading path" : "Alternative path"}
                          </div>
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
              <div className="grid gap-3 md:grid-cols-2">
                {voteLeaderboards.map((row) => (
                  <div key={row.areaId} className="rounded-2xl border border-slate-200/55 bg-white/45 p-3 dark:border-slate-600/45 dark:bg-slate-900/35">
                    <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      {row.areaTitle}
                    </div>
                    <div className="mt-2 text-[13px] font-semibold text-cyan-700 dark:text-cyan-300">{row.winner.label}</div>
                    <div className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">
                      Winner margin: {row.winnerCount} to {row.runnerUpCount}
                    </div>
                    {row.runnerUp.label && row.runnerUp.label !== "—" ? (
                      <div className="mt-2 rounded-xl bg-amber-50/70 px-2.5 py-2 text-[10px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                        Minority objection: {row.runnerUp.label}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {t("counsel_consensus_heading")}
              </div>
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
