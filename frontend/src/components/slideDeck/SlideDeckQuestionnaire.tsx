import { Check, ChevronLeft, ChevronRight, Images, LayoutTemplate, MessagesSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/useI18n";
import {
  listSlideReferenceAssets,
  putSlideBuildPreferences,
  uploadSlideReferenceAssets
} from "../../lib/slideBuildApi";

type Props = {
  open: boolean;
  backendBase: string;
  sessionId: string | null;
  skills: { webSearch: boolean; financialAnalyst: boolean };
  slideCount: number;
  initialStyleNotes?: string;
  onSubmit: (assembledStyleNotes: string) => void;
};

type WizardStep = "style" | "references" | "instructions";

const STEP_ORDER: WizardStep[] = ["style", "references", "instructions"];

const DESIGN_LABELS = {
  density: { compact: "Compact", balanced: "Balanced", spacious: "Spacious" },
  surface: { light: "Light", dark: "Dark", glass: "Glass", mono: "Monochrome" },
  typography: { system: "System sans", serif: "Serif", condensed: "Condensed" },
  imagery: { diagram: "Diagrams", illustrative: "Illustration", photo: "Photography" },
  rhythm: { minimal: "Minimal", standard: "Consulting", expressive: "Expressive" }
} as const;

export default function SlideDeckQuestionnaire(props: Props) {
  const { open, backendBase, sessionId, skills, slideCount, initialStyleNotes, onSubmit } = props;
  const { t } = useI18n();

  const [step, setStep] = useState<WizardStep>("style");

  const [globalNotes, setGlobalNotes] = useState("");
  const [webLens, setWebLens] = useState("");
  const [financeLens, setFinanceLens] = useState("");
  const [extraSkills, setExtraSkills] = useState("");

  const [density, setDensity] = useState("balanced");
  const [surface, setSurface] = useState("light");
  const [typography, setTypography] = useState("system");
  const [imagery, setImagery] = useState("diagram");
  const [rhythm, setRhythm] = useState("standard");

  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [storedRefNames, setStoredRefNames] = useState<string[]>([]);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState("");

  useEffect(() => {
    if (!open || !sessionId) return;
    let cancelled = false;
    listSlideReferenceAssets(backendBase, sessionId)
      .then((names) => {
        if (!cancelled) setStoredRefNames(names);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [open, backendBase, sessionId]);

  useEffect(() => {
    if (!open) return;
    const seed = initialStyleNotes?.trim() || "";
    if (seed) {
      setGlobalNotes((prev) => (prev.trim() ? prev : seed));
    }
    setStep("style");
  }, [open, initialStyleNotes]);

  const designChoices = (): Record<string, string> => ({
    density,
    surface,
    typography,
    imagery,
    rhythm
  });

  const designParagraph = (): string =>
    [
      `${t("slide_deck_design_density")}: ${density}`,
      `${t("slide_deck_design_surface")}: ${surface}`,
      `${t("slide_deck_design_typography")}: ${typography}`,
      `${t("slide_deck_design_imagery")}: ${imagery}`,
      `${t("slide_deck_design_rhythm")}: ${rhythm}`
    ].join("\n");

  const assembled = (refNamesMerged: readonly string[]): string => {
    const parts: string[] = [];
    parts.push(`${t("slide_deck_q_label_design")}\n${designParagraph()}`);
    parts.push(`${t("slide_deck_q_label_design_json")}\n${JSON.stringify(designChoices())}`);
    if (globalNotes.trim()) parts.push(`${t("slide_deck_q_label_global")}\n${globalNotes.trim()}`);
    if (skills.webSearch && webLens.trim()) parts.push(`${t("slide_deck_q_label_web")}\n${webLens.trim()}`);
    if (skills.financialAnalyst && financeLens.trim()) parts.push(`${t("slide_deck_q_label_finance")}\n${financeLens.trim()}`);
    if (extraSkills.trim()) parts.push(`${t("slide_deck_q_label_extra")}\n${extraSkills.trim()}`);
    if (refNamesMerged.length > 0) {
      parts.push(`${t("slide_deck_q_label_refs")}\n${refNamesMerged.map((n) => `- ${n}`).join("\n")}`);
    }
    const body = parts.join("\n\n");
    if (!body.trim()) return t("slide_deck_style_fallback_default");
    return `${t("slide_deck_style_prefix", { slides: slideCount })}\n${body}`;
  };

  const handleSubmit = async () => {
    if (!sessionId) {
      setSubmitErr(t("slide_deck_wizard_no_session"));
      return;
    }
    setSubmitErr("");
    setSubmitBusy(true);
    try {
      let mergedRefs = [...storedRefNames];
      if (refFiles.length > 0) {
        const uploaded = await uploadSlideReferenceAssets(backendBase, sessionId, refFiles);
        mergedRefs = [...new Set([...mergedRefs, ...uploaded])];
        setStoredRefNames(mergedRefs);
        setRefFiles([]);
      } else {
        mergedRefs = [...new Set(mergedRefs)];
      }

      const notes = assembled(mergedRefs);
      await putSlideBuildPreferences(backendBase, sessionId, {
        style_notes_full: notes,
        design: designChoices(),
        reference_stored_names: mergedRefs
      });
      onSubmit(notes);
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : t("slide_deck_wizard_submit_err"));
    } finally {
      setSubmitBusy(false);
    }
  };

  const summaryCards = useMemo(
    () => [
      `${DESIGN_LABELS.density[density as keyof typeof DESIGN_LABELS.density]} density`,
      `${DESIGN_LABELS.surface[surface as keyof typeof DESIGN_LABELS.surface]} surface`,
      `${DESIGN_LABELS.typography[typography as keyof typeof DESIGN_LABELS.typography]} type`,
      `${DESIGN_LABELS.imagery[imagery as keyof typeof DESIGN_LABELS.imagery]} imagery`,
      `${DESIGN_LABELS.rhythm[rhythm as keyof typeof DESIGN_LABELS.rhythm]} rhythm`
    ],
    [density, surface, typography, imagery, rhythm]
  );

  if (!open) return null;

  const stepIndex = STEP_ORDER.indexOf(step);
  const canGoBack = stepIndex > 0;
  const canGoForward = stepIndex < STEP_ORDER.length - 1;

  const segCls = (active: boolean) =>
    [
      "rounded-xl px-3 py-2 text-[12px] font-semibold transition",
      active
        ? "bg-violet-600 text-white shadow-sm dark:bg-violet-500"
        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    ].join(" ");

  const stepCardClass = "rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80";

  return (
    <div className="absolute inset-x-5 top-5 bottom-5 z-[40] flex items-start justify-center pointer-events-none">
      <div
        role="dialog"
        aria-labelledby="slide-deck-wizard-title"
        className="pointer-events-auto flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-slate-200/85 bg-white shadow-[0_32px_90px_-28px_rgba(15,23,42,0.45)] dark:border-slate-700/85 dark:bg-slate-900"
      >
        <div className="border-b border-[var(--mm-border-subtle)] px-6 py-5">
          <h2 id="slide-deck-wizard-title" className="text-xl font-semibold text-slate-900 dark:text-white">
            {t("slide_deck_wizard_title")}
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">
            {t("slide_deck_wizard_intro")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { id: "style", label: "Style", icon: <LayoutTemplate className="h-4 w-4" /> },
              { id: "references", label: "References", icon: <Images className="h-4 w-4" /> },
              { id: "instructions", label: "Instructions", icon: <MessagesSquare className="h-4 w-4" /> }
            ].map((item, idx) => {
              const active = step === item.id;
              const done = stepIndex > idx;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold transition",
                    active
                      ? "border-violet-400 bg-violet-500/12 text-violet-700 dark:border-violet-400/60 dark:text-violet-200"
                      : "border-slate-200 bg-white/75 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
                  ].join(" ")}
                  onClick={() => setStep(item.id as WizardStep)}
                >
                  {done ? <Check className="h-4 w-4" /> : item.icon}
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-h-0 overflow-y-auto px-6 py-5">
            {step === "style" ? (
              <div className="space-y-4">
                <div className={stepCardClass}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Design direction
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <fieldset className="space-y-2">
                      <legend className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_design_density")}</legend>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={segCls(density === "compact")} onClick={() => setDensity("compact")}>{t("slide_deck_density_compact")}</button>
                        <button type="button" className={segCls(density === "balanced")} onClick={() => setDensity("balanced")}>{t("slide_deck_density_balanced")}</button>
                        <button type="button" className={segCls(density === "spacious")} onClick={() => setDensity("spacious")}>{t("slide_deck_density_spacious")}</button>
                      </div>
                    </fieldset>
                    <fieldset className="space-y-2">
                      <legend className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_design_surface")}</legend>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={segCls(surface === "light")} onClick={() => setSurface("light")}>{t("slide_deck_surface_light")}</button>
                        <button type="button" className={segCls(surface === "dark")} onClick={() => setSurface("dark")}>{t("slide_deck_surface_dark")}</button>
                        <button type="button" className={segCls(surface === "glass")} onClick={() => setSurface("glass")}>{t("slide_deck_surface_glass")}</button>
                        <button type="button" className={segCls(surface === "mono")} onClick={() => setSurface("mono")}>{t("slide_deck_surface_mono")}</button>
                      </div>
                    </fieldset>
                    <fieldset className="space-y-2">
                      <legend className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_design_typography")}</legend>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={segCls(typography === "system")} onClick={() => setTypography("system")}>{t("slide_deck_type_system")}</button>
                        <button type="button" className={segCls(typography === "serif")} onClick={() => setTypography("serif")}>{t("slide_deck_type_serif")}</button>
                        <button type="button" className={segCls(typography === "condensed")} onClick={() => setTypography("condensed")}>{t("slide_deck_type_condensed")}</button>
                      </div>
                    </fieldset>
                    <fieldset className="space-y-2">
                      <legend className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_design_imagery")}</legend>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={segCls(imagery === "diagram")} onClick={() => setImagery("diagram")}>{t("slide_deck_imagery_diagram")}</button>
                        <button type="button" className={segCls(imagery === "illustrative")} onClick={() => setImagery("illustrative")}>{t("slide_deck_imagery_illus")}</button>
                        <button type="button" className={segCls(imagery === "photo")} onClick={() => setImagery("photo")}>{t("slide_deck_imagery_photo")}</button>
                      </div>
                    </fieldset>
                  </div>
                </div>

                <div className={stepCardClass}>
                  <div className="text-[12px] font-semibold text-slate-800 dark:text-slate-100">{t("slide_deck_design_rhythm")}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={segCls(rhythm === "minimal")} onClick={() => setRhythm("minimal")}>{t("slide_deck_rhythm_minimal")}</button>
                    <button type="button" className={segCls(rhythm === "standard")} onClick={() => setRhythm("standard")}>{t("slide_deck_rhythm_standard")}</button>
                    <button type="button" className={segCls(rhythm === "expressive")} onClick={() => setRhythm("expressive")}>{t("slide_deck_rhythm_expressive")}</button>
                  </div>
                </div>
              </div>
            ) : null}

            {step === "references" ? (
              <div className="space-y-4">
                <div className={stepCardClass}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Reference files
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
                    Upload brand examples, prior decks, PDFs, image boards, or charts you want the slide generator to echo.
                  </p>
                  <label className="mt-4 block">
                    <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_ref_upload_label")}</span>
                    <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{t("slide_deck_ref_upload_help")}</p>
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.png,.jpg,.jpeg,.webp"
                      className="mt-3 block w-full text-[13px] text-slate-700 file:rounded-xl file:border-0 file:bg-violet-600 file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-white dark:text-slate-200 dark:file:bg-violet-500"
                      onChange={(e) => setRefFiles(Array.from(e.target.files || []))}
                    />
                  </label>
                </div>

                {(storedRefNames.length > 0 || refFiles.length > 0) && (
                  <div className={stepCardClass}>
                    <div className="text-[12px] font-semibold text-slate-800 dark:text-slate-100">Loaded references</div>
                    <div className="mt-3 space-y-2 text-[13px] text-slate-600 dark:text-slate-300">
                      {storedRefNames.length ? (
                        <div>
                          <span className="font-semibold">{t("slide_deck_ref_on_server")}:</span> {storedRefNames.join(", ")}
                        </div>
                      ) : null}
                      {refFiles.length ? (
                        <div>
                          <span className="font-semibold">{t("slide_deck_ref_pending")}:</span> {refFiles.map((f) => f.name).join(", ")}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {step === "instructions" ? (
              <div className="space-y-4">
                <div className={stepCardClass}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Deck instructions
                  </div>
                  <div className="mt-3 space-y-4">
                    <label className="block">
                      <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_q_global")}</span>
                      <textarea
                        className="mt-1.5 min-h-[7rem] w-full rounded-2xl border border-slate-200/90 bg-white p-3 text-[14px] text-slate-800 shadow-inner dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                        placeholder={t("slide_deck_q_global_ph")}
                        value={globalNotes}
                        onChange={(e) => setGlobalNotes(e.target.value)}
                      />
                    </label>

                    {skills.webSearch ? (
                      <label className="block">
                        <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_q_web")}</span>
                        <textarea
                          className="mt-1.5 min-h-[5rem] w-full rounded-2xl border border-slate-200/90 bg-white p-3 text-[14px] text-slate-800 shadow-inner dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                          placeholder={t("slide_deck_q_web_ph")}
                          value={webLens}
                          onChange={(e) => setWebLens(e.target.value)}
                        />
                      </label>
                    ) : null}

                    {skills.financialAnalyst ? (
                      <label className="block">
                        <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_q_finance")}</span>
                        <textarea
                          className="mt-1.5 min-h-[5rem] w-full rounded-2xl border border-slate-200/90 bg-white p-3 text-[14px] text-slate-800 shadow-inner dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                          placeholder={t("slide_deck_q_finance_ph")}
                          value={financeLens}
                          onChange={(e) => setFinanceLens(e.target.value)}
                        />
                      </label>
                    ) : null}

                    <label className="block">
                      <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_q_extra_skills")}</span>
                      <textarea
                        className="mt-1.5 min-h-[5rem] w-full rounded-2xl border border-slate-200/90 bg-white p-3 text-[14px] text-slate-800 shadow-inner dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                        placeholder={t("slide_deck_q_extra_skills_ph")}
                        value={extraSkills}
                        onChange={(e) => setExtraSkills(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="hidden border-l border-[var(--mm-border-subtle)] bg-slate-50 px-5 py-5 lg:block dark:bg-slate-950/55">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Live summary
            </div>
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3 dark:border-slate-700 dark:bg-slate-900/80">
                <div className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">Style bundle</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {summaryCards.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3 dark:border-slate-700 dark:bg-slate-900/80">
                <div className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">References</div>
                <div className="mt-2 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
                  {storedRefNames.length + refFiles.length > 0
                    ? `${storedRefNames.length} saved, ${refFiles.length} pending upload`
                    : "No reference files yet"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3 dark:border-slate-700 dark:bg-slate-900/80">
                <div className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">Instruction focus</div>
                <div className="mt-2 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
                  {globalNotes.trim()
                    ? globalNotes.trim().slice(0, 180) + (globalNotes.trim().length > 180 ? "…" : "")
                    : "No deck-wide notes yet"}
                </div>
              </div>
            </div>
          </aside>
        </div>

        {submitErr ? (
          <div className="mx-6 mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100">
            {submitErr}
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-[var(--mm-border-subtle)] px-6 py-4">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            onClick={() => setStep(STEP_ORDER[Math.max(0, stepIndex - 1)]!)}
            disabled={!canGoBack || submitBusy}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          <div className="text-[12px] text-slate-500 dark:text-slate-400">
            Step {stepIndex + 1} of {STEP_ORDER.length}
          </div>

          {canGoForward ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40 dark:bg-violet-500"
              onClick={() => setStep(STEP_ORDER[Math.min(STEP_ORDER.length - 1, stepIndex + 1)]!)}
              disabled={submitBusy}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl bg-violet-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow disabled:opacity-50 dark:bg-violet-500"
              disabled={submitBusy}
              onClick={() => void handleSubmit()}
            >
              {submitBusy ? t("slide_deck_wizard_submitting") : t("slide_deck_wizard_submit")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
