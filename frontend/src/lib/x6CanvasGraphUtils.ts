import { Graph } from "@antv/x6";
import * as dagre from "dagre";

/** Dagre LR layout with generous gaps; call after node sizes are accurate to avoid overlap. */
export function applyDagreLayout(graph: Graph) {
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
}

/** Directed children map: parent id → child ids (one pass over edges). */
export function buildOutgoingChildrenBySource(graph: Graph): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of graph.getEdges()) {
    const s = edge.getSourceCellId();
    const t = edge.getTargetCellId();
    if (!s || !t) continue;
    const list = map.get(s);
    if (list) list.push(t);
    else map.set(s, [t]);
  }
  return map;
}

/** Dim everything except the selected node and its downstream subtree (parent→child edges). */
export function applySubtreeSelectionHighlight(graph: Graph, selectedNodeId: string | null) {
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

  const childrenBySource = buildOutgoingChildrenBySource(graph);
  const subtreeIds = new Set<string>([selectedNodeId]);
  const queue = [selectedNodeId];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++]!;
    for (const t of childrenBySource.get(cur) ?? []) {
      if (!subtreeIds.has(t)) {
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

export function cellSafeAddClass(cell: { addClass?: (c: string) => void } | null, cls: string) {
  try {
    cell?.addClass?.(cls);
  } catch {
    // ignore
  }
}

export function cellSafeRemoveClass(cell: { removeClass?: (c: string) => void } | null, cls: string) {
  try {
    cell?.removeClass?.(cls);
  } catch {
    // ignore
  }
}

/** Clear node/edge “connection” and subtree highlight classes (for edge-click vs node selection UI). */
export function clearConnectionHighlightOnGraph(graph: Graph) {
  for (const n of graph.getNodes()) {
    cellSafeRemoveClass(n, "mm-node-dim");
    cellSafeRemoveClass(n, "mm-node-selected");
    cellSafeRemoveClass(n, "mm-node-connected");
    cellSafeRemoveClass(n, "mm-node-subtree");
  }
  for (const e of graph.getEdges()) {
    cellSafeRemoveClass(e, "mm-edge-dim");
    cellSafeRemoveClass(e, "mm-edge-selected");
    cellSafeRemoveClass(e, "mm-edge-connected");
    cellSafeRemoveClass(e, "mm-edge-subtree");
  }
}

export function highlightForEdgeId(graph: Graph, edgeId: string) {
  const edge = graph.getCellById(edgeId);
  if (!edge || !edge.isEdge()) return;
  clearConnectionHighlightOnGraph(graph);
  for (const n of graph.getNodes()) cellSafeAddClass(n, "mm-node-dim");
  for (const e of graph.getEdges()) cellSafeAddClass(e, "mm-edge-dim");
  cellSafeRemoveClass(edge, "mm-edge-dim");
  cellSafeAddClass(edge, "mm-edge-selected");
  const src = (edge as { getSourceCellId?: () => string | null }).getSourceCellId?.();
  const tgt = (edge as { getTargetCellId?: () => string | null }).getTargetCellId?.();
  for (const id of [src, tgt]) {
    if (!id) continue;
    const n = graph.getCellById(id);
    if (n?.isNode?.()) {
      cellSafeRemoveClass(n, "mm-node-dim");
      cellSafeAddClass(n, "mm-node-connected");
    }
  }
}
