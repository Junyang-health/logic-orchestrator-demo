import { combineGraphs } from "../../lib/graphBranch";
import {
  computeHiddenNodeIds,
  getTopLevelCollapseRootIds,
  pruneCollapsedRoots
} from "../../lib/mindmapCollapse";
import {
  COLLAPSED_SUBTREE_KEY,
  LOCALE_KEY,
  readCollapsedSubtreeRoots,
  readDockOpen,
  readLocale
} from "../uiStorePersistence";
import type { UiStore, UiStoreGet, UiStoreSet } from "../uiStoreTypes";

export function buildUiChromeSlice(set: UiStoreSet, get: UiStoreGet): Pick<
  UiStore,
  | "activePanel"
  | "setActivePanel"
  | "selectedNode"
  | "setSelectedNode"
  | "locale"
  | "setLocale"
  | "theme"
  | "setTheme"
  | "toggleTheme"
  | "assistantActive"
  | "setAssistantActive"
  | "assistantOverlayOpen"
  | "setAssistantOverlayOpen"
  | "closeAssistantSession"
  | "reparentingNodeId"
  | "reparentingRelation"
  | "startReparent"
  | "clearReparent"
  | "rightDockOpen"
  | "setRightDockOpen"
  | "canvasGridVisible"
  | "setCanvasGridVisible"
  | "collapsedSubtreeRootIds"
  | "toggleCollapsedSubtree"
  | "expandAllCollapsedSubtrees"
  | "collapseAllSubtreesToTopLevel"
  | "canvasCenterOnNodeRequest"
  | "requestCanvasCenterOnNode"
> {
  return {
    activePanel: "source",
    setActivePanel: (panel) => set({ activePanel: panel }),
    selectedNode: null,
    setSelectedNode: (node) => set({ selectedNode: node }),
    locale: readLocale(),
    setLocale: (loc) => {
      try {
        localStorage.setItem(LOCALE_KEY, loc);
      } catch {
        /* ignore */
      }
      set({ locale: loc });
    },
    theme: "dark",
    setTheme: (t) => set({ theme: t }),
    toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
    assistantActive: false,
    setAssistantActive: (on) => set({ assistantActive: on }),
    assistantOverlayOpen: false,
    setAssistantOverlayOpen: (open) => set({ assistantOverlayOpen: open }),
    closeAssistantSession: () =>
      set({ assistantOverlayOpen: false, assistantActive: false, sandboxMode: false }),
    reparentingNodeId: null,
    reparentingRelation: "supports",
    startReparent: (nodeId, relationship) =>
      set({
        reparentingNodeId: nodeId,
        reparentingRelation: relationship.trim() || "supports"
      }),
    clearReparent: () => set({ reparentingNodeId: null }),
    rightDockOpen: readDockOpen("mindmap_right_dock_open", true),
    setRightDockOpen: (open) => {
      try {
        localStorage.setItem("mindmap_right_dock_open", open ? "1" : "0");
      } catch {
        /* ignore */
      }
      set({ rightDockOpen: open });
    },
    canvasGridVisible: true,
    setCanvasGridVisible: (v) => set({ canvasGridVisible: v }),

    collapsedSubtreeRootIds: readCollapsedSubtreeRoots(),
    toggleCollapsedSubtree: (nodeId) => {
      const id = nodeId.trim();
      if (!id) return;
      const st = get();
      const roots = new Set(st.collapsedSubtreeRootIds);
      if (roots.has(id)) roots.delete(id);
      else roots.add(id);
      let next = Array.from(roots);
      const combined = combineGraphs(st.mainGraph, st.sandboxGraph);
      const allIds = new Set(combined.nodes.map((n) => n.id));
      next = pruneCollapsedRoots(next, allIds);
      const hidden = computeHiddenNodeIds(new Set(next), combined.edges, allIds);
      const selId = st.selectedNode?.id;
      try {
        localStorage.setItem(COLLAPSED_SUBTREE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      if (selId && hidden.has(selId)) {
        set({ collapsedSubtreeRootIds: next, selectedNode: null });
      } else {
        set({ collapsedSubtreeRootIds: next });
      }
    },
    expandAllCollapsedSubtrees: () => {
      try {
        localStorage.removeItem(COLLAPSED_SUBTREE_KEY);
      } catch {
        /* ignore */
      }
      set({ collapsedSubtreeRootIds: [] });
    },
    canvasCenterOnNodeRequest: null,
    requestCanvasCenterOnNode: (nodeId) => {
      const id = nodeId.trim();
      if (!id) return;
      set({ canvasCenterOnNodeRequest: { nodeId: id, token: Date.now() } });
    },

    collapseAllSubtreesToTopLevel: () => {
      const st = get();
      const combined = combineGraphs(st.mainGraph, st.sandboxGraph);
      const allIds = new Set(combined.nodes.map((n) => n.id));
      let next = getTopLevelCollapseRootIds(allIds, combined.edges);
      next = pruneCollapsedRoots(next, allIds);
      const hidden = computeHiddenNodeIds(new Set(next), combined.edges, allIds);
      const selId = st.selectedNode?.id;
      try {
        localStorage.setItem(COLLAPSED_SUBTREE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      if (selId && hidden.has(selId)) {
        set({ collapsedSubtreeRootIds: next, selectedNode: null });
      } else {
        set({ collapsedSubtreeRootIds: next });
      }
    }
  };
}
