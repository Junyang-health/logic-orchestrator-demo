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
    factBusyAny,
    busy,
    onContinueNgt
  } = props;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium leading-snug text-slate-600 dark:text-slate-300">{t("counsel_fact_stack_intro")}</p>
        <p className="text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">{t("counsel_fact_reply_hint")}</p>
        <p className="text-[9px] leading-relaxed text-slate-500/90 dark:text-slate-400/90">{t("counsel_fact_skip_hint")}</p>
      </div>
      {personas.map((p) => {
        const msgs = factThreads[p.id]?.messages || [];
        const last = msgs[msgs.length - 1];
        const qs = questionsAsked[p.id] ?? 0;
        const waitingAnswer = !factSkippedIds[p.id] && msgs.length > 0 && last?.role === "persona";
        const lastPersonaTurn = [...msgs].reverse().find((m) => m.role === "persona");
        const focusHere = factFocusPersonaId === p.id;
        const dimOthers = factFocusPersonaId != null && factFocusPersonaId !== p.id;

        return (
          <div
            key={p.id}
            tabIndex={-1}
            className={[
              "rounded-xl border p-3 transition-[opacity,border-color] duration-200",
              "bg-white/92 dark:bg-slate-900/42",
              dimOthers ? "opacity-50" : "opacity-100",
              focusHere ? "border-slate-300/85 dark:border-slate-500/75" : "border-slate-200/35 dark:border-slate-600/35"
            ].join(" ")}
            onFocusCapture={() => onFocusCapturePersona(p.id)}
            onBlurCapture={(e) => onPersonaCardBlur(p.id, e)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" strokeWidth={2} aria-hidden />
                <span className="truncate font-mono text-[10px] font-semibold tracking-tight text-sky-700 dark:text-sky-300">
                  {p.name}
                </span>
              </div>
              <FactQuestionProgressDots
                posted={qs}
                max={3}
                ariaLabel={t("counsel_fact_progress_aria", { posted: qs, max: 3 })}
              />
            </div>
            {factLoading[p.id] ? (
              <p className="mt-2 rounded-2xl bg-slate-100/90 px-3 py-2.5 text-[10px] italic leading-relaxed text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                {t("counsel_fact_thinking")}
              </p>
            ) : lastPersonaTurn ? (
              <div className="mt-2 rounded-2xl bg-slate-100/85 px-3 py-2.5 text-[10px] leading-relaxed text-slate-800 dark:bg-slate-800/70 dark:text-slate-100">
                {lastPersonaTurn.content}
              </div>
            ) : (
              <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">{t("counsel_fact_thinking")}</p>
            )}
            <FactAnswerBar
              placeholder={t("counsel_fact_answer_ph")}
              sendAria={t("counsel_send")}
              onSubmit={(txt) => submitFactAnswer(p.id, txt)}
              disabled={factLoading[p.id] || !waitingAnswer}
            />
          </div>
        );
      })}
      <button
        type="button"
        className="ios-button-primary w-full py-2 text-[11px]"
        disabled={busy || factBusyAny}
        onClick={() => void onContinueNgt()}
      >
        {t("counsel_fact_continue_ngt")}
      </button>
    </div>
  );
}
