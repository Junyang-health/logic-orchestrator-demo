import { useCallback, useEffect, useState } from "react";
import type { Graph } from "@antv/x6";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../i18n/useI18n";
import { addChildToParent, removeNodeFromGraph } from "../../lib/mindmapCanvasOps";
import useUiStore from "../../store/useUiStore";
import SourceMaterialPanel from "../SourceMaterialPanel";

export default function SourceSidebarPanel(props: { graph: Graph | null; backendBase: string }) {
  const { t } = useI18n();
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

  const reparentingNodeId = useUiStore((s) => s.reparentingNodeId);
  const startReparent = useUiStore((s) => s.startReparent);
  const clearReparent = useUiStore((s) => s.clearReparent);

  const refreshModels = useCallback(async () => {
    try {
      const res = await fetch(`${backendBase}/models`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { models: string[]; current: string };
      setBaseModels(data.models);
      setActiveModel(data.current);
      setModelError("");
    } catch {
      setModelError(t("err_models_load"));
    }
  }, [backendBase, t]);

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
        setModelError(t("err_select_req"));
      }
    },
    [backendBase, t]
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
      setModelError(t("err_add_req"));
    }
  }, [backendBase, newModelId, t]);

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
        setModelError(t("err_remove_req"));
      }
    },
    [backendBase, t]
  );

  const addChildFromSelected = useCallback(() => {
    if (!graph) return;
    const sel = useUiStore.getState().selectedNode;
    if (!sel?.id) return;
    addChildToParent(graph, sel.id, {
      typeRaw: newChildType,
      label: (newChildLabel.trim() || t("new_node_default")).slice(0, 120),
      edgeLabel: newEdgeLabel.trim()
    });
    setNewChildLabel("");
  }, [graph, newChildLabel, newChildType, newEdgeLabel, t]);

  const deleteSelectedNode = useCallback(() => {
    if (!graph) return;
    const sel = useUiStore.getState().selectedNode;
    if (!sel?.id) return;
    removeNodeFromGraph(graph, sel.id);
  }, [graph]);

  const startMoveSelected = useCallback(() => {
    const sel = useUiStore.getState().selectedNode;
    if (!sel?.id) return;
    startReparent(sel.id, (newEdgeLabel || "supports").trim());
  }, [newEdgeLabel, startReparent]);

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-[var(--mm-text-title)] dark:text-slate-100">{t("source_sidebar_title")}</div>
      <SourceMaterialPanel backendBase={backendBase} />
      <div className="ios-card p-3">
        <div className="text-xs font-medium text-[var(--mm-text-title)]">{t("source_node_actions")}</div>
        {selectedNode?.id ? (
          <div className="mt-2 space-y-2">
            <div className="text-[11px] font-medium text-[var(--mm-text-muted)] dark:text-slate-300">
              {t("source_selected")} <span className="font-mono">{selectedNode.id}</span>
            </div>
            {reparentingNodeId ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2 text-[11px] text-amber-900">
                {t("source_move_mode")}
                <div className="mt-1 font-mono">
                  {t("source_moving")} {reparentingNodeId}
                </div>
                <button type="button" className="mt-2 ios-button" onClick={() => clearReparent()}>
                  {t("source_cancel_move")}
                </button>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium text-[var(--mm-text-title)] dark:text-slate-200">
                {t("source_child_type")}
                <select
                  className="mt-1 ios-select"
                  value={newChildType}
                  onChange={(e) => setNewChildType(e.target.value)}
                >
                  <option value="inferred">{t("palette_inferred")}</option>
                  <option value="evidence">{t("palette_evidence")}</option>
                </select>
              </label>
              <label className="text-[11px] font-medium text-[var(--mm-text-title)] dark:text-slate-200">
                {t("source_edge_label")}
                <input
                  className="mt-1 ios-input py-1.5"
                  value={newEdgeLabel}
                  onChange={(e) => setNewEdgeLabel(e.target.value)}
                  placeholder={t("source_ph_supports")}
                />
              </label>
            </div>
            <label className="block text-[11px] font-medium text-[var(--mm-text-title)] dark:text-slate-200">
              {t("source_child_label")}
              <input
                className="mt-1 ios-input"
                value={newChildLabel}
                onChange={(e) => setNewChildLabel(e.target.value)}
                placeholder={t("new_node_default")}
                onKeyDown={(e) => e.key === "Enter" && addChildFromSelected()}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="ios-button" onClick={() => addChildFromSelected()}>
                {t("source_add_child")}
              </button>
              <button type="button" className="ios-button" onClick={() => startMoveSelected()}>
                {t("source_move_parent")}
              </button>
              <button
                type="button"
                className="ios-button"
                onClick={() => {
                  if (graph) graph.centerContent();
                }}
              >
                {t("source_recenter")}
              </button>
              <button
                type="button"
                className="ios-button border-red-200 text-red-700 hover:bg-white dark:border-red-500/50 dark:text-red-300 dark:hover:bg-slate-950/40"
                onClick={() => deleteSelectedNode()}
              >
                {t("source_delete_node")}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-[11px] font-medium text-[var(--mm-text-muted)] dark:text-slate-300">
            {t("source_click_node")}
          </div>
        )}
        <p className="mt-2 text-[10px] font-medium leading-snug text-[var(--mm-text-placeholder)] dark:text-slate-400">{t("source_canvas_help")}</p>
      </div>
      <div className="ios-card p-3">
        <div className="text-xs font-medium text-[var(--mm-text-title)]">{t("source_base_model")}</div>
        <p className="mt-1 text-[11px] font-medium text-[var(--mm-text-muted)] dark:text-slate-300">
          {t("source_base_model_help")}{" "}
          <code className="rounded bg-white/70 px-1 py-0.5 dark:bg-slate-950/40">backend/data/model_settings.json</code>.
        </p>
        <label className="mt-2 block text-xs font-medium text-[var(--mm-text-title)] dark:text-slate-200">
          {t("source_active_model")}
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
            placeholder={t("source_model_ph")}
            className="min-w-0 flex-1 ios-input py-1.5"
            value={newModelId}
            onChange={(e) => setNewModelId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addBaseModel()}
          />
          <button type="button" className="ios-button-secondary shrink-0" onClick={() => addBaseModel()}>
            {t("source_add")}
          </button>
        </div>
        <div className="mt-2 max-h-28 space-y-1 overflow-auto">
          {baseModels.map((m) => (
            <div
              key={m}
              className="mm-sidebar-section flex items-center justify-between gap-2 px-3 py-2 text-[11px] dark:border-[var(--mm-border-subtle)] dark:bg-slate-950/40 dark:shadow-none"
            >
              <span className="truncate font-mono text-[var(--mm-text-title)]">{m}</span>
              <button
                type="button"
                className="shrink-0 text-red-700 hover:underline"
                onClick={() => removeBaseModel(m)}
                title={t("source_remove_list")}
              >
                {t("source_remove")}
              </button>
            </div>
          ))}
        </div>
        {modelError ? <p className="mt-2 text-[11px] text-red-700">{modelError}</p> : null}
        <button type="button" className="ios-button-ghost mt-2 px-1 py-0 text-[11px]" onClick={() => refreshModels()}>
          {t("source_refresh")}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-[var(--mm-text-title)] dark:text-slate-200">
          {t("source_agent_id")}
          <select
            className="mt-1 ios-select py-1 text-xs"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            <option value="agent-1">agent-1</option>
            <option value="agent-2">agent-2</option>
            <option value="agent-3">agent-3</option>
            <option value="agent-4">agent-4</option>
          </select>
        </label>
        <label className="text-xs font-medium text-[var(--mm-text-title)] dark:text-slate-200">
          {t("source_agents")}
          <select
            className="mt-1 ios-select py-1 text-xs"
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
      <div className="ios-card p-2 text-[11px] font-medium text-[var(--mm-text-title)] dark:text-slate-200">
        {t("source_cluster")}
        <pre className="mt-1 whitespace-pre-wrap font-normal text-[var(--mm-text-muted)]">{JSON.stringify(clusterAssignments, null, 2)}</pre>
      </div>
      <div className="text-sm font-medium text-[var(--mm-text-muted)] dark:text-slate-300">
        {selectedNode ? (
          <pre className="whitespace-pre-wrap ios-card p-3 text-xs text-[var(--mm-text-title)] dark:text-slate-100">
            {JSON.stringify(selectedNode, null, 2)}
          </pre>
        ) : (
          t("source_click_metadata")
        )}
      </div>
    </div>
  );
}
