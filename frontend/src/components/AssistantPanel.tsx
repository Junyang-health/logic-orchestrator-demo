import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Link2,
  MessageCircle,
  Plus,
  Send,
  Trash2,
  RotateCcw,
  Wand2
} from "lucide-react";
import useUiStore from "../store/useUiStore";
import { combineGraphs } from "../lib/graphBranch";
import {
  availableMetrics,
  branchExtractToMeterInputs,
  computeMeterPreview,
  extractBranchFinancialBaselines,
  findAffectedBranchNodes,
  formatMoneyShort,
  snapDeltaPct,
  type OptimismMetric
} from "../lib/optimismMeter";
import type { MindmapJson } from "../types/mindmap";
import { REVIEW_PERSONAS } from "../types/review";

const SKILLS_STORAGE_KEY = "mindmap_assistant_skills_v1";
const ROUNDTABLE_LIB_KEY = "mindmap_roundtable_persona_lib_v1";

const ROUNDTABLE_PRESET_INSTRUCTIONS: Record<string, string> = {
  "Skeptical Investor": "Challenge upside; demand evidence, downside cases, and disciplined assumptions.",
  "Risk Analyst": "Surface operational, market, regulatory, and execution risks with clear severity.",
  "Friendly Coach": "Clarify intent, tighten wording, and suggest practical next steps without fluff.",
  "Devil's Advocate": "Steel-man counterarguments; probe hidden assumptions and failure modes."
};

function presetRoundtableInstruction(name: string): string {
  return ROUNDTABLE_PRESET_INSTRUCTIONS[name] ?? "Give a concise, distinctive take aligned with your role label.";
}

type RoundtablePersona = { id: string; name: string; instruction: string };
type RoundtableTranscriptRow = { id: string; role: "user" | "persona"; persona_name?: string; content: string };

function loadRoundtableLib(): { name: string; instruction: string }[] {
  try {
    const raw = localStorage.getItem(ROUNDTABLE_LIB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x: any) => ({
        name: typeof x.name === "string" ? x.name.slice(0, 120) : "",
        instruction: typeof x.instruction === "string" ? x.instruction.slice(0, 4000) : ""
      }))
      .filter((x) => x.name.trim() && x.instruction.trim());
  } catch {
    return [];
  }
}

export type CustomSkillRow = {
  id: string;
  name: string;
  instruction: string;
  enabled: boolean;
};

type ChatRow = { id: string; role: "user" | "assistant"; content: string };

function loadSkillsFromStorage(): CustomSkillRow[] {
  try {
    const raw = localStorage.getItem(SKILLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x: any) => ({
        id: typeof x.id === "string" ? x.id : `s_${Math.random().toString(16).slice(2, 10)}`,
        name: typeof x.name === "string" ? x.name.slice(0, 120) : "",
        instruction: typeof x.instruction === "string" ? x.instruction.slice(0, 8000) : "",
        enabled: x.enabled !== false
      }))
      .filter((x) => x.instruction.trim().length > 0);
  } catch {
    return [];
  }
}

export default function AssistantPanel() {
  const mainGraph = useUiStore((s) => s.mainGraph);
  const sandboxGraph = useUiStore((s) => s.sandboxGraph);
  const sandboxMode = useUiStore((s) => s.sandboxMode);
  const setSandboxMode = useUiStore((s) => s.setSandboxMode);
  const selectedNode = useUiStore((s) => s.selectedNode);
  const assistantActive = useUiStore((s) => s.assistantActive);
  const setAssistantActive = useUiStore((s) => s.setAssistantActive);
  const setAssistantDockOpen = useUiStore((s) => s.setAssistantDockOpen);
  const skills = useUiStore((s) => s.skills);
  const toggleSkill = useUiStore((s) => s.toggleSkill);
  const loadMainGraph = useUiStore((s) => s.loadMainGraph);
  const clearSandbox = useUiStore((s) => s.clearSandbox);

  const backendBase = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:8000";

  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [draft, setDraft] = useState("");
  const [persona, setPersona] = useState<string>(() => localStorage.getItem("mindmap_assistant_persona") || "");
  const [applyInstruction, setApplyInstruction] = useState("");
  const [webSearchQuery, setWebSearchQuery] = useState<string>(() => localStorage.getItem("mindmap_web_search_query") || "");
  const [mode, setMode] = useState<"chat" | "optimism" | "blackSwan" | "roundtable">("chat");

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

  const sendChat = useCallback(async () => {
    const text = draft.trim();
    if (!text || chatBusy) return;
    const userRow: ChatRow = { id: `u_${Date.now()}`, role: "user", content: text };
    const nextMessages = [...messages, userRow];
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setChatBusy(true);
    try {
      const apiMessages = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${backendBase}/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          full_nodes: combined.nodes,
          full_edges: combined.edges,
          selected_node_id: selectedNode?.id ?? null,
          web_search_query: skills.webSearch ? webSearchQuery.trim() || null : null,
          custom_skills: [
            ...(persona.trim()
              ? [{ name: "AI persona", instruction: `Adopt this persona while discussing: ${persona.trim()}`, enabled: true }]
              : []),
            ...payloadSkills
          ],
          builtin_skills: builtinPayload,
          sandbox_mode: sandboxMode
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Chat failed (${res.status})`);
      }
      const data = (await res.json()) as { reply: string };
      setMessages((prev) => [
        ...prev,
        { id: `a_${Date.now()}`, role: "assistant", content: data.reply || "…" }
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat request failed");
      setMessages((prev) => prev.filter((m) => m.id !== userRow.id));
    } finally {
      setChatBusy(false);
    }
  }, [
    draft,
    chatBusy,
    messages,
    backendBase,
    combined.nodes,
    combined.edges,
    selectedNode?.id,
    payloadSkills,
    builtinPayload,
    sandboxMode
  ]);

  const applyToMindmap = useCallback(async () => {
    if (!selectedNode?.id) {
      setError("Select a branch root node on the canvas before applying changes to the mindmap.");
      return;
    }
    if (messages.length === 0) {
      setError("Have at least one message in the conversation before applying.");
      return;
    }
    setApplyBusy(true);
    setError("");
    try {
      const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${backendBase}/assistant/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_root_id: selectedNode.id,
          full_nodes: combined.nodes,
          full_edges: combined.edges,
          messages: apiMessages,
          custom_skills: [
            ...(persona.trim()
              ? [{ name: "AI persona", instruction: `Adopt this persona while discussing: ${persona.trim()}`, enabled: true }]
              : []),
            ...payloadSkills
          ],
          builtin_skills: builtinPayload,
          sandbox_mode: sandboxMode || sandboxHasDrafts
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Apply failed (${res.status})`);
      }
      const data = (await res.json()) as { mindmap: MindmapJson };
      loadMainGraph(data.mindmap);
      clearSandbox();
      setSandboxMode(false);
      setAssistantActive(false);
      setApplyInstruction("");
      useUiStore.getState().setSelectedNode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply request failed");
    } finally {
      setApplyBusy(false);
    }
  }, [
    selectedNode?.id,
    messages,
    backendBase,
    combined.nodes,
    combined.edges,
    payloadSkills,
    builtinPayload,
    loadMainGraph,
    clearSandbox,
    sandboxMode,
    sandboxHasDrafts,
    setSandboxMode,
    persona,
    setAssistantActive
  ]);

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

  const fetchSkillFromUrl = useCallback(async () => {
    const url = skillImportUrl.trim();
    if (!url || skillImportBusy) return;
    setSkillImportBusy(true);
    setSkillImportMessage("");
    try {
      const res = await fetch(`${backendBase}/assistant/fetch-skill-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = (raw as { detail?: unknown }).detail;
        const msg =
          typeof d === "string"
            ? d
            : Array.isArray(d)
              ? d.map((x: unknown) => (typeof x === "object" && x && "msg" in x ? String((x as { msg: string }).msg) : JSON.stringify(x))).join("; ")
              : d != null
                ? JSON.stringify(d)
                : `Import failed (${res.status})`;
        throw new Error(msg);
      }
      const data = raw as { instruction: string; suggested_name?: string; fetched_url?: string };
      const instruction = (data.instruction || "").trim();
      if (!instruction) throw new Error("Server returned an empty document");
      const name = (data.suggested_name || "Remote skill").trim().slice(0, 120);
      setCustomSkills((prev) => [
        ...prev,
        {
          id: `s_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
          name: name || "Remote skill",
          instruction,
          enabled: true
        }
      ]);
      setSkillImportUrl("");
      setSkillImportMessage(`Added “${name}”.`);
    } catch (e) {
      setSkillImportMessage(e instanceof Error ? e.message : "Import failed");
    } finally {
      setSkillImportBusy(false);
    }
  }, [backendBase, skillImportBusy, skillImportUrl]);

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

  const applyWithInstruction = useCallback(async () => {
    const instr = applyInstruction.trim();
    if (!instr) return;
    if (!selectedNode?.id) {
      setError("Select a branch root node on the canvas before applying.");
      return;
    }
    if (messages.length === 0) {
      setError("Have at least one message in the conversation before applying.");
      return;
    }
    setApplyBusy(true);
    setError("");
    try {
      const apiMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: `Apply instruction (highest priority): ${instr}` }
      ];
      const res = await fetch(`${backendBase}/assistant/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_root_id: selectedNode.id,
          full_nodes: combined.nodes,
          full_edges: combined.edges,
          messages: apiMessages,
          custom_skills: [
            ...(persona.trim()
              ? [{ name: "AI persona", instruction: `Adopt this persona while discussing: ${persona.trim()}`, enabled: true }]
              : []),
            ...payloadSkills
          ],
          builtin_skills: builtinPayload,
          sandbox_mode: sandboxMode || sandboxHasDrafts
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Apply failed (${res.status})`);
      }
      const data = (await res.json()) as { mindmap: MindmapJson };
      loadMainGraph(data.mindmap);
      clearSandbox();
      setSandboxMode(false);
      setAssistantActive(false);
      setApplyInstruction("");
      useUiStore.getState().setSelectedNode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply request failed");
    } finally {
      setApplyBusy(false);
    }
  }, [
    applyInstruction,
    selectedNode?.id,
    messages,
    backendBase,
    combined.nodes,
    combined.edges,
    payloadSkills,
    builtinPayload,
    loadMainGraph,
    clearSandbox,
    sandboxMode,
    sandboxHasDrafts,
    setSandboxMode,
    persona,
    setAssistantActive
  ]);

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

  const runOptimismSimulation = useCallback(async () => {
    if (!selectedNode?.id || !meterInputs || !optimismFocus) return;
    setSimBusy(true);
    setError("");
    setSimReport("");
    try {
      const dp = snapDeltaPct(optimismDeltaPct);
      const res = await fetch(`${backendBase}/assistant/simulate/optimism`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_root_id: selectedNode.id,
          full_nodes: combined.nodes,
          full_edges: combined.edges,
          optimism: 50,
          currency,
          tam_total: meterInputs.tam_total ?? undefined,
          target_segment_pct: meterInputs.target_segment_pct ?? undefined,
          arpa_year: meterInputs.arpa_year ?? undefined,
          customers_total: meterInputs.customers_total ?? undefined,
          penetration_pct: meterInputs.penetration_pct ?? undefined,
          focus_metric: optimismFocus,
          delta_pct: dp,
          baseline_som_override: meterInputs.baseline_som_override ?? undefined,
          affected_nodes: optimismAffected.map((a) => ({
            node_id: a.nodeId,
            label: a.label,
            reason: a.reason
          }))
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Simulation failed (${res.status})`);
      }
      const data = (await res.json()) as { mindmap: MindmapJson; report: string };
      setSimReport(data.report || "");
      loadMainGraph(data.mindmap);
      clearSandbox();
      setSandboxMode(false);
      setAssistantActive(false);
      useUiStore.getState().setSelectedNode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation request failed");
    } finally {
      setSimBusy(false);
    }
  }, [
    selectedNode?.id,
    backendBase,
    combined.nodes,
    combined.edges,
    meterInputs,
    optimismFocus,
    optimismDeltaPct,
    optimismAffected,
    currency,
    loadMainGraph,
    clearSandbox,
    setSandboxMode,
    setAssistantActive
  ]);

  const runBlackSwanSimulation = useCallback(async () => {
    if (!selectedNode?.id) return;
    setSimBusy(true);
    setError("");
    setSimReport("");
    try {
      const res = await fetch(`${backendBase}/assistant/simulate/black-swan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_root_id: selectedNode.id,
          full_nodes: combined.nodes,
          full_edges: combined.edges,
          messages: [{ role: "user", content: "Run black swan simulation" }],
          custom_skills: [],
          builtin_skills: {},
          sandbox_mode: sandboxMode
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Simulation failed (${res.status})`);
      }
      const data = (await res.json()) as { mindmap: MindmapJson; report: string };
      setSimReport(data.report || "");
      loadMainGraph(data.mindmap);
      clearSandbox();
      setSandboxMode(false);
      setAssistantActive(false);
      useUiStore.getState().setSelectedNode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation request failed");
    } finally {
      setSimBusy(false);
    }
  }, [
    selectedNode?.id,
    backendBase,
    combined.nodes,
    combined.edges,
    sandboxMode,
    loadMainGraph,
    clearSandbox,
    setSandboxMode,
    setAssistantActive
  ]);

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

  const runRoundtableRound = useCallback(async () => {
    if (!selectedNode?.id) {
      setError("Select a node on the canvas first.");
      return;
    }
    if (rtPersonas.length < 1) {
      setError("Add at least one persona to the roundtable.");
      return;
    }
    const steering = rtSteering.trim();
    setRtRoundBusy(true);
    setError("");
    try {
      const apiTranscript = rtTranscript.map((r) => ({
        role: r.role,
        persona_name: r.role === "persona" ? (r.persona_name ?? null) : null,
        content: r.content
      }));
      const res = await fetch(`${backendBase}/assistant/roundtable/round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_nodes: combined.nodes,
          full_edges: combined.edges,
          selected_node_id: selectedNode.id,
          personas: rtPersonas.map((p) => ({ name: p.name, instruction: p.instruction })),
          transcript: apiTranscript,
          user_steering: steering || null,
          custom_skills: payloadSkills,
          builtin_skills: builtinPayload,
          sandbox_mode: sandboxMode
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Round failed (${res.status})`);
      }
      const data = (await res.json()) as { speeches: { persona: string; content: string }[]; round_title?: string };
      const speeches = Array.isArray(data.speeches) ? data.speeches : [];
      const now = Date.now();
      setRtTranscript((prev) => {
        let next = [...prev];
        if (steering) {
          next.push({ id: `u_${now}`, role: "user", content: steering });
        }
        speeches.forEach((s, i) => {
          next.push({
            id: `p_${now}_${i}`,
            role: "persona",
            persona_name: s.persona,
            content: s.content || "…"
          });
        });
        return next;
      });
      setRtProposal(null);
      setRtConfirmApply(false);
      setRtSteering("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Roundtable request failed");
    } finally {
      setRtRoundBusy(false);
    }
  }, [
    selectedNode?.id,
    rtPersonas,
    rtTranscript,
    rtSteering,
    backendBase,
    combined.nodes,
    combined.edges,
    payloadSkills,
    builtinPayload,
    sandboxMode
  ]);

  const proposeRoundtable = useCallback(async () => {
    if (!selectedNode?.id) {
      setError("Select a branch root node on the canvas.");
      return;
    }
    if (rtTranscript.length < 1) {
      setError("Run at least one discussion round before summarizing.");
      return;
    }
    setRtProposeBusy(true);
    setError("");
    setRtProposal(null);
    setRtConfirmApply(false);
    try {
      const apiTranscript = rtTranscript.map((r) => ({
        role: r.role,
        persona_name: r.role === "persona" ? (r.persona_name ?? null) : null,
        content: r.content
      }));
      const res = await fetch(`${backendBase}/assistant/roundtable/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_root_id: selectedNode.id,
          selected_node_id: selectedNode.id,
          full_nodes: combined.nodes,
          full_edges: combined.edges,
          transcript: apiTranscript,
          custom_skills: payloadSkills,
          builtin_skills: builtinPayload,
          sandbox_mode: sandboxMode || sandboxHasDrafts
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Propose failed (${res.status})`);
      }
      const data = (await res.json()) as {
        discussion_summary: string;
        recommended_mindmap_changes: string;
        patch: Record<string, unknown>;
      };
      setRtProposal({
        discussion_summary: data.discussion_summary || "",
        recommended_mindmap_changes: data.recommended_mindmap_changes || "",
        patch: data.patch && typeof data.patch === "object" ? data.patch : {}
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Propose request failed");
    } finally {
      setRtProposeBusy(false);
    }
  }, [
    selectedNode?.id,
    rtTranscript,
    backendBase,
    combined.nodes,
    combined.edges,
    payloadSkills,
    builtinPayload,
    sandboxMode,
    sandboxHasDrafts
  ]);

  const applyRoundtablePatch = useCallback(async () => {
    if (!selectedNode?.id || !rtProposal || !rtConfirmApply) return;
    setRtApplyBusy(true);
    setError("");
    try {
      const res = await fetch(`${backendBase}/assistant/roundtable/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_root_id: selectedNode.id,
          full_nodes: combined.nodes,
          full_edges: combined.edges,
          patch: rtProposal.patch
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Apply failed (${res.status})`);
      }
      const data = (await res.json()) as { mindmap: MindmapJson };
      loadMainGraph(data.mindmap);
      clearSandbox();
      setSandboxMode(false);
      setAssistantActive(false);
      setRtProposal(null);
      setRtConfirmApply(false);
      setRtTranscript([]);
      useUiStore.getState().setSelectedNode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply request failed");
    } finally {
      setRtApplyBusy(false);
    }
  }, [
    selectedNode?.id,
    rtProposal,
    rtConfirmApply,
    backendBase,
    combined.nodes,
    combined.edges,
    loadMainGraph,
    clearSandbox,
    setSandboxMode,
    setAssistantActive
  ]);

  if (!assistantActive) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-2 py-2 dark:border-slate-800">
          <MessageCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Assistant
          </span>
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-0.5 rounded-lg border border-transparent px-1.5 py-1 text-[10px] font-medium text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-900 dark:hover:text-slate-200"
            title="Hide assistant — full width canvas"
            onClick={() => setAssistantDockOpen(false)}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Hide
          </button>
        </div>
        <div className="p-3">
          <div className="ios-card p-3">
            <div className="text-[11px] text-slate-700 dark:text-slate-200">
              Select a node, then activate a session to discuss and edit that branch.
            </div>
            <button
              type="button"
              className="mt-3 w-full ios-button-primary"
              disabled={!selectedNode?.id}
              onClick={activateAssistant}
            >
              Activate for selected node
            </button>
            {!selectedNode?.id && (
              <div className="mt-2 text-[10px] text-amber-800 dark:text-amber-200">
                Tip: click a node on the canvas first.
              </div>
            )}
          </div>
        </div>
      </div>
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
                mode === "roundtable" ? "ios-segment-item-active" : "ios-segment-item-inactive"
              ].join(" ")}
              onClick={() => setMode("roundtable")}
            >
              Roundtable
            </button>
          </div>
        </div>

        {mode === "optimism" && (
          <div className="mb-3 ios-card p-3">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">Optimism meter</div>
            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
              Select a branch node whose subtree includes <span className="font-medium">TAM</span>,{" "}
              <span className="font-medium">SOM</span> (or SAM), or <span className="font-medium">ARR</span> in{" "}
              <span className="font-medium">critical values</span>. Baseline numbers load from that branch; adjust −100%
              to +100% in 10% steps, review recomputed figures and impacted nodes, then apply.
            </p>
            {optimismMetricsAvailable.length === 0 ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-[10px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                No TAM / SOM / ARR figures detected in this branch. Add them as{" "}
                <code className="font-mono">critical_values</code> on a node, or put a keyword + amount in a node
                label (e.g. <span className="italic">市场规模 50亿美元</span>, <span className="italic">TAM: $1.2B</span>,{" "}
                <span className="italic">ARR 8000万</span>) under the selected root, then switch away and back to
                Optimism.
              </p>
            ) : (
              <>
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Branch baseline (ground zero)
                </div>
                <ul className="mt-1 space-y-0.5 text-[10px] text-slate-700 dark:text-slate-200">
                  {(["TAM", "SOM", "ARR"] as const).map((k) => {
                    const v = branchFinancial?.[k === "TAM" ? "tam" : k === "SOM" ? "som" : "arr"];
                    const sid = branchFinancial?.sourceNodeId[k];
                    if (v == null) return null;
                    return (
                      <li key={k}>
                        <span className="font-mono">{k}</span>: {formatMoneyShort(v, currency)}
                        {sid ? (
                          <span className="text-slate-500 dark:text-slate-400"> · node {sid}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {(branchFinancial?.targetSegmentPct != null ||
                  branchFinancial?.arpaYear != null ||
                  branchFinancial?.customersTotal != null ||
                  branchFinancial?.penetrationPct != null) && (
                  <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
                    Drivers detected:{" "}
                    {[
                      branchFinancial?.targetSegmentPct != null ? `segment ${branchFinancial.targetSegmentPct}%` : null,
                      branchFinancial?.penetrationPct != null ? `penetration ${branchFinancial.penetrationPct}%` : null,
                      branchFinancial?.customersTotal != null ? `customers ${branchFinancial.customersTotal}` : null,
                      branchFinancial?.arpaYear != null ? `ARPA ${formatMoneyShort(branchFinancial.arpaYear, currency)}` : null
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <label className="mt-2 block text-[11px] text-slate-700 dark:text-slate-200">
                  Currency (display)
                  <input className="mt-1 ios-input py-1.5" value={currency} onChange={(e) => setCurrency(e.target.value)} />
                </label>
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Stress metric
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(["TAM", "SOM", "ARR"] as const).map((k) => {
                    const on = optimismMetricsAvailable.includes(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={!on}
                        className={[
                          "rounded-full px-2.5 py-0.5 text-[10px] font-medium",
                          optimismFocus === k
                            ? "bg-sky-600 text-white dark:bg-sky-500"
                            : on
                              ? "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                              : "cursor-not-allowed border border-slate-100 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-600"
                        ].join(" ")}
                        onClick={() => on && setOptimismFocus(k)}
                      >
                        {k}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-2 block text-[11px] text-slate-700 dark:text-slate-200">
                  Optimism vs baseline: <span className="font-mono">{snapDeltaPct(optimismDeltaPct)}%</span>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={10}
                    value={snapDeltaPct(optimismDeltaPct)}
                    onChange={(e) => setOptimismDeltaPct(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                </label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {[-40, -20, -10, 10, 20, 40].map((step) => (
                    <button
                      key={step}
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      onClick={() => setOptimismDeltaPct((d) => snapDeltaPct(d + step))}
                    >
                      {step > 0 ? `+${step}%` : `${step}%`}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => setOptimismDeltaPct(0)}
                  >
                    Reset 0%
                  </button>
                </div>
                {optimismPreview ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white/90 p-2 dark:border-slate-600 dark:bg-slate-950/80">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Recomputed (vs baseline)
                    </div>
                    <table className="mt-1 w-full border-collapse text-[10px]">
                      <thead>
                        <tr className="text-left text-slate-500 dark:text-slate-400">
                          <th className="py-0.5 pr-2">Metric</th>
                          <th className="py-0.5 pr-2">Before</th>
                          <th className="py-0.5 pr-2">After</th>
                          <th className="py-0.5">Δ%</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-800 dark:text-slate-100">
                        {(["TAM", "SOM", "ARR"] as const).map((k) => (
                          <tr key={k}>
                            <td className="py-0.5 pr-2 font-mono">{k}</td>
                            <td className="py-0.5 pr-2">
                              {optimismPreview.before[k] != null ? formatMoneyShort(optimismPreview.before[k]!, currency) : "—"}
                            </td>
                            <td className="py-0.5 pr-2">
                              {optimismPreview.after[k] != null ? formatMoneyShort(optimismPreview.after[k]!, currency) : "—"}
                            </td>
                            <td className="py-0.5 font-mono text-sky-700 dark:text-sky-300">
                              {optimismPreview.pctLabel[k] ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {optimismAffected.length > 0 ? (
                  <div className="mt-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Branch nodes to review ({optimismAffected.length})
                    </div>
                    <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto text-[9px] text-slate-600 dark:text-slate-300">
                      {optimismAffected.map((a) => (
                        <li key={a.nodeId} className="rounded border border-slate-100 bg-slate-50/80 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900/60">
                          <span className="font-mono text-slate-500">{a.nodeId}</span> — {a.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-2 text-[9px] text-slate-500 dark:text-slate-400">No other branch nodes auto-flagged; downstream metrics still update in the table above.</p>
                )}
                <button
                  type="button"
                  className="mt-3 w-full ios-button-primary"
                  disabled={simBusy || !optimismFocus || optimismMetricsAvailable.length === 0}
                  onClick={() => void runOptimismSimulation()}
                >
                  {simBusy ? "Applying…" : "Apply optimism to mindmap"}
                </button>
              </>
            )}
          </div>
        )}

        {mode === "blackSwan" && (
          <div className="mb-3 ios-card p-3">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">Black Swan simulation</div>
            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
              Stress test the selected branch: select 3 plausible black swan events, impacts, and mitigations, then update this branch.
            </p>
            <button type="button" className="mt-3 w-full ios-button-primary" disabled={simBusy} onClick={() => void runBlackSwanSimulation()}>
              {simBusy ? "Running…" : "Run black swan simulation & apply"}
            </button>
          </div>
        )}

        {mode === "roundtable" && (
          <div className="mb-3 ios-card p-3">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">Roundtable</div>
            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
              Multi-persona discussion on the <span className="font-medium">selected node</span>. Run rounds, then summarize
              into concrete map edits and apply after you confirm.
            </p>
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Recommended personas
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {REVIEW_PERSONAS.map((pn) => (
                <button
                  key={pn}
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => addRtPreset(pn)}
                >
                  + {pn}
                </button>
              ))}
            </div>
            {rtLib.length > 0 ? (
              <>
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Saved custom personas
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {rtLib.map((row) => (
                    <button
                      key={`${row.name}::${row.instruction.slice(0, 24)}`}
                      type="button"
                      className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-100 dark:hover:bg-sky-900/80"
                      title={row.instruction}
                      onClick={() => addRtFromLib(row.name, row.instruction)}
                    >
                      + {row.name}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Panel ({rtPersonas.length})
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {rtPersonas.length === 0 ? (
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Add at least one persona.</span>
              ) : (
                rtPersonas.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white pl-2 pr-0.5 text-[10px] text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {p.name}
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800 dark:hover:text-red-400"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => removeRtPersona(p.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block text-[11px] text-slate-700 dark:text-slate-200">
                Custom name
                <input
                  className="mt-1 ios-input py-1.5"
                  value={rtNewName}
                  onChange={(e) => setRtNewName(e.target.value)}
                  placeholder="e.g. Chief Medical Officer"
                />
              </label>
              <label className="block text-[11px] text-slate-700 dark:text-slate-200 sm:col-span-2">
                Custom instruction
                <textarea
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-800 dark:border-slate-600 dark:bg-slate-950/80 dark:text-slate-100"
                  rows={2}
                  value={rtNewInstruction}
                  onChange={(e) => setRtNewInstruction(e.target.value)}
                  placeholder="Voice, expertise, and what they should optimize for in discussion…"
                />
              </label>
            </div>
            <button type="button" className="mt-2 w-full ios-button" onClick={() => addRtCustom()}>
              Add custom persona to panel
            </button>
            <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
              Custom personas are also saved locally for quick reuse (+ buttons above).
            </p>
          </div>
        )}

        {simReport && (
          <div className="mb-3 ios-card p-3 text-[11px] text-slate-700 dark:text-slate-200">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Simulation report
            </div>
            <pre className="whitespace-pre-wrap">{simReport}</pre>
          </div>
        )}

        <button
          type="button"
          className="mb-2 flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/90 px-2 py-1.5 text-left shadow-sm transition hover:bg-white dark:border-slate-600 dark:bg-slate-900/70 dark:hover:bg-slate-900"
          onClick={() => setSkillsBlockExpanded((v) => !v)}
          aria-expanded={skillsBlockExpanded}
        >
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {skillsBlockExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            Skills & lenses
          </span>
          <span className="text-[9px] font-normal text-slate-500 dark:text-slate-400">
            {skillsBlockExpanded ? "Hide" : "Show"}
          </span>
        </button>

        {skillsBlockExpanded ? (
          <>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Builtin skills
        </div>
        <label className="mb-1 flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100">
          <input type="checkbox" checked={skills.webSearch} onChange={() => toggleSkill("webSearch")} />
          <span>Web search lens</span>
        </label>
        <label className="mb-3 flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100">
          <input type="checkbox" checked={skills.financialAnalyst} onChange={() => toggleSkill("financialAnalyst")} />
          <span>Financial analyst lens</span>
        </label>

        <div className="mb-1 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Your skills
          </div>
        </div>
        <p className="mb-2 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
          Add instructions the model should follow (e.g. “Prefer EU regulatory framing”). Toggle each on or off. Use{" "}
          <span className="font-medium text-slate-700 dark:text-slate-200">Show details</span> per skill to view or edit
          the full text.
        </p>

        <div className="mb-3 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            Import from URL
          </div>
          <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
            Paste a{" "}
            <span className="font-medium text-slate-700 dark:text-slate-200">Raw GitHub</span> link (
            <code className="rounded bg-slate-100 px-0.5 dark:bg-slate-800">raw.githubusercontent.com/…</code>
            ), a normal GitHub file page (we convert blob → raw), a{" "}
            <code className="rounded bg-slate-100 px-0.5 dark:bg-slate-800">github.com/…/raw/…</code> URL, or a{" "}
            <span className="font-medium">gist</span> raw URL. The backend downloads the text and appends a skill.
          </p>
          <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-stretch">
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-[10px] text-slate-800 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-950/80 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="https://raw.githubusercontent.com/owner/repo/main/SKILL.md"
              value={skillImportUrl}
              disabled={skillImportBusy}
              onChange={(e) => {
                setSkillImportUrl(e.target.value);
                if (skillImportMessage) setSkillImportMessage("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void fetchSkillFromUrl();
                }
              }}
            />
            <button
              type="button"
              className="ios-button flex shrink-0 items-center justify-center gap-1 whitespace-nowrap px-3 py-1.5 text-[11px] sm:self-stretch"
              disabled={skillImportBusy || !skillImportUrl.trim()}
              onClick={() => void fetchSkillFromUrl()}
            >
              {skillImportBusy ? "Fetching…" : "Fetch & add"}
            </button>
          </div>
          {skillImportMessage ? (
            <p
              className={`mt-1.5 text-[10px] leading-snug ${
                skillImportMessage.startsWith("Added") ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
              }`}
            >
              {skillImportMessage}
            </p>
          ) : null}
        </div>

        <div className="mb-2 space-y-1.5">
          {customSkills.map((s) => {
            const detailsOpen = Boolean(skillDetailsOpen[s.id]);
            return (
              <div
                key={s.id}
                className="rounded-lg border border-slate-200 bg-white p-2 text-[10px] shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
              >
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={s.enabled}
                    onChange={() => toggleCustom(s.id)}
                    title="Use this skill in requests"
                  />
                  <input
                    type="text"
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-slate-50/80 px-2 py-1 text-[11px] font-medium text-slate-800 outline-none ring-sky-400/40 placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-2 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-600 dark:focus:bg-slate-950"
                    placeholder="Skill name"
                    value={s.name}
                    onChange={(e) => updateSkillName(s.id, e.target.value)}
                    aria-label="Skill name"
                  />
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    title={detailsOpen ? "Hide instructions" : "Show or edit instructions"}
                    aria-expanded={detailsOpen}
                    onClick={() => toggleSkillDetails(s.id)}
                  >
                    {detailsOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800 dark:hover:text-red-400"
                    title="Remove skill"
                    onClick={() => removeSkill(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {!detailsOpen ? (
                  <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-700/80">
                    <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Instructions hidden
                    </p>
                    <p className="mt-0.5 text-[9px] leading-snug text-slate-500 dark:text-slate-400">
                      {s.instruction.length.toLocaleString()} characters —{" "}
                      <button
                        type="button"
                        className="font-semibold text-sky-700 underline decoration-sky-700/40 underline-offset-2 hover:text-sky-800 hover:decoration-sky-800 dark:text-sky-400 dark:hover:text-sky-300"
                        onClick={() => toggleSkillDetails(s.id)}
                      >
                        Show details
                      </button>{" "}
                      or use the chevron.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 space-y-1 pl-0.5">
                    <label className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Instructions
                    </label>
                    <textarea
                      className="w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-[10px] leading-relaxed text-slate-800 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-950/80 dark:text-slate-100 dark:placeholder:text-slate-500"
                      rows={6}
                      spellCheck={false}
                      value={s.instruction}
                      onChange={(e) => updateSkillInstruction(s.id, e.target.value)}
                      aria-label="Skill instructions"
                    />
                    <div className="flex items-center justify-between text-[9px] text-slate-500 dark:text-slate-400">
                      <span>{s.instruction.length.toLocaleString()} / 8,000</span>
                      <button
                        type="button"
                        className="font-medium text-sky-700 underline decoration-sky-700/30 hover:decoration-sky-700 dark:text-sky-400"
                        onClick={() => toggleSkillDetails(s.id)}
                      >
                        Hide details
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <input
          className="mb-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
          placeholder="Skill name (optional)"
          value={newSkillName}
          onChange={(e) => setNewSkillName(e.target.value)}
        />
        <textarea
          className="mb-1 w-full resize-none rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
          placeholder="Instruction for the model…"
          rows={2}
          value={newSkillBody}
          onChange={(e) => setNewSkillBody(e.target.value)}
        />
        <button type="button" className="ios-button mb-3 flex w-full items-center justify-center gap-1 text-[11px]" onClick={addSkill}>
          <Plus className="h-3.5 w-3.5" />
          Add skill
        </button>
          </>
        ) : (
          <p className="mb-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-2 py-2 text-[10px] leading-snug text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
            {customSkills.length} custom skill{customSkills.length === 1 ? "" : "s"} · Builtin lenses can be expanded from
            the header above when you need them.
          </p>
        )}

        <div className="mb-1 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {mode === "roundtable" ? "Roundtable discussion" : "Conversation"}
          </div>
          <button
            type="button"
            className="text-[10px] text-slate-500 underline dark:text-slate-400"
            onClick={mode === "roundtable" ? clearRtTranscript : clearChat}
          >
            {mode === "roundtable" ? "Clear roundtable" : "Clear chat"}
          </button>
        </div>
        <div
          ref={listRef}
          className="min-h-[12rem] max-h-[min(52vh,560px)] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white/80 p-2 dark:border-slate-700 dark:bg-slate-900/60"
        >
          {mode === "roundtable" ? (
            <>
              {rtTranscript.length === 0 && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Add personas above, then run a round. Optional: type a steering prompt for the next round (e.g. “Stress
                  test regulatory risk”). When the discussion is enough, use{" "}
                  <span className="font-medium">Summarize &amp; propose edits</span> in the footer.
                </p>
              )}
              {rtTranscript.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-lg px-2 py-1.5 text-[11px] leading-snug ${
                    r.role === "user"
                      ? "ml-2 bg-sky-100 text-slate-900 dark:bg-sky-950/60 dark:text-sky-100"
                      : "mr-2 border border-violet-200/80 bg-violet-50 text-slate-800 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-slate-100"
                  }`}
                >
                  <div className="mb-0.5 text-[9px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                    {r.role === "user" ? "You" : r.persona_name || "Persona"}
                  </div>
                  <p className="whitespace-pre-wrap">{r.content}</p>
                </div>
              ))}
              {rtRoundBusy && (
                <div className="mr-2 rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] italic text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                  Personas are thinking…
                </div>
              )}
              {rtProposal ? (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/90 p-2 text-[11px] text-slate-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-slate-100">
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                    Proposed wrap-up
                  </div>
                  <p className="mt-1 whitespace-pre-wrap font-medium text-slate-900 dark:text-slate-50">
                    {rtProposal.discussion_summary || "—"}
                  </p>
                  <div className="mt-2 text-[9px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                    Recommended mindmap changes
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                    {rtProposal.recommended_mindmap_changes || "—"}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {messages.length === 0 && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Turn on <span className="font-medium">Sandbox mode</span> to explore with the assistant and build draft
                  structure on the canvas. When you are satisfied, select a branch root and use{" "}
                  <span className="font-medium">Summarize &amp; apply</span> to merge the discussion and drafts into the
                  firm map.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg px-2 py-1.5 text-[11px] leading-snug ${
                    m.role === "user"
                      ? "ml-2 bg-sky-100 text-slate-900 dark:bg-sky-950/60 dark:text-sky-100"
                      : "mr-2 bg-slate-100 text-slate-800 dark:bg-slate-800/80 dark:text-slate-100"
                  }`}
                >
                  <div className="mb-0.5 text-[9px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                    {m.role === "user" ? "You" : "Assistant"}
                  </div>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              ))}
              {chatBusy && (
                <div className="mr-2 rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] italic text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                  Thinking…
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 space-y-2 p-2">
        {error ? <p className="text-[10px] text-red-700 dark:text-red-400">{error}</p> : null}
        {!selectedNode?.id ? (
          <p className="text-[10px] text-amber-800 dark:text-amber-200">
            {mode === "roundtable" ? (
              <>
                Select a node on the canvas — the roundtable focuses on that node, and edits apply to its subtree root
                (same as session target).
              </>
            ) : (
              <>
                Select the branch root node on the canvas for <span className="font-medium">Summarize &amp; apply</span>.
              </>
            )}
          </p>
        ) : (
          <p className="text-[10px] text-slate-600 dark:text-slate-400">
            {mode === "roundtable" ? "Focus & apply root: " : "Apply target (subtree root): "}
            <code className="rounded bg-white px-0.5 dark:bg-slate-900 dark:text-slate-200">{selectedNode.id}</code>
          </p>
        )}
        {mode === "roundtable" ? (
          <>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Steering for next round (optional)
            </label>
            <textarea
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="e.g. Push on evidence gaps, or ask everyone for one concrete map tweak (discussion only)."
              rows={2}
              value={rtSteering}
              disabled={rtRoundBusy}
              onChange={(e) => setRtSteering(e.target.value)}
            />
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={rtRoundBusy || rtPersonas.length < 1 || !selectedNode?.id}
                className="ios-button-primary flex items-center justify-center gap-1.5 text-[11px]"
                onClick={() => void runRoundtableRound()}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {rtRoundBusy ? "Running round…" : "Run discussion round"}
              </button>
              <button
                type="button"
                disabled={rtProposeBusy || rtTranscript.length < 1 || !selectedNode?.id}
                className="ios-button flex items-center justify-center gap-1.5 text-[11px]"
                onClick={() => void proposeRoundtable()}
              >
                <Wand2 className="h-3.5 w-3.5" />
                {rtProposeBusy ? "Summarizing…" : "Summarize & propose mindmap edits"}
              </button>
              {rtProposal ? (
                <>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] text-slate-800 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={rtConfirmApply}
                      onChange={(e) => setRtConfirmApply(e.target.checked)}
                    />
                    <span>I confirm applying the proposed patch to the mindmap (subtree rooted at the target node).</span>
                  </label>
                  <button
                    type="button"
                    disabled={rtApplyBusy || !rtConfirmApply || !selectedNode?.id}
                    className="ios-button-primary flex items-center justify-center gap-1.5 text-[11px]"
                    onClick={() => void applyRoundtablePatch()}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    {rtApplyBusy ? "Applying…" : "Apply confirmed edits to mindmap"}
                  </button>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Apply instruction (optional)
            </label>
            <textarea
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="Example: Add a new inferred node summarizing risks, then connect evidence nodes that support it."
              rows={2}
              value={applyInstruction}
              disabled={applyBusy}
              onChange={(e) => setApplyInstruction(e.target.value)}
            />
            <textarea
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="Message…"
              rows={3}
              value={draft}
              disabled={chatBusy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendChat();
                }
              }}
            />
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={chatBusy || !draft.trim()}
                className="ios-button-primary flex items-center justify-center gap-1.5 text-[11px]"
                onClick={() => void sendChat()}
              >
                <Send className="h-3.5 w-3.5" />
                {chatBusy ? "Sending…" : "Send"}
              </button>
              <button
                type="button"
                disabled={applyBusy || messages.length === 0 || !selectedNode?.id}
                className="ios-button flex items-center justify-center gap-1.5 text-[11px]"
                onClick={() => void applyToMindmap()}
              >
                <Wand2 className="h-3.5 w-3.5" />
                {applyBusy ? "Applying…" : "Summarize & apply to selected node"}
              </button>
              <button
                type="button"
                disabled={applyBusy || messages.length === 0 || !selectedNode?.id || !applyInstruction.trim()}
                className="ios-button-primary flex items-center justify-center gap-1.5 text-[11px]"
                onClick={() => void applyWithInstruction()}
              >
                <Wand2 className="h-3.5 w-3.5" />
                {applyBusy ? "Applying…" : "Apply instruction"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
