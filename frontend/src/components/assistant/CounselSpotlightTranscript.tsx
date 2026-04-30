import { useEffect, useRef } from "react";
import { counselInitials } from "./counselHudUtils";

export type TranscriptLine = { speaker: string; content: string };

export default function CounselSpotlightTranscript(props: {
  lines: TranscriptLine[];
  className?: string;
}) {
  const { lines, className = "" } = props;
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [lines.length, lines]);

  if (!lines.length) {
    return (
      <p className="px-2 py-6 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
        —
      </p>
    );
  }

  return (
    <div
      className={[
        "mm-assistant-thin-scrollbar flex min-h-0 flex-col gap-0 overflow-y-auto px-1 py-2 sm:px-2",
        className
      ].join(" ")}
    >
      {lines.map((row, i) => {
        const isActive = i === lines.length - 1;
        const monoName = row.speaker.trim().toUpperCase();
        const initials = counselInitials(row.speaker);

        return (
          <div
            key={`${i}-${row.speaker}-${row.content.slice(0, 24)}`}
            className="flex gap-2 border-b border-slate-200/40 py-2.5 last:border-b-0 dark:border-white/10"
          >
            <div className="flex w-[3.25rem] shrink-0 flex-col items-center gap-0.5 pt-0.5 sm:w-[3.75rem]">
              <div className="flex h-8 w-8 items-center justify-center rounded-[28%] border border-slate-200/70 bg-slate-100/90 text-[9px] font-bold text-slate-700 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200">
                {initials}
              </div>
              <div
                className={[
                  "w-full break-words text-center font-mono text-[7px] font-semibold leading-tight tracking-tight sm:text-[8px]",
                  isActive
                    ? "text-slate-800 dark:text-slate-100"
                    : "text-slate-500/45 dark:text-slate-500/40"
                ].join(" ")}
              >
                {monoName}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={[
                  "whitespace-pre-wrap leading-relaxed transition-[opacity,font-size,color] duration-300",
                  isActive
                    ? "mm-counsel-spotlight-line-in text-[13px] font-medium text-slate-950 dark:text-white sm:text-[14px]"
                    : "text-[11px] text-slate-500/40 dark:text-slate-400/40"
                ].join(" ")}
              >
                {row.content}
              </p>
            </div>
          </div>
        );
      })}
      <div ref={endRef} className="h-px shrink-0" />
    </div>
  );
}
