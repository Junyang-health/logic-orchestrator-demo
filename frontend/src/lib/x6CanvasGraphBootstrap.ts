import type { MutableRefObject } from "react";
import { Graph } from "@antv/x6";
import { Export } from "@antv/x6-plugin-export";
import type { MindmapJson } from "../types/mindmap";
import { combineGraphs } from "./graphBranch";
import { normalizeMindmapNodeType } from "./normalizeMindmapNodeType";
import { getBackendBase } from "./backendBase";
import { clearPendingLoadMindmapTimers } from "./x6CanvasLoadMindmap";
import {
  applyDagreLayout,
  applySubtreeSelectionHighlight,
  clearConnectionHighlightOnGraph,
  highlightForEdgeId
} from "./x6CanvasGraphUtils";
import { applyGraphEdgeTheme, applyGraphGridTheme } from "./x6EdgeTheme";
import useUiStore from "../store/useUiStore";

export type X6CanvasGraphBootstrapParams = {
  containerEl: HTMLElement;
  graphRef: MutableRefObject<Graph | null>;
  debounceRef: MutableRefObject<Map<string, number>>;
  hydratingRef: MutableRefObject<boolean>;
  layoutEpochRef: MutableRefObject<number>;
  dagreRelayoutTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  clusterByNodeIdRef: MutableRefObject<Record<string, string>>;
  clusterAssignmentsRef: MutableRefObject<Record<string, string>>;
  agentIdRef: MutableRefObject<string>;
  reviewBadgeMuteValidationRef: MutableRefObject<boolean>;
  loadMindmapTimersRef: MutableRefObject<number[]>;
  sandboxModeAtMount: boolean;
  mainGraphAtMount: MindmapJson | null;
  onGraphReady?: (graph: Graph | null) => void;
  loadMindmap: (graph: Graph, mindmap: MindmapJson) => void;
  setSelectedEdgeId: (id: string | null) => void;
};

/** One-time graph construction, validation/scheduling, store sync, and resize observer. */
export function mountX6CanvasGraph(p: X6CanvasGraphBootstrapParams): () => void {
  const el = p.containerEl;

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
      allowLoop: false,
      allowNode: false,
      highlight: true,
      snap: true,
      router: "normal",
      connector: { name: "smooth" },
      createEdge() {
        const isSandbox = Boolean((this as any).prop?.("sandboxContext"));
        return (this as any).createEdge({
          attrs: {
            line: {
              stroke: isSandbox ? "var(--mm-edge-line-draft)" : "var(--mm-edge-line-interactive-firm)",
              strokeWidth: 1.75,
              strokeDasharray: isSandbox ? "6 4" : ""
            }
          },
          data: { status: isSandbox ? "draft" : "firm" }
        });
      }
    }
  });

  p.graphRef.current = graph;
  graph.use(new Export());
  p.onGraphReady?.(graph);

  if (!useUiStore.getState().canvasGridVisible) {
    try {
      graph.grid.hide();
    } catch {
      /* ignore */
    }
  }

  (graph as any).prop?.("sandboxContext", p.sandboxModeAtMount);
  applyGraphTheme(graph);
  const chromeTheme = useUiStore.getState().theme === "dark" ? "dark" : "light";
  applyGraphGridTheme(graph, chromeTheme);
  applyGraphEdgeTheme(graph, chromeTheme);

  const scheduleDagreFromNodeSize = () => {
    const g = p.graphRef.current;
    if (!g) return;
    if (p.dagreRelayoutTimerRef.current) window.clearTimeout(p.dagreRelayoutTimerRef.current);
    p.dagreRelayoutTimerRef.current = window.setTimeout(() => {
      p.dagreRelayoutTimerRef.current = null;
      applyDagreLayout(g);
    }, 80);
  };
  graph.on("node:change:size", scheduleDagreFromNodeSize);

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

    const nodeClusterId =
      (((node as any).getData?.() ?? {}) as any).clusterId || p.clusterByNodeIdRef.current[nodeId];
    if (nodeClusterId) {
      const owner = p.clusterAssignmentsRef.current[nodeClusterId];
      if (owner && owner !== p.agentIdRef.current) return;
    }

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
    const prev = p.debounceRef.current.get(nodeId);
    if (prev) window.clearTimeout(prev);
    const t = window.setTimeout(() => {
      validateRelationship(nodeId).catch(() => {});
    }, 450);
    p.debounceRef.current.set(nodeId, t);
  };

  graph.on("node:moved", ({ node }) => {
    scheduleValidate(node.id);
  });
  graph.on("node:change:data", ({ node }) => {
    if (p.reviewBadgeMuteValidationRef.current) return;
    scheduleValidate(node.id);
  });

  graph.on("blank:dblclick", () => {
    graph.centerContent();
  });

  graph.on("edge:click", ({ edge }) => {
    highlightForEdgeId(graph, edge.id);
    p.setSelectedEdgeId(edge.id);
  });
  graph.on("blank:click", () => {
    p.setSelectedEdgeId(null);
    clearConnectionHighlightOnGraph(graph);
    applySubtreeSelectionHighlight(graph, useUiStore.getState().selectedNode?.id ?? null);
  });
  graph.on("node:click", () => {
    p.setSelectedEdgeId(null);
    clearConnectionHighlightOnGraph(graph);
    applySubtreeSelectionHighlight(graph, useUiStore.getState().selectedNode?.id ?? null);
  });

  graph.on("node:added", ({ node }) => {
    if (p.hydratingRef.current) return;
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
    if (p.hydratingRef.current) return;
    useUiStore.getState().removeNode(node.id);
  });

  graph.on("edge:connected", ({ edge }) => {
    if (p.hydratingRef.current) return;
    const tgtId = edge.getTargetCellId();
    if (tgtId) scheduleValidate(tgtId);
  });

  graph.on("edge:added", ({ edge }) => {
    if (p.hydratingRef.current) return;
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
    if (p.hydratingRef.current) return;
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

  if (!p.mainGraphAtMount) {
    p.loadMindmap(graph, {
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
    const g = p.graphRef.current;
    if (!g) return;
    const host = el.parentElement ?? el;
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (typeof (g as any).resize === "function") {
      (g as any).resize(w, h);
    }
  };

  const resizeHost = el.parentElement ?? el;

  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(roRaf1);
    cancelAnimationFrame(roRaf2);
    roRaf1 = requestAnimationFrame(() => {
      roRaf2 = requestAnimationFrame(applySizeFromEl);
    });
  });

  ro.observe(resizeHost);

  return () => {
    graph.off("node:change:size", scheduleDagreFromNodeSize);
    if (p.dagreRelayoutTimerRef.current) {
      window.clearTimeout(p.dagreRelayoutTimerRef.current);
      p.dagreRelayoutTimerRef.current = null;
    }
    clearPendingLoadMindmapTimers(p.loadMindmapTimersRef);
    cancelAnimationFrame(roRaf1);
    cancelAnimationFrame(roRaf2);
    ro.disconnect();
    for (const [, t] of p.debounceRef.current.entries()) window.clearTimeout(t);
    p.debounceRef.current.clear();
    p.onGraphReady?.(null);
    p.graphRef.current?.dispose();
    p.graphRef.current = null;
  };
}
