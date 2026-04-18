import { useEffect, useMemo, useRef } from "react";
import { Graph } from "@antv/x6";
import { register } from "@antv/x6-react-shape";
import * as dagre from "dagre";

// X6 ships default CSS separately.
import "@antv/x6/dist/index.css";
import MindmapReactNode from "./MindmapReactNode";
import type { MindmapJson } from "../types/mindmap";
import { combineGraphs } from "../lib/graphBranch";
import { normalizeMindmapNodeType } from "../lib/normalizeMindmapNodeType";
import useUiStore from "../store/useUiStore";

/** Dagre LR layout with generous gaps; call after node sizes are accurate to avoid overlap. */
function applyDagreLayout(graph: Graph) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: 72,
    ranksep: 140,
    edgesep: 40,
    marginx: 56,
    marginy: 56,
    ranker: "network-simplex",
    align: "UL"
  });
  g.setDefaultEdgeLabel(() => ({}));

  const nodes = graph.getNodes();
  const edges = graph.getEdges();

  for (const n of nodes) {
    const size = n.getSize();
    g.setNode(n.id, { width: size.width, height: size.height });
  }

  for (const e of edges) {
    const src = e.getSourceCellId();
    const tgt = e.getTargetCellId();
    if (src && tgt) g.setEdge(src, tgt);
  }

  dagre.layout(g);

  for (const n of nodes) {
    const p = g.node(n.id);
    if (!p) continue;
    n.position(p.x - n.getSize().width / 2, p.y - n.getSize().height / 2);
  }

  graph.centerContent();
}

/** Dim everything except the selected node and its downstream subtree (parent→child edges). */
function applySubtreeSelectionHighlight(graph: Graph, selectedNodeId: string | null) {
  const rm = (cell: any, cls: string) => {
    try {
      cell?.removeClass?.(cls);
    } catch {
      /* ignore */
    }
  };
  const add = (cell: any, cls: string) => {
    try {
      cell?.addClass?.(cls);
    } catch {
      /* ignore */
    }
  };

  for (const n of graph.getNodes()) {
    rm(n, "mm-node-selected");
    rm(n, "mm-node-connected");
    rm(n, "mm-node-subtree");
    rm(n, "mm-node-dim");
  }
  for (const e of graph.getEdges()) {
    rm(e, "mm-edge-selected");
    rm(e, "mm-edge-connected");
    rm(e, "mm-edge-subtree");
    rm(e, "mm-edge-dim");
  }

  if (!selectedNodeId) return;
  const node = graph.getCellById(selectedNodeId);
  if (!node || !node.isNode()) return;

  const subtreeIds = new Set<string>([selectedNodeId]);
  const queue = [selectedNodeId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const edge of graph.getEdges()) {
      const s = edge.getSourceCellId();
      const t = edge.getTargetCellId();
      if (s === cur && t && !subtreeIds.has(t)) {
        subtreeIds.add(t);
        queue.push(t);
      }
    }
  }

  for (const n of graph.getNodes()) add(n, "mm-node-dim");
  for (const e of graph.getEdges()) add(e, "mm-edge-dim");

  for (const id of subtreeIds) {
    const n = graph.getCellById(id);
    if (!n || !n.isNode()) continue;
    rm(n, "mm-node-dim");
    if (id === selectedNodeId) add(n, "mm-node-selected");
    else add(n, "mm-node-subtree");
  }

  for (const edge of graph.getEdges()) {
    const s = edge.getSourceCellId();
    const t = edge.getTargetCellId();
    if (s && t && subtreeIds.has(s) && subtreeIds.has(t)) {
      rm(edge, "mm-edge-dim");
      add(edge, "mm-edge-subtree");
    }
  }
}

export default function X6Canvas(props: {
  mainGraph: MindmapJson | null;
  sandboxGraph: MindmapJson;
  agentId: string;
  clusterByNodeId: Record<string, string>;
  clusterAssignments: Record<string, string>;
  onGraphReady?: (graph: Graph | null) => void;
  /** When side docks open/close or assistant width changes, graph must resize (flex reflow is not always observed reliably). */
  dockLayoutKey?: string;
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
  const loadMindmapTimersRef = useRef<number[]>([]);
  const clearLoadMindmapTimers = () => {
    for (const t of loadMindmapTimersRef.current) window.clearTimeout(t);
    loadMindmapTimersRef.current = [];
  };
  const sandboxMode = useUiStore((s) => s.sandboxMode);
  const selectedNodeId = useUiStore((s) => s.selectedNode?.id ?? null);
  const theme = useUiStore((s) => s.theme);

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
    clearLoadMindmapTimers();
    const layoutEpoch = ++layoutEpochRef.current;
    hydratingRef.current = true;
    graph.clearCells();

    const seenNodeIds = new Set<string>();
    for (const n of mindmap.nodes) {
      if (seenNodeIds.has(n.id)) continue;
      seenNodeIds.add(n.id);
      graph.addNode({
        id: n.id,
        shape: "mindmap-react-node",
        width: 280,
        height: 96,
        data: {
          id: n.id,
          type: normalizeMindmapNodeType(n.type),
          label: n.label,
          metadata: n.metadata ?? {},
          status: n.status ?? "firm",
          clusterId: n.clusterId ?? clusterByNodeIdRef.current[n.id],
          violation_summary: (n as { violation_summary?: string }).violation_summary,
          inferred_consequences: (n as { inferred_consequences?: string }).inferred_consequences,
          upstream_conflict_summary: (n as { upstream_conflict_summary?: string }).upstream_conflict_summary
        }
      });
    }

    const seenEdgeKeys = new Set<string>();
    for (const e of mindmap.edges) {
      const ek = `${e.source}→${e.target}::${e.label ?? ""}`;
      if (seenEdgeKeys.has(ek)) continue;
      seenEdgeKeys.add(ek);
      const isDraft = (e.status ?? "firm") === "draft";
      const isDark = theme === "dark";
      const stroke = isDraft ? (isDark ? "#64748b" : "#94a3b8") : isDark ? "#e2e8f0" : "#0f172a";
      const labelBlock = e.label
        ? [
            {
              attrs: {
                text: {
                  text: e.label,
                  fill: isDark ? "#f8fafc" : isDraft ? "#64748b" : "#0f172a",
                  fontSize: 11
                },
                rect: {
                  fill: isDark ? "#334155" : "#ffffff",
                  stroke: isDark ? "#64748b" : "#e2e8f0",
                  strokeWidth: 1
                }
              }
            }
          ]
        : undefined;
      graph.addEdge({
        source: { cell: e.source },
        target: { cell: e.target },
        labels: labelBlock,
        attrs: {
          line: {
            stroke,
            strokeWidth: 1.5,
            strokeDasharray: isDraft ? "6 4" : ""
          }
        }
      });
    }

    const relayoutIfCurrent = () => {
      if (layoutEpoch !== layoutEpochRef.current) return;
      applyDagreLayout(graph);
    };

    applyDagreLayout(graph);
    loadMindmapTimersRef.current.push(
      window.setTimeout(() => {
        hydratingRef.current = false;
        relayoutIfCurrent();
      }, 0)
    );
    loadMindmapTimersRef.current.push(window.setTimeout(relayoutIfCurrent, 100));
    loadMindmapTimersRef.current.push(window.setTimeout(relayoutIfCurrent, 280));
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Ensure registration happened.
    void reactShapeRegistered;

    const applyGraphTheme = (g: Graph, theme: "light" | "dark") => {
      const bg = theme === "dark" ? "#0b1220" : "#f8fafc";
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
        color: theme === "dark" ? "#0b1220" : "#f8fafc"
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
          const uiTheme = ((this as any).prop?.("uiTheme") as "light" | "dark" | undefined) || "light";
          return (this as any).createEdge({
            attrs: {
              line: {
                stroke: isSandbox
                  ? uiTheme === "dark"
                    ? "#64748b"
                    : "#94a3b8"
                  : uiTheme === "dark"
                    ? "#93c5fd"
                    : "#2563eb",
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
    props.onGraphReady?.(graph);

    // Bridge sandbox mode into graph context for X6 internals.
    (graph as any).prop?.("sandboxContext", sandboxMode);
    (graph as any).prop?.("uiTheme", theme);
    applyGraphTheme(graph, theme);

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
      scheduleValidate(node.id);
    });

    // Recovery gesture: double-click empty canvas to bring everything back into view.
    graph.on("blank:dblclick", () => {
      graph.centerContent();
    });

    const safeAddClass = (cell: any, cls: string) => {
      try {
        cell?.addClass?.(cls);
      } catch {
        // ignore
      }
    };
    const safeRemoveClass = (cell: any, cls: string) => {
      try {
        cell?.removeClass?.(cls);
      } catch {
        // ignore
      }
    };

    const clearConnectionHighlight = () => {
      for (const n of graph.getNodes()) {
        safeRemoveClass(n, "mm-node-dim");
        safeRemoveClass(n, "mm-node-selected");
        safeRemoveClass(n, "mm-node-connected");
        safeRemoveClass(n, "mm-node-subtree");
      }
      for (const e of graph.getEdges()) {
        safeRemoveClass(e, "mm-edge-dim");
        safeRemoveClass(e, "mm-edge-selected");
        safeRemoveClass(e, "mm-edge-connected");
        safeRemoveClass(e, "mm-edge-subtree");
      }
    };

    const highlightForEdge = (edgeId: string) => {
      const edge = graph.getCellById(edgeId);
      if (!edge || !edge.isEdge()) return;
      clearConnectionHighlight();
      for (const n of graph.getNodes()) safeAddClass(n, "mm-node-dim");
      for (const e of graph.getEdges()) safeAddClass(e, "mm-edge-dim");
      safeRemoveClass(edge, "mm-edge-dim");
      safeAddClass(edge, "mm-edge-selected");
      const src = (edge as any).getSourceCellId?.();
      const tgt = (edge as any).getTargetCellId?.();
      for (const id of [src, tgt]) {
        if (!id) continue;
        const n = graph.getCellById(id);
        if (n?.isNode?.()) {
          safeRemoveClass(n, "mm-node-dim");
          safeAddClass(n, "mm-node-connected");
        }
      }
    };

    graph.on("edge:click", ({ edge }) => {
      highlightForEdge(edge.id);
    });
    graph.on("blank:click", () => {
      clearConnectionHighlight();
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
      const relationship =
        (edge.getLabels?.()?.[0] as any)?.attrs?.label?.text?.toString?.() ||
        (edge as any).getData?.()?.label ||
        "";
      useUiStore.getState().removeEdge(srcId, tgtId, relationship);
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
      clearLoadMindmapTimers();
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
    if (props.dockLayoutKey === undefined) return;
    const el = containerRef.current;
    const g = graphRef.current;
    if (!el || !g) return;
    let t1 = 0;
    let t2 = 0;
    const run = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (typeof (g as any).resize === "function") {
        (g as any).resize(w, h);
      }
    };
    t1 = requestAnimationFrame(() => {
      t2 = requestAnimationFrame(run);
    });
    return () => {
      cancelAnimationFrame(t1);
      cancelAnimationFrame(t2);
    };
  }, [props.dockLayoutKey]);

  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    applySubtreeSelectionHighlight(g, selectedNodeId);
  }, [selectedNodeId]);

  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    (g as any).prop?.("uiTheme", theme);
    const bg = theme === "dark" ? "#0b1220" : "#f8fafc";
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
    // Restyle existing edges + label pills for theme.
    const isDark = theme === "dark";
    for (const e of g.getEdges()) {
      const d = ((e as any).getData?.() ?? {}) as any;
      const status = (d.status ?? "firm") as string;
      const isDraft = status === "draft";
      const stroke = isDraft ? (isDark ? "#64748b" : "#94a3b8") : isDark ? "#e2e8f0" : "#0f172a";
      try {
        e.attr("line/stroke", stroke);
      } catch {
        // ignore
      }
      try {
        const labels = (e as any).getLabels?.() || [];
        if (labels?.length) {
          (e as any).setLabels?.(
            labels.map((lab: any) => {
              const a = lab?.attrs ?? {};
              const textStr = String(a.text?.text ?? a.label?.text ?? "").trim();
              return {
                ...lab,
                attrs: {
                  text: {
                    ...(a.text ?? {}),
                    text: textStr,
                    fill: isDark ? "#f8fafc" : isDraft ? "#64748b" : "#0f172a",
                    fontSize: a.text?.fontSize ?? a.label?.fontSize ?? 11
                  },
                  rect: {
                    ...(a.rect ?? {}),
                    fill: isDark ? "#334155" : "#ffffff",
                    stroke: isDark ? "#64748b" : "#e2e8f0",
                    strokeWidth: 1
                  }
                }
              };
            })
          );
        }
      } catch {
        // ignore
      }
    }
  }, [theme]);

  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    (g as any).prop?.("sandboxContext", sandboxMode);
  }, [sandboxMode]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const main = props.mainGraph;
    const sandbox = props.sandboxGraph;
    if (!main && (!sandbox || (sandbox.nodes.length === 0 && sandbox.edges.length === 0))) return;

    /** Must match combineGraphs(main, sandbox): same id cannot appear twice or X6 stacks duplicate cells. */
    const merged = combineGraphs(main, sandbox);
    const sandboxIds = new Set(sandbox.nodes.map((n) => n.id));
    const sandboxEdgeKeys = new Set(
      sandbox.edges.map((e) => `${e.source}→${e.target}::${e.label ?? ""}`)
    );
    const cMap = clusterByNodeIdRef.current;
    const combined: MindmapJson = {
      nodes: merged.nodes.map((n) => ({
        ...n,
        status: (sandboxIds.has(n.id) ? "draft" : (n.status ?? "firm")) as MindmapJson["nodes"][number]["status"],
        clusterId: sandboxIds.has(n.id) ? (n.clusterId ?? "sandbox") : cMap[n.id]
      })),
      edges: merged.edges.map((e) => {
        const k = `${e.source}→${e.target}::${e.label ?? ""}`;
        return {
          ...e,
          status: (sandboxEdgeKeys.has(k) ? "draft" : (e.status ?? "firm")) as MindmapJson["edges"][number]["status"]
        };
      })
    };
    loadMindmap(graph, combined);
    applySubtreeSelectionHighlight(graph, useUiStore.getState().selectedNode?.id ?? null);
  }, [props.mainGraph, props.sandboxGraph]);

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

  return <div ref={containerRef} className="h-full w-full" />;
}

