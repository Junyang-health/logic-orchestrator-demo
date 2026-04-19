import { memo } from "react";
import { ChevronDown, ChevronRight, Link2, Plus, Trash2 } from "lucide-react";
import type { SkillKey } from "../../store/useUiStore";
import type { CustomSkillRow } from "./assistantTypes";

export type AssistantSkillsBlockProps = {
  skillsBlockExpanded: boolean;
  onToggleSkillsBlockExpanded: () => void;
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
    skillsBlockExpanded,
    onToggleSkillsBlockExpanded,
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

  return (
    <>
      <button
        type="button"
        className="mb-2 flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/90 px-2 py-1.5 text-left shadow-sm transition hover:bg-white dark:border-slate-600 dark:bg-slate-900/70 dark:hover:bg-slate-900"
        onClick={onToggleSkillsBlockExpanded}
        aria-expanded={skillsBlockExpanded}
      >
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          {skillsBlockExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          Skills & lenses
        </span>
        <span className="text-[9px] font-normal text-slate-500 dark:text-slate-400">{skillsBlockExpanded ? "Hide" : "Show"}</span>
      </button>

      {skillsBlockExpanded ? (
        <>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Builtin skills</div>
          <label className="mb-1 flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100">
            <input type="checkbox" checked={builtinWebSearch} onChange={() => onToggleBuiltinSkill("webSearch")} />
            <span>Web search lens</span>
          </label>
          <label className="mb-3 flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100">
            <input type="checkbox" checked={builtinFinancialAnalyst} onChange={() => onToggleBuiltinSkill("financialAnalyst")} />
            <span>Financial analyst lens</span>
          </label>

          <div className="mb-1 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your skills</div>
          </div>
          <p className="mb-2 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
            Add instructions the model should follow (e.g. “Prefer EU regulatory framing”). Toggle each on or off. Use{" "}
            <span className="font-medium text-slate-700 dark:text-slate-200">Show details</span> per skill to view or edit the full text.
          </p>

          <div className="mb-3 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              Import from URL
            </div>
            <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
              Paste a <span className="font-medium text-slate-700 dark:text-slate-200">Raw GitHub</span> link (
              <code className="rounded bg-slate-100 px-0.5 dark:bg-slate-800">raw.githubusercontent.com/…</code>
              ), a normal GitHub file page (we convert blob → raw), a{" "}
              <code className="rounded bg-slate-100 px-0.5 dark:bg-slate-800">github.com/…/raw/…</code> URL, or a{" "}
              <span className="font-medium">gist</span> raw URL. The backend downloads the text and appends a skill.
            </p>
            <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-stretch">
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-[10px] text-slate-800 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-950/80 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="https://raw.githubusercontent.com/owner/repo/main/SKILL.md"
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
                {skillImportBusy ? "Fetching…" : "Fetch & add"}
              </button>
            </div>
            {skillImportMessage ? (
              <p
                className={`mt-1.5 text-[10px] leading-snug ${
                  skillImportMessage.startsWith("Added") ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                }`}
              >
                {skillImportMessage}
              </p>
            ) : null}
          </div>

          <div className="mb-2 space-y-1.5">
            {customSkills.map((s) => {
              const detailsOpen = Boolean(skillDetailsOpen[s.id]);
              return (
                <div
                  key={s.id}
                  className="rounded-lg border border-slate-200 bg-white p-2 text-[10px] shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0"
                      checked={s.enabled}
                      onChange={() => onToggleCustomSkill(s.id)}
                      title="Use this skill in requests"
                    />
                    <input
                      type="text"
                      className="min-w-0 flex-1 rounded-md border border-transparent bg-slate-50/80 px-2 py-1 text-[11px] font-medium text-slate-800 outline-none ring-sky-400/40 placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-2 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-600 dark:focus:bg-slate-950"
                      placeholder="Skill name"
                      value={s.name}
                      onChange={(e) => onUpdateSkillName(s.id, e.target.value)}
                      aria-label="Skill name"
                    />
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      title={detailsOpen ? "Hide instructions" : "Show or edit instructions"}
                      aria-expanded={detailsOpen}
                      onClick={() => onToggleSkillDetails(s.id)}
                    >
                      {detailsOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800 dark:hover:text-red-400"
                      title="Remove skill"
                      onClick={() => onRemoveSkill(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {!detailsOpen ? (
                    <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-700/80">
                      <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Instructions hidden</p>
                      <p className="mt-0.5 text-[9px] leading-snug text-slate-500 dark:text-slate-400">
                        {s.instruction.length.toLocaleString()} characters —{" "}
                        <button
                          type="button"
                          className="font-semibold text-sky-700 underline decoration-sky-700/40 underline-offset-2 hover:text-sky-800 hover:decoration-sky-800 dark:text-sky-400 dark:hover:text-sky-300"
                          onClick={() => onToggleSkillDetails(s.id)}
                        >
                          Show details
                        </button>{" "}
                        or use the chevron.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-1 pl-0.5">
                      <label className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Instructions
                      </label>
                      <textarea
                        className="w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-[10px] leading-relaxed text-slate-800 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-950/80 dark:text-slate-100 dark:placeholder:text-slate-500"
                        rows={6}
                        spellCheck={false}
                        value={s.instruction}
                        onChange={(e) => onUpdateSkillInstruction(s.id, e.target.value)}
                        aria-label="Skill instructions"
                      />
                      <div className="flex items-center justify-between text-[9px] text-slate-500 dark:text-slate-400">
                        <span>{s.instruction.length.toLocaleString()} / 8,000</span>
                        <button
                          type="button"
                          className="font-medium text-sky-700 underline decoration-sky-700/30 hover:decoration-sky-700 dark:text-sky-400"
                          onClick={() => onToggleSkillDetails(s.id)}
                        >
                          Hide details
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <input
            className="mb-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="Skill name (optional)"
            value={newSkillName}
            onChange={(e) => onNewSkillNameChange(e.target.value)}
          />
          <textarea
            className="mb-1 w-full resize-none rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="Instruction for the model…"
            rows={2}
            value={newSkillBody}
            onChange={(e) => onNewSkillBodyChange(e.target.value)}
          />
          <button type="button" className="ios-button mb-3 flex w-full items-center justify-center gap-1 text-[11px]" onClick={onAddSkill}>
            <Plus className="h-3.5 w-3.5" />
            Add skill
          </button>
        </>
      ) : (
        <p className="mb-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-2 py-2 text-[10px] leading-snug text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
          {customSkills.length} custom skill{customSkills.length === 1 ? "" : "s"} · Builtin lenses can be expanded from the header above when
          you need them.
        </p>
      )}
    </>
  );
}

export default memo(AssistantSkillsBlockInner);
