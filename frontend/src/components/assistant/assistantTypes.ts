export const SKILLS_STORAGE_KEY = "mindmap_assistant_skills_v1";
export const ROUNDTABLE_LIB_KEY = "mindmap_roundtable_persona_lib_v1";

export const ROUNDTABLE_PRESET_INSTRUCTIONS: Record<string, string> = {
  "Skeptical Investor": "Challenge upside; demand evidence, downside cases, and disciplined assumptions.",
  "Risk Analyst": "Surface operational, market, regulatory, and execution risks with clear severity.",
  "Friendly Coach": "Clarify intent, tighten wording, and suggest practical next steps without fluff.",
  "Devil's Advocate": "Steel-man counterarguments; probe hidden assumptions and failure modes."
};

export function presetRoundtableInstruction(name: string): string {
  return ROUNDTABLE_PRESET_INSTRUCTIONS[name] ?? "Give a concise, distinctive take aligned with your role label.";
}

export type RoundtablePersona = { id: string; name: string; instruction: string };
export type RoundtableTranscriptRow = { id: string; role: "user" | "persona"; persona_name?: string; content: string };

export function loadRoundtableLib(): { name: string; instruction: string }[] {
  try {
    const raw = localStorage.getItem(ROUNDTABLE_LIB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x: Record<string, unknown>) => ({
        name: typeof x.name === "string" ? x.name.slice(0, 120) : "",
        instruction: typeof x.instruction === "string" ? x.instruction.slice(0, 4000) : ""
      }))
      .filter((x) => x.name.trim() && x.instruction.trim());
  } catch {
    return [];
  }
}

export type CustomSkillRow = {
  id: string;
  name: string;
  instruction: string;
  enabled: boolean;
};

export type ChatRow = { id: string; role: "user" | "assistant"; content: string };

export type BlackSwanScenario = {
  id: string;
  mece_axis: string;
  title: string;
  summary: string;
  why_relevant?: string;
};
export type BlackSwanGap = { id: string; description: string; severity?: string };
export type BlackSwanMitigation = { id: string; title: string; description: string; addresses_gaps?: string[] };
export type BlackSwanResultBlock = {
  scenario_id: string;
  potential_impacts: string[];
  gaps_to_address: BlackSwanGap[];
  mitigations: BlackSwanMitigation[];
};
export type BlackSwanRunBundle = { results: BlackSwanResultBlock[]; executive_summary?: string };

export function bsMitKey(scenarioId: string, mitigationId: string): string {
  return `${scenarioId}::${mitigationId}`;
}

export type MeceScanBundle = {
  mece_assessment: Record<string, unknown>;
  level1_node_ids: string[];
  level2_node_ids: string[];
  gaps: { id: string; description: string; severity?: string }[];
  proposed_modifications: {
    id: string;
    target_node_id: string;
    target_level: number;
    action: string;
    summary: string;
    detail?: string;
    suggested_label?: string;
    /** Gap ids from `gaps[]` this patch is meant to fix (from model + server validation). */
    addresses_gaps?: string[];
  }[];
};

export type MeceEvidenceRow = {
  modification_id: string;
  supported: boolean;
  confidence?: string;
  supporting_evidence?: { source_filename: string; text_snippet: string }[];
  web_search_recommended?: boolean;
  suggested_search_query?: string;
};

export function loadSkillsFromStorage(): CustomSkillRow[] {
  try {
    const raw = localStorage.getItem(SKILLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x: Record<string, unknown>) => ({
        id: typeof x.id === "string" ? x.id : `s_${Math.random().toString(16).slice(2, 10)}`,
        name: typeof x.name === "string" ? x.name.slice(0, 120) : "",
        instruction: typeof x.instruction === "string" ? x.instruction.slice(0, 8000) : "",
        enabled: x.enabled !== false
      }))
      .filter((x) => x.instruction.trim().length > 0);
  } catch {
    return [];
  }
}
