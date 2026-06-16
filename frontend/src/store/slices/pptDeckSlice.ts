import type { PptSlide } from "../../lib/pptFrameworkExport";
import type { UiStore, UiStoreGet, UiStoreSet } from "../uiStoreTypes";

export function buildPptDeckSlice(set: UiStoreSet, get: UiStoreGet): Pick<
  UiStore,
  | "centerWorkspace"
  | "setCenterWorkspace"
  | "exportPanelTab"
  | "setExportPanelTab"
  | "pptSlides"
  | "setPptSlides"
  | "slideBuildSessionId"
  | "setSlideBuildSessionId"
  | "deckViewerIndex"
  | "setDeckViewerIndex"
> {
  return {
    centerWorkspace: "canvas",
    setCenterWorkspace: (w) => set({ centerWorkspace: w }),

    exportPanelTab: "mindmap",
    setExportPanelTab: (tab) => set({ exportPanelTab: tab }),

    pptSlides: [],
    setPptSlides: (v) =>
      set((s) => {
        const next = typeof v === "function" ? (v as (p: PptSlide[]) => PptSlide[])(s.pptSlides) : v;
        const maxI = Math.max(0, next.length - 1);
        const deckViewerIndex = Math.min(s.deckViewerIndex, maxI);
        return { pptSlides: next, deckViewerIndex };
      }),

    slideBuildSessionId: null,
    setSlideBuildSessionId: (id) => set({ slideBuildSessionId: id }),

    deckViewerIndex: 0,
    setDeckViewerIndex: (i) => {
      const slides = get().pptSlides;
      const maxI = Math.max(0, slides.length - 1);
      const idx = Math.max(0, Math.min(i, maxI));
      set({ deckViewerIndex: idx });
    }
  };
}
