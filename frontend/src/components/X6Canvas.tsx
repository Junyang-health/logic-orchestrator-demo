import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Graph } from "@antv/x6";
import { Export } from "@antv/x6-plugin-export";
import { register } from "@antv/x6-react-shape";

// X6 ships default CSS separately.
import "@antv/x6/dist/index.css";
import MindmapReactNode from "./MindmapReactNode";
import X6CanvasToolbar from "./X6CanvasToolbar";
import type { MindmapJson } from "../types/mindmap";
import { combineGraphs } from "../lib/graphBranch";
import { buildDisplayedMindmapJson } from "../lib/x6CanvasDisplayedGraph";
import { getTopLevelCollapseRootIds } from "../lib/mindmapCollapse";
import { normalizeMindmapNodeType } from "../lib/normalizeMindmapNodeType";
import { applyReviewCommentBadgesToGraph } from "../lib/syncReviewCommentBadges";
import { clearPendingLoadMindmapTimers, loadMindmapIntoGraph } from "../lib/x6CanvasLoadMindmap";
import {
  applyDagreLayout,
  applySubtreeSelectionHighlight,
  clearConnectionHighlightOnGraph,
  highlightForEdgeId
} from "../lib/x6CanvasGraphUtils";
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
    // Register once per module instance.
    register({
      shape: "mindmap-react-node",
      width: 280,
      height: 96,
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
    // Ensure registration happened.
    void reactShapeRegistered;

    const applyGraphTheme = (g: Graph) => {
      const bg = "var(--mm-canvas-bg)";
      try {
        (g as any).drawBackground?.({ color: bg });
      } catch {
        // ignore
      }
      try {
        (g as any).container?.style && ((g as any).container.style.background = bg);
      } catch {
        // ignore
      }
    };

    const graph = new Graph({
      container: el,
      grid: true,
      background: {
        color: "var(--mm-canvas-bg)"
      },
      panning: {
        enabled: true,
        // Alt+drag (Option on Mac) pans; plain left-drag keeps moving nodes. Wheel without ⌃/⌘ pans; zoom stays on ⌃/⌘+wheel.
        modifiers: ["alt"],
        eventTypes: ["leftMouseDown", "mouseWheel"]
      },
      mousewheel: {
        enabled: true,
        modifiers: ["ctrl", "meta"],
        minScale: 0.5,
        maxScale: 3
      },
      connecting: {
        router: "manhattan",
        createEdge() {
          const isSandbox = Boolean((this as any).prop?.("sandboxContext"));
          return (this as any).createEdge({
            attrs: {
              line: {
                stroke: isSandbox ? "var(--mm-edge-line-draft)" : "var(--mm-edge-line-interactive-firm)",
                strokeWidth: 1.5,
                strokeDasharray: isSandbox ? "6 4" : ""
              }
            },
            data: { status: isSandbox ? "draft" : "firm" }
          });
        }
      }
    });

    // Keep a reference for cleanup and resize.
    graphRef.current = graph;
    graph.use(new Export());
    props.onGraphReady?.(graph);

    if (!useUiStore.getState().canvasGridVisible) {
      try {
        graph.grid.hide();
      } catch {
        /* ignore */
      }
    }

    // Bridge sandbox mode into graph context for X6 internals.
    (graph as any).prop?.("sandboxContext", sandboxMode);
    applyGraphTheme(graph);

    const scheduleDagreFromNodeSize = () => {
      const g = graphRef.current;
      if (!g) return;
      if (dagreRelayoutTimerRef.current) window.clearTimeout(dagreRelayoutTimerRef.current);
      dagreRelayoutTimerRef.current = window.setTimeout(() => {
        dagreRelayoutTimerRef.current = null;
        applyDagreLayout(g);
      }, 80);
    };
    graph.on("node:change:size", scheduleDagreFromNodeSize);

    const getBackendBase = () =>
      ((import.meta as any).env?.VITE_BACKEND_URL as string) || "http://localhost:8000";

    const collectEvidenceSnippets = () => {
      const snippets: string[] = [];
      for (const n of graph.getNodes()) {
        const d = (n.getData() ?? {}) as any;
        if ((d.type || "").toString().toLowerCase() !== "evidence") continue;
        const md = (d.metadata ?? {}) as any;
        const src = (md.source_filename ?? "").toString().trim();
        const txt = (md.text_snippet ?? "").toString().trim();
        if (src && txt) snippets.push(`(${src}) ${txt}`);
      }
      return snippets;
    };

    const setNodeConflict = (
      nodeId: string,
      payload: { violation_summary: string; inferred_consequences: string; rationale?: string }
    ) => {
      const node = graph.getCellById(nodeId);
      if (!node || !node.isNode()) return;
      const d = ((node as any).getData?.() ?? {}) as any;
      (node as any).setData?.(
        {
          ...d,
          status: "conflict",
          violation_summary: payload.violation_summary,
          inferred_consequences: payload.inferred_consequences,
          validation_rationale: payload.rationale ?? ""
        },
        { overwrite: true }
      );
    };

    const propagateInstability = (
      startNodeId: string,
      ctx: { violation_summary: string; inferred_consequences: string }
    ) => {
      const unstableIds = new Set<string>();
      const edges = graph.getEdges().map((e) => ({
        source: e.getSourceCellId(),
        target: e.getTargetCellId()
      }));

      const findDescendants = (parentId: string) => {
        const outgoing = edges.filter((ed) => ed.source === parentId);
        for (const ed of outgoing) {
          const childId = ed.target;
          if (!childId) continue;
          if (!unstableIds.has(childId)) {
            unstableIds.add(childId);
            findDescendants(childId);
          }
        }
      };

      findDescendants(startNodeId);

      const cascadeSummary =
        (ctx.inferred_consequences || "").trim().slice(0, 360) ||
        "Downstream claims that depend on this branch may be unreliable until the upstream conflict is resolved.";

      for (const id of unstableIds) {
        if (id === startNodeId) continue;
        const cell = graph.getCellById(id);
        if (!cell || !cell.isNode()) continue;
        const d = ((cell as any).getData?.() ?? {}) as any;
        if (d.status === "conflict") continue;
        (cell as any).setData?.(
          {
            ...d,
            status: "unstable",
            violation_summary: "Affected by upstream logic conflict",
            inferred_consequences: cascadeSummary,
            upstream_conflict_summary: (ctx.violation_summary || "").slice(0, 240)
          },
          { overwrite: true }
        );
      }
    };

    const validateRelationship = async (nodeId: string) => {
      const node = graph.getCellById(nodeId);
      if (!node || !node.isNode()) return;

      // Sub-agent gating: only validate if this agent owns the node's cluster.
      const nodeClusterId =
        (((node as any).getData?.() ?? {}) as any).clusterId || clusterByNodeIdRef.current[nodeId];
      if (nodeClusterId) {
        const owner = clusterAssignmentsRef.current[nodeClusterId];
        if (owner && owner !== agentIdRef.current) return;
      }

      // Validate all incident parent/child relationships involving this node.
      const incidentEdges = graph
        .getEdges()
        .filter((e) => e.getSourceCellId() === nodeId || e.getTargetCellId() === nodeId);

      const evidence_snippets = collectEvidenceSnippets();
      if (evidence_snippets.length === 0) return;

      const base = getBackendBase();

      for (const e of incidentEdges) {
        const srcId = e.getSourceCellId();
        const tgtId = e.getTargetCellId();
        if (!srcId || !tgtId) continue;

        const a = graph.getCellById(srcId);
        const b = graph.getCellById(tgtId);
        if (!a?.isNode() || !b?.isNode()) continue;

        const aData = ((a as any).getData?.() ?? {}) as any;
        const bData = ((b as any).getData?.() ?? {}) as any;
        const relationship =
          (e.getLabels?.()?.[0] as any)?.attrs?.label?.text?.toString?.() ||
          (e as any).getData?.()?.label ||
          "";

        try {
          const res = await fetch(`${base}/validate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nodeA: { id: srcId, label: aData.label, type: aData.type, metadata: aData.metadata ?? {} },
              nodeB: { id: tgtId, label: bData.label, type: bData.type, metadata: bData.metadata ?? {} },
              relationship,
              evidence_snippets
            })
          });
          if (!res.ok) continue;
          const json = (await res.json()) as {
            contradicts?: boolean;
            violation_summary?: string;
            inferred_consequences?: string;
            rationale?: string;
          };
          if (json?.contradicts) {
            const violation_summary = (json.violation_summary || json.rationale || "Contradicts evidence").trim();
            const inferred_consequences = (
              json.inferred_consequences ||
              "Treat dependent inferences and actions as uncertain until this link is reconciled with the sources."
            ).trim();
            setNodeConflict(nodeId, {
              violation_summary,
              inferred_consequences,
              rationale: json.rationale
            });
            propagateInstability(nodeId, { violation_summary, inferred_consequences });
            break;
          }
        } catch {
          // ignore transient validate errors
        }
      }
    };

    const scheduleValidate = (nodeId: string) => {
      const prev = debounceRef.current.get(nodeId);
      if (prev) window.clearTimeout(prev);
      const t = window.setTimeout(() => {
        validateRelationship(nodeId).catch(() => {});
      }, 450);
      debounceRef.current.set(nodeId, t);
    };

    graph.on("node:moved", ({ node }) => {
      scheduleValidate(node.id);
    });
    graph.on("node:change:data", ({ node }) => {
      if (reviewBadgeMuteValidationRef.current) return;
      scheduleValidate(node.id);
    });

    // Recovery gesture: double-click empty canvas to bring everything back into view.
    graph.on("blank:dblclick", () => {
      graph.centerContent();
    });

    graph.on("edge:click", ({ edge }) => {
      highlightForEdgeId(graph, edge.id);
      setSelectedEdgeId(edge.id);
    });
    graph.on("blank:click", () => {
      setSelectedEdgeId(null);
      clearConnectionHighlightOnGraph(graph);
      applySubtreeSelectionHighlight(graph, useUiStore.getState().selectedNode?.id ?? null);
    });
    graph.on("node:click", () => {
      setSelectedEdgeId(null);
      clearConnectionHighlightOnGraph(graph);
      applySubtreeSelectionHighlight(graph, useUiStore.getState().selectedNode?.id ?? null);
    });

    // Persist interactive creations back into Zustand.
    graph.on("node:added", ({ node }) => {
      if (hydratingRef.current) return;
      const d = (node.getData() ?? {}) as any;
      const isSandbox = Boolean((graph as any).prop?.("sandboxContext"));
      useUiStore.getState().addNode({
        id: node.id,
        type: normalizeMindmapNodeType((d.type ?? "inferred").toString()),
        label: (d.label ?? "").toString(),
        metadata: (d.metadata ?? {}) as any,
        status: isSandbox ? "draft" : "firm"
      });
    });

    graph.on("node:removed", ({ node }) => {
      if (hydratingRef.current) return;
      useUiStore.getState().removeNode(node.id);
    });

    graph.on("edge:connected", ({ edge }) => {
      if (hydratingRef.current) return;
      const tgtId = edge.getTargetCellId();
      if (tgtId) scheduleValidate(tgtId);
    });

    /** Single persistence path — `edge:connected` also emits `edge:added`; duplicate handlers doubled store edges. */
    graph.on("edge:added", ({ edge }) => {
      if (hydratingRef.current) return;
      const srcId = edge.getSourceCellId();
      const tgtId = edge.getTargetCellId();
      if (!srcId || !tgtId) return;
      const isSandbox = Boolean((graph as any).prop?.("sandboxContext"));
      const relationship =
        (edge.getLabels?.()?.[0] as any)?.attrs?.label?.text?.toString?.() ||
        (edge as any).getData?.()?.label ||
        "";
      useUiStore.getState().addEdge({
        source: srcId,
        target: tgtId,
        label: relationship,
        status: isSandbox ? "draft" : "firm"
      });
      if (tgtId) scheduleValidate(tgtId);
    });

    graph.on("edge:removed", ({ edge }) => {
      if (hydratingRef.current) return;
      const srcId = edge.getSourceCellId();
      const tgtId = edge.getTargetCellId();
      if (!srcId || !tgtId) return;
      const st = useUiStore.getState();
      const combined = combineGraphs(st.mainGraph, st.sandboxGraph);
      const hit = combined.edges.find((e) => e.source === srcId && e.target === tgtId);
      const fromCanvas =
        (edge.getLabels?.()?.[0] as { attrs?: { label?: { text?: string } } })?.attrs?.label?.text?.toString?.() ||
        (edge as { getData?: () => { label?: string } }).getData?.()?.label ||
        "";
      const label = hit?.label ?? fromCanvas;
      st.removeEdge(srcId, tgtId, label);
    });

    // Starter graph: root hub branches to evidence + inferred (evidence supports inferred).
    if (!props.mainGraph) {
      loadMindmap(graph, {
        nodes: [
          {
            id: "r1",
            type: "inferred",
            label: "Overview (root)",
            metadata: { is_root: true },
            status: "firm"
          },
          {
            id: "e1",
            type: "evidence",
            label: "Evidence node",
            metadata: {
              source_filename: "demo.xlsx",
              text_snippet: "Headers: ..."
            },
            status: "firm"
          },
          {
            id: "i1",
            type: "inferred",
            label: "Inferred node",
            metadata: { note: "Derived from evidence" },
            status: "draft"
          }
        ],
        edges: [
          { source: "r1", target: "e1", label: "includes", status: "firm" },
          { source: "r1", target: "i1", label: "includes", status: "firm" },
          { source: "e1", target: "i1", label: "supports", status: "draft" }
        ]
      });
    }

    let roRaf1 = 0;
    let roRaf2 = 0;
    const applySizeFromEl = () => {
      const g = graphRef.current;
      if (!g) return;
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (typeof (g as any).resize === "function") {
        (g as any).resize(w, h);
      }
    };

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(roRaf1);
      cancelAnimationFrame(roRaf2);
      roRaf1 = requestAnimationFrame(() => {
        roRaf2 = requestAnimationFrame(applySizeFromEl);
      });
    });

    ro.observe(el);

    return () => {
      graph.off("node:change:size", scheduleDagreFromNodeSize);
      if (dagreRelayoutTimerRef.current) {
        window.clearTimeout(dagreRelayoutTimerRef.current);
        dagreRelayoutTimerRef.current = null;
      }
      clearPendingLoadMindmapTimers(loadMindmapTimersRef);
      cancelAnimationFrame(roRaf1);
      cancelAnimationFrame(roRaf2);
      ro.disconnect();
      for (const [, t] of debounceRef.current.entries()) window.clearTimeout(t);
      debounceRef.current.clear();
      props.onGraphReady?.(null);
      graphRef.current?.dispose();
      graphRef.current = null;
    };
  }, []);

  useEffect(() => {
    applyReviewCommentBadgesToGraph(graphRef.current, reviewComments, {
      muteValidationRef: reviewBadgeMuteValidationRef
    });
  }, [reviewComments]);

  /**
   * When the right dock (or assistant visibility) changes, flex reflow is often a frame or two late.
   * If we `resize` with a stale width, X6 only paints the old bbox — the new strip looks like a dark void.
   * We re-measure with rAF + short timeouts and call `centerContent` when the right dock toggles.
   */
  useEffect(() => {
    const el = containerRef.current;
    const g = graphRef.current;
    if (!el || !g) return;

    const prev = lastDockLayoutKeyRef.current;
    const current = dockLayoutKey;
    lastDockLayoutKeyRef.current = current;
    const rightDockToggled = prev != null && prev.split("|")[0] !== current.split("|")[0];

    const apply = (alsoCenter: boolean) => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (typeof (g as any).resize === "function") {
        (g as any).resize(w, h);
      }
      if (alsoCenter && typeof (g as any).centerContent === "function") {
        try {
          (g as any).centerContent();
        } catch {
          /* ignore */
        }
      }
    };

    // First paint after state update (may still be old width)
    apply(rightDockToggled);
    let raf0 = 0;
    let raf1 = 0;
    let raf2 = 0;
    raf0 = requestAnimationFrame(() => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => apply(rightDockToggled));
      });
    });

    const t1 = window.setTimeout(() => apply(rightDockToggled), 50);
    const t2 = window.setTimeout(() => apply(rightDockToggled), 180);

    return () => {
      cancelAnimationFrame(raf0);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [dockLayoutKey]);

  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    applySubtreeSelectionHighlight(g, selectedNodeId);
  }, [selectedNodeId]);

  const canvasCenterOnNodeRequest = useUiStore((s) => s.canvasCenterOnNodeRequest);
  useEffect(() => {
    if (!canvasCenterOnNodeRequest) return;
    const g = graphRef.current as Graph & {
      centerCell?: (cell: unknown, opts?: { padding?: number }) => void;
      scrollToCell?: (cell: unknown) => void;
    };
    if (!g?.getCellById) return;
    const cell = g.getCellById(canvasCenterOnNodeRequest.nodeId);
    if (!cell?.isNode?.()) return;
    const center = () => {
      try {
        if (typeof g.centerCell === "function") {
          g.centerCell(cell, { padding: 32 });
        } else if (typeof g.scrollToCell === "function") {
          g.scrollToCell(cell);
        }
      } catch {
        /* ignore */
      }
    };
    center();
    const t = window.setTimeout(center, 80);
    const t2 = window.setTimeout(center, 260);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [canvasCenterOnNodeRequest?.nodeId, canvasCenterOnNodeRequest?.token]);

  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    /** Canvas chrome only — edge strokes/labels use `var(--mm-edge-*)` so they track `html.dark` without O(edges) work. */
    const bg = "var(--mm-canvas-bg)";
    try {
      (g as any).drawBackground?.({ color: bg });
    } catch {
      // ignore
    }
    try {
      (g as any).container?.style && ((g as any).container.style.background = bg);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    (g as any).prop?.("sandboxContext", sandboxMode);
  }, [sandboxMode]);

  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    try {
      if (canvasGridVisible) g.grid.show();
      else g.grid.hide();
    } catch {
      /* ignore */
    }
  }, [canvasGridVisible]);

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

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const combined = buildDisplayedMindmapJson(
      props.mainGraph,
      props.sandboxGraph,
      clusterByNodeIdRef.current,
      useUiStore.getState().collapsedSubtreeRootIds
    );
    if (!combined) return;
    loadMindmap(graph, combined);
    setSelectedEdgeId(null);
    applySubtreeSelectionHighlight(graph, useUiStore.getState().selectedNode?.id ?? null);
  }, [props.mainGraph, props.sandboxGraph, collapseReloadKey]);

  /** Patch cluster ids without full graph reload (main graph effect ignores cluster-only updates). */
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || hydratingRef.current) return;
    const sandboxIds = new Set(props.sandboxGraph.nodes.map((n) => n.id));
    for (const cell of graph.getNodes()) {
      if (!cell.isNode()) continue;
      const id = cell.id;
      const d = ((cell as any).getData?.() ?? {}) as Record<string, unknown>;
      const nextCluster = sandboxIds.has(id)
        ? String((d.clusterId as string) || "sandbox")
        : (props.clusterByNodeId[id] as string | undefined) ?? (d.clusterId as string | undefined);
      if (nextCluster != null && nextCluster !== d.clusterId) {
        (cell as any).setData?.({ ...d, clusterId: nextCluster }, { overwrite: true });
      }
    }
  }, [props.clusterByNodeId, props.sandboxGraph]);

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

