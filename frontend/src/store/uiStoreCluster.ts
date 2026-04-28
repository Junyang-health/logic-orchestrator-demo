import type { MindmapJson } from "../types/mindmap";
import type { UiStore, UiStoreGet, UiStoreSet } from "./uiStoreTypes";

export function computeClusters(graph: MindmapJson): Record<string, string> {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const adj = new Map<string, Set<string>>();
  for (const id of nodeIds) adj.set(id, new Set());
  for (const e of graph.edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  const visited = new Set<string>();
  const clusterByNodeId: Record<string, string> = {};
  let clusterIdx = 0;

  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    const cid = `cluster-${clusterIdx++}`;
    const stack = [id];
    visited.add(id);
    while (stack.length) {
      const cur = stack.pop()!;
      clusterByNodeId[cur] = cid;
      for (const nb of adj.get(cur) ?? []) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        stack.push(nb);
      }
    }
  }
  return clusterByNodeId;
}

export function computeAssignments(clusterByNodeId: Record<string, string>, numAgents: number) {
  const clusterIds = Array.from(new Set(Object.values(clusterByNodeId))).sort();
  const assignments: Record<string, string> = {};
  const n = Math.max(1, Math.floor(numAgents || 1));
  for (let i = 0; i < clusterIds.length; i++) {
    assignments[clusterIds[i]] = `agent-${(i % n) + 1}`;
  }
  return assignments;
}

/** Debounce `computeClusters` on rapid main-graph edits (add/remove node/edge). */
const CLUSTER_DEBOUNCE_MS = 120;
let clusterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function flushClusterDebounce() {
  if (clusterDebounceTimer != null) {
    clearTimeout(clusterDebounceTimer);
    clusterDebounceTimer = null;
  }
}

export function applyClustersFromMainGraph(set: UiStoreSet, get: UiStoreGet) {
  const st = get();
  const main = st.mainGraph ?? { nodes: [], edges: [] };
  const clusterByNodeId = computeClusters(main);
  set({
    clusterByNodeId,
    clusterAssignments: computeAssignments(clusterByNodeId, st.numAgents)
  });
}

export function scheduleDebouncedClustersFromMain(set: UiStoreSet, get: UiStoreGet) {
  flushClusterDebounce();
  clusterDebounceTimer = window.setTimeout(() => {
    clusterDebounceTimer = null;
    applyClustersFromMainGraph(set, get);
  }, CLUSTER_DEBOUNCE_MS);
}
