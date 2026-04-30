import { memo, useState } from "react";
import { ChevronDown, ChevronRight, Link2, Plus, Trash2 } from "lucide-react";
import { useI18n } from "../../i18n/useI18n";
import type { SkillKey } from "../../store/useUiStore";
import type { CustomSkillRow } from "./assistantTypes";

export type AssistantSkillsBlockProps = {
  builtinWebSearch: boolean;
  builtinFinancialAnalyst: boolean;
  onToggleBuiltinSkill: (key: SkillKey) => void;
  customSkills: CustomSkillRow[];
  skillDetailsOpen: Record<string, boolean>;
  onToggleSkillDetails: (id: string) => void;
  onToggleCustomSkill: (id: string) => void;
  onUpdateSkillName: (id: string, name: string) => void;
  onUpdateSkillInstruction: (id: string, instruction: string) => void;
  onRemoveSkill: (id: string) => void;
  skillImportUrl: string;
  onSkillImportUrlChange: (value: string) => void;
  skillImportBusy: boolean;
  skillImportMessage: string;
  onFetchSkillFromUrl: () => void;
  newSkillName: string;
  onNewSkillNameChange: (value: string) => void;
  newSkillBody: string;
  onNewSkillBodyChange: (value: string) => void;
  onAddSkill: () => void;
};

function AssistantSkillsBlockInner(props: AssistantSkillsBlockProps) {
  const {
    builtinWebSearch,
    builtinFinancialAnalyst,
    onToggleBuiltinSkill,
    customSkills,
    skillDetailsOpen,
    onToggleSkillDetails,
    onToggleCustomSkill,
    onUpdateSkillName,
    onUpdateSkillInstruction,
    onRemoveSkill,
    skillImportUrl,
    onSkillImportUrlChange,
    skillImportBusy,
    skillImportMessage,
    onFetchSkillFromUrl,
    newSkillName,
    onNewSkillNameChange,
    newSkillBody,
    onNewSkillBodyChange,
    onAddSkill
  } = props;

  const { t } = useI18n();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {t("skills_lenses")}
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 text-[11px] text-slate-800 dark:text-slate-100">
          <span className="min-w-0 leading-tight">{t("skills_web_lens")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={builtinWebSearch}
            className="ios-toggle-compact"
            onClick={() => onToggleBuiltinSkill("webSearch")}
          >
            <span className="ios-toggle-track" data-on={builtinWebSearch} />
            <span className="ios-toggle-knob" data-on={builtinWebSearch} />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 text-[11px] text-slate-800 dark:text-slate-100">
          <span className="min-w-0 leading-tight">{t("skills_finance_lens")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={builtinFinancialAnalyst}
            className="ios-toggle-compact"
            onClick={() => onToggleBuiltinSkill("financialAnalyst")}
          >
            <span className="ios-toggle-track" data-on={builtinFinancialAnalyst} />
            <span className="ios-toggle-knob" data-on={builtinFinancialAnalyst} />
          </button>
        </div>
      </div>
      {customSkills.map((s) => {
        const detailsOpen = Boolean(skillDetailsOpen[s.id]);
        return (
          <div key={s.id} className="mt-3 border-t border-slate-200/80 pt-3 dark:border-slate-700/80">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-800 dark:text-slate-100">
                {s.name.trim() || t("custom_skill")}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={s.enabled}
                title={t("skills_use")}
                className="ios-toggle-compact shrink-0"
                onClick={() => onToggleCustomSkill(s.id)}
              >
                <span className="ios-toggle-track" data-on={s.enabled} />
                <span className="ios-toggle-knob" data-on={s.enabled} />
              </button>
              <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  title={detailsOpen ? t("skills_hide_instr") : t("skills_show_edit_instr")}
                  aria-expanded={detailsOpen}
                  onClick={() => onToggleSkillDetails(s.id)}
                >
                  {detailsOpen ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800 dark:hover:text-red-400"
                  title={t("skills_remove")}
                  onClick={() => onRemoveSkill(s.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              {detailsOpen ? (
                <div className="mt-1.5 space-y-1 pl-1">
                  <input
                    type="text"
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-800 outline-none dark:border-slate-600 dark:bg-slate-950/80 dark:text-slate-100"
                    placeholder={t("skills_name_ph")}
                    value={s.name}
                    onChange={(e) => onUpdateSkillName(s.id, e.target.value)}
                    aria-label={t("skills_name_ph")}
                  />
                  <textarea
                    className="w-full resize-y rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] leading-relaxed text-slate-800 dark:border-slate-600 dark:bg-slate-950/80 dark:text-slate-100"
                    rows={4}
                    spellCheck={false}
                    value={s.instruction}
                    onChange={(e) => onUpdateSkillInstruction(s.id, e.target.value)}
                    aria-label={t("skills_instr_label")}
                  />
                  <p className="text-[9px] text-slate-500 dark:text-slate-400">
                    {s.instruction.length.toLocaleString()}
                    {t("of_max")}
                  </p>
                </div>
              ) : null}
            </div>
          );
      })}

      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-2 py-1 text-left text-[10px] font-medium text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-900"
        onClick={() => setAddOpen((v) => !v)}
        aria-expanded={addOpen}
      >
        <span className="flex items-center gap-1">
          {addOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          {t("skills_add_manage")}
        </span>
        <span className="text-[9px] font-normal text-slate-500 dark:text-slate-500">{customSkills.length}</span>
      </button>

      {addOpen ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white/90 p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
          <p className="text-[10px] leading-snug text-slate-500 dark:text-slate-400">{t("skills_yours_help")}</p>

          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            <Link2 className="h-3 w-3" aria-hidden />
            {t("skills_import_url")}
          </div>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch">
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-[10px] text-slate-800 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-950/80 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="https://…/SKILL.md"
              value={skillImportUrl}
              disabled={skillImportBusy}
              onChange={(e) => onSkillImportUrlChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onFetchSkillFromUrl();
                }
              }}
            />
            <button
              type="button"
              className="ios-button flex shrink-0 items-center justify-center gap-1 whitespace-nowrap px-3 py-1.5 text-[11px] sm:self-stretch"
              disabled={skillImportBusy || !skillImportUrl.trim()}
              onClick={() => void onFetchSkillFromUrl()}
            >
              {skillImportBusy ? t("skills_fetching") : t("skills_fetch")}
            </button>
          </div>
          {skillImportMessage ? (
            <p
              className={`text-[10px] leading-snug ${
                /^(Added|已)/.test(skillImportMessage.trim()) || skillImportMessage.includes("已添加")
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-700 dark:text-red-400"
              }`}
            >
              {skillImportMessage}
            </p>
          ) : null}

          <div className="border-t border-slate-100 pt-2 dark:border-slate-700/80">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("skills_yours")}</div>
            <input
              className="mb-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder={t("skills_name_opt_ph")}
              value={newSkillName}
              onChange={(e) => onNewSkillNameChange(e.target.value)}
            />
            <textarea
              className="mb-1 w-full resize-none rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder={t("skills_body_ph")}
              rows={2}
              value={newSkillBody}
              onChange={(e) => onNewSkillBodyChange(e.target.value)}
            />
            <button type="button" className="ios-button flex w-full items-center justify-center gap-1 text-[11px]" onClick={onAddSkill}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {t("add_skill")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default memo(AssistantSkillsBlockInner);
