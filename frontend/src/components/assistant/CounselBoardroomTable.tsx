import { FileText, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { CounselPersona } from "../../lib/counselApi";

/** Host + up to 8 councilors around the oval. */
const TOTAL_SEATS = 9;
const CHAIR_INDEX = 0;

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  const w = name.trim();
  return w.slice(0, 2).toUpperCase();
}

/** Polar angle from center; 0 = right; π = left (chairman / host). */
function seatAngleRad(index: number): number {
  return Math.PI + (2 * Math.PI * index) / TOTAL_SEATS;
}

export type CounselBoardroomTableProps = {
  personas: CounselPersona[];
  centerText: string;
  centerPlaceholder: string;
  variant: "hero" | "compact";
  /** Current speaker name — host uses "Host" (case-insensitive) for chair glow */
  activeSpeakerName?: string | null;
  setupMode?: boolean;
  onRemoveSeat?: (personaId: string) => void;
  /** First councilor (seat 1) name-tag suffix */
  leadLabel: string;
  emptySeatAria: string;
  /** Hover / chair label, e.g. Host — Chair */
  hostChairLabel: string;
  /** Low-opacity schematic (Problem stage mini HUD) */
  hudSchematic?: boolean;
  /** Cyan pulse on host seat (host holding the floor) */
  hudHostPulse?: boolean;
  /** Brief center copy for “summary lands on table” animation */
  centerFlashText?: string | null;
  /** Max lines in center (compact table); default 4 compact / 5 hero */
  centerMaxLines?: number;
  /** Longer brief shown in “Read full brief” overlay */
  fullBriefText?: string;
  /** Fact-finding: councilor seat that should pulse (awaiting your answer) */
  councilPulseName?: string | null;
  readFullBriefAria?: string;
  briefCloseLabel?: string;
  className?: string;
};

export default function CounselBoardroomTable({
  personas,
  centerText,
  centerPlaceholder,
  variant,
  activeSpeakerName,
  setupMode,
  onRemoveSeat,
  leadLabel,
  emptySeatAria,
  hostChairLabel,
  hudSchematic = false,
  hudHostPulse = false,
  centerFlashText = null,
  centerMaxLines,
  fullBriefText = "",
  councilPulseName = null,
  readFullBriefAria = "Read full brief",
  briefCloseLabel = "Close",
  className = ""
}: CounselBoardroomTableProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hostHovered, setHostHovered] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  /** Wide, flat ellipse so top/bottom seats stay inside the rim (not clipped). */
  const rx = variant === "hero" ? 46 : 41;
  const ry = variant === "hero" ? 24 : 21;
  const seatPx = variant === "hero" ? 32 : 26;
  const squircle = variant === "hero" ? "rounded-2xl" : "rounded-xl";

  const centerBody = centerFlashText?.trim() || centerText.trim() || centerPlaceholder;
  const centerAnimating = Boolean(centerFlashText?.trim());

  const activeNorm = activeSpeakerName?.trim().toLowerCase() ?? "";
  const councilPulseNorm = councilPulseName?.trim().toLowerCase() ?? "";
  const hostSpeaking = activeNorm === "host" || hudHostPulse;
  const hostGlowClass = hostSpeaking
    ? hudSchematic
      ? "mm-counsel-hud-host-pulse z-10"
      : "mm-counsel-seat-active z-10"
    : "";

  const ovalClass =
    variant === "hero"
      ? "aspect-[2.25/1] w-full max-w-2xl min-h-[128px] sm:aspect-[2.35/1] sm:min-h-[132px]"
      : "aspect-[2.1/1] w-full max-w-[15.75rem] min-h-[7.5rem]";

  useEffect(() => {
    if (!briefOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBriefOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [briefOpen]);

  const centerLineClamp =
    centerMaxLines === 2
      ? "line-clamp-2 min-h-0"
      : variant === "hero"
        ? "line-clamp-5 min-h-0"
        : "line-clamp-4 min-h-0";

  const centerTextSize =
    centerMaxLines === 2
      ? "text-[8.5px] font-medium leading-snug tracking-tight"
      : variant === "hero"
        ? "text-[11px] font-medium leading-snug tracking-tight"
        : "text-[8.5px] font-medium leading-snug";

  return (
    <div className={`relative flex w-full min-w-0 flex-col ${className}`}>
      {/* Padding gives the painted ellipse + shadow room so ancestors with overflow-y-auto don’t clip the rim */}
      <div className="box-border w-full overflow-visible px-1 py-2 sm:px-2 sm:py-3">
        <div
          className={`relative box-border ${ovalClass} ${variant === "compact" ? "ml-auto" : "mx-auto"} border border-slate-900/[0.12] bg-gradient-to-b from-white/[0.52] to-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_6px_24px_-6px_rgba(15,23,42,0.18)] transition-opacity duration-300 dark:border-white/[0.18] dark:from-white/[0.07] dark:to-white/[0.03] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_28px_-8px_rgba(0,0,0,0.45)] ${
            hudSchematic ? "opacity-[0.68] saturate-[0.88]" : ""
          }`}
          style={{ borderRadius: "50%" }}
        >
        {Array.from({ length: TOTAL_SEATS }, (_, i) => {
          const a = seatAngleRad(i);
          const x = 50 + rx * Math.cos(a);
          const y = 50 + ry * Math.sin(a);

          if (i === CHAIR_INDEX) {
            return (
              <div
                key="chair-host"
                className={["absolute", hudSchematic ? "z-[2] opacity-100" : ""].filter(Boolean).join(" ")}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: "translate(-50%, -50%)"
                }}
                onMouseEnter={() => setHostHovered(true)}
                onMouseLeave={() => setHostHovered(false)}
              >
                {hostHovered ? (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-max max-w-[12rem] -translate-x-1/2 rounded-lg border border-slate-200/90 bg-white/95 px-2 py-1 text-[9px] font-medium text-slate-800 shadow-lg dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-100">
                    {hostChairLabel}
                  </div>
                ) : null}
                <div
                  className={[
                    "mm-counsel-seat-enter flex items-center justify-center font-bold tabular-nums text-slate-900 shadow-sm dark:text-slate-50",
                    squircle,
                    "border border-violet-300/85 bg-gradient-to-br from-violet-100/95 to-indigo-100/90 ring-2 ring-amber-400/60 dark:border-violet-500/45 dark:from-violet-950/65 dark:to-indigo-950/50 dark:ring-amber-400/45",
                    hostGlowClass,
                    hudSchematic ? "!opacity-100" : ""
                  ].join(" ")}
                  style={{ width: seatPx, height: seatPx, fontSize: variant === "hero" ? 11 : 10 }}
                  title={hostChairLabel}
                  aria-label={hostChairLabel}
                >
                  ⌁
                </div>
              </div>
            );
          }

          const p = personas[i - 1];
          const isEmpty = !p;
          if (isEmpty) {
            return (
              <div
                key={`e-${i}`}
                className={[
                  "pointer-events-none absolute flex items-center justify-center border border-dashed border-slate-400/50 bg-slate-100/25 dark:border-slate-500/45 dark:bg-slate-900/30",
                  hudSchematic ? "opacity-40" : ""
                ].join(" ")}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: seatPx,
                  height: seatPx,
                  transform: "translate(-50%, -50%)",
                  borderRadius: "30%"
                }}
                aria-label={emptySeatAria}
              >
                <Plus className="h-3 w-3 text-slate-400/90 dark:text-slate-500" strokeWidth={2} aria-hidden />
              </div>
            );
          }

          const isActive =
            (activeNorm.length > 0 && p.name.trim().toLowerCase() === activeNorm) ||
            (councilPulseNorm.length > 0 && p.name.trim().toLowerCase() === councilPulseNorm);
          const leadCouncilor = i === 1;
          const showTag = hoveredId === p.id;

          return (
            <div
              key={p.id}
              className={["absolute", hudSchematic ? "opacity-45" : ""].join(" ")}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)"
              }}
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {showTag ? (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-max max-w-[11rem] -translate-x-1/2 rounded-lg border border-slate-200/90 bg-white/95 px-2 py-1 text-[9px] font-medium text-slate-800 shadow-lg dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-100">
                  {leadCouncilor ? `${p.name} — ${leadLabel}` : p.name}
                </div>
              ) : null}
              <button
                type="button"
                title={p.name}
                className={[
                  "mm-counsel-seat-enter relative flex items-center justify-center font-bold text-slate-900 shadow-sm transition dark:text-slate-50",
                  squircle,
                  "border border-slate-200/80 bg-gradient-to-br from-sky-100/95 to-cyan-50/90 dark:border-slate-600/80 dark:from-sky-950/55 dark:to-cyan-950/45",
                  leadCouncilor ? "ring-2 ring-sky-400/45 dark:ring-sky-400/35" : "",
                  isActive ? "mm-counsel-seat-active z-10" : "",
                  setupMode && onRemoveSeat
                    ? "cursor-pointer hover:brightness-105 dark:hover:brightness-110"
                    : ""
                ].join(" ")}
                style={{ width: seatPx, height: seatPx, fontSize: variant === "hero" ? 10 : 9 }}
                onClick={() => {
                  if (setupMode && onRemoveSeat) onRemoveSeat(p.id);
                }}
              >
                {initialsFromName(p.name)}
              </button>
            </div>
          );
        })}

        <div className="pointer-events-none absolute inset-[18%_10%] z-[1] flex items-center justify-center px-2 text-center sm:inset-[18%_12%] sm:px-3">
          <div className="pointer-events-auto flex w-full max-w-full items-start justify-center gap-1.5 sm:gap-2">
            <p
              className={[
                "text-balance text-slate-700 dark:text-slate-200",
                centerAnimating ? "mm-counsel-hud-center-pop" : "",
                centerTextSize,
                centerLineClamp
              ].join(" ")}
            >
              {centerBody}
            </p>
            {fullBriefText.trim().length > 0 ? (
              <button
                type="button"
                className={[
                  "pointer-events-auto mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white/85 text-slate-600 shadow-sm transition hover:bg-white hover:text-sky-700 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-sky-300",
                  hudSchematic ? "opacity-95" : ""
                ].join(" ")}
                title={readFullBriefAria}
                aria-label={readFullBriefAria}
                onClick={() => setBriefOpen(true)}
              >
                <FileText className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        {briefOpen ? (
          <div
            className="pointer-events-auto fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={readFullBriefAria}
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px] dark:bg-black/55"
              aria-label="Close"
              onClick={() => setBriefOpen(false)}
            />
            <div className="relative z-[1] max-h-[min(70vh,28rem)] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-600 dark:bg-slate-900">
              <div className="border-b border-slate-200/80 px-4 py-2.5 dark:border-slate-700">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {readFullBriefAria}
                </span>
              </div>
              <div className="mm-assistant-thin-scrollbar max-h-[min(60vh,22rem)] overflow-y-auto px-4 py-3 text-left text-[11px] leading-relaxed text-slate-800 dark:text-slate-100">
                <p className="whitespace-pre-wrap">{fullBriefText.trim()}</p>
              </div>
              <div className="border-t border-slate-200/80 px-3 py-2 dark:border-slate-700">
                <button
                  type="button"
                  className="ios-button w-full py-1.5 text-[10px]"
                  onClick={() => setBriefOpen(false)}
                >
                  {briefCloseLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}
