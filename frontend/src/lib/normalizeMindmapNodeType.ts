import type { MindmapJson } from "../types/mindmap";
import { dedupeMindmapGraph } from "./graphBranch";

/** Canonical graph node types: grounded quotes vs interpretations. */
export function normalizeMindmapNodeType(raw: string | undefined): "evidence" | "inferred" {
  const tl = (raw || "").toLowerCase();
  if (tl === "evidence") return "evidence";
  return "inferred";
}

export function normalizeMindmapJsonNodeTypes(graph: MindmapJson): MindmapJson {
  const deduped = dedupeMindmapGraph(graph);
  return {
    ...deduped,
    nodes: deduped.nodes.map((n) => ({
      ...n,
      type: normalizeMindmapNodeType(n.type)
    }))
  };
}
