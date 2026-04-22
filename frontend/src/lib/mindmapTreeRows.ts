import type { MindmapJson, MindmapNode } from "../types/mindmap";

export type MindmapTreeRow = { node: MindmapNode; depth: number };

function buildChildrenByParentNodes(graph: MindmapJson): Map<string, MindmapNode[]> {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const childrenBy = new Map<string, MindmapNode[]>();
  for (const e of graph.edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    const child = nodeById.get(e.target)!;
    const list = childrenBy.get(e.source);
    if (list) list.push(child);
    else childrenBy.set(e.source, [child]);
  }
  for (const [, list] of childrenBy) {
    list.sort((a, b) =>
      (a.label || "").localeCompare(b.label || "", undefined, { sensitivity: "base" })
    );
  }
  return childrenBy;
}

/** Parent id → child ids (source → target), label-sorted — same tree as `buildMindmapTreeRows`. */
export function buildOutgoingChildIdsByParent(graph: MindmapJson): Map<string, string[]> {
  const childrenBy = buildChildrenByParentNodes(graph);
  const out = new Map<string, string[]>();
  for (const [pid, list] of childrenBy) out.set(
    pid,
    list.map((c) => c.id)
  );
  return out;
}

/**
 * Rows in depth-first order following directed edges source → target (same as branch subtree direction).
 */
export function buildMindmapTreeRows(graph: MindmapJson): MindmapTreeRow[] {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const incomingCount = new Map<string, number>();
  for (const id of nodeIds) incomingCount.set(id, 0);
  for (const e of graph.edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1);
    }
  }

  const childrenBy = buildChildrenByParentNodes(graph);

  const roots = graph.nodes
    .filter((n) => (incomingCount.get(n.id) ?? 0) === 0)
    .sort((a, b) =>
      (a.label || "").localeCompare(b.label || "", undefined, { sensitivity: "base" })
    );

  const rows: MindmapTreeRow[] = [];
  const visited = new Set<string>();

  const dfs = (id: string, depth: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    const n = nodeById.get(id);
    if (!n) return;
    rows.push({ node: n, depth });
    for (const c of childrenBy.get(id) ?? []) dfs(c.id, depth + 1);
  };

  for (const r of roots) dfs(r.id, 0);
  for (const n of graph.nodes) {
    if (!visited.has(n.id)) dfs(n.id, 0);
  }

  return rows;
}

function nodeMatchesQuery(n: MindmapNode, q: string): boolean {
  const ql = q.trim().toLowerCase();
  if (!ql) return true;
  return (
    (n.label || "").toLowerCase().includes(ql) ||
    n.id.toLowerCase().includes(ql) ||
    (n.type || "").toLowerCase().includes(ql)
  );
}

/** When filtering: show nodes that match or are ancestors of a match (so levels stay coherent). */
export function visibleNodeIdsForTreeFilter(graph: MindmapJson, query: string): Set<string> | null {
  const ql = query.trim().toLowerCase();
  if (!ql) return null;

  const direct = new Set<string>();
  for (const n of graph.nodes) {
    if (nodeMatchesQuery(n, ql)) direct.add(n.id);
  }

  const visible = new Set<string>(direct);
  const stack = [...direct];
  while (stack.length) {
    const id = stack.pop()!;
    for (const e of graph.edges) {
      if (e.target === id && nodeIdsHas(graph, e.source) && !visible.has(e.source)) {
        visible.add(e.source);
        stack.push(e.source);
      }
    }
  }
  return visible;
}

function nodeIdsHas(graph: MindmapJson, id: string): boolean {
  return graph.nodes.some((n) => n.id === id);
}
