import type { MindmapJson } from "../types/mindmap";

/**
 * Collapse duplicate node ids and duplicate edges (same source, target, label).
 * Last node wins per id; edges keep first occurrence per key (stable for API payloads).
 */
export function dedupeMindmapGraph(graph: MindmapJson): MindmapJson {
  const byId = new Map<string, MindmapJson["nodes"][number]>();
  for (const n of graph.nodes) {
    byId.set(n.id, n);
  }
  const edgeKey = new Set<string>();
  const edges: MindmapJson["edges"] = [];
  for (const e of graph.edges) {
    const k = `${e.source}→${e.target}::${e.label ?? ""}`;
    if (edgeKey.has(k)) continue;
    edgeKey.add(k);
    edges.push(e);
  }
  return { nodes: Array.from(byId.values()), edges };
}

/** Merge main + sandbox into one graph for branch extraction. */
export function combineGraphs(main: MindmapJson | null, sandbox: MindmapJson): MindmapJson {
  const nodeById = new Map<string, MindmapJson["nodes"][number]>();
  for (const n of main?.nodes ?? []) nodeById.set(n.id, n);
  for (const n of sandbox.nodes) nodeById.set(n.id, n);

  const edgeKey = new Set<string>();
  const edges: MindmapJson["edges"] = [];
  const pushEdge = (e: MindmapJson["edges"][number]) => {
    const k = `${e.source}→${e.target}::${e.label ?? ""}`;
    if (edgeKey.has(k)) return;
    edgeKey.add(k);
    edges.push(e);
  };
  for (const e of main?.edges ?? []) pushEdge(e);
  for (const e of sandbox.edges) pushEdge(e);

  return dedupeMindmapGraph({ nodes: Array.from(nodeById.values()), edges });
}

/** Subtree following directed edges source -> target (parent -> child). */
export function collectBranchSubgraph(rootId: string, graph: MindmapJson): MindmapJson {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  if (!nodeIds.has(rootId)) return { nodes: [], edges: [] };

  const inBranch = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of graph.edges) {
      if (e.source === cur && nodeIds.has(e.target) && !inBranch.has(e.target)) {
        inBranch.add(e.target);
        queue.push(e.target);
      }
    }
  }

  const nodes = graph.nodes.filter((n) => inBranch.has(n.id));
  const edges = graph.edges.filter((e) => inBranch.has(e.source) && inBranch.has(e.target));
  return { nodes, edges };
}

/** Union of several `collectBranchSubgraph` results (deduped nodes and edges). */
export function mergeBranchSubgraphs(rootIds: string[], graph: MindmapJson): MindmapJson {
  const nodeById = new Map<string, MindmapJson["nodes"][number]>();
  const edgeKey = new Set<string>();
  const edges: MindmapJson["edges"] = [];
  for (const rootId of rootIds) {
    const sub = collectBranchSubgraph(rootId, graph);
    for (const n of sub.nodes) nodeById.set(n.id, n);
    for (const e of sub.edges) {
      const k = `${e.source}→${e.target}::${e.label ?? ""}`;
      if (edgeKey.has(k)) continue;
      edgeKey.add(k);
      edges.push(e);
    }
  }
  return { nodes: Array.from(nodeById.values()), edges };
}
