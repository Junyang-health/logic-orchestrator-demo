import type { CounselPersona } from "../../lib/counselApi";

export type Phase = "setup" | "problem" | "fact" | "collisions" | "debate" | "vote" | "finalize";

export type FactThread = { messages: { role: "user" | "persona"; content: string }[] };

export type CounselFinalizeResult = {
  recommendation: string;
  patch: Record<string, unknown>;
  discussion_summary: string;
  recommended_mindmap_changes: string;
};

export type CounselSessionState = {
  phase: Phase;
  personas: CounselPersona[];
  problemDraft: string;
  problemTranscript: { role: string; content: string }[];
  problemSummary: string;
  slugKeywords: string;
  newPersonaName: string;
  newPersonaInstruction: string;
  libEditName: string | null;
  libEditDraft: string;
  publicFigBusy: boolean;
  factThreads: Record<string, FactThread>;
  questionsAsked: Record<string, number>;
  opinions: Record<string, string>;
  collisionAreas: { id: string; title: string; positions?: unknown[] }[];
  selectedCollisionIds: Set<string>;
  debateTranscripts: Record<string, { speaker: string; content: string }[]>;
  debateAreaIdx: number;
  debateMsgCount: number;
  debateMsgLimit: number;
  debatePaused: boolean;
  debateUserLine: string;
  debateSpeedMult: 1 | 1.5;
  debateAutoProgress: number;
  debateModeratorFloorOpen: boolean;
  voteOptionAreas: { area_id: string; options: { id: string; label: string }[] }[];
  rawVotes: unknown[] | null;
  finalizeResult: CounselFinalizeResult | null;
  busy: boolean;
  error: string;
  factSkippedIds: Record<string, boolean>;
  factLoading: Record<string, boolean>;
  factFocusPersonaId: string | null;
};

export function createInitialCounselSessionState(): CounselSessionState {
  return {
    phase: "setup",
    personas: [],
    problemDraft: "",
    problemTranscript: [],
    problemSummary: "",
    slugKeywords: "",
    newPersonaName: "",
    newPersonaInstruction: "",
    libEditName: null,
    libEditDraft: "",
    publicFigBusy: false,
    factThreads: {},
    questionsAsked: {},
    opinions: {},
    collisionAreas: [],
    selectedCollisionIds: new Set(),
    debateTranscripts: {},
    debateAreaIdx: 0,
    debateMsgCount: 0,
    debateMsgLimit: 30,
    debatePaused: false,
    debateUserLine: "",
    debateSpeedMult: 1,
    debateAutoProgress: 0,
    debateModeratorFloorOpen: false,
    voteOptionAreas: [],
    rawVotes: null,
    finalizeResult: null,
    busy: false,
    error: "",
    factSkippedIds: {},
    factLoading: {},
    factFocusPersonaId: null
  };
}

export type CounselSessionPatch =
  | Partial<CounselSessionState>
  | ((state: CounselSessionState) => Partial<CounselSessionState>);

export type CounselSessionAction = { type: "reset" } | { type: "patch"; patch: CounselSessionPatch };

export function counselSessionReducer(
  state: CounselSessionState,
  action: CounselSessionAction
): CounselSessionState {
  switch (action.type) {
    case "reset":
      return {
        ...createInitialCounselSessionState(),
        personas: state.personas,
        problemDraft: state.problemDraft,
        busy: state.busy,
        debateUserLine: state.debateUserLine,
        factFocusPersonaId: state.factFocusPersonaId
      };
    case "patch": {
      const delta =
        typeof action.patch === "function" ? action.patch(state) : action.patch;
      return { ...state, ...delta };
    }
    default:
      return state;
  }
}
