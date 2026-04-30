import { memo, useCallback, useMemo, useState, type ReactNode, type RefObject } from "react";
import { Info, X } from "lucide-react";
import { useI18n } from "../../i18n/useI18n";
import type { AssistantPanelMode } from "./assistantPanelMode";
import { SLASH_MODE_CHIP_ITEMS } from "./slashModeCommands";
import type { ChatRow, RoundtablePersona, RoundtableTranscriptRow } from "./assistantTypes";

const CHAT_EMPTY_HINT_KEY = "mindmap_assistant_chat_empty_hint_dismissed";

export type AssistantTranscriptBlockProps = {
  listRef?: RefObject<HTMLDivElement | null>;
  /** When true, transcript does not own scroll/ref — parent scroll container handles it. */
  embedInParentScroll?: boolean;
  isRoundtable: boolean;
  messages: ChatRow[];
  chatBusy: boolean;
  rtTranscript: RoundtableTranscriptRow[];
  rtRoundBusy: boolean;
  rtProposal: {
    discussion_summary: string;
    recommended_mindmap_changes: string;
  } | null;
  onClearChat: () => void;
  onClearRoundtable: () => void;
  /** Chat only: click = same as sending that slash line to switch modes. */
  onSlashModeJump?: (mode: AssistantPanelMode) => void;
  /** Roundtable: roster strip + graph id highlighting */
  rtPersonas?: RoundtablePersona[];
  onRemoveRtPersona?: (id: string) => void;
  rtGraphNodeIds?: string[];
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  const w = name.trim();
  return w.slice(0, 2).toUpperCase();
}

const PERSONA_ACCENT_STYLES = [
  { name: "text-amber-600 dark:text-amber-400", av: "bg-amber-100 text-amber-900 dark:bg-amber-950/55 dark:text-amber-100" },
  { name: "text-cyan-600 dark:text-cyan-400", av: "bg-cyan-100 text-cyan-900 dark:bg-cyan-950/55 dark:text-cyan-100" },
  { name: "text-violet-600 dark:text-violet-400", av: "bg-violet-100 text-violet-900 dark:bg-violet-950/55 dark:text-violet-100" },
  { name: "text-rose-600 dark:text-rose-400", av: "bg-rose-100 text-rose-900 dark:bg-rose-950/55 dark:text-rose-100" },
  { name: "text-emerald-600 dark:text-emerald-400", av: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/55 dark:text-emerald-100" },
  { name: "text-sky-600 dark:text-sky-400", av: "bg-sky-100 text-sky-900 dark:bg-sky-950/55 dark:text-sky-100" }
];

function personaAccent(name: string): (typeof PERSONA_ACCENT_STYLES)[number] {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h + name.charCodeAt(i) * (i + 1)) % 1009;
  }
  return PERSONA_ACCENT_STYLES[h % PERSONA_ACCENT_STYLES.length];
}

function groupTranscriptIntoRounds(rows: RoundtableTranscriptRow[]): RoundtableTranscriptRow[][] {
  const rounds: RoundtableTranscriptRow[][] = [];
  let cur: RoundtableTranscriptRow[] = [];
  for (const r of rows) {
    if (r.role === "user") {
      if (cur.length) {
        rounds.push(cur);
        cur = [];
      }
      cur.push(r);
    } else {
      cur.push(r);
    }
  }
  if (cur.length) rounds.push(cur);
  return rounds;
}

function renderGroundedText(text: string, nodeIds: string[]): ReactNode {
  if (!text) return null;
  const sorted = [...new Set(nodeIds.filter(Boolean))].sort((a, b) => b.length - a.length).slice(0, 120);
  const metricAlt = String.raw`\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:TB|GB|MB|%)`;
  const alts =
    sorted.length > 0 ? `${sorted.map(escapeRe).join("|")}|${metricAlt}` : metricAlt;
  let re: RegExp;
  try {
    re = new RegExp(`(${alts})`, "gi");
  } catch {
    return text;
  }
  const metricTest = new RegExp(`^${metricAlt}$`, "i");
  const parts = text.split(re);
  return parts.map((part, i) => {
    if (!part) return null;
    const isMetric = metricTest.test(part.trim());
    const isNode = sorted.some((id) => id === part);
    if (isNode) {
      return (
        <mark
          key={i}
          className="bg-transparent font-medium text-sky-700 underline decoration-sky-400/70 decoration-1 underline-offset-[3px] dark:text-sky-300 dark:decoration-sky-500/60"
        >
          {part}
        </mark>
      );
    }
    if (isMetric) {
      return (
        <mark
          key={i}
          className="bg-transparent font-medium text-emerald-800 underline decoration-emerald-500/50 decoration-1 underline-offset-[3px] dark:text-emerald-200 dark:decoration-emerald-400/45"
        >
          {part}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function AssistantTranscriptBlockInner(props: AssistantTranscriptBlockProps) {
  const {
    listRef,
    embedInParentScroll,
    isRoundtable,
    messages,
    chatBusy,
    rtTranscript,
    rtRoundBusy,
    rtProposal,
    onClearChat,
    onClearRoundtable,
    onSlashModeJump,
    rtPersonas = [],
    onRemoveRtPersona,
    rtGraphNodeIds = []
  } = props;

  const { t } = useI18n();
  const [chatHintDismissed, setChatHintDismissed] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem(CHAT_EMPTY_HINT_KEY) === "1"
  );
  const [introOpen, setIntroOpen] = useState(false);

  const dismissChatHint = useCallback(() => {
    try {
      localStorage.setItem(CHAT_EMPTY_HINT_KEY, "1");
    } catch {
      /* ignore */
    }
    setChatHintDismissed(true);
  }, []);

  const chatEmpty = !isRoundtable && messages.length === 0 && !chatBusy;
  const rtEmpty = isRoundtable && rtTranscript.length === 0 && !rtRoundBusy && !rtProposal;
  const transcriptQuiet = chatEmpty || rtEmpty;
  const showChatGhost = chatEmpty && !chatHintDismissed;

  const roundGroups = useMemo(() => groupTranscriptIntoRounds(rtTranscript), [rtTranscript]);
  const lastRoundIdx = roundGroups.length > 0 ? roundGroups.length - 1 : -1;

  const scrollClass = embedInParentScroll
    ? "min-h-0"
    : [
        "overflow-y-auto overscroll-contain rounded-xl p-2 transition-[min-height]",
        isRoundtable ? "space-y-2" : "space-y-3",
        transcriptQuiet && !showChatGhost
          ? "min-h-0 max-h-[min(40dvh,360px)] border-0 bg-transparent"
          : transcriptQuiet && showChatGhost
            ? "relative min-h-0 max-h-[min(40dvh,360px)] border-0 bg-slate-100/35 dark:bg-slate-800/25"
            : "min-h-0 max-h-[min(40dvh,360px)] border border-slate-200/55 bg-white/55 dark:border-slate-700/45 dark:bg-slate-900/35"
      ].join(" ");

  return (
    <>
      {isRoundtable ? (
        <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200/50 pb-3 dark:border-slate-700/40">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("mode_roundtable")}
            </span>
            <div className="relative">
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-expanded={introOpen}
                aria-label={t("rt_intro_tooltip_aria")}
                onClick={() => setIntroOpen((v) => !v)}
              >
                <Info className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              {introOpen ? (
                <div className="absolute left-0 top-full z-20 mt-1 w-[min(100vw-3rem,18rem)] rounded-xl border border-slate-200/90 bg-white p-3 text-[10px] leading-relaxed shadow-lg dark:border-slate-600 dark:bg-slate-900">
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{t("rt_title")}</div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">{t("rt_intro")}</p>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
            <div className="flex max-w-[min(100%,14rem)] flex-wrap items-center justify-end gap-1 sm:max-w-none">
              {rtPersonas.map((p) => {
                const ini = initialsFromName(p.name);
                return (
                  <button
                    key={p.id}
                    type="button"
                    title={`${p.name} — ${t("rt_remove", { name: p.name })}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-gradient-to-br from-sky-100/90 to-cyan-100/70 text-[10px] font-bold text-slate-900 shadow-sm transition hover:brightness-105 dark:border-slate-600 dark:from-sky-950/50 dark:to-cyan-950/40 dark:text-slate-50"
                    onClick={() => onRemoveRtPersona?.(p.id)}
                  >
                    {ini}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="shrink-0 text-[9px] text-slate-400 underline decoration-slate-300/80 underline-offset-2 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              onClick={onClearRoundtable}
            >
              {t("transcript_clear_rt")}
            </button>
          </div>
        </header>
      ) : (
        <div className="mb-1 flex items-center justify-between">
          <div className="text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {t("transcript_conversation")}
          </div>
          <button
            type="button"
            className="text-[10px] text-slate-500 underline dark:text-slate-400"
            onClick={onClearChat}
          >
            {t("transcript_clear_chat")}
          </button>
        </div>
      )}

      <div ref={embedInParentScroll ? undefined : listRef} className={scrollClass}>
        {isRoundtable ? (
          <>
            {rtEmpty ? (
              <p className="text-[10px] leading-relaxed text-slate-400/95 dark:text-slate-500">{t("transcript_rt_empty")}</p>
            ) : null}

            {roundGroups.map((round, roundIndex) => {
              const roundDimmed = lastRoundIdx >= 0 && roundIndex < lastRoundIdx;
              return (
                <div
                  key={`rt-round-${roundIndex}`}
                  className={roundDimmed ? "opacity-[0.8] transition-opacity" : "opacity-100"}
                >
                  {round.map((r, idxInRound) => {
                    const isFirstInRound = idxInRound === 0;
                    const acc =
                      r.role === "persona" && r.persona_name ? personaAccent(r.persona_name) : null;
                    const label =
                      r.role === "user" ? t("transcript_you") : r.persona_name || t("transcript_persona");
                    return (
                      <div
                        key={r.id}
                        className="border-b border-slate-200/35 pb-4 pt-1 dark:border-slate-700/35"
                      >
                        <div className="flex gap-2">
                          <div className="flex w-7 shrink-0 flex-col items-center pt-1">
                            {isFirstInRound ? (
                              <span
                                className="text-[8px] font-medium tabular-nums uppercase tracking-wider text-slate-400 dark:text-slate-500"
                                title={t("transcript_round_n", { n: roundIndex + 1 })}
                              >
                                {t("transcript_round_short", { n: roundIndex + 1 })}
                              </span>
                            ) : (
                              <span className="text-[8px] text-slate-300 dark:text-slate-600" aria-hidden>
                                ·
                              </span>
                            )}
                          </div>
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                              r.role === "user"
                                ? "bg-slate-200/90 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                                : acc
                                  ? acc.av
                                  : "bg-violet-100 text-violet-900 dark:bg-violet-950/55 dark:text-violet-100"
                            }`}
                          >
                            {r.role === "user"
                              ? "⌁"
                              : r.persona_name
                                ? initialsFromName(r.persona_name)
                                : "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div
                              className={`text-[10px] font-bold uppercase tracking-[0.12em] ${
                                r.role === "user"
                                  ? "text-slate-500 dark:text-slate-400"
                                  : acc
                                    ? acc.name
                                    : "text-slate-600 dark:text-slate-300"
                              }`}
                            >
                              {label}
                            </div>
                            <div className="mt-1 text-[11px] leading-[1.6] text-slate-800 dark:text-slate-100">
                              {renderGroundedText(r.content, rtGraphNodeIds)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {rtRoundBusy && (
                <div className="border-b border-slate-200/35 pb-3 pt-1 text-[10px] italic text-slate-500 dark:border-slate-700/35 dark:text-slate-500">
                {t("transcript_thinking_rt")}
              </div>
            )}

            {rtProposal ? (
              <div className="mt-4 border-t border-slate-200/50 pt-4 dark:border-slate-700/45">
                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
                  {t("transcript_proposed_wrap")}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[11px] font-medium leading-[1.6] text-slate-800 dark:text-slate-100">
                  {rtProposal.discussion_summary || "—"}
                </p>
                <div className="mt-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
                  {t("transcript_recommended_changes")}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[11px] leading-[1.6] text-slate-700 dark:text-slate-200">
                  {renderGroundedText(rtProposal.recommended_mindmap_changes || "—", rtGraphNodeIds)}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {showChatGhost ? (
              <div className="relative pr-7 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
                <button
                  type="button"
                  className="absolute right-0 top-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700/50 dark:hover:text-slate-300"
                  title={t("transcript_dismiss_hint")}
                  aria-label={t("transcript_dismiss_hint")}
                  onClick={dismissChatHint}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
                <p>{t("transcript_chat_empty")}</p>
              </div>
            ) : null}
            {chatEmpty && onSlashModeJump ? (
              <div className={showChatGhost ? "mt-3" : ""}>
                {!showChatGhost ? (
                  <p className="mb-2 text-[9px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {t("transcript_slash_shortcuts_after_dismiss")}
                  </p>
                ) : null}
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label={t("assistant_slash_jump_aria")}
                >
                  {SLASH_MODE_CHIP_ITEMS.map(({ mode: m, label }) => (
                    <button
                      key={m}
                      type="button"
                      className="rounded-lg border border-slate-200/90 bg-white/90 px-2 py-1 font-mono text-[9px] font-medium text-slate-700 shadow-sm transition hover:border-sky-300/80 hover:bg-sky-50/90 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-sky-500/50 dark:hover:bg-sky-950/40"
                      title={t("assistant_slash_chip_title", { cmd: label })}
                      onClick={() => onSlashModeJump(m)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex w-full justify-end">
                  <div className="max-w-[min(85%,20rem)] rounded-[1.15rem] rounded-br-md bg-[var(--mm-cta-blue)] px-3.5 py-2 text-[13px] font-normal leading-[1.35] text-white shadow-sm">
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex w-full justify-start">
                  <div className="max-w-[min(92%,36rem)] text-left text-[13px] font-normal leading-relaxed text-[#1d1d1f] dark:text-slate-100">
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                </div>
              )
            )}
            {chatBusy ? (
              <div className="flex w-full justify-start">
                <p className="max-w-[min(92%,36rem)] text-left text-[13px] italic text-slate-400 dark:text-slate-500">
                  {t("transcript_thinking")}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

export default memo(AssistantTranscriptBlockInner);
