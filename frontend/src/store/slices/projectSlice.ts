import {
  INTENT_KEY,
  LANDING_DONE_KEY,
  PROJECT_ID_KEY,
  readIntent,
  readProjectId
} from "../uiStorePersistence";
import type { UiStore, UiStoreGet, UiStoreSet } from "../uiStoreTypes";

export function buildProjectSlice(set: UiStoreSet, _get: UiStoreGet): Pick<
  UiStore,
  | "projectId"
  | "setProjectId"
  | "projects"
  | "setProjects"
  | "intent"
  | "setIntent"
  | "projectLandingOpen"
  | "projectLandingReason"
  | "openProjectLanding"
  | "closeProjectLanding"
  | "dismissProjectLandingOnboarding"
> {
  return {
    projectId: readProjectId(),
    setProjectId: (id) => {
      try {
        localStorage.setItem(PROJECT_ID_KEY, id);
      } catch {
        /* ignore */
      }
      try {
        window.dispatchEvent(new CustomEvent("mindmap:projectId", { detail: { projectId: id } }));
      } catch {
        /* ignore */
      }
      set({ projectId: id });
    },
    projects: [],
    setProjects: (projects) => set({ projects }),
    intent: readIntent(),
    setIntent: (intent) => {
      try {
        localStorage.setItem(INTENT_KEY, intent);
      } catch {
        /* ignore */
      }
      set({ intent });
    },
    projectLandingOpen: false,
    projectLandingReason: null,
    openProjectLanding: (reason = "first_visit") =>
      set({ projectLandingOpen: true, projectLandingReason: reason }),
    closeProjectLanding: () => set({ projectLandingOpen: false, projectLandingReason: null }),
    dismissProjectLandingOnboarding: () => {
      try {
        localStorage.setItem(LANDING_DONE_KEY, "1");
      } catch {
        /* ignore */
      }
      set({ projectLandingOpen: false, projectLandingReason: null });
    }
  };
}
