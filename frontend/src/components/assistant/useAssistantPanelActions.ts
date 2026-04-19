import { useCallback, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import useUiStore, { type LoadMainGraphOptions } from "../../store/useUiStore";
import { snapDeltaPct, type AffectedNodeHint, type MeterInputs, type OptimismMetric } from "../../lib/optimismMeter";
import type { MindmapJson } from "../../types/mindmap";
import type {
  BlackSwanResultBlock,
  BlackSwanRunBundle,
  BlackSwanScenario,
  ChatRow,
  MeceEvidenceRow,
  MeceScanBundle,
  RoundtablePersona,
  RoundtableTranscriptRow
} from "./assistantTypes";

/** Latest values read by assistant HTTP handlers; sync this ref every render before invoking handlers. */
export type AssistantPanelActionsCtx = {
  backendBase: string;
  combined: MindmapJson;
  selectedNodeId: string | undefined;
  draft: string;
  chatBusy: boolean;
  messages: ChatRow[];
  persona: string;
  webSearchQuery: string;
  skillsWebSearch: boolean;
  payloadSkills: { name: string; instruction: string; enabled: boolean }[];
  builtinPayload: { webSearch: boolean; financialAnalyst: boolean };
  sandboxMode: boolean;
  sandboxHasDrafts: boolean;
  applyInstruction: string;
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
  setApplyInstruction: Dispatch<SetStateAction<string>>;
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
  setCustomSkills: Dispatch<SetStateAction<import("./assistantTypes").CustomSkillRow[]>>;
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
  setAssistantActive: (v: boolean) => void;
};

/**
 * Stable async handlers for assistant HTTP calls. Assign `ctxRef.current` on every render
 * with a fresh {@link AssistantPanelActionsCtx} snapshot before any handler runs.
 */
export function useAssistantPanelActions(ctxRef: MutableRefObject<AssistantPanelActionsCtx>) {
  const ref = ctxRef;

  const sendChat = useCallback(async () => {
    const c = ref.current;
    const text = c.draft.trim();
    if (!text || c.chatBusy) return;
    const userRow: ChatRow = { id: `u_${Date.now()}`, role: "user", content: text };
    const nextMessages = [...c.messages, userRow];
    c.setMessages(nextMessages);
    c.setDraft("");
    c.setError("");
    c.setChatBusy(true);
    try {
      const apiMessages = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${c.backendBase}/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          full_nodes: c.combined.nodes,
          full_edges: c.combined.edges,
          selected_node_id: c.selectedNodeId ?? null,
          web_search_query: c.skillsWebSearch ? c.webSearchQuery.trim() || null : null,
          custom_skills: [
            ...(c.persona.trim()
              ? [{ name: "AI persona", instruction: `Adopt this persona while discussing: ${c.persona.trim()}`, enabled: true }]
              : []),
            ...c.payloadSkills
          ],
          builtin_skills: c.builtinPayload,
          sandbox_mode: c.sandboxMode
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Chat failed (${res.status})`);
      }
      const data = (await res.json()) as { reply: string };
      c.setMessages((prev) => [...prev, { id: `a_${Date.now()}`, role: "assistant", content: data.reply || "…" }]);
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "Chat request failed");
      c.setMessages((prev) => prev.filter((m) => m.id !== userRow.id));
    } finally {
      c.setChatBusy(false);
    }
  }, [ref]);

  const applyToMindmap = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId) {
      c.setError("Select a branch root node on the canvas before applying changes to the mindmap.");
      return;
    }
    if (c.messages.length === 0) {
      c.setError("Have at least one message in the conversation before applying.");
      return;
    }
    c.setApplyBusy(true);
    c.setError("");
    try {
      const apiMessages = c.messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${c.backendBase}/assistant/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_root_id: c.selectedNodeId,
          full_nodes: c.combined.nodes,
          full_edges: c.combined.edges,
          messages: apiMessages,
          custom_skills: [
            ...(c.persona.trim()
              ? [{ name: "AI persona", instruction: `Adopt this persona while discussing: ${c.persona.trim()}`, enabled: true }]
              : []),
            ...c.payloadSkills
          ],
          builtin_skills: c.builtinPayload,
          sandbox_mode: c.sandboxMode || c.sandboxHasDrafts
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Apply failed (${res.status})`);
      }
      const data = (await res.json()) as { mindmap: MindmapJson };
      c.loadMainGraph(data.mindmap, { newMarks: "diff" });
      c.clearSandbox();
      c.setSandboxMode(false);
      c.setAssistantActive(false);
      c.setApplyInstruction("");
      useUiStore.getState().setSelectedNode(null);
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "Apply request failed");
    } finally {
      c.setApplyBusy(false);
    }
  }, [ref]);

  const applyWithInstruction = useCallback(async () => {
    const c = ref.current;
    const instr = c.applyInstruction.trim();
    if (!instr) return;
    if (!c.selectedNodeId) {
      c.setError("Select a branch root node on the canvas before applying.");
      return;
    }
    if (c.messages.length === 0) {
      c.setError("Have at least one message in the conversation before applying.");
      return;
    }
    c.setApplyBusy(true);
    c.setError("");
    try {
      const apiMessages = [
        ...c.messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: `Apply instruction (highest priority): ${instr}` }
      ];
      const res = await fetch(`${c.backendBase}/assistant/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_root_id: c.selectedNodeId,
          full_nodes: c.combined.nodes,
          full_edges: c.combined.edges,
          messages: apiMessages,
          custom_skills: [
            ...(c.persona.trim()
              ? [{ name: "AI persona", instruction: `Adopt this persona while discussing: ${c.persona.trim()}`, enabled: true }]
              : []),
            ...c.payloadSkills
          ],
          builtin_skills: c.builtinPayload,
          sandbox_mode: c.sandboxMode || c.sandboxHasDrafts
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Apply failed (${res.status})`);
      }
      const data = (await res.json()) as { mindmap: MindmapJson };
      c.loadMainGraph(data.mindmap, { newMarks: "diff" });
      c.clearSandbox();
      c.setSandboxMode(false);
      c.setAssistantActive(false);
      c.setApplyInstruction("");
      useUiStore.getState().setSelectedNode(null);
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "Apply request failed");
    } finally {
      c.setApplyBusy(false);
    }
  }, [ref]);

  const fetchSkillFromUrl = useCallback(async () => {
    const c = ref.current;
    const url = c.skillImportUrl.trim();
    if (!url || c.skillImportBusy) return;
    c.setSkillImportBusy(true);
    c.setSkillImportMessage("");
    try {
      const res = await fetch(`${c.backendBase}/assistant/fetch-skill-url`, {
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
      c.setCustomSkills((prev) => [
        ...prev,
        {
          id: `s_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
          name: name || "Remote skill",
          instruction,
          enabled: true
        }
      ]);
      c.setSkillImportUrl("");
      c.setSkillImportMessage(`Added “${name}”.`);
    } catch (e) {
      c.setSkillImportMessage(e instanceof Error ? e.message : "Import failed");
    } finally {
      c.setSkillImportBusy(false);
    }
  }, [ref]);

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
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Simulation failed (${res.status})`);
      }
      const data = (await res.json()) as { mindmap: MindmapJson; report: string };
      c.setSimReport(data.report || "");
      c.loadMainGraph(data.mindmap, { newMarks: "diff" });
      c.clearSandbox();
      c.setSandboxMode(false);
      c.setAssistantActive(false);
      useUiStore.getState().setSelectedNode(null);
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
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Scan failed (${res.status})`);
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
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Run failed (${res.status})`);
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
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Apply failed (${res.status})`);
      }
      const data = (await res.json()) as { mindmap: MindmapJson; report: string };
      c.setSimReport(data.report || "");
      c.loadMainGraph(data.mindmap, { newMarks: "diff" });
      c.clearSandbox();
      c.setSandboxMode(false);
      c.setAssistantActive(false);
      useUiStore.getState().setSelectedNode(null);
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

  const meceScan = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId) return;
    c.setSimBusy(true);
    c.setError("");
    c.setSimReport("");
    c.setMeceEvidenceBundle(null);
    c.setMeceWebHints({});
    c.setMeceSelectedMods(new Set());
    try {
      const res = await fetch(`${c.backendBase}/assistant/mece/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mece_root_id: c.selectedNodeId,
          full_nodes: c.combined.nodes,
          full_edges: c.combined.edges
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `MECE scan failed (${res.status})`);
      }
      const data = (await res.json()) as MeceScanBundle;
      c.setMeceScanBundle(data);
      const a = data.mece_assessment as { mutually_exclusive?: string; collectively_exhaustive?: string; rationale?: string };
      c.setSimReport(
        `MECE scan: exclusivity=${a?.mutually_exclusive ?? "?"} exhaustiveness=${a?.collectively_exhaustive ?? "?"}\n${(a?.rationale || "").slice(0, 1200)}`
      );
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "MECE scan failed");
      c.setMeceScanBundle(null);
    } finally {
      c.setSimBusy(false);
    }
  }, [ref]);

  const meceEvidence = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId || !c.meceScanBundle) return;
    const ids = Array.from(c.meceSelectedMods);
    if (ids.length < 1) {
      c.setError("Select at least one proposed modification.");
      return;
    }
    c.setSimBusy(true);
    c.setError("");
    try {
      const projectId =
        typeof localStorage !== "undefined" ? (localStorage.getItem("mindmap_project_id") || "").trim() : "";
      const res = await fetch(`${c.backendBase}/assistant/mece/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mece_root_id: c.selectedNodeId,
          full_nodes: c.combined.nodes,
          full_edges: c.combined.edges,
          scan: c.meceScanBundle,
          modification_ids: ids,
          project_id: projectId || undefined
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Evidence check failed (${res.status})`);
      }
      const data = (await res.json()) as { results: MeceEvidenceRow[]; corpus_stats?: Record<string, unknown> };
      c.setMeceEvidenceBundle({ results: data.results || [], corpus_stats: data.corpus_stats });
      const stats = data.corpus_stats || {};
      c.setSimReport(
        `Evidence check complete. Corpus: project ~${String(stats.project_chars ?? "?")} chars, graph evidence ~${String(stats.graph_evidence_chars ?? "?")} chars.`
      );
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "MECE evidence failed");
      c.setMeceEvidenceBundle(null);
    } finally {
      c.setSimBusy(false);
    }
  }, [ref]);

  const meceWebSearchForMod = useCallback(async (modId: string, query: string) => {
    const c = ref.current;
    const q = query.trim();
    if (!q) return;
    c.setMeceWebBusyId(modId);
    c.setError("");
    try {
      const res = await fetch(`${c.backendBase}/assistant/mece/web-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.slice(0, 500) })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Web search failed (${res.status})`);
      }
      const data = (await res.json()) as { results: { title: string; url: string; content: string }[] };
      const text = (data.results || []).map((r) => `${r.title}\n${r.url}\n${r.content}`).join("\n\n").slice(0, 12000);
      c.setMeceWebHints((prev) => ({
        ...prev,
        [modId]: [prev[modId], text].filter(Boolean).join("\n\n---\n\n")
      }));
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "Web search failed");
    } finally {
      c.setMeceWebBusyId(null);
    }
  }, [ref]);

  const meceApply = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId || !c.meceScanBundle || !c.meceEvidenceBundle?.results?.length) return;
    const ids = Array.from(c.meceSelectedMods);
    if (ids.length < 1) {
      c.setError("Select at least one modification to apply.");
      return;
    }
    c.setSimBusy(true);
    c.setError("");
    try {
      const res = await fetch(`${c.backendBase}/assistant/mece/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mece_root_id: c.selectedNodeId,
          full_nodes: c.combined.nodes,
          full_edges: c.combined.edges,
          scan: c.meceScanBundle,
          evidence: c.meceEvidenceBundle,
          modification_ids: ids,
          web_hints: c.meceWebHints
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Apply failed (${res.status})`);
      }
      const data = (await res.json()) as { mindmap: MindmapJson; report: string };
      c.setSimReport(data.report || "");
      c.loadMainGraph(data.mindmap, { newMarks: "diff" });
      c.clearSandbox();
      c.setSandboxMode(false);
      c.setAssistantActive(false);
      useUiStore.getState().setSelectedNode(null);
      c.setMeceScanBundle(null);
      c.setMeceSelectedMods(new Set());
      c.setMeceEvidenceBundle(null);
      c.setMeceWebHints({});
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "MECE apply failed");
    } finally {
      c.setSimBusy(false);
    }
  }, [ref]);

  const runRoundtableRound = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId) {
      c.setError("Select a node on the canvas first.");
      return;
    }
    if (c.rtPersonas.length < 1) {
      c.setError("Add at least one persona to the roundtable.");
      return;
    }
    const steering = c.rtSteering.trim();
    c.setRtRoundBusy(true);
    c.setError("");
    try {
      const apiTranscript = c.rtTranscript.map((r) => ({
        role: r.role,
        persona_name: r.role === "persona" ? (r.persona_name ?? null) : null,
        content: r.content
      }));
      const res = await fetch(`${c.backendBase}/assistant/roundtable/round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_nodes: c.combined.nodes,
          full_edges: c.combined.edges,
          selected_node_id: c.selectedNodeId,
          personas: c.rtPersonas.map((p) => ({ name: p.name, instruction: p.instruction })),
          transcript: apiTranscript,
          user_steering: steering || null,
          custom_skills: c.payloadSkills,
          builtin_skills: c.builtinPayload,
          sandbox_mode: c.sandboxMode
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
      c.setRtTranscript((prev) => {
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
      c.setRtProposal(null);
      c.setRtConfirmApply(false);
      c.setRtSteering("");
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "Roundtable request failed");
    } finally {
      c.setRtRoundBusy(false);
    }
  }, [ref]);

  const proposeRoundtable = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId) {
      c.setError("Select a branch root node on the canvas.");
      return;
    }
    if (c.rtTranscript.length < 1) {
      c.setError("Run at least one discussion round before summarizing.");
      return;
    }
    c.setRtProposeBusy(true);
    c.setError("");
    c.setRtProposal(null);
    c.setRtConfirmApply(false);
    try {
      const apiTranscript = c.rtTranscript.map((r) => ({
        role: r.role,
        persona_name: r.role === "persona" ? (r.persona_name ?? null) : null,
        content: r.content
      }));
      const res = await fetch(`${c.backendBase}/assistant/roundtable/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_root_id: c.selectedNodeId,
          selected_node_id: c.selectedNodeId,
          full_nodes: c.combined.nodes,
          full_edges: c.combined.edges,
          transcript: apiTranscript,
          custom_skills: c.payloadSkills,
          builtin_skills: c.builtinPayload,
          sandbox_mode: c.sandboxMode || c.sandboxHasDrafts
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
      c.setRtProposal({
        discussion_summary: data.discussion_summary || "",
        recommended_mindmap_changes: data.recommended_mindmap_changes || "",
        patch: data.patch && typeof data.patch === "object" ? data.patch : {}
      });
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "Propose request failed");
    } finally {
      c.setRtProposeBusy(false);
    }
  }, [ref]);

  const applyRoundtablePatch = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId || !c.rtProposal || !c.rtConfirmApply) return;
    c.setRtApplyBusy(true);
    c.setError("");
    try {
      const res = await fetch(`${c.backendBase}/assistant/roundtable/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_root_id: c.selectedNodeId,
          full_nodes: c.combined.nodes,
          full_edges: c.combined.edges,
          patch: c.rtProposal.patch
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Apply failed (${res.status})`);
      }
      const data = (await res.json()) as { mindmap: MindmapJson };
      c.loadMainGraph(data.mindmap, { newMarks: "diff" });
      c.clearSandbox();
      c.setSandboxMode(false);
      c.setAssistantActive(false);
      c.setRtProposal(null);
      c.setRtConfirmApply(false);
      c.setRtTranscript([]);
      useUiStore.getState().setSelectedNode(null);
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "Apply request failed");
    } finally {
      c.setRtApplyBusy(false);
    }
  }, [ref]);

  return useMemo(
    () => ({
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
    }),
    [
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
    ]
  );
}
