import type { CounselPersona } from "../../lib/counselApi";
import type { PersonaVoteSentiment } from "./counselVoteConsensus";
import { counselInitials, counselSignatureRing, normSpeakerKey } from "./counselHudUtils";

export type CounselGalleryDockProps = {
  personas: CounselPersona[];
  /** Left seat: chair / host */
  showHost?: boolean;
  hostLabel?: string;
  /** Right seat: judge / user */
  showJudge?: boolean;
  judgeLabel?: string;
  /** Who currently holds the speaking spotlight (persona name, "Host", or "User") */
  speakingName: string | null;
  /** Optional: persona being directly addressed — soft pulse */
  addresseeName?: string | null;
  /** Judge seat emphasized (e.g. "take the floor") */
  judgeActive?: boolean;
  /** 0–1 fill under the speaking avatar during auto-advance countdown */
  timerProgress?: number;
  /** Normalized key of avatar that shows the timer bar (lowercase); if unset, uses speaking */
  timerUnderKey?: string | null;
  hostRingColor?: string;
  judgeRingColor?: string;
  /** Vote / finalize: alignment rim (persona keys = lowercase name or id) */
  sentimentByPersonaKey?: Record<string, PersonaVoteSentiment>;
  className?: string;
};

type DockEntry =
  | { kind: "host"; key: string; label: string; initials: string; ring: string; id?: string }
  | { kind: "persona"; key: string; label: string; initials: string; ring: string; id: string }
  | { kind: "judge"; key: string; label: string; initials: string; ring: string };

export default function CounselGalleryDock(props: CounselGalleryDockProps) {
  const {
    personas,
    showHost = false,
    hostLabel = "Host",
    showJudge = false,
    judgeLabel = "Judge",
    speakingName,
    addresseeName,
    judgeActive = false,
    timerProgress = 0,
    timerUnderKey = null,
    hostRingColor = "rgba(139, 92, 246, 0.95)",
    judgeRingColor = "rgba(245, 158, 11, 0.95)",
    sentimentByPersonaKey,
    className = ""
  } = props;

  const speakKey = normSpeakerKey(speakingName);
  const addrKey = normSpeakerKey(addresseeName ?? null);
  const barKey = timerUnderKey ? normSpeakerKey(timerUnderKey) : speakKey;
  const hasSpotlight = Boolean(speakKey || judgeActive);

  const entries: DockEntry[] = [];
  if (showHost) {
    entries.push({
      kind: "host",
      key: "host",
      label: hostLabel,
      initials: "⌁",
      ring: hostRingColor
    });
  }
  for (const p of personas) {
    entries.push({
      kind: "persona",
      key: normSpeakerKey(p.name) || p.id,
      label: p.name,
      initials: counselInitials(p.name),
      ring: counselSignatureRing(p.name),
      id: p.id
    });
  }
  if (showJudge) {
    entries.push({
      kind: "judge",
      key: "user",
      label: judgeLabel,
      initials: "⚖",
      ring: judgeRingColor
    });
  }

  return (
    <div
      className={[
        "flex w-full items-end justify-center gap-2 px-1 py-2 sm:gap-3 sm:px-2",
        className
      ].join(" ")}
    >
      {entries.map((e) => {
        const isUserSeat = e.kind === "judge";
        const isHostSeat = e.kind === "host";
        const matchSpeak =
          speakKey &&
          (isUserSeat
            ? speakKey === "user"
            : isHostSeat
              ? speakKey === "host" || speakKey === normSpeakerKey(hostLabel)
              : normSpeakerKey(e.label) === speakKey);
        const matchAddr = Boolean(addrKey && normSpeakerKey(e.label) === addrKey && !matchSpeak);
        const judgeLit = isUserSeat && judgeActive;
        const speaking = Boolean(matchSpeak || judgeLit);
        const dimmed = hasSpotlight && !speaking;
        const pKey = e.kind === "persona" ? normSpeakerKey(e.label) || e.id : null;
        const sentiment =
          e.kind === "persona" && sentimentByPersonaKey && pKey ? sentimentByPersonaKey[pKey] : undefined;
        const showTimer =
          hasSpotlight &&
          typeof timerProgress === "number" &&
          timerProgress > 0 &&
          barKey &&
          (isUserSeat
            ? barKey === "user"
            : isHostSeat
              ? barKey === "host" || barKey === normSpeakerKey(hostLabel)
              : normSpeakerKey(e.label) === barKey);

        const sentimentGlow =
          !speaking && sentiment === "aligned"
            ? "0 0 0 2px rgba(34, 197, 94, 0.5), 0 0 14px rgba(34, 197, 94, 0.28)"
            : !speaking && sentiment === "dissent"
              ? "0 0 0 2px rgba(245, 158, 11, 0.55), 0 0 14px rgba(245, 158, 11, 0.3)"
              : null;

        const baseBg = isHostSeat
          ? "from-violet-200/90 to-indigo-100/85 dark:from-violet-950/75 dark:to-indigo-950/55"
          : isUserSeat
            ? "from-amber-100/95 to-orange-50/90 dark:from-amber-950/55 dark:to-orange-950/45"
            : "from-sky-100/95 to-cyan-50/90 dark:from-sky-950/55 dark:to-cyan-950/45";

        return (
          <div
            key={`${e.kind}-${e.kind === "persona" ? e.id : e.key}`}
            className="flex min-w-0 flex-col items-center gap-1"
          >
            <div
              className={[
                "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[30%] border border-slate-200/80 bg-gradient-to-br font-bold tabular-nums text-slate-900 shadow-sm transition-[transform,opacity,filter] duration-300 dark:border-slate-600/75 dark:text-slate-50 sm:h-12 sm:w-12",
                baseBg,
                speaking ? "z-[2] scale-[1.2]" : "z-[1] scale-100",
                dimmed ? "opacity-[0.3] grayscale" : "opacity-100 grayscale-0",
                matchAddr ? "mm-counsel-addressee-pulse" : ""
              ].join(" ")}
              style={
                speaking
                  ? {
                      boxShadow: `0 0 0 2px ${e.ring}, 0 0 16px ${e.ring}55`
                    }
                  : sentimentGlow
                    ? { boxShadow: sentimentGlow }
                    : undefined
              }
              title={e.label}
              aria-label={e.label}
            >
              <span className="text-[10px] sm:text-[11px]">{e.initials}</span>
            </div>
            {showTimer ? (
              <div className="h-1 w-[88%] overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/80">
                <div
                  className="h-full rounded-full bg-sky-500/90 transition-[width] duration-75 dark:bg-sky-400/90"
                  style={{ width: `${Math.round(Math.min(1, timerProgress) * 100)}%` }}
                />
              </div>
            ) : (
              <div className="h-1 w-[88%]" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}
