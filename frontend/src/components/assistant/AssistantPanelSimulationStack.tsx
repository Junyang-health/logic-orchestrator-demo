import type { Dispatch, SetStateAction } from "react";
import type {
  AffectedNodeHint,
  BranchFinancialExtract,
  OptimismMetric
} from "../../lib/optimismMeter";
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

type Props = {
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
  selectedNodeId: string | undefined;
  bsScenarios: BlackSwanScenario[] | null;
  bsSelectedScenarioIds: Set<string>;
  onToggleScenario: (id: string) => void;
  bsRunBundle: BlackSwanRunBundle | null;
  bsMitigationPick: Set<string>;
  onToggleMitigation: (key: string) => void;
  onBlackSwanScan: () => void;
  onBlackSwanRun: () => void;
  onBlackSwanApply: () => void;
  meceScanBundle: MeceScanBundle | null;
  meceSelectedMods: Set<string>;
  onToggleMeceModification: (id: string) => void;
  meceEvidenceBundle: { results: MeceEvidenceRow[]; corpus_stats?: Record<string, unknown> } | null;
  meceWebHints: Record<string, string>;
  meceWebBusyId: string | null;
  onMeceScan: () => void;
  onMeceEvidence: () => void;
  onMeceWebSearchForMod: (modId: string) => void;
  onMeceApply: () => void;
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
  selectedNodeId,
  bsScenarios,
  bsSelectedScenarioIds,
  onToggleScenario,
  bsRunBundle,
  bsMitigationPick,
  onToggleMitigation,
  onBlackSwanScan,
  onBlackSwanRun,
  onBlackSwanApply,
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
  rtPersonas,
  rtLib,
  rtNewName,
  setRtNewName,
  rtNewInstruction,
  setRtNewInstruction,
  onAddRtPreset,
  onAddFromLib,
  onRemoveRtPersona,
  onAddRtCustom
}: Props) {
  if (mode === "counsel") return null;

  if (mode === "chat" && !simReport) return null;

  return (
    <div className="max-h-[min(50vh,28rem)] shrink-0 overflow-y-auto overflow-x-hidden border-b border-slate-200 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-950/80">
      {mode === "optimism" && (
        <AssistantOptimismTab
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
        />
      )}

      {mode === "blackSwan" && (
        <AssistantBlackSwanTab
          selectedNodeId={selectedNodeId}
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
        />
      )}

      {mode === "roundtable" && (
        <AssistantRoundtableTab
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

      {simReport ? (
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
