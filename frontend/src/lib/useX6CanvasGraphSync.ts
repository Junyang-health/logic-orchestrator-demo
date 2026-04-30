import { useEffect, type MutableRefObject } from "react";
import type { Graph } from "@antv/x6";
import type { MindmapJson } from "../types/mindmap";
import type { ReviewComment } from "../types/review";
import { buildDisplayedMindmapJson } from "./x6CanvasDisplayedGraph";
import { applyReviewCommentBadgesToGraph } from "./syncReviewCommentBadges";
import { applySubtreeSelectionHighlight } from "./x6CanvasGraphUtils";
import { applyGraphEdgeTheme, applyGraphGridTheme } from "./x6EdgeTheme";
import useUiStore from "../store/useUiStore";

export type CanvasCenterRequest = { nodeId: string; token?: number } | null | undefined;

export type UseX6CanvasGraphSyncParams = {
  graphRef: MutableRefObject<Graph | null>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  lastDockLayoutKeyRef: MutableRefObject<string | null>;
  dockLayoutKey: string;
  reviewComments: readonly ReviewComment[];
  reviewBadgeMuteValidationRef: MutableRefObject<boolean>;
  selectedNodeId: string | null;
  canvasCenterOnNodeRequest: CanvasCenterRequest;
  theme: string;
  sandboxMode: boolean;
  canvasGridVisible: boolean;
  mainGraph: MindmapJson | null;
  sandboxGraph: MindmapJson;
  clusterByNodeId: Record<string, string>;
  clusterByNodeIdRef: MutableRefObject<Record<string, string>>;
  collapseReloadKey: string;
  hydratingRef: MutableRefObject<boolean>;
  loadMindmap: (graph: Graph, mindmap: MindmapJson) => void;
  setSelectedEdgeId: (id: string | null) => void;
};

/**
 * Reconcile Zustand / props changes onto the live X6 graph (post-mount):
 * badges, dock resize, selection chrome, center requests, theme/grid/sandbox, mindmap reload, cluster patch.
 */
export function useX6CanvasGraphSync(p: UseX6CanvasGraphSyncParams) {
  useEffect(() => {
    applyReviewCommentBadgesToGraph(p.graphRef.current, p.reviewComments, {
      muteValidationRef: p.reviewBadgeMuteValidationRef
    });
  }, [p.reviewComments, p.reviewBadgeMuteValidationRef]);

  useEffect(() => {
    const el = p.containerRef.current;
    const g = p.graphRef.current;
    if (!el || !g) return;

    const prev = p.lastDockLayoutKeyRef.current;
    const current = p.dockLayoutKey;
    p.lastDockLayoutKeyRef.current = current;
    const rightDockToggled = prev != null && prev.split("|")[0] !== current.split("|")[0];

    const apply = (alsoCenter: boolean) => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (typeof (g as any).resize === "function") {
        (g as any).resize(w, h);
      }
      if (alsoCenter && typeof (g as any).centerContent === "function") {
        try {
          (g as any).centerContent();
        } catch {
          /* ignore */
        }
      }
    };

    apply(rightDockToggled);
    let raf0 = 0;
    let raf1 = 0;
    let raf2 = 0;
    raf0 = requestAnimationFrame(() => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => apply(rightDockToggled));
      });
    });

    const t1 = window.setTimeout(() => apply(rightDockToggled), 50);
    const t2 = window.setTimeout(() => apply(rightDockToggled), 180);

    return () => {
      cancelAnimationFrame(raf0);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [p.dockLayoutKey]);

  useEffect(() => {
    const g = p.graphRef.current;
    if (!g) return;
    applySubtreeSelectionHighlight(g, p.selectedNodeId);
  }, [p.selectedNodeId]);

  useEffect(() => {
    if (!p.canvasCenterOnNodeRequest) return;
    const g = p.graphRef.current as Graph & {
      centerCell?: (cell: unknown, opts?: { padding?: number }) => void;
      scrollToCell?: (cell: unknown) => void;
    };
    if (!g?.getCellById) return;
    const cell = g.getCellById(p.canvasCenterOnNodeRequest.nodeId);
    if (!cell?.isNode?.()) return;
    const center = () => {
      try {
        if (typeof g.centerCell === "function") {
          g.centerCell(cell, { padding: 32 });
        } else if (typeof g.scrollToCell === "function") {
          g.scrollToCell(cell);
        }
      } catch {
        /* ignore */
      }
    };
    center();
    const t = window.setTimeout(center, 80);
    const t2 = window.setTimeout(center, 260);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [p.canvasCenterOnNodeRequest?.nodeId, p.canvasCenterOnNodeRequest?.token]);

  useEffect(() => {
    const g = p.graphRef.current;
    if (!g) return;
    const bg = "var(--mm-canvas-bg)";
    try {
      (g as any).drawBackground?.({ color: bg });
    } catch {
      // ignore
    }
    try {
      (g as any).container?.style && ((g as any).container.style.background = bg);
    } catch {
      // ignore
    }
    const chromeTheme = p.theme === "dark" ? "dark" : "light";
    applyGraphGridTheme(g, chromeTheme);
    applyGraphEdgeTheme(g, chromeTheme);
  }, [p.theme]);

  useEffect(() => {
    const g = p.graphRef.current;
    if (!g) return;
    (g as any).prop?.("sandboxContext", p.sandboxMode);
  }, [p.sandboxMode]);

  useEffect(() => {
    const g = p.graphRef.current;
    if (!g) return;
    try {
      if (p.canvasGridVisible) g.grid.show();
      else g.grid.hide();
    } catch {
      /* ignore */
    }
  }, [p.canvasGridVisible]);

  useEffect(() => {
    const graph = p.graphRef.current;
    if (!graph) return;
    const combined = buildDisplayedMindmapJson(
      p.mainGraph,
      p.sandboxGraph,
      p.clusterByNodeIdRef.current,
      useUiStore.getState().collapsedSubtreeRootIds
    );
    if (!combined) return;
    p.loadMindmap(graph, combined);
    p.setSelectedEdgeId(null);
    applySubtreeSelectionHighlight(graph, useUiStore.getState().selectedNode?.id ?? null);
  }, [p.mainGraph, p.sandboxGraph, p.collapseReloadKey]);

  useEffect(() => {
    const graph = p.graphRef.current;
    if (!graph || p.hydratingRef.current) return;
    const sandboxIds = new Set(p.sandboxGraph.nodes.map((n) => n.id));
    for (const cell of graph.getNodes()) {
      if (!cell.isNode()) continue;
      const id = cell.id;
      const d = ((cell as any).getData?.() ?? {}) as Record<string, unknown>;
      const nextCluster = sandboxIds.has(id)
        ? String((d.clusterId as string) || "sandbox")
        : (p.clusterByNodeId[id] as string | undefined) ?? (d.clusterId as string | undefined);
      if (nextCluster != null && nextCluster !== d.clusterId) {
        (cell as any).setData?.({ ...d, clusterId: nextCluster }, { overwrite: true });
      }
    }
  }, [p.clusterByNodeId, p.sandboxGraph]);
}
