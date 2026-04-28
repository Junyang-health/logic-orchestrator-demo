import type { UiStore, UiStoreGet, UiStoreSet } from "../uiStoreTypes";

export function buildReviewSlice(set: UiStoreSet, _get: UiStoreGet): Pick<
  UiStore,
  | "reviewPersona"
  | "setReviewPersona"
  | "reviewComments"
  | "reviewBranchRootId"
  | "setReviewComments"
  | "clearReviewComments"
  | "reviewFocusNodeId"
  | "setReviewFocusNodeId"
  | "reviewLoading"
  | "setReviewLoading"
> {
  return {
    reviewPersona: "Skeptical Investor",
    setReviewPersona: (persona) => set({ reviewPersona: persona }),
    reviewComments: [],
    reviewBranchRootId: null,
    setReviewComments: (items, persona, branchRootId) =>
      set((s) => ({
        reviewComments: items.map((c, i) => ({
          ...c,
          id: `c_${persona}_${c.nodeId}_${i}`,
          persona
        })),
        reviewBranchRootId:
          branchRootId === undefined ? s.reviewBranchRootId : branchRootId === null ? null : branchRootId
      })),
    clearReviewComments: () =>
      set({ reviewComments: [], reviewFocusNodeId: null, reviewBranchRootId: null }),
    reviewFocusNodeId: null,
    setReviewFocusNodeId: (id) => set({ reviewFocusNodeId: id }),
    reviewLoading: false,
    setReviewLoading: (v) => set({ reviewLoading: v })
  };
}
