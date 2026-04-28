import type { UiStore, UiStoreGet, UiStoreSet } from "../uiStoreTypes";

export function buildSourceSlice(set: UiStoreSet, _get: UiStoreGet): Pick<
  UiStore,
  "sourceFiles" | "addSourceFiles" | "removeSourceFile" | "clearSourceFiles" | "projectSelectedFileIds" | "setProjectSelectedFileIds"
> {
  return {
    sourceFiles: [],
    addSourceFiles: (files) =>
      set((s) => {
        const next = [...s.sourceFiles];
        const t = Date.now();
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          next.push({
            id: `sf_${t}_${i}_${Math.random().toString(16).slice(2, 10)}`,
            file,
            addedAt: t
          });
        }
        return { sourceFiles: next };
      }),
    removeSourceFile: (id) => set((s) => ({ sourceFiles: s.sourceFiles.filter((e) => e.id !== id) })),
    clearSourceFiles: () => set({ sourceFiles: [] }),
    projectSelectedFileIds: [],
    setProjectSelectedFileIds: (ids) => set({ projectSelectedFileIds: Array.from(new Set(ids)) })
  };
}
