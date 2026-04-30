import type { CounselPersona } from "../../../lib/counselApi";
import { useI18n } from "../../../i18n/useI18n";
import { REVIEW_PERSONAS } from "../../../types/review";
import CounselBoardroomTable from "../CounselBoardroomTable";

export type CounselPhaseSetupProps = {
  personas: CounselPersona[];
  problemDraft: string;
  onProblemDraftChange: (v: string) => void;
  busy: boolean;
  rtLib: { name: string; instruction: string }[];
  presetOnPanel: (name: string) => boolean;
  togglePresetPersona: (name: string) => void;
  presetPreview: (name: string) => string;
  libRowOnPanel: (row: { name: string; instruction: string }) => boolean;
  toggleLibPersona: (name: string, instruction: string) => void;
  libEditName: string | null;
  onLibEditNameChange: (v: string | null) => void;
  libEditDraft: string;
  onLibEditDraftChange: (v: string) => void;
  onUpdatePersonaInLib?: (name: string, instruction: string) => void;
  onRemovePersonaFromLib?: (name: string) => void;
  newPersonaName: string;
  onNewPersonaNameChange: (v: string) => void;
  newPersonaInstruction: string;
  onNewPersonaInstructionChange: (v: string) => void;
  publicFigBusy: boolean;
  onGeneratePublicFigure: () => void;
  onAddCustomPersona: () => void;
  onRemovePersona: (id: string) => void;
  onStartProblem: () => void;
  persistLibHint: boolean;
};

export default function CounselPhaseSetup(props: CounselPhaseSetupProps) {
  const { t } = useI18n();
  const {
    personas,
    problemDraft,
    onProblemDraftChange,
    busy,
    rtLib,
    presetOnPanel,
    togglePresetPersona,
    presetPreview,
    libRowOnPanel,
    toggleLibPersona,
    libEditName,
    onLibEditNameChange,
    libEditDraft,
    onLibEditDraftChange,
    onUpdatePersonaInLib,
    onRemovePersonaFromLib,
    newPersonaName,
    onNewPersonaNameChange,
    newPersonaInstruction,
    onNewPersonaInstructionChange,
    publicFigBusy,
    onGeneratePublicFigure,
    onAddCustomPersona,
    persistLibHint,
    onRemovePersona,
    onStartProblem
  } = props;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[800px] flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto">
      <div className="flex flex-[2] shrink-0 flex-col items-stretch justify-center overflow-visible px-1 py-3">
        <CounselBoardroomTable
          variant="hero"
          personas={personas}
          centerText={problemDraft}
          centerPlaceholder={t("counsel_boardroom_placeholder")}
          setupMode
          onRemoveSeat={onRemovePersona}
          leadLabel={t("counsel_lead_councilor")}
          emptySeatAria={t("counsel_seat_empty")}
          hostChairLabel={t("counsel_host_chair")}
        />
        <div className="mt-2 text-[9px] tabular-nums text-slate-500 dark:text-slate-400">
          {t("counsel_personas_count", { n: personas.length })}
        </div>
      </div>

      <div className="mm-assistant-thin-scrollbar flex min-h-0 flex-[2] flex-col overflow-y-auto pr-1">
        <p className="text-[9px] leading-snug text-slate-500 dark:text-slate-400">{t("counsel_setup_help")}</p>
        <div className="mt-2 text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          {t("counsel_library_title")}
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {REVIEW_PERSONAS.map((pn) => {
            const on = presetOnPanel(pn);
            return (
              <button
                key={pn}
                type="button"
                title={presetPreview(pn)}
                disabled={(!on && personas.length >= 8) || busy}
                onClick={() => togglePresetPersona(pn)}
                className={[
                  "min-h-[2.25rem] rounded-full border px-1 py-1 text-center text-[8px] font-medium leading-tight transition",
                  on
                    ? "border-sky-500/40 bg-sky-500/[0.12] text-sky-950 opacity-[0.58] ring-1 ring-sky-400/25 dark:text-sky-100"
                    : "border-slate-200/80 bg-white/90 text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:hover:bg-slate-800/80"
                ].join(" ")}
              >
                {on ? "✓ " : ""}
                <span className="line-clamp-2">{pn}</span>
              </button>
            );
          })}
          {rtLib.map((x) => {
            const on = libRowOnPanel(x);
            return (
              <button
                key={`${x.name}::${x.instruction.slice(0, 24)}`}
                type="button"
                title={x.instruction}
                disabled={(!on && personas.length >= 8) || busy}
                onClick={() => toggleLibPersona(x.name, x.instruction)}
                className={[
                  "min-h-[2.25rem] rounded-full border px-1 py-1 text-center text-[8px] font-medium leading-tight transition",
                  on
                    ? "border-sky-500/40 bg-sky-500/[0.12] text-sky-950 opacity-[0.58] ring-1 ring-sky-400/25 dark:text-sky-100"
                    : "border-slate-200/80 bg-slate-100/80 text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-100"
                ].join(" ")}
              >
                {on ? "✓ " : ""}
                <span className="line-clamp-2">{x.name}</span>
              </button>
            );
          })}
        </div>

        <details className="mt-3 rounded-lg border border-slate-200/75 bg-white/50 dark:border-slate-600/50 dark:bg-slate-900/30">
          <summary className="cursor-pointer select-none px-2 py-2 text-[9px] font-medium text-slate-600 dark:text-slate-300">
            {t("counsel_manage_saved")}
          </summary>
          <div className="max-h-40 space-y-1 overflow-y-auto border-t border-slate-200/60 px-2 py-2 dark:border-slate-700/50">
            {rtLib.map((x) => (
              <div key={x.name} className="rounded border border-slate-200 px-2 py-1 dark:border-slate-600">
                {libEditName === x.name && onUpdatePersonaInLib ? (
                  <div className="space-y-1">
                    <div className="text-[10px] font-medium text-slate-800 dark:text-slate-100">{x.name}</div>
                    <textarea
                      className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] dark:border-slate-600 dark:bg-slate-900"
                      rows={4}
                      value={libEditDraft}
                      onChange={(e) => onLibEditDraftChange(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="ios-button py-0.5 text-[9px]"
                        onClick={() => {
                          onUpdatePersonaInLib(x.name, libEditDraft);
                          onLibEditNameChange(null);
                        }}
                      >
                        {t("counsel_lib_save")}
                      </button>
                      <button type="button" className="ios-button py-0.5 text-[9px]" onClick={() => onLibEditNameChange(null)}>
                        {t("counsel_lib_cancel")}
                      </button>
                      {onRemovePersonaFromLib ? (
                        <button
                          type="button"
                          className="py-0.5 text-[9px] text-red-600 hover:underline dark:text-red-400"
                          onClick={() => {
                            onRemovePersonaFromLib(x.name);
                            onLibEditNameChange(null);
                          }}
                        >
                          {t("counsel_lib_remove")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-[10px] font-medium text-slate-800 dark:text-slate-100">{x.name}</span>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {onUpdatePersonaInLib ? (
                        <button
                          type="button"
                          className="text-[9px] text-slate-600 underline dark:text-slate-400"
                          onClick={() => {
                            onLibEditNameChange(x.name);
                            onLibEditDraftChange(x.instruction);
                          }}
                        >
                          {t("counsel_lib_edit")}
                        </button>
                      ) : null}
                      {onRemovePersonaFromLib ? (
                        <button
                          type="button"
                          className="text-[9px] text-red-600 hover:underline dark:text-red-400"
                          onClick={() => onRemovePersonaFromLib(x.name)}
                        >
                          {t("counsel_lib_remove")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>

        <details className="mt-2 rounded-lg border border-slate-200/75 bg-white/50 p-2 dark:border-slate-600/50 dark:bg-slate-900/30">
          <summary className="cursor-pointer select-none text-[9px] font-semibold text-slate-600 dark:text-slate-300">
            {t("counsel_custom_toggle")}
          </summary>
          <div className="mt-2 space-y-2 border-t border-slate-200/60 pt-2 dark:border-slate-700/50">
            <label className="block text-[10px] text-slate-700 dark:text-slate-200">
              {t("rt_custom_name")}
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] dark:border-slate-600 dark:bg-slate-900"
                value={newPersonaName}
                onChange={(e) => onNewPersonaNameChange(e.target.value)}
                placeholder={t("rt_name_ph")}
              />
            </label>
            <label className="block text-[10px] text-slate-700 dark:text-slate-200">
              {t("rt_custom_instr")}
              <textarea
                className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] dark:border-slate-600 dark:bg-slate-900"
                rows={3}
                value={newPersonaInstruction}
                onChange={(e) => onNewPersonaInstructionChange(e.target.value)}
                placeholder={t("rt_instr_ph")}
              />
            </label>
            <button
              type="button"
              className="ios-button w-full py-1.5 text-[10px] disabled:opacity-50"
              disabled={personas.length >= 8 || publicFigBusy || !newPersonaName.trim()}
              onClick={() => void onGeneratePublicFigure()}
            >
              {publicFigBusy ? t("counsel_public_figure_busy") : t("counsel_public_figure_btn")}
            </button>
            <button
              type="button"
              className="ios-button-primary w-full py-1.5 text-[11px]"
              disabled={personas.length >= 8 || !newPersonaName.trim() || !newPersonaInstruction.trim()}
              onClick={() => onAddCustomPersona()}
            >
              {t("rt_add_panel")}
            </button>
            {persistLibHint ? (
              <p className="text-[9px] text-slate-500 dark:text-slate-400">{t("rt_saved_local")}</p>
            ) : null}
          </div>
        </details>
      </div>

      <div className="flex flex-[1] shrink-0 flex-col justify-end gap-2 border-t border-slate-200/60 pt-3 dark:border-slate-700/45">
        <label className="block shrink-0">
          <span className="text-[9px] font-medium text-slate-600 dark:text-slate-400">{t("counsel_problem_draft")}</span>
          <textarea
            className="mt-1 w-full resize-none rounded-2xl border border-slate-200 bg-white p-2.5 text-[11px] dark:border-slate-600 dark:bg-slate-900"
            rows={2}
            value={problemDraft}
            onChange={(e) => onProblemDraftChange(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="ios-button-primary w-full shrink-0 rounded-2xl py-2.5 text-[11px] font-semibold disabled:opacity-50"
          disabled={personas.length < 4 || personas.length > 8 || busy}
          onClick={onStartProblem}
        >
          {t("counsel_start_problem")}
        </button>
      </div>
    </div>
  );
}
