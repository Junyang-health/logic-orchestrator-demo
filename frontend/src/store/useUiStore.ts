import { create } from "zustand";
import { buildGraphSlice } from "./slices/graphSlice";
import { buildProjectSlice } from "./slices/projectSlice";
import { buildReviewSlice } from "./slices/reviewSlice";
import { buildSkillsSlice } from "./slices/skillsSlice";
import { buildSourceSlice } from "./slices/sourceSlice";
import { buildUiChromeSlice } from "./slices/uiChromeSlice";
import { buildPptDeckSlice } from "./slices/pptDeckSlice";
import type { UiStore } from "./uiStoreTypes";

export type {
  AppLocale,
  LoadMainGraphOptions,
  MindmapNodePayload,
  PanelKey,
  ProjectRow,
  SkillKey,
  UiStore
} from "./uiStoreTypes";

const useUiStore = create<UiStore>((set, get) => ({
  ...buildProjectSlice(set, get),
  ...buildSkillsSlice(set, get),
  ...buildReviewSlice(set, get),
  ...buildSourceSlice(set, get),
  ...buildUiChromeSlice(set, get),
  ...buildGraphSlice(set, get),
  ...buildPptDeckSlice(set, get)
}));

export default useUiStore;
