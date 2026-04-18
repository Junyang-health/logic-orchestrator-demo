import X6Canvas from "./components/X6Canvas";
import useUiStore from "./store/useUiStore";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, PanelLeft, PanelRight } from "lucide-react";
import type { Graph } from "@antv/x6";
import AssistantPanel from "./components/AssistantPanel";
import { REVIEW_PERSONAS } from "./types/review";
import { combineGraphs, collectBranchSubgraph } from "./lib/graphBranch";
import type { MindmapJson } from "./types/mindmap";
import SourceMaterialPanel from "./components/SourceMaterialPanel";

export default function App() {
  const activePanel = useUiStore((s) => s.activePanel);
  const setActivePanel = useUiStore((s) => s.setActivePanel);
  const selectedNode = useUiStore((s) => s.selectedNode);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const mainGraph = useUiStore((s) => s.mainGraph);
  const sandboxGraph = useUiStore((s) => s.sandboxGraph);
  const clearSandbox = useUiStore((s) => s.clearSandbox);
  const loadMainGraph = useUiStore((s) => s.loadMainGraph);
  const agentId = useUiStore((s) => s.agentId);
  const setAgentId = useUiStore((s) => s.setAgentId);
  const numAgents = useUiStore((s) => s.numAgents);
  const setNumAgents = useUiStore((s) => s.setNumAgents);
  const clusterAssignments = useUiStore((s) => s.clusterAssignments);
  const clusterByNodeId = useUiStore((s) => s.clusterByNodeId);
  const reviewPersona = useUiStore((s) => s.reviewPersona);
  const setReviewPersona = useUiStore((s) => s.setReviewPersona);
  const reviewComments = useUiStore((s) => s.reviewComments);
  const reviewBranchRootId = useUiStore((s) => s.reviewBranchRootId);
  const setReviewComments = useUiStore((s) => s.setReviewComments);
  const reviewFocusNodeId = useUiStore((s) => s.reviewFocusNodeId);
  const setReviewFocusNodeId = useUiStore((s) => s.setReviewFocusNodeId);
  const reviewLoading = useUiStore((s) => s.reviewLoading);
  const setReviewLoading = useUiStore((s) => s.setReviewLoading);
  const clearReviewComments = useUiStore((s) => s.clearReviewComments);
  const assistantDockOpen = useUiStore((s) => s.assistantDockOpen);
  const setAssistantDockOpen = useUiStore((s) => s.setAssistantDockOpen);
  const rightDockOpen = useUiStore((s) => s.rightDockOpen);
  const setRightDockOpen = useUiStore((s) => s.setRightDockOpen);
  const assistantDockWidthPx = useUiStore((s) => s.assistantDockWidthPx);
  const setAssistantDockWidthPx = useUiStore((s) => s.setAssistantDockWidthPx);

  const [graph, setGraph] = useState<Graph | null>(null);
  const resizeDrag = useRef<{ startX: number; startW: number } | null>(null);

  const backendBase = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:8000";
  const [baseModels, setBaseModels] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState("");
  const [newModelId, setNewModelId] = useState("");
  const [modelError, setModelError] = useState("");
  const [newChildType, setNewChildType] = useState("inferred");
  const [newChildLabel, setNewChildLabel] = useState("");
  const [newEdgeLabel, setNewEdgeLabel] = useState("supports");
  const [moveMode, setMoveMode] = useState(false);
  const [movingNodeId, setMovingNodeId] = useState<string | null>(null);
  const [applyReviewBusy, setApplyReviewBusy] = useState(false);
  const [applyReviewError, setApplyReviewError] = useState("");
  /** Which reviewer comment rows (by `ReviewComment.id`) to send to /review/apply. */
  const [selectedCommentIds, setSelectedCommentIds] = useState<string[]>([]);
  const [evidenceSource, setEvidenceSource] = useState<null | { filename: string; href: string }>(null);

  useEffect(() => {
    setSelectedCommentIds((ids) => ids.filter((id) => reviewComments.some((c) => c.id === id)));
  }, [reviewComments]);

  const toggleCommentSelection = useCallback((commentId: string) => {
    setSelectedCommentIds((prev) =>
      prev.includes(commentId) ? prev.filter((id) => id !== commentId) : [...prev, commentId]
    );
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const res = await fetch(`${backendBase}/models`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { models: string[]; current: string };
      setBaseModels(data.models);
      setActiveModel(data.current);
      setModelError("");
    } catch {
      setModelError("Could not load models (is the backend running?)");
    }
  }, [backendBase]);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  useEffect(() => {
    // Theme init + persistence (Apple-like: follow system when unset)
    const key = "mindmap_theme";
    const saved = localStorage.getItem(key);
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
      return;
    }
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    setTheme(prefersDark ? "dark" : "light");
  }, [setTheme]);

  useEffect(() => {
    const key = "mindmap_theme";
    try {
      localStorage.setItem(key, theme);
    } catch {
      // ignore
    }
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    // Resolve an Evidence node's source file to a stored project download URL.
    const t = selectedNode?.type?.toString().toLowerCase();
    const md = (selectedNode?.metadata ?? {}) as any;
    const sourceFilename = (md?.source_filename ?? md?.sourceFilename ?? "").toString().trim();
    if (t !== "evidence" || !sourceFilename) {
      setEvidenceSource(null);
      return;
    }
    const projectId = localStorage.getItem("mindmap_project_id") || "";
    if (!projectId) {
      setEvidenceSource({ filename: sourceFilename, href: "" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${backendBase}/projects/${encodeURIComponent(projectId)}/files`);
        if (!res.ok) return;
        const files = (await res.json()) as Array<{ id: string; filename: string }>;
        const match = [...files].reverse().find((f) => (f.filename || "").toLowerCase() === sourceFilename.toLowerCase());
        if (!match) {
          if (!cancelled) setEvidenceSource({ filename: sourceFilename, href: "" });
          return;
        }
        const href = `${backendBase}/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(match.id)}`;
        if (!cancelled) setEvidenceSource({ filename: sourceFilename, href });
      } catch {
        if (!cancelled) setEvidenceSource({ filename: sourceFilename, href: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendBase, selectedNode?.id, selectedNode?.type, selectedNode?.metadata]);

  const selectBaseModel = useCallback(
    async (model: string) => {
      try {
        const res = await fetch(`${backendBase}/models/select`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const d = (err as { detail?: unknown }).detail;
          setModelError(
            typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Select failed (${res.status})`
          );
          return;
        }
        const data = (await res.json()) as { models: string[]; current: string };
        setBaseModels(data.models);
        setActiveModel(data.current);
        setModelError("");
      } catch {
        setModelError("Select request failed");
      }
    },
    [backendBase]
  );

  const addBaseModel = useCallback(async () => {
    const m = newModelId.trim();
    if (!m) return;
    try {
      const res = await fetch(`${backendBase}/models/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: m })
      });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const d = (err as { detail?: unknown }).detail;
          setModelError(
            typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Add failed (${res.status})`
          );
          return;
        }
      const data = (await res.json()) as { models: string[]; current: string };
      setBaseModels(data.models);
      setActiveModel(data.current);
      setNewModelId("");
      setModelError("");
    } catch {
      setModelError("Add request failed");
    }
  }, [backendBase, newModelId]);

  const removeBaseModel = useCallback(
    async (model: string) => {
      try {
        const res = await fetch(`${backendBase}/models/remove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const d = (err as { detail?: unknown }).detail;
          setModelError(
            typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Remove failed (${res.status})`
          );
          return;
        }
        const data = (await res.json()) as { models: string[]; current: string };
        setBaseModels(data.models);
        setActiveModel(data.current);
        setModelError("");
      } catch {
        setModelError("Remove request failed");
      }
    },
    [backendBase]
  );

  const runReviewBranch = useCallback(async () => {
    const sel = useUiStore.getState().selectedNode;
    if (!sel?.id) return;
    const combined = combineGraphs(mainGraph, sandboxGraph);
    const branch = collectBranchSubgraph(sel.id, combined);
    if (branch.nodes.length === 0) return;

    setReviewLoading(true);
    try {
      const res = await fetch(`${backendBase}/review/branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: reviewPersona,
          nodes: branch.nodes.map((n) => ({
            id: n.id,
            label: n.label,
            type: n.type,
            metadata: (n.metadata ?? {}) as Record<string, unknown>
          })),
          edges: branch.edges.map((e) => ({
            source: e.source,
            target: e.target,
            label: e.label
          }))
        })
      });
      if (!res.ok) throw new Error(`Review failed: ${res.status}`);
      const json = (await res.json()) as {
        comments: Array<{ node_id: string; text: string }>;
      };
      setReviewComments(
        json.comments.map((c) => ({ nodeId: c.node_id, text: c.text })),
        reviewPersona,
        sel.id
      );
      setSelectedCommentIds([]);
    } catch {
      // keep UI resilient if backend / LLM unavailable
    } finally {
      setReviewLoading(false);
    }
  }, [backendBase, mainGraph, sandboxGraph, reviewPersona, setReviewComments, setReviewLoading]);

  const runApplyReview = useCallback(async () => {
    const root = useUiStore.getState().reviewBranchRootId;
    const allComments = useUiStore.getState().reviewComments;
    const selected = allComments.filter((c) => selectedCommentIds.includes(c.id));
    if (!root) {
      setApplyReviewError("Run “Review branch” first so comments are tied to a branch root.");
      return;
    }
    if (selected.length === 0) {
      setApplyReviewError("Select at least one comment to apply (use the checkboxes).");
      return;
    }
    const combined = combineGraphs(mainGraph, sandboxGraph);
    if (combined.nodes.length === 0) {
      setApplyReviewError("No mindmap loaded.");
      return;
    }
    setApplyReviewBusy(true);
    setApplyReviewError("");
    try {
      const res = await fetch(`${backendBase}/review/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: reviewPersona,
          branch_root_id: root,
          full_nodes: combined.nodes,
          full_edges: combined.edges,
          comments: selected.map((c) => ({ node_id: c.nodeId, text: c.text }))
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        setApplyReviewError(
          typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Apply failed (${res.status})`
        );
        return;
      }
      const data = (await res.json()) as { mindmap: MindmapJson };
      loadMainGraph(data.mindmap);
      clearSandbox();
      clearReviewComments();
      setSelectedCommentIds([]);
      useUiStore.getState().setSelectedNode(null);
      setReviewFocusNodeId(null);
    } catch {
      setApplyReviewError("Network error — is the backend running?");
    } finally {
      setApplyReviewBusy(false);
    }
  }, [
    backendBase,
    mainGraph,
    sandboxGraph,
    reviewPersona,
    selectedCommentIds,
    loadMainGraph,
    clearSandbox,
    clearReviewComments,
    setReviewFocusNodeId
  ]);

  const addChildFromSelected = useCallback(() => {
    if (!graph) return;
    const sel = useUiStore.getState().selectedNode;
    if (!sel?.id) return;

    const parent = graph.getCellById(sel.id);
    if (!parent || !parent.isNode()) return;

    const id = `n_${Math.random().toString(16).slice(2, 10)}`;
    const isSandbox = Boolean((graph as any).prop?.("sandboxContext"));
    const status = isSandbox ? "draft" : "firm";
    const label = (newChildLabel.trim() || "New node").slice(0, 120);
    const raw = (newChildType || "inferred").toLowerCase();
    const type = raw === "evidence" ? "evidence" : "inferred";

    const p = (parent as any).position?.() || { x: 0, y: 0 };
    const node = graph.addNode({
      id,
      shape: "mindmap-react-node",
      width: 280,
      height: 96,
      x: p.x + 260,
      y: p.y,
      data: { id, type, label, metadata: {}, status }
    });

    graph.addEdge({
      source: sel.id,
      target: node.id,
      labels: newEdgeLabel.trim()
        ? [
            {
              attrs: { label: { text: newEdgeLabel.trim(), fill: isSandbox ? "#64748b" : "#0f172a", fontSize: 11 } }
            }
          ]
        : undefined,
      attrs: {
        line: {
          stroke: isSandbox ? "#94a3b8" : "#0f172a",
          strokeWidth: 1.5,
          strokeDasharray: isSandbox ? "6 4" : ""
        }
      },
      data: { status, label: newEdgeLabel.trim() }
    });

    setNewChildLabel("");
  }, [graph, newChildLabel, newChildType, newEdgeLabel]);

  const deleteSelectedNode = useCallback(() => {
    if (!graph) return;
    const sel = useUiStore.getState().selectedNode;
    if (!sel?.id) return;
    const cell = graph.getCellById(sel.id);
    if (!cell || !cell.isNode()) return;
    graph.removeCell(cell);
    setReviewFocusNodeId(null);
    useUiStore.getState().setSelectedNode(null);
  }, [graph, setReviewFocusNodeId]);

  const startMoveSelected = useCallback(() => {
    const sel = useUiStore.getState().selectedNode;
    if (!sel?.id) return;
    setMoveMode(true);
    setMovingNodeId(sel.id);
  }, []);

  const cancelMove = useCallback(() => {
    setMoveMode(false);
    setMovingNodeId(null);
  }, []);

  const attachMovingNodeTo = useCallback(
    (newParentId: string) => {
      if (!graph) return;
      const childId = movingNodeId;
      if (!childId || !newParentId || childId === newParentId) return;
      const child = graph.getCellById(childId);
      const parent = graph.getCellById(newParentId);
      if (!child || !child.isNode() || !parent || !parent.isNode()) return;

      // Remove existing incoming edges to the child (old parent links).
      const incoming = graph
        .getEdges()
        .filter((e) => e.getTargetCellId() === childId)
        .slice();
      for (const e of incoming) {
        graph.removeEdge(e);
      }

      const isSandbox = Boolean((graph as any).prop?.("sandboxContext"));
      const status = isSandbox ? "draft" : "firm";
      const relationship = (newEdgeLabel.trim() || "supports").trim();

      graph.addEdge({
        source: newParentId,
        target: childId,
        labels: relationship
          ? [
              {
                attrs: { label: { text: relationship, fill: isSandbox ? "#64748b" : "#0f172a", fontSize: 11 } }
              }
            ]
          : undefined,
        attrs: {
          line: {
            stroke: isSandbox ? "#94a3b8" : "#0f172a",
            strokeWidth: 1.5,
            strokeDasharray: isSandbox ? "6 4" : ""
          }
        },
        data: { status, label: relationship }
      });

      setMoveMode(false);
      setMovingNodeId(null);
    },
    [graph, movingNodeId, newEdgeLabel]
  );

  // Move workflow: user clicks "Move…" then clicks the new parent node on canvas.
  useEffect(() => {
    if (!moveMode || !movingNodeId) return;
    if (!selectedNode?.id) return;
    const newParentId = selectedNode.id;
    if (newParentId === movingNodeId) return;
    attachMovingNodeTo(newParentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveMode, movingNodeId, selectedNode?.id]);

  const startAssistantResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeDrag.current = { startX: e.clientX, startW: assistantDockWidthPx };
      const onMove = (ev: MouseEvent) => {
        const r = resizeDrag.current;
        if (!r) return;
        const dx = ev.clientX - r.startX;
        setAssistantDockWidthPx(r.startW + dx);
      };
      const onUp = () => {
        resizeDrag.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [assistantDockWidthPx, setAssistantDockWidthPx]
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden text-slate-900 dark:text-slate-100">
      {!assistantDockOpen ? (
        <button
          type="button"
          className="fixed left-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1 rounded-r-xl border border-l-0 border-slate-200 bg-slate-50 py-3 pl-1 pr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600 shadow-md backdrop-blur-sm hover:bg-white dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => setAssistantDockOpen(true)}
          title="Show assistant"
        >
          <PanelLeft className="h-4 w-4 shrink-0" aria-hidden />
          <span className="max-w-[4.5rem] leading-tight">Assistant</span>
        </button>
      ) : null}
      {!rightDockOpen ? (
        <button
          type="button"
          className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1 rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 py-3 pl-2 pr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 shadow-md backdrop-blur-sm hover:bg-white dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => setRightDockOpen(true)}
          title="Show source & review"
        >
          <span className="max-w-[4.5rem] text-right leading-tight">Source</span>
          <PanelRight className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      ) : null}

      <div className="flex h-full w-full">
        <section className="relative min-w-0 flex-1 border-r ios-divider">
          <div className="flex h-full w-full min-w-0">
            {assistantDockOpen ? (
              <>
                <div
                  className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden"
                  style={{ width: assistantDockWidthPx }}
                >
                  <AssistantPanel />
                </div>
                <button
                  type="button"
                  aria-label="Resize assistant panel"
                  title="Drag to resize"
                  onMouseDown={startAssistantResize}
                  className="group relative z-20 w-2 shrink-0 cursor-col-resize border-l border-r border-transparent bg-transparent hover:border-sky-300/60 hover:bg-sky-400/15 active:bg-sky-400/25"
                />
              </>
            ) : null}
            <div className="min-h-0 min-w-0 flex-1">
              <X6Canvas
                mainGraph={mainGraph}
                sandboxGraph={sandboxGraph}
                agentId={agentId}
                clusterByNodeId={clusterByNodeId}
                clusterAssignments={clusterAssignments}
                onGraphReady={setGraph}
                dockLayoutKey={`${rightDockOpen ? 1 : 0}|${assistantDockOpen ? 1 : 0}|${assistantDockWidthPx}`}
              />
            </div>
          </div>
        </section>

        {rightDockOpen ? (
        <aside
          className="min-h-0 min-w-0 shrink-0 overflow-hidden"
          style={{ flex: "0 0 clamp(280px, 32vw, 440px)" }}
        >
          <div className="flex h-full min-w-0 flex-col">
            <nav className="border-b ios-divider px-4 pt-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Appearance</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="ios-toggle"
                    aria-label="Toggle night mode"
                    aria-pressed={theme === "dark"}
                    onClick={() => toggleTheme()}
                  >
                    <span className="ios-toggle-track" data-on={theme === "dark"} />
                    <span className="ios-toggle-knob" data-on={theme === "dark"} />
                    <span className="ios-toggle-icon" aria-hidden>
                      {theme === "dark" ? "🌙" : "☀️"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="ios-button flex shrink-0 items-center gap-1 px-2 py-1 text-[10px]"
                    onClick={() => setRightDockOpen(false)}
                    title="Hide panel — full width canvas"
                  >
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    Hide
                  </button>
                </div>
              </div>
              <div className="ios-segment w-full">
                <button
                  type="button"
                  className={[
                    "ios-segment-item flex-1",
                    activePanel === "source" ? "ios-segment-item-active" : "ios-segment-item-inactive"
                  ].join(" ")}
                  onClick={() => setActivePanel("source")}
                >
                  Source
                </button>
                <button
                  type="button"
                  className={[
                    "ios-segment-item flex-1",
                    activePanel === "review" ? "ios-segment-item-active" : "ios-segment-item-inactive"
                  ].join(" ")}
                  onClick={() => setActivePanel("review")}
                >
                  Review
                </button>
              </div>
            </nav>

            <div className="flex-1 overflow-auto px-4 py-4">
              {activePanel === "source" ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Source
                  </div>
                  <SourceMaterialPanel backendBase={backendBase} />
                  <div className="ios-card p-3">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">Node actions</div>
                    {selectedNode?.id ? (
                      <div className="mt-2 space-y-2">
                        <div className="text-[11px] text-slate-600 dark:text-slate-300">
                          Selected: <span className="font-mono">{selectedNode.id}</span>
                        </div>
                        {moveMode && movingNodeId ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2 text-[11px] text-amber-900">
                            Move mode: click the new parent node on the canvas.
                            <div className="mt-1 font-mono">moving: {movingNodeId}</div>
                            <button type="button" className="mt-2 ios-button" onClick={() => cancelMove()}>
                              Cancel move
                            </button>
                          </div>
                        ) : null}
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[11px] text-slate-700 dark:text-slate-200">
                            Child type
                            <select
                              className="mt-1 ios-select"
                              value={newChildType}
                              onChange={(e) => setNewChildType(e.target.value)}
                            >
                              <option value="inferred">Inferred</option>
                              <option value="evidence">Evidence</option>
                            </select>
                          </label>
                          <label className="text-[11px] text-slate-700 dark:text-slate-200">
                            Edge label
                            <input
                              className="mt-1 ios-input py-1.5"
                              value={newEdgeLabel}
                              onChange={(e) => setNewEdgeLabel(e.target.value)}
                              placeholder="supports"
                            />
                          </label>
                        </div>
                        <label className="block text-[11px] text-slate-700 dark:text-slate-200">
                          Child label
                          <input
                            className="mt-1 ios-input"
                            value={newChildLabel}
                            onChange={(e) => setNewChildLabel(e.target.value)}
                            placeholder="New node"
                            onKeyDown={(e) => e.key === "Enter" && addChildFromSelected()}
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="ios-button" onClick={() => addChildFromSelected()}>
                            Add child branch
                          </button>
                          <button type="button" className="ios-button" onClick={() => startMoveSelected()}>
                            Move to another parent
                          </button>
                          <button
                            type="button"
                            className="ios-button"
                            onClick={() => {
                              if (graph) graph.centerContent();
                            }}
                          >
                            Recenter
                          </button>
                          <button
                            type="button"
                            className="ios-button border-red-200 text-red-700 hover:bg-white dark:border-red-500/50 dark:text-red-300 dark:hover:bg-slate-950/40"
                            onClick={() => deleteSelectedNode()}
                          >
                            Delete node
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
                        Click a node on the canvas to enable actions.
                      </div>
                    )}
                    <p className="mt-2 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                      Canvas: hold <span className="font-medium">Option/Alt</span> and drag to pan; two-finger scroll
                      also pans. Use <span className="font-medium">⌃ or ⌘ + scroll</span> to zoom. Double-click empty
                      canvas to recenter.
                    </p>
                  </div>
                  <div className="ios-card p-3">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">Base model</div>
                    <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                      Add/remove model IDs and choose which one all LLM calls use. Persisted on the server under{" "}
                      <code className="rounded bg-white/70 px-1 py-0.5 dark:bg-slate-950/40">
                        backend/data/model_settings.json
                      </code>
                      .
                    </p>
                    <label className="mt-2 block text-xs text-slate-700 dark:text-slate-200">
                      Active model
                      <select
                        className="mt-1 ios-select"
                        value={activeModel}
                        onChange={(e) => selectBaseModel(e.target.value)}
                        disabled={baseModels.length === 0}
                      >
                        {baseModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. claude-sonnet-4-20250514"
                        className="min-w-0 flex-1 ios-input py-1.5"
                        value={newModelId}
                        onChange={(e) => setNewModelId(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addBaseModel()}
                      />
                      <button
                        type="button"
                        className="ios-button shrink-0"
                        onClick={() => addBaseModel()}
                      >
                        Add
                      </button>
                    </div>
                    <div className="mt-2 max-h-28 space-y-1 overflow-auto">
                      {baseModels.map((m) => (
                        <div
                          key={m}
                          className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[11px] shadow-sm backdrop-blur-xl"
                        >
                          <span className="truncate font-mono text-slate-800">{m}</span>
                          <button
                            type="button"
                            className="shrink-0 text-red-700 hover:underline"
                            onClick={() => removeBaseModel(m)}
                            title="Remove from list"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    {modelError ? <p className="mt-2 text-[11px] text-red-700">{modelError}</p> : null}
                    <button
                      type="button"
                      className="mt-2 text-[11px] text-slate-600 underline"
                      onClick={() => refreshModels()}
                    >
                      Refresh from server
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-slate-700">
                      Agent ID
                      <select
                        className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                        value={agentId}
                        onChange={(e) => setAgentId(e.target.value)}
                      >
                        <option value="agent-1">agent-1</option>
                        <option value="agent-2">agent-2</option>
                        <option value="agent-3">agent-3</option>
                        <option value="agent-4">agent-4</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-700">
                      Agents
                      <select
                        className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                        value={numAgents}
                        onChange={(e) => setNumAgents(Number(e.target.value))}
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                      </select>
                    </label>
                  </div>
                  <div className="ios-card p-2 text-[11px] text-slate-700">
                    Cluster assignments (only owning agent re-validates):
                    <pre className="mt-1 whitespace-pre-wrap">
                      {JSON.stringify(clusterAssignments, null, 2)}
                    </pre>
                  </div>
                  <div className="text-sm text-slate-600">
                    {selectedNode ? (
                      <pre className="whitespace-pre-wrap ios-card p-3 text-xs text-slate-800">
                        {JSON.stringify(selectedNode, null, 2)}
                      </pre>
                    ) : (
                      "Click a node to view its metadata."
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-900">
                    Review branch
                  </div>
                  {selectedNode?.type?.toString().toLowerCase() === "evidence" && (
                    <div className="ios-card p-3 text-xs text-slate-800">
                      <div className="mb-2 font-semibold text-slate-900">Evidence source</div>
                      <div className="text-[11px] text-slate-600">
                        Filename: <span className="font-mono">{evidenceSource?.filename || "(unknown)"}</span>
                      </div>
                      <div className="mt-2 text-[11px] text-slate-600">
                        Page:{" "}
                        <span className="font-mono">
                          {(() => {
                            const md = (selectedNode?.metadata ?? {}) as any;
                            const p = md?.page_number ?? md?.pageNumber;
                            return typeof p === "number" && p > 0 ? p : "—";
                          })()}
                        </span>
                      </div>
                      <div className="mt-2 rounded-xl border border-slate-200 bg-white/70 p-2 text-[11px] text-slate-800">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Quote
                        </div>
                        <p className="whitespace-pre-wrap">
                          {(() => {
                            const md = (selectedNode?.metadata ?? {}) as any;
                            return (md?.text_snippet ?? md?.textSnippet ?? "").toString() || "(no quote available)";
                          })()}
                        </p>
                      </div>
                      {evidenceSource?.href ? (
                        <a
                          className="mt-2 inline-flex text-[11px] font-medium text-sky-700 underline"
                          href={evidenceSource.href}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open source file
                        </a>
                      ) : (
                        <div className="mt-2 text-[11px] text-slate-600">
                          Source file not found in current project storage.
                        </div>
                      )}
                      <div className="mt-2 text-[11px] text-slate-600">
                        Tip: Make sure you selected the right Project in the Source panel.
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-slate-600">
                    Select a node on the canvas (branch root), choose a reviewer persona, then run the scan.
                    Comments appear as 💬 badges on nodes; click a badge to read the critique here. Tick the comments
                    you want merged, then use{" "}
                    <span className="font-medium">Apply selected comments</span> so the model updates the branch from
                    that subset only (sandbox is cleared afterward so the graph stays in sync).
                  </p>
                  <label className="block text-xs text-slate-700">
                    Persona
                    <select
                      className="mt-1 ios-select"
                      value={reviewPersona}
                      onChange={(e) => setReviewPersona(e.target.value)}
                    >
                      {REVIEW_PERSONAS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!selectedNode?.id || reviewLoading}
                      className="ios-button"
                      onClick={() => runReviewBranch()}
                    >
                      {reviewLoading ? "Scanning…" : "Review Branch"}
                    </button>
                    <button
                      type="button"
                      className="ios-button"
                      onClick={() => {
                        clearReviewComments();
                        setSelectedCommentIds([]);
                        setApplyReviewError("");
                      }}
                    >
                      Clear comments
                    </button>
                  </div>
                  {reviewComments.length > 0 && (
                    <div className="mt-2">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                        <span className="font-medium text-slate-700">Comments to apply</span>
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setSelectedCommentIds(reviewComments.map((c) => c.id))}
                        >
                          Select all
                        </button>
                        <button type="button" className="underline" onClick={() => setSelectedCommentIds([])}>
                          Clear selection
                        </button>
                      </div>
                      <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white/60 p-2">
                        {reviewComments.map((c) => (
                          <label
                            key={c.id}
                            className="flex cursor-pointer gap-2 rounded-lg border border-transparent p-1 hover:border-slate-200 hover:bg-white/80"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 shrink-0"
                              checked={selectedCommentIds.includes(c.id)}
                              onChange={() => toggleCommentSelection(c.id)}
                            />
                            <div className="min-w-0 text-[11px] text-slate-800">
                              <div className="font-mono text-[10px] text-slate-500">{c.nodeId}</div>
                              <p className="mt-0.5 whitespace-pre-wrap">{c.text}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={
                        applyReviewBusy ||
                        selectedCommentIds.length === 0 ||
                        !reviewBranchRootId
                      }
                      className="ios-button-primary"
                      onClick={() => runApplyReview()}
                    >
                      {applyReviewBusy ? "Applying…" : "Apply selected comments"}
                    </button>
                  </div>
                  {applyReviewError ? (
                    <p className="text-[11px] text-red-700">{applyReviewError}</p>
                  ) : null}
                  {!selectedNode?.id && (
                    <div className="text-xs text-amber-800">Click a node first to set the branch root.</div>
                  )}
                  {reviewFocusNodeId && (
                    <div className="ios-card p-3 text-xs text-slate-800">
                      <div className="mb-2 font-semibold text-slate-900">
                        Critique — node{" "}
                        <code className="rounded bg-white/70 px-1 py-0.5">{reviewFocusNodeId}</code>
                      </div>
                      {reviewComments
                        .filter((c) => c.nodeId === reviewFocusNodeId)
                        .map((c) => (
                          <label
                            key={c.id}
                            className="mb-3 flex cursor-pointer gap-2 border-b ios-divider pb-3 last:mb-0 last:border-0 last:pb-0"
                          >
                            <input
                              type="checkbox"
                              className="mt-1 shrink-0"
                              checked={selectedCommentIds.includes(c.id)}
                              onChange={() => toggleCommentSelection(c.id)}
                            />
                            <div className="min-w-0">
                              <div className="text-[11px] font-medium text-slate-500">{c.persona}</div>
                              <p className="mt-1 whitespace-pre-wrap text-slate-800">{c.text}</p>
                            </div>
                          </label>
                        ))}
                      {reviewComments.filter((c) => c.nodeId === reviewFocusNodeId).length === 0 && (
                        <div className="text-slate-600">No comments for this node.</div>
                      )}
                      <button
                        type="button"
                        className="mt-2 text-[11px] text-slate-600 underline"
                        onClick={() => setReviewFocusNodeId(null)}
                      >
                        Close focus
                      </button>
                    </div>
                  )}
                  {!reviewFocusNodeId && reviewComments.length > 0 && (
                    <div className="text-xs text-slate-600">
                      {reviewComments.length} comment(s) on the map — click a 💬 badge on a node.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
        ) : null}
      </div>
    </div>
  );
}

