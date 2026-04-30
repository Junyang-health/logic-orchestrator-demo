import { useCallback, useMemo, useRef, useState } from "react";
import { combineGraphs } from "../lib/graphBranch";
import { getBackendBase } from "../lib/backendBase";
import { useI18n } from "../i18n/useI18n";
import type { MindmapJson } from "../types/mindmap";
import AssistantSkillsBlock from "./assistant/AssistantSkillsBlock";
import AssistantTranscriptBlock from "./assistant/AssistantTranscriptBlock";
import AssistantWorkspaceFooter from "./assistant/AssistantWorkspaceFooter";
import AssistantPanelHeader from "./assistant/AssistantPanelHeader";
import AssistantPanelModeSegment from "./assistant/AssistantPanelModeSegment";
import AssistantPanelSimulationStack, {
  type AssistantPanelSimulationStackProps
} from "./assistant/AssistantPanelSimulationStack";
import AssistantCounselFlow from "./assistant/AssistantCounselFlow";
import AssistantSandboxDraftBanner from "./assistant/AssistantSandboxDraftBanner";
import AssistantSessionSourcesCard from "./assistant/AssistantSessionSourcesCard";
import type { AssistantPanelMode } from "./assistant/assistantPanelMode";
import { buildMeceFooterPrimary } from "./assistant/panel/buildMeceFooterPrimary";
import { tryParseSlashModeOnlyLine } from "./assistant/slashModeCommands";
import { useAssistantPanelChatSession } from "./assistant/panel/useAssistantPanelChatSession";
import { useAssistantPanelRoundtable } from "./assistant/panel/useAssistantPanelRoundtable";
import { useAssistantPanelSimulation } from "./assistant/panel/useAssistantPanelSimulation";
import { useAssistantPanelSkills } from "./assistant/panel/useAssistantPanelSkills";
import { useAssistantPanelSources } from "./assistant/panel/useAssistantPanelSources";
import {
  useAssistantPanelActions,
  type AssistantPanelActionsCtx
} from "./assistant/useAssistantPanelActions";
import { useAssistantGraphSlice, useAssistantSessionSlice, useAssistantSkillsSlice } from "./assistant/useAssistantZustand";
import useUiStore from "../store/useUiStore";

export type { CustomSkillRow } from "./assistant/assistantTypes";

export default function AssistantPanel() {
  const { t, locale } = useI18n();
  const { mainGraph, sandboxGraph, sandboxMode, setSandboxMode, loadMainGraph, clearSandbox } = useAssistantGraphSlice();
  const { selectedNode, closeAssistantSession } = useAssistantSessionSlice();
  const { skills, toggleSkill } = useAssistantSkillsSlice();
  const projectId = useUiStore((s) => s.projectId);

  const backendBase = getBackendBase();

  const [mode, setMode] = useState<AssistantPanelMode>("chat");
  const [error, setError] = useState("");

  const sources = useAssistantPanelSources({ projectId, backendBase, setError, t });

  const skillsVertical = useAssistantPanelSkills({ t });

  const roundtable = useAssistantPanelRoundtable({ setError });

  const combined: MindmapJson = useMemo(() => combineGraphs(mainGraph, sandboxGraph), [mainGraph, sandboxGraph]);

  const simulation = useAssistantPanelSimulation({ mode, selectedNode, combined });

  const chat = useAssistantPanelChatSession({
    mode,
    setError,
    rtTranscriptLength: roundtable.rtTranscript.length,
    rtRoundBusy: roundtable.rtRoundBusy
  });

  const rtGraphNodeIds = useMemo(() => combined.nodes.map((n) => String(n.id)), [combined.nodes]);

  const sandboxHasDrafts = sandboxGraph.nodes.length > 0 || sandboxGraph.edges.length > 0;

  const payloadSkills = useMemo(
    () =>
      skillsVertical.customSkills.map((s) => ({
        name: s.name.trim() || t("custom_skill"),
        instruction: s.instruction.trim(),
        enabled: s.enabled
      })),
    [skillsVertical.customSkills, t, locale]
  );

  const builtinPayload = useMemo(
    () => ({
      webSearch: Boolean(skills.webSearch),
      financialAnalyst: Boolean(skills.financialAnalyst)
    }),
    [skills.financialAnalyst, skills.webSearch]
  );

  const actionsCtxRef = useRef({} as AssistantPanelActionsCtx);
  const {
    sendChat,
    applyToMindmap,
    fetchSkillFromUrl,
    runOptimismSimulation,
    blackSwanScan,
    blackSwanRun,
    blackSwanApply,
    meceScan,
    meceEvidence,
    meceWebSearchForMod,
    meceApply,
    runRoundtableRound,
    proposeRoundtable,
    applyRoundtablePatch
  } = useAssistantPanelActions(actionsCtxRef);

  actionsCtxRef.current = {
    assistantMode: mode,
    backendBase,
    combined,
    selectedNodeId: selectedNode?.id,
    t,
    draft: chat.draft,
    chatBusy: chat.chatBusy,
    messages: chat.messages,
    webSearchQuery: sources.webSearchQuery,
    skillsWebSearch: skills.webSearch,
    assistantSourceFileIds: sources.selectedSourceFileIds,
    payloadSkills,
    builtinPayload,
    sandboxMode,
    sandboxHasDrafts,
    skillImportUrl: skillsVertical.skillImportUrl,
    skillImportBusy: skillsVertical.skillImportBusy,
    meterInputs: simulation.meterInputs,
    optimismFocus: simulation.optimismFocus,
    optimismDeltaPct: simulation.optimismDeltaPct,
    optimismAffected: simulation.optimismAffected,
    currency: simulation.currency,
    bsScenarios: simulation.bsScenarios,
    bsSelectedScenarioIds: simulation.bsSelectedScenarioIds,
    bsRunBundle: simulation.bsRunBundle,
    bsMitigationPick: simulation.bsMitigationPick,
    meceScanBundle: simulation.meceScanBundle,
    meceSelectedMods: simulation.meceSelectedMods,
    meceEvidenceBundle: simulation.meceEvidenceBundle,
    meceWebHints: simulation.meceWebHints,
    rtPersonas: roundtable.rtPersonas,
    rtTranscript: roundtable.rtTranscript,
    rtSteering: roundtable.rtSteering,
    rtProposal: roundtable.rtProposal,
    rtConfirmApply: roundtable.rtConfirmApply,
    setDraft: chat.setDraft,
    setMessages: chat.setMessages,
    setError,
    setChatBusy: chat.setChatBusy,
    setApplyBusy: chat.setApplyBusy,
    setSimBusy: simulation.setSimBusy,
    setSimReport: simulation.setSimReport,
    setBsScenarios: simulation.setBsScenarios,
    setBsSelectedScenarioIds: simulation.setBsSelectedScenarioIds,
    setBsRunBundle: simulation.setBsRunBundle,
    setBsMitigationPick: simulation.setBsMitigationPick,
    setMeceScanBundle: simulation.setMeceScanBundle,
    setMeceSelectedMods: simulation.setMeceSelectedMods,
    setMeceEvidenceBundle: simulation.setMeceEvidenceBundle,
    setMeceWebHints: simulation.setMeceWebHints,
    setMeceWebBusyId: simulation.setMeceWebBusyId,
    setCustomSkills: skillsVertical.setCustomSkills,
    setSkillImportUrl: skillsVertical.setSkillImportUrl,
    setSkillImportBusy: skillsVertical.setSkillImportBusy,
    setSkillImportMessage: skillsVertical.setSkillImportMessage,
    setRtTranscript: roundtable.setRtTranscript,
    setRtRoundBusy: roundtable.setRtRoundBusy,
    setRtProposeBusy: roundtable.setRtProposeBusy,
    setRtApplyBusy: roundtable.setRtApplyBusy,
    setRtProposal: roundtable.setRtProposal,
    setRtConfirmApply: roundtable.setRtConfirmApply,
    setRtSteering: roundtable.setRtSteering,
    loadMainGraph,
    clearSandbox,
    setSandboxMode
  };

  const meceFooterPrimary = useMemo(
    () =>
      buildMeceFooterPrimary({
        mode,
        selectedNodeId: selectedNode?.id,
        meceScanBundle: simulation.meceScanBundle,
        meceEvidenceResults: simulation.meceEvidenceBundle?.results,
        meceSelectedCount: simulation.meceSelectedMods.size,
        simBusy: simulation.simBusy,
        t,
        meceScan,
        meceEvidence,
        meceApply
      }),
    [
      mode,
      selectedNode?.id,
      simulation.meceScanBundle,
      simulation.meceEvidenceBundle?.results,
      simulation.meceSelectedMods.size,
      simulation.simBusy,
      t,
      meceScan,
      meceEvidence,
      meceApply
    ]
  );

  const runSendChat = useCallback(async () => {
    const raw = chat.draft.trim();
    const modeJump = tryParseSlashModeOnlyLine(raw);
    if (modeJump) {
      setMode(modeJump);
      chat.setDraft("");
      return;
    }
    await sendChat();
  }, [chat.draft, chat.setDraft, sendChat, setMode]);

  const discardDraft = useCallback(() => {
    clearSandbox();
    setError("");
  }, [clearSandbox]);

  const deactivateAssistant = useCallback(() => {
    closeAssistantSession();
    setError("");
    roundtable.resetOnAssistantClose();
  }, [closeAssistantSession, roundtable.resetOnAssistantClose]);

  const modeSegmentTooltips = useMemo(
    () => ({
      chat: t("assistant_mode_tip_chat"),
      optimism: t("assistant_mode_tip_optimism"),
      blackSwan: t("assistant_mode_tip_black_swan"),
      mece: t("assistant_mode_tip_mece"),
      roundtable: t("assistant_mode_tip_roundtable"),
      counsel: t("assistant_mode_tip_counsel")
    }),
    [t]
  );

  const simulationStackProps: AssistantPanelSimulationStackProps = useMemo(
    () => ({
      mode,
      simReport: simulation.simReport,
      simReportTitle: t("assistant_sim_report"),
      branchFinancial: simulation.branchFinancial,
      optimismMetricsAvailable: simulation.optimismMetricsAvailable,
      optimismFocus: simulation.optimismFocus,
      setOptimismFocus: simulation.setOptimismFocus,
      currency: simulation.currency,
      setCurrency: simulation.setCurrency,
      optimismDeltaPct: simulation.optimismDeltaPct,
      setOptimismDeltaPct: simulation.setOptimismDeltaPct,
      optimismPreview: simulation.optimismPreview,
      optimismAffected: simulation.optimismAffected,
      simBusy: simulation.simBusy,
      onApplyOptimism: runOptimismSimulation,
      selectedNodeId: selectedNode?.id,
      optimismBranchRootLabel: (selectedNode?.label?.trim() || selectedNode?.id) ?? "",
      meterInputs: simulation.meterInputs,
      setMeterInputs: simulation.setMeterInputs,
      backendBase,
      combinedGraphForOptimism: combined,
      bsScenarios: simulation.bsScenarios,
      bsSelectedScenarioIds: simulation.bsSelectedScenarioIds,
      onToggleScenario: simulation.handleBsToggleScenario,
      bsRunBundle: simulation.bsRunBundle,
      bsMitigationPick: simulation.bsMitigationPick,
      onToggleMitigation: simulation.handleBsToggleMitigation,
      onBlackSwanScan: blackSwanScan,
      onBlackSwanRun: blackSwanRun,
      onBlackSwanApply: blackSwanApply,
      onBlackSwanBackFromResults: simulation.handleBlackSwanBackFromResults,
      meceScanBundle: simulation.meceScanBundle,
      meceSelectedMods: simulation.meceSelectedMods,
      onToggleMeceModification: simulation.handleMeceToggleModification,
      meceEvidenceBundle: simulation.meceEvidenceBundle,
      meceWebHints: simulation.meceWebHints,
      meceWebBusyId: simulation.meceWebBusyId,
      onMeceScan: meceScan,
      onMeceEvidence: meceEvidence,
      onMeceWebSearchForMod: meceWebSearchForMod,
      onMeceApply: meceApply,
      meceNodeLabelById: simulation.meceNodeLabelById,
      onMeceFocusCanvasNode: simulation.handleMeceFocusCanvasNode,
      rtPersonas: roundtable.rtPersonas,
      rtLib: roundtable.rtLib,
      rtNewName: roundtable.rtNewName,
      setRtNewName: roundtable.setRtNewName,
      rtNewInstruction: roundtable.rtNewInstruction,
      setRtNewInstruction: roundtable.setRtNewInstruction,
      onAddRtPreset: roundtable.addRtPreset,
      onAddFromLib: roundtable.addRtFromLib,
      onRemoveRtPersona: roundtable.removeRtPersona,
      onAddRtCustom: roundtable.addRtCustom,
      rtDiscussionStarted:
        mode === "roundtable"
          ? roundtable.rtTranscript.length > 0 || Boolean(roundtable.rtProposal) || roundtable.rtRoundBusy
          : undefined
    }),
    [
      mode,
      simulation.simReport,
      t,
      simulation.branchFinancial,
      simulation.optimismMetricsAvailable,
      simulation.optimismFocus,
      simulation.setOptimismFocus,
      simulation.currency,
      simulation.setCurrency,
      simulation.optimismDeltaPct,
      simulation.setOptimismDeltaPct,
      simulation.optimismPreview,
      simulation.optimismAffected,
      simulation.simBusy,
      runOptimismSimulation,
      selectedNode?.id,
      selectedNode?.label,
      simulation.meterInputs,
      simulation.setMeterInputs,
      backendBase,
      combined,
      simulation.bsScenarios,
      simulation.bsSelectedScenarioIds,
      simulation.handleBsToggleScenario,
      simulation.bsRunBundle,
      simulation.bsMitigationPick,
      simulation.handleBsToggleMitigation,
      blackSwanScan,
      blackSwanRun,
      blackSwanApply,
      simulation.handleBlackSwanBackFromResults,
      simulation.meceScanBundle,
      simulation.meceSelectedMods,
      simulation.handleMeceToggleModification,
      simulation.meceEvidenceBundle,
      simulation.meceWebHints,
      simulation.meceWebBusyId,
      meceScan,
      meceEvidence,
      meceWebSearchForMod,
      meceApply,
      simulation.meceNodeLabelById,
      simulation.handleMeceFocusCanvasNode,
      roundtable.rtPersonas,
      roundtable.rtLib,
      roundtable.rtNewName,
      roundtable.setRtNewName,
      roundtable.rtNewInstruction,
      roundtable.setRtNewInstruction,
      roundtable.addRtPreset,
      roundtable.addRtFromLib,
      roundtable.removeRtPersona,
      roundtable.addRtCustom,
      roundtable.rtTranscript.length,
      roundtable.rtProposal,
      roundtable.rtRoundBusy
    ]
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
      <AssistantPanelHeader
        title={t("assistant_title")}
        closeLabel={t("assistant_close_session")}
        onClose={deactivateAssistant}
        center={
          <AssistantPanelModeSegment
            embedded
            mode={mode}
            onModeChange={setMode}
            modeTooltips={modeSegmentTooltips}
            labels={{
              chat: t("mode_chat"),
              optimism: t("mode_optimism"),
              blackSwan: t("mode_black_swan"),
              mece: t("mode_mece"),
              roundtable: t("mode_roundtable"),
              counsel: t("mode_counsel")
            }}
          />
        }
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
        <aside className="flex w-[25%] min-w-[11rem] max-w-sm flex-shrink-0 flex-col overflow-hidden bg-black/[0.035] dark:bg-white/[0.05]">
          <div className="min-h-0 flex-1 space-y-8 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4">
            <AssistantSessionSourcesCard
              sessionLabel={t("assistant_session")}
              targetNodeLabel={t("assistant_target_node")}
              selectedNodeId={selectedNode?.id}
              sandboxHint={t("assistant_sandbox_hint")}
              skillsWebSearch={skills.webSearch}
              webQueryLabel={t("assistant_web_query")}
              webQueryHelp={t("assistant_web_query_help")}
              webQueryPlaceholder={t("assistant_web_query_ph")}
              webSearchQuery={sources.webSearchQuery}
              onWebSearchQueryChange={sources.setWebSearchQuery}
              activeProjectId={projectId}
              ingestBusy={sources.ingestWebBusy}
              ingestCta={t("assistant_web_ingest_cta")}
              ingestBusyLabel={t("assistant_web_ingest_busy")}
              ingestHint={t("assistant_web_ingest_hint")}
              onIngestWeb={sources.ingestWebToSources}
              sourceFilesLabel={t("assistant_source_files")}
              sourceFilesHint={t("assistant_source_files_hint")}
              sourceFilesNoProject={t("assistant_source_files_no_project")}
              sourceFilesError={t("assistant_source_files_error")}
              sourceFilesEmpty={t("assistant_source_files_empty")}
              selectAllSources={t("assistant_select_all_sources")}
              selectNoSources={t("assistant_select_no_sources")}
              selectionCount={(n) => t("assistant_source_files_selection_count", { n })}
              projectFilesLoadError={sources.projectFilesLoadError}
              projectFiles={sources.projectFiles}
              selectedSourceFileIds={sources.selectedSourceFileIds}
              onSelectedSourceFileIdsChange={sources.setSelectedSourceFileIds}
            />
            <AssistantSkillsBlock
              builtinWebSearch={skills.webSearch}
              builtinFinancialAnalyst={skills.financialAnalyst}
              onToggleBuiltinSkill={toggleSkill}
              customSkills={skillsVertical.customSkills}
              skillDetailsOpen={skillsVertical.skillDetailsOpen}
              onToggleSkillDetails={skillsVertical.toggleSkillDetails}
              onToggleCustomSkill={skillsVertical.toggleCustom}
              onUpdateSkillName={skillsVertical.updateSkillName}
              onUpdateSkillInstruction={skillsVertical.updateSkillInstruction}
              onRemoveSkill={skillsVertical.removeSkill}
              skillImportUrl={skillsVertical.skillImportUrl}
              onSkillImportUrlChange={skillsVertical.onSkillImportUrlChange}
              skillImportBusy={skillsVertical.skillImportBusy}
              skillImportMessage={skillsVertical.skillImportMessage}
              onFetchSkillFromUrl={fetchSkillFromUrl}
              newSkillName={skillsVertical.newSkillName}
              onNewSkillNameChange={skillsVertical.setNewSkillName}
              newSkillBody={skillsVertical.newSkillBody}
              onNewSkillBodyChange={skillsVertical.setNewSkillBody}
              onAddSkill={skillsVertical.addSkill}
            />
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-slate-950">
          {mode === "counsel" ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 py-5 sm:px-6">
              {sandboxHasDrafts ? (
                <AssistantSandboxDraftBanner
                  line={t("assistant_draft_line", { nodes: sandboxGraph.nodes.length, edges: sandboxGraph.edges.length })}
                  discardLabel={t("assistant_discard_draft")}
                  onDiscard={discardDraft}
                />
              ) : null}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <AssistantCounselFlow
                  backendBase={backendBase}
                  projectId={projectId}
                  selectedNodeId={selectedNode?.id}
                  mainGraph={mainGraph}
                  sandboxGraph={sandboxGraph}
                  sourceFileIds={sources.selectedSourceFileIds}
                  payloadSkills={payloadSkills}
                  builtinSkills={builtinPayload}
                  sandboxMode={sandboxMode}
                  loadMainGraph={loadMainGraph}
                  rtLib={roundtable.rtLib}
                  onPersistPersonaToLib={(name, instruction) => {
                    roundtable.setRtLib((prev) => {
                      if (prev.some((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase())) return prev;
                      return [...prev, { name: name.trim().slice(0, 120), instruction: instruction.trim().slice(0, 4000) }];
                    });
                  }}
                  onUpdatePersonaInLib={(name, instruction) => {
                    roundtable.setRtLib((prev) => {
                      const i = prev.findIndex((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
                      if (i < 0) return prev;
                      const next = [...prev];
                      next[i] = {
                        ...next[i],
                        instruction: instruction.trim().slice(0, 8000)
                      };
                      return next;
                    });
                  }}
                  onRemovePersonaFromLib={(name) => {
                    const key = name.trim().toLowerCase();
                    roundtable.setRtLib((prev) => prev.filter((x) => x.name.trim().toLowerCase() !== key));
                  }}
                />
              </div>
            </div>
          ) : mode === "roundtable" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div
                ref={chat.listRef}
                className="mm-assistant-thin-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6"
              >
                {sandboxHasDrafts ? (
                  <AssistantSandboxDraftBanner
                    line={t("assistant_draft_line", { nodes: sandboxGraph.nodes.length, edges: sandboxGraph.edges.length })}
                    discardLabel={t("assistant_discard_draft")}
                    onDiscard={discardDraft}
                  />
                ) : null}
                <AssistantTranscriptBlock
                  embedInParentScroll
                  isRoundtable
                  messages={chat.messages}
                  chatBusy={chat.chatBusy}
                  rtTranscript={roundtable.rtTranscript}
                  rtRoundBusy={roundtable.rtRoundBusy}
                  rtProposal={roundtable.rtProposal}
                  onClearChat={chat.clearChat}
                  onClearRoundtable={roundtable.clearRtTranscript}
                  rtPersonas={roundtable.rtPersonas}
                  onRemoveRtPersona={roundtable.removeRtPersona}
                  rtGraphNodeIds={rtGraphNodeIds}
                />
              </div>
              <AssistantPanelSimulationStack {...simulationStackProps} />
            </div>
          ) : (
            <div className="mm-assistant-thin-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
              {sandboxHasDrafts ? (
                <AssistantSandboxDraftBanner
                  line={t("assistant_draft_line", { nodes: sandboxGraph.nodes.length, edges: sandboxGraph.edges.length })}
                  discardLabel={t("assistant_discard_draft")}
                  onDiscard={discardDraft}
                />
              ) : null}
              <div className="space-y-8">
                {mode === "chat" ? (
                  <section className="space-y-2">
                    <AssistantTranscriptBlock
                      listRef={chat.listRef}
                      isRoundtable={false}
                      messages={chat.messages}
                      chatBusy={chat.chatBusy}
                      rtTranscript={roundtable.rtTranscript}
                      rtRoundBusy={roundtable.rtRoundBusy}
                      rtProposal={roundtable.rtProposal}
                      onClearChat={chat.clearChat}
                      onClearRoundtable={roundtable.clearRtTranscript}
                      onSlashModeJump={setMode}
                    />
                  </section>
                ) : null}

                <AssistantPanelSimulationStack {...simulationStackProps} />
              </div>
            </div>
          )}

          {mode === "counsel" ? null : (
            <AssistantWorkspaceFooter
              error={error}
              mode={mode}
              selectedNodeId={selectedNode?.id}
              rtRoundBusy={roundtable.rtRoundBusy}
              rtPersonasCount={roundtable.rtPersonas.length}
              onRunRoundtableRound={runRoundtableRound}
              rtProposeBusy={roundtable.rtProposeBusy}
              rtTranscriptCount={roundtable.rtTranscript.length}
              onProposeRoundtable={proposeRoundtable}
              hasRoundtableProposal={Boolean(roundtable.rtProposal)}
              rtConfirmApply={roundtable.rtConfirmApply}
              onRtConfirmApplyChange={roundtable.setRtConfirmApply}
              rtApplyBusy={roundtable.rtApplyBusy}
              onApplyRoundtablePatch={applyRoundtablePatch}
              applyBusy={chat.applyBusy}
              messagesCount={chat.messages.length}
              onApplyToMindmap={applyToMindmap}
              rtSteering={roundtable.rtSteering}
              onRtSteeringChange={roundtable.setRtSteering}
              draft={chat.draft}
              onDraftChange={chat.setDraft}
              chatBusy={chat.chatBusy}
              onSendChat={runSendChat}
              meceFooterPrimary={meceFooterPrimary}
            />
          )}
        </main>
      </div>
    </div>
  );
}
