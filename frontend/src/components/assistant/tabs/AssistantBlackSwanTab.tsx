import { memo } from "react";
import { bsMitKey, type BlackSwanRunBundle, type BlackSwanScenario } from "../assistantTypes";

export type AssistantBlackSwanTabProps = {
  selectedNodeId: string | undefined;
  simBusy: boolean;
  bsScenarios: BlackSwanScenario[] | null;
  bsSelectedScenarioIds: Set<string>;
  onToggleScenario: (scenarioId: string) => void;
  bsRunBundle: BlackSwanRunBundle | null;
  bsMitigationPick: Set<string>;
  onToggleMitigation: (key: string) => void;
  onScan: () => void;
  onRun: () => void;
  onApply: () => void;
};

function AssistantBlackSwanTabInner(props: AssistantBlackSwanTabProps) {
  const {
    selectedNodeId,
    simBusy,
    bsScenarios,
    bsSelectedScenarioIds,
    onToggleScenario,
    bsRunBundle,
    bsMitigationPick,
    onToggleMitigation,
    onScan,
    onRun,
    onApply
  } = props;

  return (
    <div className="mb-3 ios-card p-3">
      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">Black Swan simulation</div>
      <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
        Select a branch node on the canvas, scan for five MECE-scoped tail-risk scenarios, run stress analysis on your picks,
        then apply chosen mitigations to the mindmap.
      </p>
      {!selectedNodeId ? (
        <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-300">Select a node on the canvas to anchor this simulation.</p>
      ) : null}

      <button
        type="button"
        className="mt-3 w-full ios-button-primary"
        disabled={simBusy || !selectedNodeId}
        onClick={() => void onScan()}
      >
        {simBusy && !bsScenarios ? "Scanning…" : "1. Scan — top 5 black swan scenarios (MECE)"}
      </button>

      {bsScenarios && bsScenarios.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            2. Select scenario(s) to simulate
          </div>
          <ul className="max-h-52 space-y-2 overflow-y-auto text-[10px]">
            {bsScenarios.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-slate-200 bg-white/90 p-2 dark:border-slate-600 dark:bg-slate-900/80"
              >
                <label className="flex cursor-pointer gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={bsSelectedScenarioIds.has(s.id)}
                    onChange={() => onToggleScenario(s.id)}
                  />
                  <span>
                    <span className="rounded bg-slate-100 px-1 font-mono text-[9px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {s.mece_axis}
                    </span>{" "}
                    <span className="font-medium text-slate-800 dark:text-slate-100">{s.title}</span>
                    <span className="mt-0.5 block text-slate-600 dark:text-slate-300">{s.summary}</span>
                    {s.why_relevant ? (
                      <span className="mt-0.5 block text-[9px] text-slate-500 dark:text-slate-400">{s.why_relevant}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="w-full rounded-lg border border-sky-300 bg-sky-50 py-2 text-[11px] font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-900/80"
            disabled={simBusy || bsSelectedScenarioIds.size < 1}
            onClick={() => void onRun()}
          >
            {simBusy && bsScenarios ? "Running simulation…" : "3. Run simulation — impacts, gaps, mitigations"}
          </button>
        </div>
      ) : null}

      {bsRunBundle && bsRunBundle.results.length > 0 ? (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-600">
          {bsRunBundle.executive_summary ? (
            <div className="rounded-md bg-slate-50 p-2 text-[10px] text-slate-700 dark:bg-slate-800/80 dark:text-slate-200">
              <span className="font-semibold">Summary</span>
              <p className="mt-1 whitespace-pre-wrap">{bsRunBundle.executive_summary}</p>
            </div>
          ) : null}
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            4. Review &amp; 5. Select mitigation(s) to add to the map
          </div>
          <div className="max-h-64 space-y-3 overflow-y-auto">
            {bsRunBundle.results.map((block) => {
              const scen = bsScenarios?.find((x) => x.id === block.scenario_id);
              return (
                <div
                  key={block.scenario_id}
                  className="rounded-lg border border-slate-200 bg-white/90 p-2 text-[10px] dark:border-slate-600 dark:bg-slate-900/80"
                >
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{scen?.title || block.scenario_id}</div>
                  <div className="mt-1 text-[9px] font-semibold uppercase text-slate-500">Potential impacts</div>
                  <ul className="list-inside list-disc text-slate-600 dark:text-slate-300">
                    {block.potential_impacts.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                  <div className="mt-1 text-[9px] font-semibold uppercase text-slate-500">Gaps to address</div>
                  <ul className="space-y-0.5 text-slate-600 dark:text-slate-300">
                    {block.gaps_to_address.map((g) => (
                      <li key={g.id}>
                        <span className="font-mono text-slate-400">{g.id}</span> ({g.severity || "medium"}) {g.description}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 text-[9px] font-semibold uppercase text-slate-500">Mitigations</div>
                  <ul className="space-y-1">
                    {block.mitigations.map((m) => {
                      const k = bsMitKey(block.scenario_id, m.id);
                      return (
                        <li key={m.id}>
                          <label className="flex cursor-pointer gap-2 rounded border border-transparent p-1 hover:border-slate-200 dark:hover:border-slate-600">
                            <input
                              type="checkbox"
                              checked={bsMitigationPick.has(k)}
                              onChange={() => onToggleMitigation(k)}
                            />
                            <span>
                              <span className="font-medium text-slate-800 dark:text-slate-100">{m.title}</span>
                              <span className="mt-0.5 block text-slate-600 dark:text-slate-300">{m.description}</span>
                              {m.addresses_gaps && m.addresses_gaps.length > 0 ? (
                                <span className="mt-0.5 block text-[9px] text-slate-500">
                                  Addresses gaps: {m.addresses_gaps.join(", ")}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="w-full ios-button-primary"
            disabled={simBusy || bsMitigationPick.size < 1}
            onClick={() => void onApply()}
          >
            {simBusy ? "Applying…" : "Apply selected mitigations to mindmap"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default memo(AssistantBlackSwanTabInner);
