import { useCallback, useEffect, useState } from "react";
import type { Graph } from "@antv/x6";
import { useShallow } from "zustand/react/shallow";
import useUiStore from "../../store/useUiStore";
import SourceMaterialPanel from "../SourceMaterialPanel";

export default function SourceSidebarPanel(props: { graph: Graph | null; backendBase: string }) {
  const { graph, backendBase } = props;

  const { selectedNode, clusterAssignments, agentId, setAgentId, numAgents, setNumAgents } = useUiStore(
    useShallow((s) => ({
      selectedNode: s.selectedNode,
      clusterAssignments: s.clusterAssignments,
      agentId: s.agentId,
      setAgentId: s.setAgentId,
      numAgents: s.numAgents,
      setNumAgents: s.setNumAgents
    }))
  );

  const [baseModels, setBaseModels] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState("");
  const [newModelId, setNewModelId] = useState("");
  const [modelError, setModelError] = useState("");
  const [newChildType, setNewChildType] = useState("inferred");
  const [newChildLabel, setNewChildLabel] = useState("");
  const [newEdgeLabel, setNewEdgeLabel] = useState("supports");
  const [moveMode, setMoveMode] = useState(false);
  const [movingNodeId, setMovingNodeId] = useState<string | null>(null);

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
    useUiStore.getState().setReviewFocusNodeId(null);
    useUiStore.getState().setSelectedNode(null);
  }, [graph]);

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

  useEffect(() => {
    if (!moveMode || !movingNodeId) return;
    if (!selectedNode?.id) return;
    const newParentId = selectedNode.id;
    if (newParentId === movingNodeId) return;
    attachMovingNodeTo(newParentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveMode, movingNodeId, selectedNode?.id]);

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Source</div>
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
          Canvas: hold <span className="font-medium">Option/Alt</span> and drag to pan; two-finger scroll also pans. Use{" "}
          <span className="font-medium">⌃ or ⌘ + scroll</span> to zoom. Double-click empty canvas to recenter.
        </p>
      </div>
      <div className="ios-card p-3">
        <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">Base model</div>
        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
          Add/remove model IDs and choose which one all LLM calls use. Persisted on the server under{" "}
          <code className="rounded bg-white/70 px-1 py-0.5 dark:bg-slate-950/40">backend/data/model_settings.json</code>.
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
          <button type="button" className="ios-button shrink-0" onClick={() => addBaseModel()}>
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
        <button type="button" className="mt-2 text-[11px] text-slate-600 underline" onClick={() => refreshModels()}>
          Refresh from server
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-700 dark:text-slate-200">
          Agent ID
          <select
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            <option value="agent-1">agent-1</option>
            <option value="agent-2">agent-2</option>
            <option value="agent-3">agent-3</option>
            <option value="agent-4">agent-4</option>
          </select>
        </label>
        <label className="text-xs text-slate-700 dark:text-slate-200">
          Agents
          <select
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
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
      <div className="ios-card p-2 text-[11px] text-slate-700 dark:text-slate-200">
        Cluster assignments (only owning agent re-validates):
        <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(clusterAssignments, null, 2)}</pre>
      </div>
      <div className="text-sm text-slate-600 dark:text-slate-300">
        {selectedNode ? (
          <pre className="whitespace-pre-wrap ios-card p-3 text-xs text-slate-800 dark:text-slate-100">
            {JSON.stringify(selectedNode, null, 2)}
          </pre>
        ) : (
          "Click a node to view its metadata."
        )}
      </div>
    </div>
  );
}
