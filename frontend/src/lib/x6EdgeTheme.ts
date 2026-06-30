import type { Graph } from "@antv/x6";

export type X6ChromeTheme = "light" | "dark";

export function edgeLineAttrs(isDraft: boolean) {
  return {
    stroke: isDraft ? "var(--mm-edge-line-draft)" : "var(--mm-edge-line-firm)",
    strokeWidth: 1.75,
    strokeDasharray: isDraft ? "6 4" : ""
  };
}

/** Default routing: smooth workflow curves in both day and night modes. */
export function applyGraphEdgeTheme(graph: Graph, theme: X6ChromeTheme) {
  const router = "normal";
  const connector = { name: "smooth" as const };

  try {
    (graph as any).setConnecting({
      router,
      connector,
      createEdge() {
        const isSandbox = Boolean((this as { prop?: (k: string) => unknown }).prop?.("sandboxContext"));
        return (this as { createEdge: (args: Record<string, unknown>) => unknown }).createEdge({
          router,
          connector,
          attrs: { line: edgeLineAttrs(isSandbox) },
          data: { status: isSandbox ? "draft" : "firm" }
        });
      }
    });
  } catch {
    /* ignore */
  }

  try {
    graph.getEdges().forEach((edge) => {
      edge.setRouter(router, {});
      edge.setConnector(connector.name, (connector as { args?: Record<string, number> }).args ?? {});
      const isDraft = (edge.getData()?.status ?? "firm") === "draft";
      edge.attr("line", edgeLineAttrs(isDraft));
    });
  } catch {
    /* ignore */
  }
}

export function applyGraphGridTheme(graph: Graph, theme: X6ChromeTheme) {
  const isDark = theme === "dark";
  try {
    if (isDark) {
      graph.drawGrid({
        type: "dot",
        size: 18,
        visible: true,
        args: { color: "rgba(96, 165, 250, 0.16)", thickness: 1.05 }
      } as Parameters<Graph["drawGrid"]>[0]);
    } else {
      graph.drawGrid({
        type: "dot",
        size: 18,
        visible: true,
        args: { color: "rgba(143, 170, 214, 0.52)", thickness: 1.05 }
      } as Parameters<Graph["drawGrid"]>[0]);
    }
  } catch {
    /* ignore */
  }
}
