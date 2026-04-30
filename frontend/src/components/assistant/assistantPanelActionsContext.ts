import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { LoadMainGraphOptions } from "../../store/useUiStore";
import type { MessageKey } from "../../i18n/messages";
import type { AffectedNodeHint, MeterInputs, OptimismMetric } from "../../lib/optimismMeter";
import type { MindmapJson } from "../../types/mindmap";
import type {
  BlackSwanRunBundle,
  BlackSwanScenario,
  ChatRow,
  CustomSkillRow,
  MeceEvidenceRow,
  MeceScanBundle,
  RoundtablePersona,
  RoundtableTranscriptRow
} from "./assistantTypes";
import type { AssistantPanelMode } from "./assistantPanelMode";

/** Latest values read by assistant HTTP handlers; sync this ref every render before invoking handlers. */
export type AssistantPanelActionsCtx = {
  assistantMode: AssistantPanelMode;
  backendBase: string;
  combined: MindmapJson;
  selectedNodeId: string | undefined;
  /** i18n for generic async error copy */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  draft: string;
  chatBusy: boolean;
  messages: ChatRow[];
  webSearchQuery: string;
  skillsWebSearch: boolean;
  /** Project file ids to attach to chat/apply; empty = do not send source text. */
  assistantSourceFileIds: string[];
  payloadSkills: { name: string; instruction: string; enabled: boolean }[];
  builtinPayload: { webSearch: boolean; financialAnalyst: boolean };
  sandboxMode: boolean;
  sandboxHasDrafts: boolean;
  skillImportUrl: string;
  skillImportBusy: boolean;
  meterInputs: MeterInputs | null;
  optimismFocus: OptimismMetric | null;
  optimismDeltaPct: number;
  optimismAffected: AffectedNodeHint[];
  currency: string;
  bsScenarios: BlackSwanScenario[] | null;
  bsSelectedScenarioIds: Set<string>;
  bsRunBundle: BlackSwanRunBundle | null;
  bsMitigationPick: Set<string>;
  meceScanBundle: MeceScanBundle | null;
  meceSelectedMods: Set<string>;
  meceEvidenceBundle: { results: MeceEvidenceRow[]; corpus_stats?: Record<string, unknown> } | null;
  meceWebHints: Record<string, string>;
  rtPersonas: RoundtablePersona[];
  rtTranscript: RoundtableTranscriptRow[];
  rtSteering: string;
  rtProposal: {
    discussion_summary: string;
    recommended_mindmap_changes: string;
    patch: Record<string, unknown>;
  } | null;
  rtConfirmApply: boolean;
  setDraft: Dispatch<SetStateAction<string>>;
  setMessages: Dispatch<SetStateAction<ChatRow[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setChatBusy: Dispatch<SetStateAction<boolean>>;
  setApplyBusy: Dispatch<SetStateAction<boolean>>;
  setSimBusy: Dispatch<SetStateAction<boolean>>;
  setSimReport: Dispatch<SetStateAction<string>>;
  setBsScenarios: Dispatch<SetStateAction<BlackSwanScenario[] | null>>;
  setBsSelectedScenarioIds: Dispatch<SetStateAction<Set<string>>>;
  setBsRunBundle: Dispatch<SetStateAction<BlackSwanRunBundle | null>>;
  setBsMitigationPick: Dispatch<SetStateAction<Set<string>>>;
  setMeceScanBundle: Dispatch<SetStateAction<MeceScanBundle | null>>;
  setMeceSelectedMods: Dispatch<SetStateAction<Set<string>>>;
  setMeceEvidenceBundle: Dispatch<
    SetStateAction<{ results: MeceEvidenceRow[]; corpus_stats?: Record<string, unknown> } | null>
  >;
  setMeceWebHints: Dispatch<SetStateAction<Record<string, string>>>;
  setMeceWebBusyId: Dispatch<SetStateAction<string | null>>;
  setCustomSkills: Dispatch<SetStateAction<CustomSkillRow[]>>;
  setSkillImportUrl: Dispatch<SetStateAction<string>>;
  setSkillImportBusy: Dispatch<SetStateAction<boolean>>;
  setSkillImportMessage: Dispatch<SetStateAction<string>>;
  setRtTranscript: Dispatch<SetStateAction<RoundtableTranscriptRow[]>>;
  setRtRoundBusy: Dispatch<SetStateAction<boolean>>;
  setRtProposeBusy: Dispatch<SetStateAction<boolean>>;
  setRtApplyBusy: Dispatch<SetStateAction<boolean>>;
  setRtProposal: Dispatch<
    SetStateAction<{
      discussion_summary: string;
      recommended_mindmap_changes: string;
      patch: Record<string, unknown>;
    } | null>
  >;
  setRtConfirmApply: Dispatch<SetStateAction<boolean>>;
  setRtSteering: Dispatch<SetStateAction<string>>;
  loadMainGraph: (graph: MindmapJson, opts?: LoadMainGraphOptions) => void;
  clearSandbox: () => void;
  setSandboxMode: (v: boolean) => void;
};

/** Ref type used by all assistant action hooks. */
export type AssistantPanelActionsRef = MutableRefObject<AssistantPanelActionsCtx>;
