import { combineGraphs } from "../../lib/graphBranch";
import { normalizeMindmapJsonNodeTypes, normalizeMindmapNodeType } from "../../lib/normalizeMindmapNodeType";
import type { MindmapEdge, MindmapJson, MindmapNode } from "../../types/mindmap";
import {
  computeAssignments,
  computeClusters,
  flushClusterDebounce,
  scheduleDebouncedClustersFromMain
} from "../uiStoreCluster";
import { nodeFingerprint, type UiStore, type UiStoreGet, type UiStoreSet } from "../uiStoreTypes";

export function buildGraphSlice(set: UiStoreSet, get: UiStoreGet): Pick<
  UiStore,
  | "mainGraph"
  | "sandboxGraph"
  | "sandboxMode"
  | "setSandboxMode"
  | "clearSandbox"
  | "mergeSandboxIntoMain"
  | "loadMainGraph"
  | "newMarkedNodeIds"
  | "addNode"
  | "addEdge"
  | "removeNode"
  | "removeEdge"
  | "agentId"
  | "setAgentId"
  | "clusterByNodeId"
  | "clusterAssignments"
  | "numAgents"
  | "setNumAgents"
> {
  return {
    mainGraph: null,
    sandboxGraph: { nodes: [], edges: [] },
    sandboxMode: false,
    setSandboxMode: (on) => set({ sandboxMode: on }),
    clearSandbox: () => set({ sandboxGraph: { nodes: [], edges: [] } }),
    mergeSandboxIntoMain: () => {
      flushClusterDebounce();
      const st = get();
      if (!st.mainGraph) {
        const promoted: MindmapJson = normalizeMindmapJsonNodeTypes({
          nodes: st.sandboxGraph.nodes.map((n) => ({ ...n, status: "firm" })),
          edges: st.sandboxGraph.edges.map((e) => ({ ...e, status: "firm" }))
        });
        const clusterByNodeId = computeClusters(promoted);
        const newMarkedNodeIds = Object.fromEntries(promoted.nodes.map((n) => [n.id, true]));
        set({
          mainGraph: promoted,
          sandboxGraph: { nodes: [], edges: [] },
          clusterByNodeId,
          clusterAssignments: computeAssignments(clusterByNodeId, st.numAgents),
          newMarkedNodeIds
        });
        return;
      }

      const main = st.mainGraph;
      const sandbox = st.sandboxGraph;
      const combined = combineGraphs(main, sandbox);
      const merged: MindmapJson = normalizeMindmapJsonNodeTypes({
        nodes: combined.nodes.map((n) => ({ ...n, status: "firm" as const })),
        edges: combined.edges.map((e) => ({ ...e, status: "firm" as const }))
      });
      const clusterByNodeId = computeClusters(merged);
      const sandboxIds = new Set(sandbox.nodes.map((n) => n.id));
      const newMarkedNodeIds: Record<string, boolean> = {};
      for (const n of merged.nodes) {
        if (sandboxIds.has(n.id)) {
          newMarkedNodeIds[n.id] = true;
          continue;
        }
        const prev = main.nodes.find((p) => p.id === n.id);
        if (!prev || nodeFingerprint(prev) !== nodeFingerprint(n)) {
          newMarkedNodeIds[n.id] = true;
        }
      }
      set({
        mainGraph: merged,
        sandboxGraph: { nodes: [], edges: [] },
        clusterByNodeId,
        clusterAssignments: computeAssignments(clusterByNodeId, st.numAgents),
        newMarkedNodeIds
      });
    },
    newMarkedNodeIds: {},
    loadMainGraph: (graph, opts) => {
      flushClusterDebounce();
      const st = get();
      const normalized: MindmapJson = normalizeMindmapJsonNodeTypes({
        nodes: graph.nodes.map((n) => ({ ...n, status: n.status ?? "firm" })),
        edges: graph.edges.map((e) => ({ ...e, status: e.status ?? "firm" }))
      });
      const clusterByNodeId = computeClusters(normalized);
      const mode = opts?.newMarks ?? "none";
      let newMarkedNodeIds: Record<string, boolean> = {};
      if (mode === "diff" && st.mainGraph && st.mainGraph.nodes.length > 0) {
        const prevFp = new Map(st.mainGraph.nodes.map((n) => [n.id, nodeFingerprint(n)]));
        for (const n of normalized.nodes) {
          const fp = nodeFingerprint(n);
          if (!prevFp.has(n.id) || prevFp.get(n.id) !== fp) {
            newMarkedNodeIds[n.id] = true;
          }
        }
      }
      set({
        mainGraph: normalized,
        clusterByNodeId,
        clusterAssignments: computeAssignments(clusterByNodeId, st.numAgents),
        newMarkedNodeIds
      });
    },
    addNode: (node) => {
      const st = get();
      const targetKey = st.sandboxMode ? "sandboxGraph" : "mainGraph";
      const status = st.sandboxMode ? ("draft" as const) : ("firm" as const);
      const normalized: MindmapNode = {
        ...node,
        type: normalizeMindmapNodeType(node.type),
        status: node.status ?? status
      };
      if (targetKey === "mainGraph") {
        const cur = st.mainGraph ?? { nodes: [], edges: [] };
        const idx = cur.nodes.findIndex((n) => n.id === node.id);
        const nodes =
          idx >= 0 ? cur.nodes.map((n, i) => (i === idx ? { ...n, ...normalized } : n)) : [...cur.nodes, normalized];
        const next = { ...cur, nodes };
        set({
          mainGraph: next,
          newMarkedNodeIds: { [normalized.id]: true }
        });
        scheduleDebouncedClustersFromMain(set, get);
      } else {
        const cur = st.sandboxGraph;
        const idx = cur.nodes.findIndex((n) => n.id === node.id);
        const nodes =
          idx >= 0 ? cur.nodes.map((n, i) => (i === idx ? { ...n, ...normalized } : n)) : [...cur.nodes, normalized];
        set({ sandboxGraph: { ...cur, nodes }, newMarkedNodeIds: { [normalized.id]: true } });
      }
    },
    addEdge: (edge) => {
      const st = get();
      const targetKey = st.sandboxMode ? "sandboxGraph" : "mainGraph";
      const status = st.sandboxMode ? ("draft" as const) : ("firm" as const);
      const key = `${edge.source}→${edge.target}::${edge.label ?? ""}`;

      if (targetKey === "mainGraph") {
        const cur = st.mainGraph ?? { nodes: [], edges: [] };
        const edges = cur.edges.some((e) => `${e.source}→${e.target}::${e.label ?? ""}` === key)
          ? cur.edges
          : [...cur.edges, { ...edge, status: edge.status ?? status }];
        const next = { ...cur, edges };
        set({
          mainGraph: next,
          newMarkedNodeIds: { [edge.source]: true, [edge.target]: true }
        });
        scheduleDebouncedClustersFromMain(set, get);
      } else {
        const cur = st.sandboxGraph;
        const edges = cur.edges.some((e) => `${e.source}→${e.target}::${e.label ?? ""}` === key)
          ? cur.edges
          : [...cur.edges, { ...edge, status: edge.status ?? status }];
        set({
          sandboxGraph: { ...cur, edges },
          newMarkedNodeIds: { [edge.source]: true, [edge.target]: true }
        });
      }
    },

    removeNode: (nodeId) => {
      const st = get();
      const targetKey = st.sandboxMode ? "sandboxGraph" : "mainGraph";
      if (targetKey === "mainGraph") {
        const cur = st.mainGraph ?? { nodes: [], edges: [] };
        const nodes = cur.nodes.filter((n) => n.id !== nodeId);
        const edges = cur.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
        const next = { ...cur, nodes, edges };
        set({
          mainGraph: next,
          newMarkedNodeIds: {}
        });
        scheduleDebouncedClustersFromMain(set, get);
      } else {
        const cur = st.sandboxGraph;
        set({
          sandboxGraph: {
            nodes: cur.nodes.filter((n) => n.id !== nodeId),
            edges: cur.edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
          },
          newMarkedNodeIds: {}
        });
      }
    },

    removeEdge: (source, target, label) => {
      const st = get();
      const targetKey = st.sandboxMode ? "sandboxGraph" : "mainGraph";
      const key = `${source}→${target}::${label ?? ""}`;
      const filterOutEdge = (edges: MindmapEdge[]) => {
        const next = edges.filter((e) => `${e.source}→${e.target}::${e.label ?? ""}` !== key);
        if (next.length < edges.length) return next;
        const idx = edges.findIndex((e) => e.source === source && e.target === target);
        if (idx >= 0) return edges.filter((_, i) => i !== idx);
        return edges;
      };
      if (targetKey === "mainGraph") {
        const cur = st.mainGraph ?? { nodes: [], edges: [] };
        const edges = filterOutEdge(cur.edges);
        if (edges.length === cur.edges.length) return;
        const next = { ...cur, edges };
        set({
          mainGraph: next,
          newMarkedNodeIds: { [source]: true, [target]: true }
        });
        scheduleDebouncedClustersFromMain(set, get);
      } else {
        const cur = st.sandboxGraph;
        const edges = filterOutEdge(cur.edges);
        if (edges.length === cur.edges.length) return;
        set({
          sandboxGraph: {
            ...cur,
            edges
          },
          newMarkedNodeIds: { [source]: true, [target]: true }
        });
      }
    },

    agentId: "agent-1",
    setAgentId: (agentId) => set({ agentId }),
    clusterByNodeId: {},
    clusterAssignments: {},
    numAgents: 3,
    setNumAgents: (n) => {
      flushClusterDebounce();
      const st = get();
      const numAgents = Math.max(1, Math.floor(n || 1));
      const main = st.mainGraph ?? { nodes: [], edges: [] };
      const clusterByNodeId = computeClusters(main);
      set({
        numAgents,
        clusterByNodeId,
        clusterAssignments: computeAssignments(clusterByNodeId, numAgents)
      });
    }
  };
}
