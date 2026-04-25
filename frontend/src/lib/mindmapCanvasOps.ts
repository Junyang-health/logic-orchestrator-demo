import type { Graph } from "@antv/x6";
import useUiStore from "../store/useUiStore";

type AddChildOptions = {
  typeRaw: string;
  label: string;
  edgeLabel: string;
};

/**
 * Add a new child under `parentId` in the live X6 graph. Persists to Zustand via graph listeners.
 */
export function addChildToParent(graph: Graph, parentId: string, opts: AddChildOptions) {
  const parent = graph.getCellById(parentId);
  if (!parent || !parent.isNode()) return;

  const id = `n_${Math.random().toString(16).slice(2, 10)}`;
  const isSandbox = Boolean((graph as { prop?: (k: string) => unknown }).prop?.("sandboxContext"));
  const status = isSandbox ? "draft" : "firm";
  const label = (opts.label || "").trim().slice(0, 120);
  const raw = (opts.typeRaw || "inferred").toLowerCase();
  const type = raw === "evidence" ? "evidence" : "inferred";
  const edgeLabel = opts.edgeLabel.trim();

  const p = ((parent as { position?: () => { x: number; y: number } }).position?.() as { x: number; y: number }) || {
    x: 0,
    y: 0
  };

  const node = graph.addNode({
    id,
    shape: "mindmap-react-node",
    width: 280,
    height: 96,
    x: p.x + 260,
    y: p.y,
    data: { id, type, label, metadata: {}, status }
  });

  graph.addEdge({
    source: parentId,
    target: node.id,
    labels: edgeLabel
      ? [
          {
            attrs: { label: { text: edgeLabel, fill: isSandbox ? "#64748b" : "#0f172a", fontSize: 11 } }
          }
        ]
      : undefined,
    attrs: {
      line: {
        stroke: isSandbox ? "#94a3b8" : "#0f172a",
        strokeWidth: 1.5,
        strokeDasharray: isSandbox ? "6 4" : ""
      }
    },
    data: { status, label: edgeLabel }
  });
}

/**
 * Reparent: remove all incoming edges to `childId`, add edge newParent -> child. Persists via listeners.
 */
export function reparentNodeOnGraph(graph: Graph, childId: string, newParentId: string, relationship: string) {
  if (childId === newParentId) return;
  const child = graph.getCellById(childId);
  const parent = graph.getCellById(newParentId);
  if (!child || !child.isNode() || !parent || !parent.isNode()) return;

  const incoming = graph
    .getEdges()
    .filter((e) => e.getTargetCellId() === childId)
    .slice();
  for (const e of incoming) {
    graph.removeEdge(e);
  }

  const isSandbox = Boolean((graph as { prop?: (k: string) => unknown }).prop?.("sandboxContext"));
  const status = isSandbox ? "draft" : "firm";
  const rel = (relationship || "supports").trim() || "supports";

  graph.addEdge({
    source: newParentId,
    target: childId,
    labels: [
      {
        attrs: { label: { text: rel, fill: isSandbox ? "#64748b" : "#0f172a", fontSize: 11 } }
      }
    ],
    attrs: {
      line: {
        stroke: isSandbox ? "#94a3b8" : "#0f172a",
        strokeWidth: 1.5,
        strokeDasharray: isSandbox ? "6 4" : ""
      }
    },
    data: { status, label: rel }
  });
}

/**
 * Remove a node from the live graph. Clears review focus and selection in the store.
 */
export function removeNodeFromGraph(graph: Graph, nodeId: string) {
  const cell = graph.getCellById(nodeId);
  if (!cell || !cell.isNode()) return;
  graph.removeCell(cell);
  useUiStore.getState().setReviewFocusNodeId(null);
  useUiStore.getState().setSelectedNode(null);
}
