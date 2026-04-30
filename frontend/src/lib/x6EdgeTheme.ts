import type { Graph } from "@antv/x6";

export type X6ChromeTheme = "light" | "dark";

export function edgeLineAttrs(isDraft: boolean) {
  return {
    stroke: isDraft ? "var(--mm-edge-line-draft)" : "var(--mm-edge-line-firm)",
    strokeWidth: 1.75,
    strokeDasharray: isDraft ? "6 4" : ""
  };
}

/** Default routing: light = smooth organic curves; dark = manhattan / circuit-style. */
export function applyGraphEdgeTheme(graph: Graph, theme: X6ChromeTheme) {
  const isDark = theme === "dark";
  const router = isDark ? "manhattan" : "normal";
  const connector = isDark ? { name: "rounded" as const, args: { radius: 6 } } : { name: "smooth" as const };

  try {
    graph.setConnecting({
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
    } as Parameters<Graph["setConnecting"]>[0]);
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
        type: "doubleMesh",
        size: 20,
        visible: true,
        args: [
          { color: "rgba(148, 163, 184, 0.07)", thickness: 1, factor: 5 },
          { color: "rgba(2, 6, 23, 0.35)", thickness: 1, factor: 5 }
        ]
      } as Parameters<Graph["drawGrid"]>[0]);
    } else {
      graph.drawGrid({
        type: "dot",
        size: 20,
        visible: true,
        args: { color: "rgba(229, 231, 235, 0.65)", thickness: 1.1 }
      });
    }
  } catch {
    /* ignore */
  }
}
