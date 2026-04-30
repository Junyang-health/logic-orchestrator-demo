import type { MutableRefObject } from "react";
import { Graph } from "@antv/x6";
import type { MindmapJson } from "../types/mindmap";
import { dedupeMindmapGraph } from "./graphBranch";
import { normalizeMindmapNodeType } from "./normalizeMindmapNodeType";
import { applyReviewCommentBadgesToGraph } from "./syncReviewCommentBadges";
import useUiStore from "../store/useUiStore";
import { mmEdgeLabelBlock } from "./mmEdgeLabel";
import { applyDagreLayout } from "./x6CanvasGraphUtils";
import { applyGraphEdgeTheme } from "./x6EdgeTheme";

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
      height: 72,
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
    const labelBlock = e.label ? [mmEdgeLabelBlock(e.label, isDraft)] : undefined;
    graph.addEdge({
      source: { cell: e.source },
      target: { cell: e.target },
      labels: labelBlock,
      attrs: {
        line: {
          stroke,
          strokeWidth: 1.75,
          strokeDasharray: isDraft ? "6 4" : ""
        }
      }
    });
  }

  const chromeTheme = useUiStore.getState().theme === "dark" ? "dark" : "light";
  applyGraphEdgeTheme(graph, chromeTheme);

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
