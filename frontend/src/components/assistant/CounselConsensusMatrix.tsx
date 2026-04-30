import { useCallback, useEffect, useRef, useState } from "react";
import type { AreaLeaderboardRow, VoteFootprint } from "./counselVoteConsensus";

function VoteFootprintBubble(props: {
  bubble: VoteFootprint;
  rationaleHint: string;
}) {
  const { bubble, rationaleHint } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hasReason = bubble.rationale.trim().length > 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = useCallback(() => {
    if (hasReason) setOpen((o) => !o);
  }, [hasReason]);

  return (
    <div ref={rootRef} className="relative inline-flex align-middle">
      <button
        type="button"
        title={hasReason ? rationaleHint : bubble.voter}
        aria-expanded={open}
        aria-label={bubble.voter}
        className={[
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-400/55 bg-gradient-to-br from-slate-100/95 to-slate-50/90 text-[7px] font-bold text-slate-800 shadow-sm transition hover:brightness-105 dark:border-slate-500/65 dark:from-slate-800/90 dark:to-slate-900/85 dark:text-slate-100",
          hasReason ? "cursor-pointer ring-1 ring-cyan-500/25 dark:ring-cyan-400/20" : "cursor-default opacity-80"
        ].join(" ")}
        onClick={toggle}
      >
        {bubble.initials}
      </button>
      {open && hasReason ? (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 z-[60] mb-1.5 w-[min(14rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-200/90 bg-white/95 px-2.5 py-2 shadow-xl dark:border-slate-600 dark:bg-slate-900/95"
        >
          <div className="font-mono text-[8px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
            {bubble.voter}
          </div>
          <p className="mt-1 text-[9px] leading-snug text-slate-700 dark:text-slate-200">{bubble.rationale}</p>
        </div>
      ) : null}
    </div>
  );
}

export default function CounselConsensusMatrix(props: {
  leaderboards: AreaLeaderboardRow[];
  rationaleHoverHint: string;
  emptyLabel: string;
}) {
  const { leaderboards, rationaleHoverHint, emptyLabel } = props;

  if (!leaderboards.length) {
    return <p className="py-4 text-center text-[10px] text-slate-500 dark:text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {leaderboards.map((area) => (
        <div
          key={area.areaId}
          className="rounded-2xl border border-white/35 bg-white/45 p-3 shadow-[0_8px_32px_-8px_rgba(15,23,42,0.12)] backdrop-blur-[18px] dark:border-white/10 dark:bg-slate-900/40 dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.35)]"
        >
          <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            {area.areaTitle}
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <div className="text-[8px] font-mono uppercase tracking-wider text-cyan-600/90 dark:text-cyan-400/90">1</div>
              <div className="text-[13px] font-semibold leading-snug text-cyan-600 dark:text-cyan-300">
                {area.winner.label}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {area.winner.bubbles.map((b, i) => (
                  <VoteFootprintBubble key={`${b.voter}-${i}`} bubble={b} rationaleHint={rationaleHoverHint} />
                ))}
              </div>
            </div>
            <div className="space-y-2 border-t border-slate-200/50 pt-3 opacity-70 dark:border-slate-600/40 dark:opacity-65">
              <div>
                <div className="text-[8px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-500">2</div>
                <div className="text-[11px] font-medium leading-snug text-slate-600 dark:text-slate-400">
                  {area.runnerUp.label}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {area.runnerUp.bubbles.map((b, i) => (
                    <VoteFootprintBubble key={`${b.voter}-r-${i}`} bubble={b} rationaleHint={rationaleHoverHint} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
