import { useCallback, useMemo } from "react";
import useUiStore from "../../store/useUiStore";
import { snapDeltaPct } from "../../lib/optimismMeter";
import type { MindmapJson } from "../../types/mindmap";
import type { BlackSwanResultBlock, BlackSwanRunBundle, BlackSwanScenario } from "./assistantTypes";
import { readFetchDetailMessage } from "./assistantFetchDetail";
import type { AssistantPanelActionsRef } from "./assistantPanelActionsContext";

export function useAssistantSimulationActions(ref: AssistantPanelActionsRef) {
  const runOptimismSimulation = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId || !c.meterInputs || !c.optimismFocus) return;
    c.setSimBusy(true);
    c.setError("");
    c.setSimReport("");
    try {
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
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "Simulation request failed");
    } finally {
      c.setSimBusy(false);
    }
  }, [ref]);

  const blackSwanScan = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId) return;
    c.setSimBusy(true);
    c.setError("");
    c.setSimReport("");
    c.setBsRunBundle(null);
    c.setBsMitigationPick(new Set());
    c.setBsSelectedScenarioIds(new Set());
    try {
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
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "Black swan scan failed");
      c.setBsScenarios(null);
    } finally {
      c.setSimBusy(false);
    }
  }, [ref]);

  const blackSwanRun = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId || !c.bsScenarios?.length) return;
    const picked = c.bsScenarios.filter((s) => c.bsSelectedScenarioIds.has(s.id));
    if (picked.length < 1) {
      c.setError("Select at least one scenario to simulate.");
      return;
    }
    c.setSimBusy(true);
    c.setError("");
    c.setSimReport("");
    c.setBsMitigationPick(new Set());
    try {
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
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "Black swan run failed");
      c.setBsRunBundle(null);
    } finally {
      c.setSimBusy(false);
    }
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
    c.setSimBusy(true);
    c.setError("");
    try {
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
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "Black swan apply failed");
    } finally {
      c.setSimBusy(false);
    }
  }, [ref]);

  return useMemo(
    () => ({ runOptimismSimulation, blackSwanScan, blackSwanRun, blackSwanApply }),
    [runOptimismSimulation, blackSwanScan, blackSwanRun, blackSwanApply]
  );
}
