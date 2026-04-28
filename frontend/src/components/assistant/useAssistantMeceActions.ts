import { useCallback, useMemo } from "react";
import useUiStore from "../../store/useUiStore";
import type { MindmapJson } from "../../types/mindmap";
import type { MeceEvidenceRow, MeceScanBundle } from "./assistantTypes";
import { readFetchDetailMessage } from "./assistantFetchDetail";
import type { AssistantPanelActionsRef } from "./assistantPanelActionsContext";

export function useAssistantMeceActions(ref: AssistantPanelActionsRef) {
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
        throw new Error(await readFetchDetailMessage(res, "MECE scan failed"));
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
        throw new Error(await readFetchDetailMessage(res, "Evidence check failed"));
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
        throw new Error(await readFetchDetailMessage(res, "Web search failed"));
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
        throw new Error(await readFetchDetailMessage(res, "Apply failed"));
      }
      const data = (await res.json()) as { mindmap: MindmapJson; report: string };
      c.setSimReport(data.report || "");
      c.loadMainGraph(data.mindmap, { newMarks: "diff" });
      c.clearSandbox();
      useUiStore.getState().setSelectedNode(null);
      useUiStore.getState().closeAssistantSession();
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

  return useMemo(
    () => ({ meceScan, meceEvidence, meceWebSearchForMod, meceApply }),
    [meceScan, meceEvidence, meceWebSearchForMod, meceApply]
  );
}
