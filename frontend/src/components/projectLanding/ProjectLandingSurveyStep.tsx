import type { SurveyClarificationPayload } from "../../lib/mindmapBuild";
import { useI18n } from "../../i18n/useI18n";

type Props = {
  clarifyLoading: boolean;
  clarifyPayload: SurveyClarificationPayload | null;
  clarifyFetchFallback: boolean;
  toggleMcq: (questionId: string, optionId: string, allowMultiple: boolean) => void;
  mcqSelections: Record<string, string[]>;
  openFollowupText: string;
  setOpenFollowupText: (s: string) => void;
};

export function ProjectLandingSurveyStep(props: Props) {
  const { t } = useI18n();
  const { clarifyLoading, clarifyPayload, clarifyFetchFallback, toggleMcq, mcqSelections, openFollowupText, setOpenFollowupText } =
    props;

  if (clarifyLoading || !clarifyPayload) {
    return (
      <div className="space-y-2 py-6 text-center">
        <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200">{t("landing_clarify_loading")}</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400">{t("landing_clarify_loading_hint")}</p>
      </div>
    );
  }

  return (
    <>
      {clarifyFetchFallback ? (
        <p className="mb-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-2 py-1.5 text-[10px] text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/50 dark:text-amber-100">
          {t("landing_clarify_offline")}
        </p>
      ) : null}
      <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">{clarifyPayload.intro}</p>
      {clarifyPayload.clarification_note.trim() ? (
        <p className="mt-2 rounded-lg border border-sky-200/70 bg-sky-50/80 px-2.5 py-2 text-[10px] leading-snug text-sky-950 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-100">
          <span className="font-semibold">{t("landing_clarify_note_label")}</span> {clarifyPayload.clarification_note}
        </p>
      ) : null}
      <div className="mt-3 space-y-4">
        {clarifyPayload.questions.map((q) => {
          const selected = mcqSelections[q.id] ?? [];
          return (
            <fieldset
              key={q.id}
              className="rounded-xl border border-slate-200/80 bg-white/50 p-2.5 dark:border-slate-700/70 dark:bg-slate-950/35"
            >
              <legend className="mb-1.5 px-0.5 text-[11px] font-medium text-slate-800 dark:text-slate-100">
                {q.prompt}
              </legend>
              <p className="mb-2 text-[9px] text-slate-500 dark:text-slate-400">
                {q.allow_multiple ? t("landing_mcq_hint_multi") : t("landing_mcq_hint_single")}
              </p>
              <div className="flex flex-col gap-1.5">
                {q.options.map((o) => {
                  const checked = selected.includes(o.id);
                  if (q.allow_multiple) {
                    return (
                      <label
                        key={o.id}
                        className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-sky-600"
                          checked={checked}
                          onChange={() => toggleMcq(q.id, o.id, true)}
                        />
                        <span className="text-slate-800 dark:text-slate-100">{o.label}</span>
                      </label>
                    );
                  }
                  return (
                    <label
                      key={o.id}
                      className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
                    >
                      <input
                        type="radio"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 border-slate-300 text-sky-600"
                        name={`landing-mcq-${q.id}`}
                        checked={checked}
                        onChange={() => toggleMcq(q.id, o.id, false)}
                      />
                      <span className="text-slate-800 dark:text-slate-100">{o.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
      <label className="mt-4 block text-[11px] text-slate-700 dark:text-slate-200">
        {clarifyPayload.open_followup.prompt}
        <textarea
          className="mt-1 ios-input resize-y"
          rows={2}
          value={openFollowupText}
          placeholder={clarifyPayload.open_followup.placeholder || t("landing_survey_avoid_ph")}
          onChange={(e) => setOpenFollowupText(e.target.value)}
        />
      </label>
    </>
  );
}
