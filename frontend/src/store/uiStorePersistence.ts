import type { AppLocale } from "./uiStoreTypes";

export const LOCALE_KEY = "mindmap_locale";
export const PROJECT_ID_KEY = "mindmap_project_id";
export const INTENT_KEY = "mindmap_intent";
export const LANDING_DONE_KEY = "mindmap_landing_done";
export const COLLAPSED_SUBTREE_KEY = "mindmap_collapsed_subtree_roots";

export function readProjectId(): string {
  try {
    return localStorage.getItem(PROJECT_ID_KEY) || "";
  } catch {
    return "";
  }
}

export function readIntent(): string {
  try {
    return localStorage.getItem(INTENT_KEY) || "";
  } catch {
    return "";
  }
}

export function readLocale(): AppLocale {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    if (v === "zh" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return "en";
}

export function readDockOpen(key: string, defaultOpen: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return defaultOpen;
}

export function readCollapsedSubtreeRoots(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_SUBTREE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.map((x) => String(x)).filter(Boolean);
  } catch {
    return [];
  }
}
