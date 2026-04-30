import { useCallback, useMemo } from "react";
import useUiStore from "../../store/useUiStore";
import { snapDeltaPct } from "../../lib/optimismMeter";
import type { MindmapJson } from "../../types/mindmap";
import type { BlackSwanResultBlock, BlackSwanRunBundle, BlackSwanScenario } from "./assistantTypes";
import { assistantRunAsync } from "./assistantRunAsync";
import { readFetchDetailMessage } from "./assistantFetchDetail";
import type { AssistantPanelActionsRef } from "./assistantPanelActionsContext";

export function useAssistantSimulationActions(ref: AssistantPanelActionsRef) {
  const runOptimismSimulation = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId || !c.meterInputs || !c.optimismFocus) return;
    await assistantRunAsync(
      {
        setBusy: c.setSimBusy,
        setPanelError: c.setError,
        t: c.t,
        label: "optimism_sim",
        prepare: () => c.setSimReport("")
      },
      async () => {
        const dp = snapDeltaPct(c.optimismDeltaPct);
        const res = await fetch(`${c.backendBase}/assistant/simulate/optimism`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_root_id: c.selectedNodeId,
            full_nodes: c.combined.nodes,
            full_edges: c.combined.edges,
            optimism: 50,
            currency: c.currency,
            tam_total: c.meterInputs.tam_total ?? undefined,
            target_segment_pct: c.meterInputs.target_segment_pct ?? undefined,
            arpa_year: c.meterInputs.arpa_year ?? undefined,
            customers_total: c.meterInputs.customers_total ?? undefined,
            penetration_pct: c.meterInputs.penetration_pct ?? undefined,
            focus_metric: c.optimismFocus,
            delta_pct: dp,
            baseline_som_override: c.meterInputs.baseline_som_override ?? undefined,
            affected_nodes: c.optimismAffected.map((a) => ({
              node_id: a.nodeId,
              label: a.label,
              reason: a.reason
            }))
          })
        });
        if (!res.ok) {
          throw new Error(await readFetchDetailMessage(res, "Simulation failed"));
        }
        const data = (await res.json()) as { mindmap: MindmapJson; report: string };
        c.setSimReport(data.report || "");
        c.loadMainGraph(data.mindmap, { newMarks: "diff" });
        c.clearSandbox();
        useUiStore.getState().setSelectedNode(null);
        useUiStore.getState().closeAssistantSession();
      }
    );
  }, [ref]);

  const blackSwanScan = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId) return;
    await assistantRunAsync(
      {
        setBusy: c.setSimBusy,
        setPanelError: c.setError,
        t: c.t,
        label: "black_swan_scan",
        prepare: () => {
          c.setSimReport("");
          c.setBsRunBundle(null);
          c.setBsMitigationPick(new Set());
          c.setBsSelectedScenarioIds(new Set());
        },
        onFailure: () => c.setBsScenarios(null)
      },
      async () => {
        const res = await fetch(`${c.backendBase}/assistant/simulate/black-swan/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_root_id: c.selectedNodeId,
            full_nodes: c.combined.nodes,
            full_edges: c.combined.edges
          })
        });
        if (!res.ok) {
          throw new Error(await readFetchDetailMessage(res, "Scan failed"));
        }
        const data = (await res.json()) as { scenarios: BlackSwanScenario[]; report?: string };
        c.setBsScenarios(data.scenarios || []);
        c.setSimReport(data.report || "Scan complete.");
      }
    );
  }, [ref]);

  const blackSwanRun = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId || !c.bsScenarios?.length) return;
    const picked = c.bsScenarios.filter((s) => c.bsSelectedScenarioIds.has(s.id));
    if (picked.length < 1) {
      c.setError("Select at least one scenario to simulate.");
      return;
    }
    await assistantRunAsync(
      {
        setBusy: c.setSimBusy,
        setPanelError: c.setError,
        t: c.t,
        label: "black_swan_run",
        prepare: () => {
          c.setSimReport("");
          c.setBsMitigationPick(new Set());
        },
        onFailure: () => c.setBsRunBundle(null)
      },
      async () => {
        const res = await fetch(`${c.backendBase}/assistant/simulate/black-swan/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_root_id: c.selectedNodeId,
            full_nodes: c.combined.nodes,
            full_edges: c.combined.edges,
            scenarios: picked
          })
        });
        if (!res.ok) {
          throw new Error(await readFetchDetailMessage(res, "Run failed"));
        }
        const data = (await res.json()) as BlackSwanRunBundle & { report?: string; results: BlackSwanResultBlock[] };
        c.setBsRunBundle({
          results: data.results || [],
          executive_summary: data.executive_summary || data.report || ""
        });
        c.setSimReport([data.executive_summary, data.report].filter(Boolean).join("\n\n") || "Simulation complete.");
      }
    );
  }, [ref]);

  const blackSwanApply = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId || !c.bsScenarios?.length || !c.bsRunBundle?.results?.length) return;
    const pickedScenarios = c.bsScenarios.filter((s) => c.bsSelectedScenarioIds.has(s.id));
    if (pickedScenarios.length < 1) {
      c.setError("Scenario context missing; re-run simulation.");
      return;
    }
    const selections = Array.from(c.bsMitigationPick)
      .map((key) => {
        const i = key.indexOf("::");
        const scenario_id = i >= 0 ? key.slice(0, i) : key;
        const mitigation_id = i >= 0 ? key.slice(i + 2) : "";
        return { scenario_id, mitigation_id };
      })
      .filter((x) => x.scenario_id && x.mitigation_id);
    if (selections.length < 1) {
      c.setError("Select at least one mitigation to apply to the mindmap.");
      return;
    }
    await assistantRunAsync(
      { setBusy: c.setSimBusy, setPanelError: c.setError, t: c.t, label: "black_swan_apply" },
      async () => {
        const res = await fetch(`${c.backendBase}/assistant/simulate/black-swan/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_root_id: c.selectedNodeId,
            full_nodes: c.combined.nodes,
            full_edges: c.combined.edges,
            scenarios: pickedScenarios,
            run: {
              results: c.bsRunBundle.results,
              executive_summary: c.bsRunBundle.executive_summary || ""
            },
            selections
          })
        });
        if (!res.ok) {
          throw new Error(await readFetchDetailMessage(res, "Apply failed"));
        }
        const data = (await res.json()) as { mindmap: MindmapJson; report: string };
        c.setSimReport(data.report || "");
        c.loadMainGraph(data.mindmap, { newMarks: "diff" });
        c.clearSandbox();
        useUiStore.getState().setSelectedNode(null);
        useUiStore.getState().closeAssistantSession();
        c.setBsScenarios(null);
        c.setBsSelectedScenarioIds(new Set());
        c.setBsRunBundle(null);
        c.setBsMitigationPick(new Set());
      }
    );
  }, [ref]);

  return useMemo(
    () => ({ runOptimismSimulation, blackSwanScan, blackSwanRun, blackSwanApply }),
    [runOptimismSimulation, blackSwanScan, blackSwanRun, blackSwanApply]
  );
}
