import { FastForward, Pause, Play } from "lucide-react";

export default function CounselModeratorBar(props: {
  /** Left mono label, e.g. Target: [slug] */
  targetLeft: string;
  paused: boolean;
  onTogglePause: () => void;
  onSkipToEnd: () => void;
  speedLabel: string;
  onToggleSpeed: () => void;
  takeFloorLabel: string;
  onTakeFloor: () => void;
  floorOpen: boolean;
  floorDraft: string;
  floorPlaceholder: string;
  onFloorDraftChange: (s: string) => void;
  onSubmitFloor: () => void;
  onDismissFloor: () => void;
  sendFloorAria: string;
  cancelLabel: string;
  busy?: boolean;
  atLimit?: boolean;
}) {
  const {
    targetLeft,
    paused,
    onTogglePause,
    onSkipToEnd,
    speedLabel,
    onToggleSpeed,
    takeFloorLabel,
    onTakeFloor,
    floorOpen,
    floorDraft,
    floorPlaceholder,
    onFloorDraftChange,
    onSubmitFloor,
    onDismissFloor,
    sendFloorAria,
    cancelLabel,
    busy,
    atLimit
  } = props;

  return (
    <div className="pointer-events-auto relative z-20 w-full shrink-0">
      <div
        className={[
          "overflow-hidden rounded-t-2xl border border-white/25 bg-white/55 shadow-[0_-8px_40px_-12px_rgba(15,23,42,0.12)] backdrop-blur-[20px] dark:border-white/10 dark:bg-slate-950/55 dark:shadow-[0_-12px_48px_-8px_rgba(0,0,0,0.4)]",
          floorOpen ? "ring-1 ring-amber-400/35 dark:ring-amber-500/30" : ""
        ].join(" ")}
      >
        <div
          className={[
            "grid max-h-[min(40vh,16rem)] grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out",
            floorOpen ? "grid-rows-[1fr]" : ""
          ].join(" ")}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="border-b border-slate-200/60 px-3 pb-2 pt-2 dark:border-white/10">
              <textarea
                className="mm-assistant-thin-scrollbar max-h-32 w-full resize-none rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-[12px] leading-relaxed text-slate-900 outline-none ring-0 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-900/90 dark:text-slate-100 dark:placeholder:text-slate-500"
                rows={3}
                placeholder={floorPlaceholder}
                value={floorDraft}
                onChange={(e) => onFloorDraftChange(e.target.value)}
                aria-label={takeFloorLabel}
              />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" className="ios-button py-1 text-[10px]" onClick={onDismissFloor}>
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  className="ios-button-primary py-1 px-3 text-[10px]"
                  disabled={!floorDraft.trim() || busy}
                  onClick={onSubmitFloor}
                >
                  {sendFloorAria}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2.5 sm:px-3">
          <div className="min-w-0 max-w-[38%] sm:max-w-[34%]">
            <span className="block truncate font-mono text-[8px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {targetLeft}
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/50 px-1 py-0.5 dark:border-slate-600/80 dark:bg-slate-900/50">
            <button
              type="button"
              disabled={atLimit}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100/90 disabled:pointer-events-none disabled:opacity-35 dark:text-slate-200 dark:hover:bg-slate-800/80"
              title={paused ? "Resume" : "Pause"}
              aria-label={paused ? "Resume" : "Pause"}
              onClick={onTogglePause}
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              disabled={atLimit}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100/90 disabled:pointer-events-none disabled:opacity-35 dark:text-slate-200 dark:hover:bg-slate-800/80"
              title="Skip to end"
              aria-label="Skip to end of round"
              onClick={onSkipToEnd}
            >
              <FastForward className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={atLimit}
              className="rounded-full px-2 py-1 font-mono text-[9px] font-bold tabular-nums text-slate-800 transition hover:bg-slate-100/90 disabled:pointer-events-none disabled:opacity-35 dark:text-slate-100 dark:hover:bg-slate-800/80"
              onClick={onToggleSpeed}
            >
              {speedLabel}
            </button>
          </div>

          <button
            type="button"
            disabled={atLimit || busy}
            className="shrink-0 rounded-xl border-2 border-amber-400/70 bg-gradient-to-br from-amber-100/95 to-orange-50/90 px-2.5 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-amber-950 shadow-md transition hover:brightness-105 disabled:pointer-events-none disabled:opacity-40 dark:border-amber-500/50 dark:from-amber-950/60 dark:to-orange-950/50 dark:text-amber-100"
            onClick={onTakeFloor}
          >
            {takeFloorLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
