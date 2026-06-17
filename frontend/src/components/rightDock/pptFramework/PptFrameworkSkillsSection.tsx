import { Link2, Trash2 } from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";
import type { SkillKey } from "../../../store/useUiStore";
import type { PptCustomSkillRow } from "./types";

type Props = {
  skills: { webSearch: boolean; financialAnalyst: boolean };
  toggleSkill: (k: SkillKey) => void;
  webQuery: string;
  onWebQuery: (v: string) => void;
  customSkills: PptCustomSkillRow[];
  onSetCustomSkills: React.Dispatch<React.SetStateAction<PptCustomSkillRow[]>>;
  skillImportUrl: string;
  onSkillImportUrl: (v: string) => void;
  skillImportBusy: boolean;
  onFetchSkillUrl: () => void;
  skillImportMsg: string;
  sourceFileCount: number;
};

export default function PptFrameworkSkillsSection(props: Props) {
  const { t } = useI18n();
  const {
    skills,
    toggleSkill,
    webQuery,
    onWebQuery,
    customSkills,
    onSetCustomSkills,
    skillImportUrl,
    onSkillImportUrl,
    skillImportBusy,
    onFetchSkillUrl,
    skillImportMsg,
    sourceFileCount
  } = props;

  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{t("ppt_skills")}</div>
      <div className="mb-2 flex flex-wrap gap-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200/80 bg-white/80 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-900/60">
          <input type="checkbox" checked={skills.webSearch} onChange={() => toggleSkill("webSearch" as SkillKey)} />
          <span>{t("skills_web_lens")}</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200/80 bg-white/80 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-900/60">
          <input
            type="checkbox"
            checked={skills.financialAnalyst}
            onChange={() => toggleSkill("financialAnalyst" as SkillKey)}
          />
          <span>{t("skills_finance_lens")}</span>
        </label>
      </div>
      {skills.webSearch ? (
        <input
          className="ios-field mb-2 w-full text-xs"
          value={webQuery}
          onChange={(e) => onWebQuery(e.target.value)}
          placeholder={t("ppt_web_q_ph")}
        />
      ) : null}
      <div className="mb-2 rounded-lg border border-slate-200/80 bg-white/70 p-2 dark:border-slate-600 dark:bg-slate-900/50">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
          <Link2 className="h-3 w-3" />
          {t("ppt_gh_skill")}
        </div>
        <div className="flex gap-1">
          <input
            className="ios-field min-w-0 flex-1 font-mono text-[10px]"
            value={skillImportUrl}
            onChange={(e) => onSkillImportUrl(e.target.value)}
            placeholder="https://raw.githubusercontent.com/…"
          />
          <button
            type="button"
            className="ios-button shrink-0 px-2 text-[10px]"
            disabled={skillImportBusy}
            onClick={onFetchSkillUrl}
          >
            {skillImportBusy ? t("skills_fetching") : t("skills_fetch")}
          </button>
        </div>
        {skillImportMsg ? (
          <div className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">{skillImportMsg}</div>
        ) : null}
      </div>
      {customSkills.length > 0 ? (
        <ul className="space-y-1.5">
          {customSkills.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-slate-200/60 bg-slate-50/80 p-2 dark:border-slate-600 dark:bg-slate-800/50"
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <input
                  className="ios-field min-w-0 flex-1 py-0.5 text-[11px]"
                  value={s.name}
                  onChange={(e) =>
                    onSetCustomSkills((p) => p.map((r) => (r.id === s.id ? { ...r, name: e.target.value } : r)))
                  }
                />
                <div className="flex shrink-0 items-center gap-1">
                  <label className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={() =>
                        onSetCustomSkills((p) => p.map((r) => (r.id === s.id ? { ...r, enabled: !r.enabled } : r)))
                      }
                    />
                    {t("ppt_use_skill")}
                  </label>
                  <button
                    type="button"
                    className="rounded p-0.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400"
                    title={t("skills_remove")}
                    onClick={() => onSetCustomSkills((p) => p.filter((r) => r.id !== s.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <textarea
                className="ios-field min-h-[48px] w-full py-1 text-[10px]"
                value={s.instruction}
                onChange={(e) =>
                  onSetCustomSkills((p) => p.map((r) => (r.id === s.id ? { ...r, instruction: e.target.value } : r)))
                }
              />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-500">
        {t("ppt_source_hint", { n: sourceFileCount })}
      </p>
    </div>
  );
}
