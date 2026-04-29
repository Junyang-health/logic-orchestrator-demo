import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { combineGraphs } from "../lib/graphBranch";
import { getBackendBase } from "../lib/backendBase";
import { useI18n } from "../i18n/useI18n";
import {
  availableMetrics,
  branchExtractToMeterInputs,
  computeMeterPreview,
  extractBranchFinancialBaselines,
  findAffectedBranchNodes,
  type OptimismMetric
} from "../lib/optimismMeter";
import type { MindmapJson } from "../types/mindmap";
import AssistantSkillsBlock from "./assistant/AssistantSkillsBlock";
import AssistantTranscriptBlock from "./assistant/AssistantTranscriptBlock";
import AssistantPanelLeftActions from "./assistant/AssistantPanelLeftActions";
import AssistantPanelRightComposer from "./assistant/AssistantPanelRightComposer";
import AssistantPanelHeader from "./assistant/AssistantPanelHeader";
import AssistantPanelModeSegment from "./assistant/AssistantPanelModeSegment";
import AssistantPanelSimulationStack from "./assistant/AssistantPanelSimulationStack";
import AssistantCounselFlow from "./assistant/AssistantCounselFlow";
import AssistantSandboxDraftBanner from "./assistant/AssistantSandboxDraftBanner";
import AssistantSessionSourcesCard from "./assistant/AssistantSessionSourcesCard";
import type { AssistantPanelMode } from "./assistant/assistantPanelMode";
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
import { readAssistantSourceFilePickMap, writeAssistantSourceFilePickForProject } from "./assistant/assistantSourceFilePick";
import {
  useAssistantPanelActions,
  type AssistantPanelActionsCtx
} from "./assistant/useAssistantPanelActions";
import { useAssistantGraphSlice, useAssistantSessionSlice, useAssistantSkillsSlice } from "./assistant/useAssistantZustand";

export type { CustomSkillRow } from "./assistant/assistantTypes";

export default function AssistantPanel() {
  const { t, locale } = useI18n();
  const { mainGraph, sandboxGraph, sandboxMode, setSandboxMode, loadMainGraph, clearSandbox } = useAssistantGraphSlice();
  const { selectedNode, closeAssistantSession } = useAssistantSessionSlice();
  const { skills, toggleSkill } = useAssistantSkillsSlice();

  const backendBase = getBackendBase();

  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [draft, setDraft] = useState("");
  const [webSearchQuery, setWebSearchQuery] = useState<string>(() => localStorage.getItem("mindmap_web_search_query") || "");
  const [activeProjectId, setActiveProjectId] = useState(() => {
    try {
      return (typeof localStorage !== "undefined" && localStorage.getItem("mindmap_project_id")?.trim()) || "";
    } catch {
      return "";
    }
  });
  const [projectFiles, setProjectFiles] = useState<{ id: string; filename: string }[]>([]);
  const [projectFilesLoadError, setProjectFilesLoadError] = useState(false);
  const [selectedSourceFileIds, setSelectedSourceFileIds] = useState<string[]>([]);
  const [mode, setMode] = useState<AssistantPanelMode>("chat");

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
  const [ingestWebBusy, setIngestWebBusy] = useState(false);
  const [error, setError] = useState("");
  const [skillImportUrl, setSkillImportUrl] = useState("");
  const [skillImportBusy, setSkillImportBusy] = useState(false);
  const [skillImportMessage, setSkillImportMessage] = useState("");
  /** Skill id → instruction panel expanded (default collapsed = details hidden). */
  const [skillDetailsOpen, setSkillDetailsOpen] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(customSkills));
    } catch {
      /* ignore quota */
    }
  }, [customSkills]);

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

  const combined: MindmapJson = useMemo(() => combineGraphs(mainGraph, sandboxGraph), [mainGraph, sandboxGraph]);

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

  const sandboxHasDrafts = sandboxGraph.nodes.length > 0 || sandboxGraph.edges.length > 0;

  const payloadSkills = useMemo(
    () =>
      customSkills.map((s) => ({
        name: s.name.trim() || t("custom_skill"),
        instruction: s.instruction.trim(),
        enabled: s.enabled
      })),
    [customSkills, t, locale]
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
      localStorage.setItem("mindmap_web_search_query", webSearchQuery);
    } catch {
      // ignore
    }
  }, [webSearchQuery]);

  useEffect(() => {
    const read = () => (typeof localStorage !== "undefined" && localStorage.getItem("mindmap_project_id")?.trim()) || "";
    setActiveProjectId(read());
    const onProject = (e: Event) => {
      const id = (e as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (id != null) setActiveProjectId(String(id).trim());
    };
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === "mindmap_project_id") setActiveProjectId((ev.newValue || "").trim());
    };
    window.addEventListener("mindmap:projectId", onProject);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("mindmap:projectId", onProject);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const loadProjectFiles = useCallback(
    async (signal?: AbortSignal) => {
      if (!activeProjectId || !backendBase) {
        setProjectFiles([]);
        setProjectFilesLoadError(false);
        return;
      }
      setProjectFilesLoadError(false);
      try {
        const res = await fetch(`${backendBase}/projects/${encodeURIComponent(activeProjectId)}/files`, { signal });
        if (!res.ok) {
          setProjectFilesLoadError(true);
          setProjectFiles([]);
          return;
        }
        const rows = (await res.json()) as { id: string; filename: string }[];
        if (signal?.aborted) return;
        setProjectFiles(Array.isArray(rows) ? rows.map((r) => ({ id: r.id, filename: r.filename || r.id })) : []);
      } catch {
        if (!signal?.aborted) {
          setProjectFilesLoadError(true);
          setProjectFiles([]);
        }
      }
    },
    [activeProjectId, backendBase]
  );

  useEffect(() => {
    const ac = new AbortController();
    void loadProjectFiles(ac.signal);
    return () => ac.abort();
  }, [loadProjectFiles]);

  const ingestWebToSources = useCallback(async () => {
    const projectId = activeProjectId?.trim() || "";
    if (!projectId) {
      setError(t("assistant_ingest_no_project"));
      return;
    }
    const lines = webSearchQuery
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setError(t("assistant_ingest_no_queries"));
      return;
    }
    setIngestWebBusy(true);
    setError("");
    try {
      const res = await fetch(`${backendBase}/projects/${encodeURIComponent(projectId)}/files/ingest-web`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries: lines, max_results_per_query: 3, max_pages_ingest: 15 })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `ingest ${res.status}`);
      }
      const data = (await res.json()) as { stored: { id: string }[]; notices: string[] };
      await loadProjectFiles();
      const newIds = (data.stored || []).map((s) => s.id);
      if (newIds.length > 0) {
        setSelectedSourceFileIds((prev) => Array.from(new Set([...prev, ...newIds])));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("assistant_ingest_fail"));
    } finally {
      setIngestWebBusy(false);
    }
  }, [activeProjectId, backendBase, loadProjectFiles, t, webSearchQuery]);

  useEffect(() => {
    if (!activeProjectId) {
      setSelectedSourceFileIds([]);
      return;
    }
    if (projectFiles.length === 0) {
      setSelectedSourceFileIds([]);
      return;
    }
    const idSet = new Set(projectFiles.map((f) => f.id));
    setSelectedSourceFileIds((prev) => {
      if (prev.length > 0) {
        const kept = prev.filter((id) => idSet.has(id));
        if (kept.length > 0) return kept;
      }
      const map = readAssistantSourceFilePickMap();
      const saved = (map[activeProjectId] ?? []).filter((id) => idSet.has(id));
      if (saved.length > 0) return saved;
      return projectFiles.map((f) => f.id);
    });
  }, [activeProjectId, projectFiles]);

  useEffect(() => {
    if (!activeProjectId) return;
    writeAssistantSourceFilePickForProject(activeProjectId, selectedSourceFileIds);
  }, [activeProjectId, selectedSourceFileIds]);

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
    backendBase,
    combined,
    selectedNodeId: selectedNode?.id,
    draft,
    chatBusy,
    messages,
    webSearchQuery,
    skillsWebSearch: skills.webSearch,
    assistantSourceFileIds: selectedSourceFileIds,
    payloadSkills,
    builtinPayload,
    sandboxMode,
    sandboxHasDrafts,
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
    setSandboxMode
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
        name: newSkillName.trim() || t("custom_skill"),
        instruction,
        enabled: true
      }
    ]);
    setNewSkillName("");
    setNewSkillBody("");
  }, [newSkillBody, newSkillName, t]);

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
    setCustomSkills((prev) => prev.map((s) => (s.id === id ? { ...s, name: name.slice(0, 120) } : s)));
  }, []);

  const updateSkillInstruction = useCallback((id: string, instruction: string) => {
    setCustomSkills((prev) => prev.map((s) => (s.id === id ? { ...s, instruction: instruction.slice(0, 8000) } : s)));
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError("");
  }, []);

  const deactivateAssistant = useCallback(() => {
    closeAssistantSession();
    setError("");
    setRtTranscript([]);
    setRtProposal(null);
    setRtConfirmApply(false);
    setRtSteering("");
  }, [closeAssistantSession]);

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

  const runSendChat = useCallback(async () => {
    const raw = draft.trim();
    if (raw) {
      const m = raw.match(/^\s*\/(chat|optimism|blackswan|black-swan|mece|roundtable|counsel)\s*$/i);
      if (m) {
        const g = m[1].toLowerCase().replace("black-swan", "blackswan");
        const nextMode: AssistantPanelMode =
          g === "chat"
            ? "chat"
            : g === "optimism"
              ? "optimism"
              : g === "blackswan"
                ? "blackSwan"
                : g === "mece"
                  ? "mece"
                  : g === "counsel"
                    ? "counsel"
                    : "roundtable";
        setMode(nextMode);
        setDraft("");
        return;
      }
    }
    await sendChat();
  }, [draft, sendChat]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/95">
      <AssistantPanelHeader title={t("assistant_title")} closeLabel={t("assistant_close_session")} onClose={deactivateAssistant} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
        {/* Left ~70%: mode, transcript + simulations, primary actions */}
        <div className="flex min-h-0 min-w-0 w-[70%] flex-shrink-0 flex-col border-r border-slate-200 dark:border-slate-800">
          <AssistantPanelModeSegment
            mode={mode}
            onModeChange={setMode}
            labels={{
              chat: t("mode_chat"),
              optimism: t("mode_optimism"),
              blackSwan: t("mode_black_swan"),
              mece: t("mode_mece"),
              roundtable: t("mode_roundtable"),
              counsel: t("mode_counsel")
            }}
          />
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
            {sandboxHasDrafts ? (
              <AssistantSandboxDraftBanner
                line={t("assistant_draft_line", { nodes: sandboxGraph.nodes.length, edges: sandboxGraph.edges.length })}
                discardLabel={t("assistant_discard_draft")}
                onDiscard={discardDraft}
              />
            ) : null}

            {mode === "counsel" ? (
              <AssistantCounselFlow
                backendBase={backendBase}
                projectId={activeProjectId}
                selectedNodeId={selectedNode?.id}
                mainGraph={mainGraph}
                sandboxGraph={sandboxGraph}
                sourceFileIds={selectedSourceFileIds}
                payloadSkills={payloadSkills}
                builtinSkills={builtinPayload}
                sandboxMode={sandboxMode}
                loadMainGraph={loadMainGraph}
                rtLib={rtLib}
                onPersistPersonaToLib={(name, instruction) => {
                  setRtLib((prev) => {
                    if (prev.some((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase())) return prev;
                    return [...prev, { name: name.trim().slice(0, 120), instruction: instruction.trim().slice(0, 4000) }];
                  });
                }}
              />
            ) : (
              <>
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

                <AssistantPanelSimulationStack
                  mode={mode}
                  simReport={simReport}
                  simReportTitle={t("assistant_sim_report")}
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
                  selectedNodeId={selectedNode?.id}
                  bsScenarios={bsScenarios}
                  bsSelectedScenarioIds={bsSelectedScenarioIds}
                  onToggleScenario={handleBsToggleScenario}
                  bsRunBundle={bsRunBundle}
                  bsMitigationPick={bsMitigationPick}
                  onToggleMitigation={handleBsToggleMitigation}
                  onBlackSwanScan={blackSwanScan}
                  onBlackSwanRun={blackSwanRun}
                  onBlackSwanApply={blackSwanApply}
                  meceScanBundle={meceScanBundle}
                  meceSelectedMods={meceSelectedMods}
                  onToggleMeceModification={handleMeceToggleModification}
                  meceEvidenceBundle={meceEvidenceBundle}
                  meceWebHints={meceWebHints}
                  meceWebBusyId={meceWebBusyId}
                  onMeceScan={meceScan}
                  onMeceEvidence={meceEvidence}
                  onMeceWebSearchForMod={meceWebSearchForMod}
                  onMeceApply={meceApply}
                  rtPersonas={rtPersonas}
                  rtLib={rtLib}
                  rtNewName={rtNewName}
                  setRtNewName={setRtNewName}
                  rtNewInstruction={rtNewInstruction}
                  setRtNewInstruction={setRtNewInstruction}
                  onAddRtPreset={addRtPreset}
                  onAddFromLib={addRtFromLib}
                  onRemoveRtPersona={removeRtPersona}
                  onAddRtCustom={addRtCustom}
                />
              </>
            )}
          </div>

          {mode === "counsel" ? null : (
          <AssistantPanelLeftActions
            error={error}
            mode={mode}
            selectedNodeId={selectedNode?.id}
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
            applyBusy={applyBusy}
            messagesCount={messages.length}
            onApplyToMindmap={applyToMindmap}
          />
          )}
        </div>

        {/* Right ~30%: sources, skills, composer */}
        <div className="flex min-h-0 min-w-0 w-[30%] flex-shrink-0 flex-col">
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-2">
            <AssistantSessionSourcesCard
              sessionLabel={t("assistant_session")}
              targetNodeLabel={t("assistant_target_node")}
              selectedNodeId={selectedNode?.id}
              sandboxHint={t("assistant_sandbox_hint")}
              skillsWebSearch={skills.webSearch}
              webQueryLabel={t("assistant_web_query")}
              webQueryHelp={t("assistant_web_query_help")}
              webQueryPlaceholder={t("assistant_web_query_ph")}
              webSearchQuery={webSearchQuery}
              onWebSearchQueryChange={setWebSearchQuery}
              activeProjectId={activeProjectId}
              ingestBusy={ingestWebBusy}
              ingestCta={t("assistant_web_ingest_cta")}
              ingestBusyLabel={t("assistant_web_ingest_busy")}
              ingestHint={t("assistant_web_ingest_hint")}
              onIngestWeb={ingestWebToSources}
              sourceFilesLabel={t("assistant_source_files")}
              sourceFilesHint={t("assistant_source_files_hint")}
              sourceFilesNoProject={t("assistant_source_files_no_project")}
              sourceFilesError={t("assistant_source_files_error")}
              sourceFilesEmpty={t("assistant_source_files_empty")}
              selectAllSources={t("assistant_select_all_sources")}
              selectNoSources={t("assistant_select_no_sources")}
              selectionCount={(n) => t("assistant_source_files_selection_count", { n })}
              projectFilesLoadError={projectFilesLoadError}
              projectFiles={projectFiles}
              selectedSourceFileIds={selectedSourceFileIds}
              onSelectedSourceFileIdsChange={setSelectedSourceFileIds}
            />
            <AssistantSkillsBlock
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
          </div>
          {mode === "counsel" ? null : (
          <AssistantPanelRightComposer
            mode={mode}
            rtSteering={rtSteering}
            onRtSteeringChange={setRtSteering}
            rtRoundBusy={rtRoundBusy}
            draft={draft}
            onDraftChange={setDraft}
            chatBusy={chatBusy}
            onSendChat={runSendChat}
          />
          )}
        </div>
      </div>
    </div>
  );
}
