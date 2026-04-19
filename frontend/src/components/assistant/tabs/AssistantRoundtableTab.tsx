import { memo } from "react";
import { Trash2 } from "lucide-react";
import { REVIEW_PERSONAS } from "../../../types/review";
import type { RoundtablePersona } from "../assistantTypes";

export type AssistantRoundtableTabProps = {
  rtPersonas: RoundtablePersona[];
  rtLib: { name: string; instruction: string }[];
  rtNewName: string;
  setRtNewName: (v: string) => void;
  rtNewInstruction: string;
  setRtNewInstruction: (v: string) => void;
  onAddPreset: (name: string) => void;
  onAddFromLib: (name: string, instruction: string) => void;
  onRemovePersona: (id: string) => void;
  onAddCustom: () => void;
};

function AssistantRoundtableTabInner(props: AssistantRoundtableTabProps) {
  const {
    rtPersonas,
    rtLib,
    rtNewName,
    setRtNewName,
    rtNewInstruction,
    setRtNewInstruction,
    onAddPreset,
    onAddFromLib,
    onRemovePersona,
    onAddCustom
  } = props;

  return (
    <div className="mb-3 ios-card p-3">
      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">Roundtable</div>
      <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
        Multi-persona discussion on the <span className="font-medium">selected node</span>. Run rounds, then summarize into concrete map
        edits and apply after you confirm.
      </p>
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recommended personas</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {REVIEW_PERSONAS.map((pn) => (
          <button
            key={pn}
            type="button"
            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => onAddPreset(pn)}
          >
            + {pn}
          </button>
        ))}
      </div>
      {rtLib.length > 0 ? (
        <>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Saved custom personas</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {rtLib.map((row) => (
              <button
                key={`${row.name}::${row.instruction.slice(0, 24)}`}
                type="button"
                className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-100 dark:hover:bg-sky-900/80"
                title={row.instruction}
                onClick={() => onAddFromLib(row.name, row.instruction)}
              >
                + {row.name}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Panel ({rtPersonas.length})</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {rtPersonas.length === 0 ? (
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Add at least one persona.</span>
        ) : (
          rtPersonas.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white pl-2 pr-0.5 text-[10px] text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              {p.name}
              <button
                type="button"
                className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800 dark:hover:text-red-400"
                aria-label={`Remove ${p.name}`}
                onClick={() => onRemovePersona(p.id)}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-[11px] text-slate-700 dark:text-slate-200">
          Custom name
          <input
            className="mt-1 ios-input py-1.5"
            value={rtNewName}
            onChange={(e) => setRtNewName(e.target.value)}
            placeholder="e.g. Chief Medical Officer"
          />
        </label>
        <label className="block text-[11px] text-slate-700 dark:text-slate-200 sm:col-span-2">
          Custom instruction
          <textarea
            className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-800 dark:border-slate-600 dark:bg-slate-950/80 dark:text-slate-100"
            rows={2}
            value={rtNewInstruction}
            onChange={(e) => setRtNewInstruction(e.target.value)}
            placeholder="Voice, expertise, and what they should optimize for in discussion…"
          />
        </label>
      </div>
      <button type="button" className="mt-2 w-full ios-button" onClick={() => onAddCustom()}>
        Add custom persona to panel
      </button>
      <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">Custom personas are also saved locally for quick reuse (+ buttons above).</p>
    </div>
  );
}

export default memo(AssistantRoundtableTabInner);
