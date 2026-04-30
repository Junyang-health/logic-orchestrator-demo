import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Graph } from "@antv/x6";
import { register } from "@antv/x6-react-shape";

// X6 ships default CSS separately.
import "@antv/x6/dist/index.css";
import MindmapReactNode from "./MindmapReactNode";
import X6CanvasToolbar from "./X6CanvasToolbar";
import type { MindmapJson } from "../types/mindmap";
import { combineGraphs } from "../lib/graphBranch";
import { getTopLevelCollapseRootIds } from "../lib/mindmapCollapse";
import { loadMindmapIntoGraph } from "../lib/x6CanvasLoadMindmap";
import {
  applySubtreeSelectionHighlight,
  clearConnectionHighlightOnGraph
} from "../lib/x6CanvasGraphUtils";
import { mountX6CanvasGraph } from "../lib/x6CanvasGraphBootstrap";
import { useX6CanvasGraphSync } from "../lib/useX6CanvasGraphSync";
import useUiStore from "../store/useUiStore";

export default function X6Canvas(props: {
  mainGraph: MindmapJson | null;
  sandboxGraph: MindmapJson;
  agentId: string;
  clusterByNodeId: Record<string, string>;
  clusterAssignments: Record<string, string>;
  onGraphReady?: (graph: Graph | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const debounceRef = useRef<Map<string, number>>(new Map());
  const hydratingRef = useRef(false);
  /** Bumps when a new mindmap is loaded so stale deferred layouts are skipped. */
  const layoutEpochRef = useRef(0);
  const dagreRelayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Latest cluster map (avoid re-running full loadMindmap when only clusters change). */
  const clusterByNodeIdRef = useRef(props.clusterByNodeId);
  clusterByNodeIdRef.current = props.clusterByNodeId;
  const clusterAssignmentsRef = useRef(props.clusterAssignments);
  clusterAssignmentsRef.current = props.clusterAssignments;
  const agentIdRef = useRef(props.agentId);
  agentIdRef.current = props.agentId;
  /** Skip `/validate` scheduling while bulk-updating ephemeral review badge counts on `node.data`. */
  const reviewBadgeMuteValidationRef = useRef(false);
  const loadMindmapTimersRef = useRef<number[]>([]);
  const lastDockLayoutKeyRef = useRef<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const sandboxMode = useUiStore((s) => s.sandboxMode);
  const selectedNodeId = useUiStore((s) => s.selectedNode?.id ?? null);
  const theme = useUiStore((s) => s.theme);
  const reviewComments = useUiStore((s) => s.reviewComments);
  const rightDockOpen = useUiStore((s) => s.rightDockOpen);
  const canvasGridVisible = useUiStore((s) => s.canvasGridVisible);
  const setCanvasGridVisible = useUiStore((s) => s.setCanvasGridVisible);
  const collapsedSubtreeRootIds = useUiStore((s) => s.collapsedSubtreeRootIds);
  const expandAllCollapsedSubtrees = useUiStore((s) => s.expandAllCollapsedSubtrees);
  const collapseAllSubtreesToTopLevel = useUiStore((s) => s.collapseAllSubtreesToTopLevel);
  const collapseReloadKey = useMemo(
    () => [...collapsedSubtreeRootIds].sort().join("|"),
    [collapsedSubtreeRootIds]
  );
  const canCollapseToTop = useMemo(() => {
    const main = props.mainGraph;
    const san = props.sandboxGraph;
    if (!main && (!san || san.nodes.length === 0)) return false;
    const merged = combineGraphs(main, san);
    const allIds = new Set(merged.nodes.map((n) => n.id));
    return getTopLevelCollapseRootIds(allIds, merged.edges).length > 0;
  }, [props.mainGraph, props.sandboxGraph]);
  const hasCollapsedSubtrees = collapsedSubtreeRootIds.length > 0;
  const dockLayoutKey = `${rightDockOpen ? 1 : 0}`;

  const reactShapeRegistered = useMemo(() => {
    register({
      shape: "mindmap-react-node",
      width: 280,
      height: 72,
      component: MindmapReactNode
    });
    return true;
  }, []);

  const loadMindmap = (graph: Graph, mindmap: MindmapJson) => {
    loadMindmapIntoGraph(graph, mindmap, clusterByNodeIdRef.current, {
      layoutEpochRef,
      hydratingRef,
      loadMindmapTimersRef,
      reviewBadgeMuteValidationRef
    });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    void reactShapeRegistered;

    return mountX6CanvasGraph({
      containerEl: el,
      graphRef,
      debounceRef,
      hydratingRef,
      layoutEpochRef,
      dagreRelayoutTimerRef,
      clusterByNodeIdRef,
      clusterAssignmentsRef,
      agentIdRef,
      reviewBadgeMuteValidationRef,
      loadMindmapTimersRef,
      sandboxModeAtMount: sandboxMode,
      mainGraphAtMount: props.mainGraph,
      onGraphReady: props.onGraphReady,
      loadMindmap,
      setSelectedEdgeId
    });
  }, []);

  const canvasCenterOnNodeRequest = useUiStore((s) => s.canvasCenterOnNodeRequest);
  useX6CanvasGraphSync({
    graphRef,
    containerRef,
    lastDockLayoutKeyRef,
    dockLayoutKey,
    reviewComments,
    reviewBadgeMuteValidationRef,
    selectedNodeId,
    canvasCenterOnNodeRequest,
    theme,
    sandboxMode,
    canvasGridVisible,
    mainGraph: props.mainGraph,
    sandboxGraph: props.sandboxGraph,
    clusterByNodeId: props.clusterByNodeId,
    clusterByNodeIdRef,
    collapseReloadKey,
    hydratingRef,
    loadMindmap,
    setSelectedEdgeId
  });

  const removeMindmapEdgeFromStoreForCell = useCallback((g: Graph, edgeId: string) => {
    const cell = g.getCellById(edgeId);
    if (!cell?.isEdge?.()) {
      setSelectedEdgeId(null);
      return;
    }
    const src = cell.getSourceCellId();
    const tgt = cell.getTargetCellId();
    if (!src || !tgt) {
      setSelectedEdgeId(null);
      return;
    }
    const st = useUiStore.getState();
    const hit = combineGraphs(st.mainGraph, st.sandboxGraph).edges.find(
      (e) => e.source === src && e.target === tgt
    );
    if (!hit) {
      setSelectedEdgeId(null);
      return;
    }
    st.removeEdge(src, tgt, hit.label ?? "");
    setSelectedEdgeId(null);
    clearConnectionHighlightOnGraph(g);
    applySubtreeSelectionHighlight(g, st.selectedNode?.id ?? null);
  }, []);

  const removeSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    const g = graphRef.current;
    if (!g) return;
    removeMindmapEdgeFromStoreForCell(g, selectedEdgeId);
  }, [selectedEdgeId, removeMindmapEdgeFromStoreForCell]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, [contenteditable='true']")) return;
      if (!selectedEdgeId) return;
      const g = graphRef.current;
      if (!g) return;
      e.preventDefault();
      removeMindmapEdgeFromStoreForCell(g, selectedEdgeId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEdgeId, removeMindmapEdgeFromStoreForCell]);

  return (
    <div className="relative h-full w-full min-h-0 min-w-0 flex-1">
      <div ref={containerRef} className="h-full w-full min-h-0 min-w-0" />
      <X6CanvasToolbar
        hasCollapsedSubtrees={hasCollapsedSubtrees}
        canCollapseToTop={canCollapseToTop}
        onExpandAllSubtrees={() => expandAllCollapsedSubtrees()}
        onCollapseAllToTop={() => collapseAllSubtreesToTopLevel()}
        canvasGridVisible={canvasGridVisible}
        onToggleGrid={() => setCanvasGridVisible(!canvasGridVisible)}
        selectedEdgeId={selectedEdgeId}
        onRemoveSelectedEdge={removeSelectedEdge}
      />
    </div>
  );
}
