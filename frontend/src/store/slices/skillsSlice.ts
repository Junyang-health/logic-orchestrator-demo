import type { UiStore, UiStoreGet, UiStoreSet } from "../uiStoreTypes";

export function buildSkillsSlice(_set: UiStoreSet, _get: UiStoreGet): Pick<UiStore, "skills" | "toggleSkill"> {
  return {
    skills: { webSearch: false, financialAnalyst: false },
    toggleSkill: (key) =>
      _set((s) => ({
        skills: { ...s.skills, [key]: !s.skills[key] }
      }))
  };
}
