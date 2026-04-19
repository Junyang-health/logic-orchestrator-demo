import type { Graph } from "@antv/x6";
import type { ReviewComment } from "../types/review";

export type MuteValidationRef = { current: boolean };

/** Ephemeral X6 node.data field — not part of persisted mindmap JSON. */
export const REVIEW_COMMENT_COUNT_DATA_KEY = "reviewCommentCount" as const;

export function countReviewCommentsByNodeId(comments: readonly ReviewComment[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of comments) {
    if (!c.nodeId) continue;
    counts[c.nodeId] = (counts[c.nodeId] ?? 0) + 1;
  }
  return counts;
}

/**
 * Writes per-node comment counts into X6 `node.data` so react nodes re-render individually
 * without subscribing the whole graph to Zustand `reviewComments`.
 */
export function applyReviewCommentBadgesToGraph(
  graph: Graph | null | undefined,
  comments: readonly ReviewComment[],
  options?: {
    /** When set to true, graph `node:change:data` handlers can skip side effects (e.g. validate). */
    muteValidationRef?: MuteValidationRef;
  }
): void {
  if (!graph) return;
  const counts = countReviewCommentsByNodeId(comments);
  const mute = options?.muteValidationRef;
  if (mute) mute.current = true;
  try {
    for (const cell of graph.getNodes()) {
      if (!cell.isNode()) continue;
      const d = (cell.getData() ?? {}) as Record<string, unknown>;
      const next = counts[cell.id] ?? 0;
      const cur = typeof d[REVIEW_COMMENT_COUNT_DATA_KEY] === "number" ? d[REVIEW_COMMENT_COUNT_DATA_KEY] : 0;
      if (cur === next) continue;
      cell.setData({ ...d, [REVIEW_COMMENT_COUNT_DATA_KEY]: next }, { overwrite: true });
    }
  } finally {
    if (mute) mute.current = false;
  }
}
