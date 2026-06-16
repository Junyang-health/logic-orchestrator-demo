import type { FocusEvent } from "react";
import { MessageCircle } from "lucide-react";
import type { CounselPersona } from "../../../lib/counselApi";
import { useI18n } from "../../../i18n/useI18n";
import { FactAnswerBar, FactQuestionProgressDots } from "./CounselFactWidgets";

type FactThread = { messages: { role: "user" | "persona"; content: string }[] };

export type CounselPhaseFactProps = {
  personas: CounselPersona[];
  factThreads: Record<string, FactThread>;
  questionsAsked: Record<string, number>;
  factSkippedIds: Record<string, boolean>;
  factLoading: Record<string, boolean>;
  factFocusPersonaId: string | null;
  onFocusCapturePersona: (personaId: string) => void;
  onPersonaCardBlur: (personaId: string, e: FocusEvent<HTMLDivElement>) => void;
  submitFactAnswer: (personaId: string, text: string) => void;
  onSkipPersona: (personaId: string) => void;
  factBusyAny: boolean;
  busy: boolean;
  onContinueNgt: () => void;
};

export default function CounselPhaseFact(props: CounselPhaseFactProps) {
  const { t } = useI18n();
  const {
    personas,
    factThreads,
    questionsAsked,
    factSkippedIds,
    factLoading,
    factFocusPersonaId,
    onFocusCapturePersona,
    onPersonaCardBlur,
    submitFactAnswer,
    onSkipPersona,
    factBusyAny,
    busy,
    onContinueNgt
  } = props;

  const activePersonaId =
    factFocusPersonaId ??
    personas.find((p) => {
      const msgs = factThreads[p.id]?.messages || [];
      const last = msgs[msgs.length - 1];
      return !factSkippedIds[p.id] && msgs.length > 0 && last?.role === "persona";
    })?.id ??
    null;

  const completeCount = personas.filter((p) => {
    const msgs = factThreads[p.id]?.messages || [];
    const last = msgs[msgs.length - 1];
    return factSkippedIds[p.id] || (msgs.length > 0 && last?.role !== "persona");
  }).length;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 rounded-2xl border border-slate-200/55 bg-white/40 p-3 dark:border-slate-700/45 dark:bg-slate-900/25">
        <div className="flex items-center justify-between gap-3">
          <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Fact status
          </div>
          <div className="rounded-full bg-slate-200/70 px-2.5 py-1 text-[9px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {completeCount}/{personas.length} members covered
          </div>
        </div>
        <p className="text-xs font-medium leading-snug text-slate-600 dark:text-slate-300">{t("counsel_fact_stack_intro")}</p>
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{t("counsel_fact_reply_hint")}</p>
        <p className="text-[11px] leading-relaxed text-slate-500/90 dark:text-slate-400/90">{t("counsel_fact_skip_hint")}</p>
      </div>
      {personas.map((p) => {
        const msgs = factThreads[p.id]?.messages || [];
        const last = msgs[msgs.length - 1];
        const qs = questionsAsked[p.id] ?? 0;
        const waitingAnswer = !factSkippedIds[p.id] && msgs.length > 0 && last?.role === "persona";
        const lastPersonaTurn = [...msgs].reverse().find((m) => m.role === "persona");
        const answered = msgs.length > 0 && last?.role === "user";
        const focusHere = factFocusPersonaId === p.id;
        const expanded = activePersonaId === p.id || focusHere || (!factSkippedIds[p.id] && msgs.length === 0);
        const dimOthers = activePersonaId != null && activePersonaId !== p.id && !answered && !factSkippedIds[p.id];
        const status = factSkippedIds[p.id] ? "done" : waitingAnswer ? "waiting" : answered ? "answered" : factLoading[p.id] ? "thinking" : "ready";

        return (
          <div
            key={p.id}
            tabIndex={-1}
            className={[
              "rounded-xl border p-3 transition-[opacity,border-color] duration-200",
              "bg-white/92 dark:bg-slate-900/42",
              dimOthers ? "opacity-50" : "opacity-100",
              focusHere || expanded ? "border-slate-300/85 dark:border-slate-500/75" : "border-slate-200/35 dark:border-slate-600/35"
            ].join(" ")}
            onFocusCapture={() => onFocusCapturePersona(p.id)}
            onBlurCapture={(e) => onPersonaCardBlur(p.id, e)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <MessageCircle className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" strokeWidth={2} aria-hidden />
                <span className="truncate font-mono text-xs font-semibold tracking-tight text-sky-700 dark:text-sky-300">
                  {p.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-[9px] font-medium",
                    status === "waiting"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                      : status === "answered" || status === "done"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  ].join(" ")}
                >
                  {status === "waiting" ? "waiting" : status === "answered" ? "answered" : status === "done" ? "done" : status}
                </span>
                <FactQuestionProgressDots
                  posted={qs}
                  max={3}
                  ariaLabel={t("counsel_fact_progress_aria", { posted: qs, max: 3 })}
                />
              </div>
            </div>
            {expanded ? (
              <>
                {factLoading[p.id] ? (
                  <p className="mt-2 rounded-2xl bg-slate-100/90 px-3 py-2.5 text-xs italic leading-relaxed text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                    {t("counsel_fact_thinking")}
                  </p>
                ) : lastPersonaTurn ? (
                  <div className="mt-2 rounded-2xl bg-slate-100/85 px-3 py-2.5 text-xs leading-relaxed text-slate-800 dark:bg-slate-800/70 dark:text-slate-100">
                    {lastPersonaTurn.content}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("counsel_fact_thinking")}</p>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {waitingAnswer ? "This member is waiting on you." : answered ? "Answer captured." : ""}
                  </div>
                  {!factSkippedIds[p.id] ? (
                    <button
                      type="button"
                      className="text-[10px] text-slate-600 underline underline-offset-2 dark:text-slate-400"
                      disabled={factLoading[p.id]}
                      onClick={() => onSkipPersona(p.id)}
                    >
                      Skip member
                    </button>
                  ) : null}
                </div>
                <FactAnswerBar
                  placeholder={t("counsel_fact_answer_ph")}
                  sendAria={t("counsel_send")}
                  onSubmit={(txt) => submitFactAnswer(p.id, txt)}
                  disabled={factLoading[p.id] || !waitingAnswer}
                />
              </>
            ) : (
              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                {lastPersonaTurn?.content || "Completed."}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="ios-button-primary w-full py-2 text-sm"
        disabled={busy || factBusyAny}
        onClick={() => void onContinueNgt()}
      >
        {t("counsel_fact_continue_ngt")}
      </button>
    </div>
  );
}
