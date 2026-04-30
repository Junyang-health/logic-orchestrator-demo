import type { Dispatch, SetStateAction } from "react";
import type {
  AffectedNodeHint,
  BranchFinancialExtract,
  MeterInputs,
  OptimismMetric
} from "../../lib/optimismMeter";
import type { MindmapJson } from "../../types/mindmap";
import type {
  BlackSwanRunBundle,
  BlackSwanScenario,
  MeceEvidenceRow,
  MeceScanBundle,
  RoundtablePersona
} from "./assistantTypes";
import AssistantBlackSwanTab from "./tabs/AssistantBlackSwanTab";
import AssistantMeceTab from "./tabs/AssistantMeceTab";
import AssistantOptimismTab from "./tabs/AssistantOptimismTab";
import AssistantRoundtableTab from "./tabs/AssistantRoundtableTab";
import type { AssistantPanelMode } from "./assistantPanelMode";

type OptimismPreview = {
  before: Record<OptimismMetric, number | null>;
  after: Record<OptimismMetric, number | null>;
  pctLabel: Record<OptimismMetric, string | null>;
};

export type AssistantPanelSimulationStackProps = {
  mode: AssistantPanelMode;
  simReport: string;
  simReportTitle: string;
  branchFinancial: BranchFinancialExtract | null;
  optimismMetricsAvailable: OptimismMetric[];
  optimismFocus: OptimismMetric | null;
  setOptimismFocus: Dispatch<SetStateAction<OptimismMetric | null>>;
  currency: string;
  setCurrency: (v: string) => void;
  optimismDeltaPct: number;
  setOptimismDeltaPct: Dispatch<SetStateAction<number>>;
  optimismPreview: OptimismPreview | null;
  optimismAffected: AffectedNodeHint[];
  simBusy: boolean;
  onApplyOptimism: () => void;
  meterInputs: MeterInputs | null;
  setMeterInputs: Dispatch<SetStateAction<MeterInputs | null>>;
  backendBase: string;
  combinedGraphForOptimism: MindmapJson;
  selectedNodeId: string | undefined;
  /** Label or id for optimism branch-root UX (audit card, add-metrics CTA). */
  optimismBranchRootLabel: string;
  bsScenarios: BlackSwanScenario[] | null;
  bsSelectedScenarioIds: Set<string>;
  onToggleScenario: (id: string) => void;
  bsRunBundle: BlackSwanRunBundle | null;
  bsMitigationPick: Set<string>;
  onToggleMitigation: (key: string) => void;
  onBlackSwanScan: () => void;
  onBlackSwanRun: () => void;
  onBlackSwanApply: () => void;
  onBlackSwanBackFromResults: () => void;
  meceScanBundle: MeceScanBundle | null;
  meceSelectedMods: Set<string>;
  onToggleMeceModification: (id: string) => void;
  meceEvidenceBundle: { results: MeceEvidenceRow[]; corpus_stats?: Record<string, unknown> } | null;
  meceWebHints: Record<string, string>;
  meceWebBusyId: string | null;
  onMeceScan: () => void;
  onMeceEvidence: () => void;
  onMeceWebSearchForMod: (modId: string, query: string) => void;
  onMeceApply: () => void;
  meceNodeLabelById: Record<string, string>;
  onMeceFocusCanvasNode: (nodeId: string) => void;
  rtPersonas: RoundtablePersona[];
  rtLib: { name: string; instruction: string }[];
  rtNewName: string;
  setRtNewName: (v: string) => void;
  rtNewInstruction: string;
  setRtNewInstruction: (v: string) => void;
  onAddRtPreset: (name: string) => void;
  onAddFromLib: (name: string, instruction: string) => void;
  onRemoveRtPersona: (id: string) => void;
  onAddRtCustom: () => void;
  /** When true, roundtable setup and persona library are hidden; roster stays in transcript header. */
  rtDiscussionStarted?: boolean;
};

export default function AssistantPanelSimulationStack({
  mode,
  simReport,
  simReportTitle,
  branchFinancial,
  optimismMetricsAvailable,
  optimismFocus,
  setOptimismFocus,
  currency,
  setCurrency,
  optimismDeltaPct,
  setOptimismDeltaPct,
  optimismPreview,
  optimismAffected,
  simBusy,
  onApplyOptimism,
  meterInputs,
  setMeterInputs,
  backendBase,
  combinedGraphForOptimism,
  selectedNodeId,
  optimismBranchRootLabel,
  bsScenarios,
  bsSelectedScenarioIds,
  onToggleScenario,
  bsRunBundle,
  bsMitigationPick,
  onToggleMitigation,
  onBlackSwanScan,
  onBlackSwanRun,
  onBlackSwanApply,
  onBlackSwanBackFromResults,
  meceScanBundle,
  meceSelectedMods,
  onToggleMeceModification,
  meceEvidenceBundle,
  meceWebHints,
  meceWebBusyId,
  onMeceScan,
  onMeceEvidence,
  onMeceWebSearchForMod,
  onMeceApply,
  meceNodeLabelById,
  onMeceFocusCanvasNode,
  rtPersonas,
  rtLib,
  rtNewName,
  setRtNewName,
  rtNewInstruction,
  setRtNewInstruction,
  onAddRtPreset,
  onAddFromLib,
  onRemoveRtPersona,
  onAddRtCustom,
  rtDiscussionStarted
}: AssistantPanelSimulationStackProps) {
  if (mode === "counsel") return null;

  if (mode === "chat" && !simReport) return null;

  const simScrollable =
    mode === "optimism" || mode === "blackSwan" || mode === "mece"
      ? "mm-assistant-thin-scrollbar max-h-[min(62vh,44rem)] overflow-y-auto overflow-x-hidden"
      : mode === "roundtable"
        ? "overflow-x-hidden"
        : "mm-assistant-thin-scrollbar max-h-[min(50vh,28rem)] overflow-y-auto overflow-x-hidden";

  return (
    <div
      className={[
        "shrink-0 border-b border-slate-200 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-950/80",
        mode === "roundtable" ? "border-t border-slate-200/75 dark:border-slate-800/90" : "",
        simScrollable
      ].join(" ")}
    >
      {mode === "optimism" && (
        <AssistantOptimismTab
          branchRootId={selectedNodeId}
          branchRootDisplayName={optimismBranchRootLabel}
          branchFinancial={branchFinancial}
          optimismMetricsAvailable={optimismMetricsAvailable}
          optimismFocus={optimismFocus}
          setOptimismFocus={setOptimismFocus}
          currency={currency}
          setCurrency={setCurrency}
          optimismDeltaPct={optimismDeltaPct}
          setOptimismDeltaPct={setOptimismDeltaPct}
          optimismPreview={optimismPreview}
          optimismAffected={optimismAffected}
          simBusy={simBusy}
          onApplyOptimism={onApplyOptimism}
          meterInputs={meterInputs}
          setMeterInputs={setMeterInputs}
          backendBase={backendBase}
          combinedGraphForOptimism={combinedGraphForOptimism}
        />
      )}

      {mode === "blackSwan" && (
        <AssistantBlackSwanTab
          selectedNodeId={selectedNodeId}
          anchorLabel={optimismBranchRootLabel}
          simBusy={simBusy}
          bsScenarios={bsScenarios}
          bsSelectedScenarioIds={bsSelectedScenarioIds}
          onToggleScenario={onToggleScenario}
          bsRunBundle={bsRunBundle}
          bsMitigationPick={bsMitigationPick}
          onToggleMitigation={onToggleMitigation}
          onScan={onBlackSwanScan}
          onRun={onBlackSwanRun}
          onApply={onBlackSwanApply}
          onBackFromResults={onBlackSwanBackFromResults}
        />
      )}

      {mode === "mece" && (
        <AssistantMeceTab
          selectedNodeId={selectedNodeId}
          simBusy={simBusy}
          meceScanBundle={meceScanBundle}
          meceSelectedMods={meceSelectedMods}
          onToggleModification={onToggleMeceModification}
          meceEvidenceBundle={meceEvidenceBundle}
          meceWebHints={meceWebHints}
          meceWebBusyId={meceWebBusyId}
          onScan={onMeceScan}
          onEvidence={onMeceEvidence}
          onWebSearchForMod={onMeceWebSearchForMod}
          onApply={onMeceApply}
          nodeLabelById={meceNodeLabelById}
          onFocusCanvasNode={onMeceFocusCanvasNode}
        />
      )}

      {mode === "roundtable" && (
        <AssistantRoundtableTab
          discussionStarted={Boolean(rtDiscussionStarted)}
          rtPersonas={rtPersonas}
          rtLib={rtLib}
          rtNewName={rtNewName}
          setRtNewName={setRtNewName}
          rtNewInstruction={rtNewInstruction}
          setRtNewInstruction={setRtNewInstruction}
          onAddPreset={onAddRtPreset}
          onAddFromLib={onAddFromLib}
          onRemovePersona={onRemoveRtPersona}
          onAddCustom={onAddRtCustom}
        />
      )}

      {simReport && mode !== "optimism" && mode !== "blackSwan" && mode !== "mece" ? (
        <div className="mt-3 ios-card p-3 text-[11px] text-slate-700 dark:text-slate-200">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {simReportTitle}
          </div>
          <pre className="whitespace-pre-wrap">{simReport}</pre>
        </div>
      ) : null}
    </div>
  );
}
