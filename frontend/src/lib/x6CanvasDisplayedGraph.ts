import { combineGraphs } from "./graphBranch";
import { computeHiddenNodeIds, pruneCollapsedRoots } from "./mindmapCollapse";
import type { MindmapJson } from "../types/mindmap";

/**
 * Merged main + sandbox graph with collapse pruning and cluster/sandbox status flags for canvas display.
 */
export function buildDisplayedMindmapJson(
  main: MindmapJson | null,
  sandbox: MindmapJson,
  clusterByNodeId: Record<string, string>,
  collapsedSubtreeRootIds: string[]
): MindmapJson | null {
  if (!main && (!sandbox || (sandbox.nodes.length === 0 && sandbox.edges.length === 0))) return null;

  const merged = combineGraphs(main, sandbox);
  const allIds = new Set(merged.nodes.map((n) => n.id));
  const roots = pruneCollapsedRoots(collapsedSubtreeRootIds, allIds);
  const hidden = computeHiddenNodeIds(new Set(roots), merged.edges, allIds);
  const sandboxIds = new Set(sandbox.nodes.map((n) => n.id));
  const sandboxEdgeKeys = new Set(sandbox.edges.map((e) => `${e.source}→${e.target}::${e.label ?? ""}`));

  return {
    nodes: merged.nodes
      .filter((n) => !hidden.has(n.id))
      .map((n) => ({
        ...n,
        status: (sandboxIds.has(n.id) ? "draft" : (n.status ?? "firm")) as MindmapJson["nodes"][number]["status"],
        clusterId: sandboxIds.has(n.id) ? (n.clusterId ?? "sandbox") : clusterByNodeId[n.id]
      })),
    edges: merged.edges
      .filter((e) => !hidden.has(e.source) && !hidden.has(e.target))
      .map((e) => {
        const k = `${e.source}→${e.target}::${e.label ?? ""}`;
        return {
          ...e,
          status: (sandboxEdgeKeys.has(k) ? "draft" : (e.status ?? "firm")) as MindmapJson["edges"][number]["status"]
        };
      })
  };
}
