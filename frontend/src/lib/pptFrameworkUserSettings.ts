import { newPptSlideId } from "./pptFrameworkShared";

const ENRICH_KEY = "unbox.ppt.enrichBatchSize";
const SKILLS_KEY = "unbox.ppt.customSkills.v1";

const ENV = import.meta.env as { VITE_PPT_ENRICH_BATCH_SIZE?: string };

export const PPT_ENRICH_BATCH_SIZE_DEFAULT = 3;

function clampBatchSize(n: number): number {
  if (Number.isNaN(n) || n < 1) return PPT_ENRICH_BATCH_SIZE_DEFAULT;
  return Math.min(8, Math.max(1, Math.floor(n)));
}

/** Build-time default via `VITE_PPT_ENRICH_BATCH_SIZE` (1–8). */
export function getEnvEnrichBatchSize(): number {
  const raw = ENV.VITE_PPT_ENRICH_BATCH_SIZE;
  if (raw === undefined || raw === "") return PPT_ENRICH_BATCH_SIZE_DEFAULT;
  return clampBatchSize(parseInt(String(raw), 10));
}

export function readStoredEnrichBatchSize(): number | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(ENRICH_KEY);
    if (raw == null) return null;
    return clampBatchSize(parseInt(raw, 10));
  } catch {
    return null;
  }
}

export function writeStoredEnrichBatchSize(n: number): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ENRICH_KEY, String(clampBatchSize(n)));
  } catch {
    /* quota / private mode */
  }
}

type SkillPayload = { name: string; instruction: string; enabled: boolean };

function isSkillRow(x: unknown): x is SkillPayload {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.instruction === "string" &&
    typeof o.enabled === "boolean"
  );
}

export type LoadedCustomSkill = { id: string; name: string; instruction: string; enabled: boolean };

export function loadPptCustomSkillsFromStorage(): LoadedCustomSkill[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(SKILLS_KEY);
    if (raw == null || raw === "") return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: LoadedCustomSkill[] = [];
    for (const item of parsed) {
      if (!isSkillRow(item)) continue;
      if (!item.instruction.trim() && !item.name.trim()) continue;
      out.push({
        id: newPptSlideId(),
        name: item.name.slice(0, 200),
        instruction: item.instruction.slice(0, 8000),
        enabled: item.enabled
      });
    }
    return out;
  } catch {
    return [];
  }
}

let skillsSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSavePptCustomSkills(
  skills: readonly { name: string; instruction: string; enabled: boolean }[],
  debounceMs = 400
): void {
  if (typeof localStorage === "undefined") return;
  if (skillsSaveTimer) clearTimeout(skillsSaveTimer);
  skillsSaveTimer = setTimeout(() => {
    skillsSaveTimer = null;
    try {
      const payload: SkillPayload[] = skills.map((s) => ({
        name: s.name,
        instruction: s.instruction,
        enabled: s.enabled
      }));
      localStorage.setItem(SKILLS_KEY, JSON.stringify(payload));
    } catch {
      /* quota */
    }
  }, debounceMs);
}
