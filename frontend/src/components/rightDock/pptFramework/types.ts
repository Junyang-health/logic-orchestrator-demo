export type PptCustomSkillRow = { id: string; name: string; instruction: string; enabled: boolean };

export type PptChatRow = { id: string; role: "user" | "assistant"; content: string };

export type PptGenPhase =
  | null
  | { kind: "skeleton" }
  | { kind: "enrich"; batch: number; batches: number }
  | { kind: "reconcile" };
