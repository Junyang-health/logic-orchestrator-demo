import type { RefObject } from "react";
import { Send } from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";

export type CounselPhaseProblemProps = {
  hostLabel: string;
  problemTranscript: { role: string; content: string }[];
  problemDraft: string;
  onProblemDraftChange: (v: string) => void;
  problemSummary: string;
  onProblemSummaryChange: (v: string) => void;
  slugKeywords: string;
  onSlugKeywordsChange: (v: string) => void;
  busy: boolean;
  problemReplyRef: RefObject<HTMLTextAreaElement | null>;
  problemSummaryRef: RefObject<HTMLTextAreaElement | null>;
  problemPrimaryCtaClass: string;
  onSubmitProblemUser: () => void;
  onRunProblemTurn: () => void;
};

export default function CounselPhaseProblem(props: CounselPhaseProblemProps) {
  const { t } = useI18n();
  const {
    hostLabel,
    problemTranscript,
    problemDraft,
    onProblemDraftChange,
    problemSummary,
    onProblemSummaryChange,
    slugKeywords,
    onSlugKeywordsChange,
    busy,
    problemReplyRef,
    problemSummaryRef,
    problemPrimaryCtaClass,
    onSubmitProblemUser,
    onRunProblemTurn
  } = props;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-5 pb-2">
      <div className="space-y-2.5 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
        {problemTranscript.map((row, i) => (
          <div key={i} className={row.role === "host" ? "text-sky-800 dark:text-sky-200" : ""}>
            <span className="font-semibold">{row.role === "host" ? hostLabel : "You"}:</span>{" "}
            <span className="whitespace-pre-wrap">{row.content}</span>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl bg-slate-100/55 dark:bg-white/[0.06]">
        <div className="px-4 pb-1 pt-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {t("counsel_problem_ghost_label")}
          </div>
          <textarea
            ref={problemReplyRef}
            className="mt-2 min-h-[5.5rem] w-full resize-none border-0 bg-transparent text-[12px] text-slate-800 outline-none ring-0 placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder={t("counsel_reply_host")}
            value={problemDraft}
            onChange={(e) => onProblemDraftChange(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200/45 px-3 py-2.5 dark:border-white/10">
          <div className="min-w-0 text-[9px] tabular-nums tracking-tight text-slate-500 dark:text-slate-400">
            <span>{t("counsel_input_char_count", { n: problemDraft.length })}</span>
            <span className="mx-1.5 opacity-50">·</span>
            <span>{t("counsel_input_stage", { stage: t("counsel_stage_problem") })}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300/90 bg-white/55 text-slate-700 transition hover:bg-white/85 disabled:opacity-40 dark:border-slate-500 dark:bg-slate-900/45 dark:text-slate-200 dark:hover:bg-slate-800/65"
              disabled={busy}
              title={t("counsel_send")}
              aria-label={t("counsel_send")}
              onClick={() => void onSubmitProblemUser()}
            >
              <Send className="h-4 w-4" strokeWidth={2} />
            </button>
            <button type="button" className={problemPrimaryCtaClass} disabled={busy} onClick={() => void onRunProblemTurn()}>
              {t("counsel_host_turn")}
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-white/[0.16] via-white/[0.08] to-slate-900/12 p-5 shadow-[0_8px_32px_rgba(15,23,42,0.07)] backdrop-blur-xl dark:border-white/10 dark:from-white/[0.07] dark:via-slate-900/35 dark:to-slate-950/65">
        <div className="font-mono text-[8px] font-medium uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          {t("counsel_summary_section_label")}
        </div>
        <p className="mt-1 text-[9px] leading-snug text-slate-500 dark:text-slate-400">{t("counsel_summary_edit_hint")}</p>
        <textarea
          ref={problemSummaryRef}
          className="mt-3 min-h-[6rem] w-full resize-none border-0 bg-white/[0.14] px-3 py-3 font-mono text-[11px] leading-relaxed text-slate-800 outline-none ring-0 placeholder:text-slate-400 dark:bg-black/25 dark:text-slate-100 dark:placeholder:text-slate-500"
          value={problemSummary}
          onChange={(e) => onProblemSummaryChange(e.target.value)}
        />
      </section>

      <label className="block pb-1">
        <span className="text-[8px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("counsel_slug")}</span>
        <input
          className="mt-1 w-full rounded-lg border border-slate-200/85 bg-white px-3 py-2 font-mono text-[10px] text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          title={t("counsel_slug_help")}
          value={slugKeywords}
          onChange={(e) => onSlugKeywordsChange(e.target.value)}
        />
      </label>
    </div>
  );
}
