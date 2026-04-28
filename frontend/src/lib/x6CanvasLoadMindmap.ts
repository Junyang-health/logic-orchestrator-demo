import type { MutableRefObject } from "react";
import { Graph } from "@antv/x6";
import type { MindmapJson } from "../types/mindmap";
import { dedupeMindmapGraph } from "./graphBranch";
import { normalizeMindmapNodeType } from "./normalizeMindmapNodeType";
import { applyReviewCommentBadgesToGraph } from "./syncReviewCommentBadges";
import useUiStore from "../store/useUiStore";
import { applyDagreLayout } from "./x6CanvasGraphUtils";

export type LoadMindmapIntoGraphCtx = {
  layoutEpochRef: MutableRefObject<number>;
  hydratingRef: MutableRefObject<boolean>;
  loadMindmapTimersRef: MutableRefObject<number[]>;
  reviewBadgeMuteValidationRef: MutableRefObject<boolean>;
};

function clearLoadMindmapTimers(loadMindmapTimersRef: MutableRefObject<number[]>) {
  for (const t of loadMindmapTimersRef.current) window.clearTimeout(t);
  loadMindmapTimersRef.current = [];
}

/** Cancel pending deferred layout timeouts from {@link loadMindmapIntoGraph}. */
export function clearPendingLoadMindmapTimers(loadMindmapTimersRef: MutableRefObject<number[]>) {
  clearLoadMindmapTimers(loadMindmapTimersRef);
}

/**
 * Rebuilds X6 cells from JSON; schedules deferred dagre passes after React node mounts measure.
 */
export function loadMindmapIntoGraph(
  graph: Graph,
  mindmap: MindmapJson,
  clusterByNodeId: Record<string, string>,
  ctx: LoadMindmapIntoGraphCtx
): void {
  const { layoutEpochRef, hydratingRef, loadMindmapTimersRef, reviewBadgeMuteValidationRef } = ctx;
  clearLoadMindmapTimers(loadMindmapTimersRef);
  const layoutEpoch = ++layoutEpochRef.current;
  hydratingRef.current = true;
  graph.clearCells();

  const mm = dedupeMindmapGraph(mindmap);
  const seenNodeIds = new Set<string>();
  for (const n of mm.nodes) {
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
        clusterId: n.clusterId ?? clusterByNodeId[n.id],
        violation_summary: (n as { violation_summary?: string }).violation_summary,
        inferred_consequences: (n as { inferred_consequences?: string }).inferred_consequences,
        upstream_conflict_summary: (n as { upstream_conflict_summary?: string }).upstream_conflict_summary
      }
    });
  }

  const seenEdgeKeys = new Set<string>();
  for (const e of mm.edges) {
    const ek = `${e.source}→${e.target}::${e.label ?? ""}`;
    if (seenEdgeKeys.has(ek)) continue;
    seenEdgeKeys.add(ek);
    const isDraft = (e.status ?? "firm") === "draft";
    const stroke = isDraft ? "var(--mm-edge-line-draft)" : "var(--mm-edge-line-firm)";
    const labelBlock = e.label
      ? [
          {
            attrs: {
              text: {
                text: e.label,
                fill: isDraft ? "var(--mm-edge-label-text-draft)" : "var(--mm-edge-label-text-firm)",
                fontSize: 11
              },
              rect: {
                fill: "var(--mm-edge-label-pill-fill)",
                stroke: "var(--mm-edge-label-pill-stroke)",
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

  applyReviewCommentBadgesToGraph(graph, useUiStore.getState().reviewComments, {
    muteValidationRef: reviewBadgeMuteValidationRef
  });

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
}
