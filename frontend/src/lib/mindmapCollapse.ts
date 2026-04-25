import type { MindmapEdge, MindmapJson } from "../types/mindmap";

/** Directed children: parent id → child node ids (one hop). */
export function buildOutgoingChildrenMap(edges: MindmapEdge[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of edges) {
    const s = e.source;
    const t = e.target;
    if (!s || !t) continue;
    const list = m.get(s);
    if (list) list.push(t);
    else m.set(s, [t]);
  }
  return m;
}

/** All descendants of `rootId` following source→target (excluding `rootId`). */
export function collectDescendantIds(rootId: string, edges: MindmapEdge[], allIds: Set<string>): Set<string> {
  const childrenBySource = buildOutgoingChildrenMap(edges);
  const hidden = new Set<string>();
  const queue = [...(childrenBySource.get(rootId) ?? [])];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++]!;
    if (!allIds.has(cur) || hidden.has(cur)) continue;
    hidden.add(cur);
    for (const ch of childrenBySource.get(cur) ?? []) {
      if (!hidden.has(ch)) queue.push(ch);
    }
  }
  return hidden;
}

/**
 * Node ids that should not be rendered: every node in a subtree folded under one of `collapsedRoots`
 * (the root itself stays visible).
 */
export function computeHiddenNodeIds(
  collapsedRoots: ReadonlySet<string>,
  edges: MindmapEdge[],
  allIds: Set<string>
): Set<string> {
  const hidden = new Set<string>();
  for (const root of collapsedRoots) {
    if (!allIds.has(root)) continue;
    for (const id of collectDescendantIds(root, edges, allIds)) hidden.add(id);
  }
  return hidden;
}

/** Number of descendants (for “+N hidden” badge). */
export function countDescendantNodes(rootId: string, edges: MindmapEdge[]): number {
  const allIds = new Set<string>([rootId]);
  for (const e of edges) {
    allIds.add(e.source);
    allIds.add(e.target);
  }
  return collectDescendantIds(rootId, edges, allIds).size;
}

/** Drop roots that no longer exist in the graph. */
export function pruneCollapsedRoots(roots: string[], allIds: Set<string>): string[] {
  return roots.filter((id) => allIds.has(id));
}

/**
 * Ids to collapse to show only "top-level" nodes: in-degree 0 in the full graph, with at least one
 * child. Collapsing each such root hides that branch (DAG paths may be hidden by an ancestor).
 */
export function getTopLevelCollapseRootIds(
  allIds: ReadonlySet<string>,
  edges: MindmapEdge[]
): string[] {
  const childrenBy = buildOutgoingChildrenMap(edges);
  const hasIncoming = new Set<string>();
  for (const e of edges) {
    if (e.target && allIds.has(e.target)) hasIncoming.add(e.target);
  }
  const out: string[] = [];
  for (const id of allIds) {
    if (hasIncoming.has(id)) continue;
    if ((childrenBy.get(id) ?? []).length > 0) out.push(id);
  }
  return out;
}
