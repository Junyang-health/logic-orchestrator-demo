import { useCallback, useEffect, useMemo, useState } from "react";
import type { MindmapJson } from "../../../types/mindmap";
import useUiStore from "../../../store/useUiStore";
import {
  availableMetrics,
  branchExtractToMeterInputs,
  computeMeterPreview,
  extractBranchFinancialBaselines,
  findAffectedBranchNodes,
  type MeterInputs,
  type OptimismMetric
} from "../../../lib/optimismMeter";
import type { AssistantPanelMode } from "../assistantPanelMode";
import type { BlackSwanRunBundle, BlackSwanScenario, MeceEvidenceRow, MeceScanBundle } from "../assistantTypes";

export type UseAssistantPanelSimulationArgs = {
  mode: AssistantPanelMode;
  selectedNode: { id: string; label?: string } | null | undefined;
  combined: MindmapJson;
};

export function useAssistantPanelSimulation(args: UseAssistantPanelSimulationArgs) {
  const { mode, selectedNode, combined } = args;
  const setSelectedNode = useUiStore((s) => s.setSelectedNode);

  const [currency, setCurrency] = useState("USD");
  const [optimismDeltaPct, setOptimismDeltaPct] = useState(0);
  const [optimismFocus, setOptimismFocus] = useState<OptimismMetric | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simReport, setSimReport] = useState<string>("");
  const [bsScenarios, setBsScenarios] = useState<BlackSwanScenario[] | null>(null);
  const [bsSelectedScenarioIds, setBsSelectedScenarioIds] = useState<Set<string>>(() => new Set());
  const [bsRunBundle, setBsRunBundle] = useState<BlackSwanRunBundle | null>(null);
  const [bsMitigationPick, setBsMitigationPick] = useState<Set<string>>(() => new Set());
  const [meceScanBundle, setMeceScanBundle] = useState<MeceScanBundle | null>(null);
  const [meceSelectedMods, setMeceSelectedMods] = useState<Set<string>>(() => new Set());
  const [meceEvidenceBundle, setMeceEvidenceBundle] = useState<{
    results: MeceEvidenceRow[];
    corpus_stats?: Record<string, unknown>;
  } | null>(null);
  const [meceWebHints, setMeceWebHints] = useState<Record<string, string>>({});
  const [meceWebBusyId, setMeceWebBusyId] = useState<string | null>(null);
  const [meterInputs, setMeterInputs] = useState<MeterInputs | null>(null);

  const meceNodeLabelById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of combined.nodes) m[n.id] = (n.label || "").trim() || n.id;
    return m;
  }, [combined.nodes]);

  const handleMeceFocusCanvasNode = useCallback(
    (nodeId: string) => {
      const n = combined.nodes.find((x) => x.id === nodeId);
      if (!n) return;
      setSelectedNode({
        id: n.id,
        type: n.type,
        label: n.label,
        metadata: n.metadata as Record<string, unknown> | undefined
      });
    },
    [combined.nodes, setSelectedNode]
  );

  const branchFinancial = useMemo(() => {
    if (!selectedNode?.id) return null;
    return extractBranchFinancialBaselines(selectedNode.id, combined);
  }, [selectedNode?.id, combined]);

  useEffect(() => {
    if (!branchFinancial) {
      setMeterInputs(null);
      return;
    }
    setMeterInputs(branchExtractToMeterInputs(branchFinancial));
  }, [branchFinancial]);

  const optimismPreview = useMemo(() => {
    if (!meterInputs || !optimismFocus) return null;
    return computeMeterPreview(optimismFocus, optimismDeltaPct, meterInputs);
  }, [meterInputs, optimismFocus, optimismDeltaPct]);

  const optimismAffected = useMemo(() => {
    if (!selectedNode?.id || !optimismFocus || !branchFinancial) return [];
    return findAffectedBranchNodes(selectedNode.id, combined, optimismFocus, branchFinancial.sourceNodeId);
  }, [selectedNode?.id, combined, optimismFocus, branchFinancial]);

  const optimismMetricsAvailable = useMemo(
    () => (branchFinancial ? availableMetrics(branchFinancial) : []),
    [branchFinancial]
  );

  useEffect(() => {
    if (mode !== "optimism") return;
    const av = optimismMetricsAvailable;
    if (av.length === 0) {
      setOptimismFocus(null);
      return;
    }
    setOptimismFocus((prev) => (prev && av.includes(prev) ? prev : av[0]));
  }, [mode, optimismMetricsAvailable]);

  useEffect(() => {
    setBsScenarios(null);
    setBsSelectedScenarioIds(new Set());
    setBsRunBundle(null);
    setBsMitigationPick(new Set());
    setMeceScanBundle(null);
    setMeceSelectedMods(new Set());
    setMeceEvidenceBundle(null);
    setMeceWebHints({});
    setMeceWebBusyId(null);
  }, [selectedNode?.id]);

  const handleBlackSwanBackFromResults = useCallback(() => {
    setBsRunBundle(null);
    setBsMitigationPick(new Set());
  }, []);

  const handleBsToggleScenario = useCallback((scenarioId: string) => {
    setBsSelectedScenarioIds((prev) => {
      const n = new Set(prev);
      if (n.has(scenarioId)) n.delete(scenarioId);
      else n.add(scenarioId);
      return n;
    });
    setBsRunBundle(null);
    setBsMitigationPick(new Set());
  }, []);

  const handleBsToggleMitigation = useCallback((key: string) => {
    setBsMitigationPick((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  const handleMeceToggleModification = useCallback((modificationId: string) => {
    setMeceSelectedMods((prev) => {
      const n = new Set(prev);
      if (n.has(modificationId)) n.delete(modificationId);
      else n.add(modificationId);
      return n;
    });
    setMeceEvidenceBundle(null);
  }, []);

  return {
    currency,
    setCurrency,
    optimismDeltaPct,
    setOptimismDeltaPct,
    optimismFocus,
    setOptimismFocus,
    simBusy,
    setSimBusy,
    simReport,
    setSimReport,
    bsScenarios,
    setBsScenarios,
    bsSelectedScenarioIds,
    setBsSelectedScenarioIds,
    bsRunBundle,
    setBsRunBundle,
    bsMitigationPick,
    setBsMitigationPick,
    meceScanBundle,
    setMeceScanBundle,
    meceSelectedMods,
    setMeceSelectedMods,
    meceEvidenceBundle,
    setMeceEvidenceBundle,
    meceWebHints,
    setMeceWebHints,
    meceWebBusyId,
    setMeceWebBusyId,
    meterInputs,
    setMeterInputs,
    meceNodeLabelById,
    handleMeceFocusCanvasNode,
    branchFinancial,
    optimismPreview,
    optimismAffected,
    optimismMetricsAvailable,
    handleBlackSwanBackFromResults,
    handleBsToggleScenario,
    handleBsToggleMitigation,
    handleMeceToggleModification
  };
}
