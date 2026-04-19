import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, MessageCircle, RotateCcw } from "lucide-react";
import { combineGraphs } from "../lib/graphBranch";
import { getBackendBase } from "../lib/backendBase";
import {
  availableMetrics,
  branchExtractToMeterInputs,
  computeMeterPreview,
  extractBranchFinancialBaselines,
  findAffectedBranchNodes,
  type OptimismMetric
} from "../lib/optimismMeter";
import type { MindmapJson } from "../types/mindmap";
import AssistantPanelInactive from "./AssistantPanelInactive";
import AssistantBlackSwanTab from "./assistant/tabs/AssistantBlackSwanTab";
import AssistantMeceTab from "./assistant/tabs/AssistantMeceTab";
import AssistantOptimismTab from "./assistant/tabs/AssistantOptimismTab";
import AssistantRoundtableTab from "./assistant/tabs/AssistantRoundtableTab";
import AssistantSkillsBlock from "./assistant/AssistantSkillsBlock";
import AssistantTranscriptBlock from "./assistant/AssistantTranscriptBlock";
import AssistantPanelFooter from "./assistant/AssistantPanelFooter";
import {
  SKILLS_STORAGE_KEY,
  ROUNDTABLE_LIB_KEY,
  loadRoundtableLib,
  loadSkillsFromStorage,
  presetRoundtableInstruction,
  type BlackSwanRunBundle,
  type BlackSwanScenario,
  type ChatRow,
  type CustomSkillRow,
  type MeceEvidenceRow,
  type MeceScanBundle,
  type RoundtablePersona,
  type RoundtableTranscriptRow
} from "./assistant/assistantTypes";
import {
  useAssistantPanelActions,
  type AssistantPanelActionsCtx
} from "./assistant/useAssistantPanelActions";
import { useAssistantGraphSlice, useAssistantSessionSlice, useAssistantSkillsSlice } from "./assistant/useAssistantZustand";

export type { CustomSkillRow } from "./assistant/assistantTypes";

export default function AssistantPanel() {
  const { mainGraph, sandboxGraph, sandboxMode, setSandboxMode, loadMainGraph, clearSandbox } = useAssistantGraphSlice();
  const { selectedNode, assistantActive, setAssistantActive, setAssistantDockOpen } = useAssistantSessionSlice();
  const { skills, toggleSkill } = useAssistantSkillsSlice();

  const backendBase = getBackendBase();

  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [draft, setDraft] = useState("");
  const [persona, setPersona] = useState<string>(() => localStorage.getItem("mindmap_assistant_persona") || "");
  const [applyInstruction, setApplyInstruction] = useState("");
  const [webSearchQuery, setWebSearchQuery] = useState<string>(() => localStorage.getItem("mindmap_web_search_query") || "");
  const [mode, setMode] = useState<"chat" | "optimism" | "blackSwan" | "mece" | "roundtable">("chat");

  const [rtPersonas, setRtPersonas] = useState<RoundtablePersona[]>([]);
  const [rtTranscript, setRtTranscript] = useState<RoundtableTranscriptRow[]>([]);
  const [rtSteering, setRtSteering] = useState("");
  const [rtNewName, setRtNewName] = useState("");
  const [rtNewInstruction, setRtNewInstruction] = useState("");
  const [rtLib, setRtLib] = useState<{ name: string; instruction: string }[]>(() =>
    typeof localStorage !== "undefined" ? loadRoundtableLib() : []
  );
  const [rtRoundBusy, setRtRoundBusy] = useState(false);
  const [rtProposeBusy, setRtProposeBusy] = useState(false);
  const [rtApplyBusy, setRtApplyBusy] = useState(false);
  const [rtProposal, setRtProposal] = useState<{
    discussion_summary: string;
    recommended_mindmap_changes: string;
    patch: Record<string, unknown>;
  } | null>(null);
  const [rtConfirmApply, setRtConfirmApply] = useState(false);

  const [currency, setCurrency] = useState("USD");
  /** Meter: −100% … +100% vs branch baseline, steps of 10%. */
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
  const [meceEvidenceBundle, setMeceEvidenceBundle] = useState<{ results: MeceEvidenceRow[]; corpus_stats?: Record<string, unknown> } | null>(
    null
  );
  const [meceWebHints, setMeceWebHints] = useState<Record<string, string>>({});
  const [meceWebBusyId, setMeceWebBusyId] = useState<string | null>(null);
  const [customSkills, setCustomSkills] = useState<CustomSkillRow[]>(() =>
    typeof localStorage !== "undefined" ? loadSkillsFromStorage() : []
  );
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillBody, setNewSkillBody] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [error, setError] = useState("");
  const [skillImportUrl, setSkillImportUrl] = useState("");
  const [skillImportBusy, setSkillImportBusy] = useState(false);
  const [skillImportMessage, setSkillImportMessage] = useState("");
  /** Skill id → instruction panel expanded (default collapsed = details hidden). */
  const [skillDetailsOpen, setSkillDetailsOpen] = useState<Record<string, boolean>>({});
  /** Collapse entire builtin + custom skills block to focus on chat. */
  const [skillsBlockExpanded, setSkillsBlockExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem("mindmap_skills_block_expanded") !== "0";
    } catch {
      return true;
    }
  });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(customSkills));
    } catch {
      /* ignore quota */
    }
  }, [customSkills]);

  useEffect(() => {
    try {
      localStorage.setItem("mindmap_skills_block_expanded", skillsBlockExpanded ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [skillsBlockExpanded]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chatBusy, mode, rtTranscript, rtRoundBusy]);

  useEffect(() => {
    try {
      localStorage.setItem(ROUNDTABLE_LIB_KEY, JSON.stringify(rtLib));
    } catch {
      /* ignore */
    }
  }, [rtLib]);

  const combined: MindmapJson = useMemo(
    () => combineGraphs(mainGraph, sandboxGraph),
    [mainGraph, sandboxGraph]
  );

  const branchFinancial = useMemo(() => {
    if (!selectedNode?.id) return null;
    return extractBranchFinancialBaselines(selectedNode.id, combined);
  }, [selectedNode?.id, combined]);

  const meterInputs = useMemo(() => {
    if (!branchFinancial) return null;
    return branchExtractToMeterInputs(branchFinancial);
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

  const sandboxHasDrafts =
    sandboxGraph.nodes.length > 0 || sandboxGraph.edges.length > 0;

  const payloadSkills = useMemo(
    () =>
      customSkills.map((s) => ({
        name: s.name.trim() || "Custom skill",
        instruction: s.instruction.trim(),
        enabled: s.enabled
      })),
    [customSkills]
  );

  const builtinPayload = useMemo(
    () => ({
      webSearch: Boolean(skills.webSearch),
      financialAnalyst: Boolean(skills.financialAnalyst)
    }),
    [skills.financialAnalyst, skills.webSearch]
  );

  useEffect(() => {
    try {
      localStorage.setItem("mindmap_assistant_persona", persona);
    } catch {
      // ignore
    }
  }, [persona]);

  useEffect(() => {
    try {
      localStorage.setItem("mindmap_web_search_query", webSearchQuery);
    } catch {
      // ignore
    }
  }, [webSearchQuery]);

  const actionsCtxRef = useRef({} as AssistantPanelActionsCtx);
  const {
    sendChat,
    applyToMindmap,
    applyWithInstruction,
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
    backendBase,
    combined,
    selectedNodeId: selectedNode?.id,
    draft,
    chatBusy,
    messages,
    persona,
    webSearchQuery,
    skillsWebSearch: skills.webSearch,
    payloadSkills,
    builtinPayload,
    sandboxMode,
    sandboxHasDrafts,
    applyInstruction,
    skillImportUrl,
    skillImportBusy,
    meterInputs,
    optimismFocus,
    optimismDeltaPct,
    optimismAffected,
    currency,
    bsScenarios,
    bsSelectedScenarioIds,
    bsRunBundle,
    bsMitigationPick,
    meceScanBundle,
    meceSelectedMods,
    meceEvidenceBundle,
    meceWebHints,
    rtPersonas,
    rtTranscript,
    rtSteering,
    rtProposal,
    rtConfirmApply,
    setDraft,
    setMessages,
    setError,
    setChatBusy,
    setApplyBusy,
    setApplyInstruction,
    setSimBusy,
    setSimReport,
    setBsScenarios,
    setBsSelectedScenarioIds,
    setBsRunBundle,
    setBsMitigationPick,
    setMeceScanBundle,
    setMeceSelectedMods,
    setMeceEvidenceBundle,
    setMeceWebHints,
    setMeceWebBusyId,
    setCustomSkills,
    setSkillImportUrl,
    setSkillImportBusy,
    setSkillImportMessage,
    setRtTranscript,
    setRtRoundBusy,
    setRtProposeBusy,
    setRtApplyBusy,
    setRtProposal,
    setRtConfirmApply,
    setRtSteering,
    loadMainGraph,
    clearSandbox,
    setSandboxMode,
    setAssistantActive
  };

  const discardDraft = useCallback(() => {
    clearSandbox();
    setError("");
  }, [clearSandbox]);

  const addSkill = useCallback(() => {
    const instruction = newSkillBody.trim();
    if (!instruction) return;
    setCustomSkills((prev) => [
      ...prev,
      {
        id: `s_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        name: newSkillName.trim() || "Custom skill",
        instruction,
        enabled: true
      }
    ]);
    setNewSkillName("");
    setNewSkillBody("");
  }, [newSkillBody, newSkillName]);

  const removeSkill = useCallback((id: string) => {
    setCustomSkills((prev) => prev.filter((s) => s.id !== id));
    setSkillDetailsOpen((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const toggleCustom = useCallback((id: string) => {
    setCustomSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }, []);

  const toggleSkillDetails = useCallback((id: string) => {
    setSkillDetailsOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const updateSkillName = useCallback((id: string, name: string) => {
    setCustomSkills((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name: name.slice(0, 120) } : s))
    );
  }, []);

  const updateSkillInstruction = useCallback((id: string, instruction: string) => {
    setCustomSkills((prev) =>
      prev.map((s) => (s.id === id ? { ...s, instruction: instruction.slice(0, 8000) } : s))
    );
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError("");
  }, []);

  const activateAssistant = useCallback(() => {
    if (!selectedNode?.id) return;
    setAssistantActive(true);
    setSandboxMode(true);
    setError("");
  }, [selectedNode?.id, setAssistantActive, setSandboxMode]);

  const deactivateAssistant = useCallback(() => {
    setAssistantActive(false);
    setSandboxMode(false);
    setError("");
    setRtTranscript([]);
    setRtProposal(null);
    setRtConfirmApply(false);
    setRtSteering("");
  }, [setAssistantActive, setSandboxMode]);

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

  const addRtPreset = useCallback((name: string) => {
    const n = name.trim();
    if (!n) return;
    setRtPersonas((prev) => {
      if (prev.some((p) => p.name.trim().toLowerCase() === n.toLowerCase())) return prev;
      const id = `rtp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      return [...prev, { id, name: n, instruction: presetRoundtableInstruction(n) }];
    });
  }, []);

  const addRtCustom = useCallback(() => {
    const name = rtNewName.trim().slice(0, 120);
    const instruction = rtNewInstruction.trim().slice(0, 4000);
    if (!name || !instruction) return;
    const id = `rtp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    setRtPersonas((prev) => [...prev, { id, name, instruction }]);
    setRtLib((prev) => {
      if (prev.some((x) => x.name.trim().toLowerCase() === name.toLowerCase())) return prev;
      return [...prev, { name, instruction }];
    });
    setRtNewName("");
    setRtNewInstruction("");
  }, [rtNewName, rtNewInstruction]);

  const addRtFromLib = useCallback((name: string, instruction: string) => {
    const n = name.trim();
    const ins = instruction.trim();
    if (!n || !ins) return;
    setRtPersonas((prev) => {
      if (prev.some((p) => p.name.trim().toLowerCase() === n.toLowerCase())) return prev;
      const id = `rtp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      return [...prev, { id, name: n, instruction: ins.slice(0, 4000) }];
    });
  }, []);

  const removeRtPersona = useCallback((id: string) => {
    setRtPersonas((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearRtTranscript = useCallback(() => {
    setRtTranscript([]);
    setRtProposal(null);
    setRtConfirmApply(false);
    setError("");
  }, []);

  if (!assistantActive) {
    return (
      <AssistantPanelInactive
        selectedNode={selectedNode}
        setAssistantDockOpen={setAssistantDockOpen}
        onActivate={activateAssistant}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-2 py-2 dark:border-slate-800">
        <MessageCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Assistant
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="inline-flex items-center gap-0.5 rounded-lg border border-transparent px-1.5 py-1 text-[10px] font-medium text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-900 dark:hover:text-slate-200"
            title="Hide assistant panel — full width canvas"
            onClick={() => setAssistantDockOpen(false)}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Hide
          </button>
          <button type="button" className="ios-button" onClick={deactivateAssistant}>
            Close session
          </button>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden border-b border-slate-200 p-2 dark:border-slate-800">
        <div className="mb-3 ios-card p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Session
          </div>
          <div className="mt-1 text-[11px] text-slate-700 dark:text-slate-200">
            Target node: <span className="font-mono">{selectedNode?.id ?? "—"}</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            Sandbox is active during this session; new nodes/edges remain drafts until you apply.
          </div>
          <label className="mt-2 block text-[11px] text-slate-700 dark:text-slate-200">
            AI persona (optional)
            <input
              className="mt-1 ios-input py-1.5"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder='e.g. "Skeptical investor", "Legal counsel"'
            />
          </label>
          {skills.webSearch && (
            <label className="mt-2 block text-[11px] text-slate-700 dark:text-slate-200">
              Web search query (recommended)
              <input
                className="mt-1 ios-input py-1.5"
                value={webSearchQuery}
                onChange={(e) => setWebSearchQuery(e.target.value)}
                placeholder='e.g. "病理AI 市场规模 2024 2025 中国"'
              />
            </label>
          )}
        </div>
        {sandboxHasDrafts ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-slate-600 dark:text-slate-400">
              Draft: {sandboxGraph.nodes.length} node(s), {sandboxGraph.edges.length} edge(s)
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[10px] text-slate-600 underline dark:text-slate-400"
              onClick={discardDraft}
            >
              <RotateCcw className="h-3 w-3" />
              Discard draft
            </button>
          </div>
        ) : null}

        <div className="mb-3">
          <div className="ios-segment flex w-full flex-wrap justify-stretch gap-0.5">
            <button
              type="button"
              className={[
                "ios-segment-item min-w-0 flex-1 px-2 py-1.5 text-[10px] sm:text-sm",
                mode === "chat" ? "ios-segment-item-active" : "ios-segment-item-inactive"
              ].join(" ")}
              onClick={() => setMode("chat")}
            >
              Chat
            </button>
            <button
              type="button"
              className={[
                "ios-segment-item min-w-0 flex-1 px-2 py-1.5 text-[10px] sm:text-sm",
                mode === "optimism" ? "ios-segment-item-active" : "ios-segment-item-inactive"
              ].join(" ")}
              onClick={() => setMode("optimism")}
            >
              Optimism
            </button>
            <button
              type="button"
              className={[
                "ios-segment-item min-w-0 flex-1 px-2 py-1.5 text-[10px] sm:text-sm",
                mode === "blackSwan" ? "ios-segment-item-active" : "ios-segment-item-inactive"
              ].join(" ")}
              onClick={() => setMode("blackSwan")}
            >
              Black swan
            </button>
            <button
              type="button"
              className={[
                "ios-segment-item min-w-0 flex-1 px-2 py-1.5 text-[10px] sm:text-sm",
                mode === "mece" ? "ios-segment-item-active" : "ios-segment-item-inactive"
              ].join(" ")}
              onClick={() => setMode("mece")}
            >
              MECE
            </button>
            <button
              type="button"
              className={[
                "ios-segment-item min-w-0 flex-1 px-2 py-1.5 text-[10px] sm:text-sm",
                mode === "roundtable" ? "ios-segment-item-active" : "ios-segment-item-inactive"
              ].join(" ")}
              onClick={() => setMode("roundtable")}
            >
              Roundtable
            </button>
          </div>
        </div>

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
            onApplyOptimism={runOptimismSimulation}
          />
        )}

        {mode === "blackSwan" && (
          <AssistantBlackSwanTab
            selectedNodeId={selectedNode?.id}
            simBusy={simBusy}
            bsScenarios={bsScenarios}
            bsSelectedScenarioIds={bsSelectedScenarioIds}
            onToggleScenario={handleBsToggleScenario}
            bsRunBundle={bsRunBundle}
            bsMitigationPick={bsMitigationPick}
            onToggleMitigation={handleBsToggleMitigation}
            onScan={blackSwanScan}
            onRun={blackSwanRun}
            onApply={blackSwanApply}
          />
        )}

        {mode === "mece" && (
          <AssistantMeceTab
            selectedNodeId={selectedNode?.id}
            simBusy={simBusy}
            meceScanBundle={meceScanBundle}
            meceSelectedMods={meceSelectedMods}
            onToggleModification={handleMeceToggleModification}
            meceEvidenceBundle={meceEvidenceBundle}
            meceWebHints={meceWebHints}
            meceWebBusyId={meceWebBusyId}
            onScan={meceScan}
            onEvidence={meceEvidence}
            onWebSearchForMod={meceWebSearchForMod}
            onApply={meceApply}
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
            onAddPreset={addRtPreset}
            onAddFromLib={addRtFromLib}
            onRemovePersona={removeRtPersona}
            onAddCustom={addRtCustom}
          />
        )}

        {simReport && (
          <div className="mb-3 ios-card p-3 text-[11px] text-slate-700 dark:text-slate-200">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Simulation report
            </div>
            <pre className="whitespace-pre-wrap">{simReport}</pre>
          </div>
        )}

        <AssistantSkillsBlock
          skillsBlockExpanded={skillsBlockExpanded}
          onToggleSkillsBlockExpanded={() => setSkillsBlockExpanded((v) => !v)}
          builtinWebSearch={skills.webSearch}
          builtinFinancialAnalyst={skills.financialAnalyst}
          onToggleBuiltinSkill={toggleSkill}
          customSkills={customSkills}
          skillDetailsOpen={skillDetailsOpen}
          onToggleSkillDetails={toggleSkillDetails}
          onToggleCustomSkill={toggleCustom}
          onUpdateSkillName={updateSkillName}
          onUpdateSkillInstruction={updateSkillInstruction}
          onRemoveSkill={removeSkill}
          skillImportUrl={skillImportUrl}
          onSkillImportUrlChange={(value) => {
            setSkillImportUrl(value);
            if (skillImportMessage) setSkillImportMessage("");
          }}
          skillImportBusy={skillImportBusy}
          skillImportMessage={skillImportMessage}
          onFetchSkillFromUrl={fetchSkillFromUrl}
          newSkillName={newSkillName}
          onNewSkillNameChange={setNewSkillName}
          newSkillBody={newSkillBody}
          onNewSkillBodyChange={setNewSkillBody}
          onAddSkill={addSkill}
        />

        <AssistantTranscriptBlock
          listRef={listRef}
          isRoundtable={mode === "roundtable"}
          messages={messages}
          chatBusy={chatBusy}
          rtTranscript={rtTranscript}
          rtRoundBusy={rtRoundBusy}
          rtProposal={rtProposal}
          onClearChat={clearChat}
          onClearRoundtable={clearRtTranscript}
        />
      </div>

      <AssistantPanelFooter
        error={error}
        mode={mode}
        selectedNodeId={selectedNode?.id}
        rtSteering={rtSteering}
        onRtSteeringChange={setRtSteering}
        rtRoundBusy={rtRoundBusy}
        rtPersonasCount={rtPersonas.length}
        onRunRoundtableRound={runRoundtableRound}
        rtProposeBusy={rtProposeBusy}
        rtTranscriptCount={rtTranscript.length}
        onProposeRoundtable={proposeRoundtable}
        hasRoundtableProposal={Boolean(rtProposal)}
        rtConfirmApply={rtConfirmApply}
        onRtConfirmApplyChange={setRtConfirmApply}
        rtApplyBusy={rtApplyBusy}
        onApplyRoundtablePatch={applyRoundtablePatch}
        applyInstruction={applyInstruction}
        onApplyInstructionChange={setApplyInstruction}
        applyBusy={applyBusy}
        draft={draft}
        onDraftChange={setDraft}
        chatBusy={chatBusy}
        onSendChat={sendChat}
        messagesCount={messages.length}
        onApplyToMindmap={applyToMindmap}
        onApplyWithInstruction={applyWithInstruction}
      />
    </div>
  );
}
