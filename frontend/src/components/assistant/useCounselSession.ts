import { useCallback, useReducer } from "react";
import {
  counselSessionReducer,
  createInitialCounselSessionState,
  type CounselSessionPatch,
  type CounselSessionState
} from "./counselSessionState";

function usePatchField<K extends keyof CounselSessionState>(
  patch: (p: CounselSessionPatch) => void,
  key: K
): (
  v:
    | CounselSessionState[K]
    | ((prev: CounselSessionState[K]) => CounselSessionState[K])
) => void {
  return useCallback(
    (v) =>
      patch((s) => {
        const next =
          typeof v === "function"
            ? (v as (prev: CounselSessionState[K]) => CounselSessionState[K])(s[key])
            : v;
        return { [key]: next } as Partial<CounselSessionState>;
      }),
    [patch, key]
  );
}

/** Reducer-backed counsel session; setters mirror useState and keep call sites stable. */
export function useCounselSession() {
  const [state, dispatch] = useReducer(counselSessionReducer, undefined, createInitialCounselSessionState);

  const patch = useCallback((p: CounselSessionPatch) => {
    dispatch({ type: "patch", patch: p });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  const setPhase = usePatchField(patch, "phase");
  const setPersonas = usePatchField(patch, "personas");
  const setProblemDraft = usePatchField(patch, "problemDraft");
  const setProblemTranscript = usePatchField(patch, "problemTranscript");
  const setProblemSummary = usePatchField(patch, "problemSummary");
  const setSlugKeywords = usePatchField(patch, "slugKeywords");
  const setNewPersonaName = usePatchField(patch, "newPersonaName");
  const setNewPersonaInstruction = usePatchField(patch, "newPersonaInstruction");
  const setLibEditName = usePatchField(patch, "libEditName");
  const setLibEditDraft = usePatchField(patch, "libEditDraft");
  const setPublicFigBusy = usePatchField(patch, "publicFigBusy");
  const setFactThreads = usePatchField(patch, "factThreads");
  const setQuestionsAsked = usePatchField(patch, "questionsAsked");
  const setOpinions = usePatchField(patch, "opinions");
  const setCollisionAreas = usePatchField(patch, "collisionAreas");
  const setSelectedCollisionIds = usePatchField(patch, "selectedCollisionIds");
  const setDebateTranscripts = usePatchField(patch, "debateTranscripts");
  const setDebateAreaIdx = usePatchField(patch, "debateAreaIdx");
  const setDebateMsgCount = usePatchField(patch, "debateMsgCount");
  const setDebateMsgLimit = usePatchField(patch, "debateMsgLimit");
  const setDebatePaused = usePatchField(patch, "debatePaused");
  const setDebateUserLine = usePatchField(patch, "debateUserLine");
  const setDebateSpeedMult = usePatchField(patch, "debateSpeedMult");
  const setDebateAutoProgress = usePatchField(patch, "debateAutoProgress");
  const setDebateModeratorFloorOpen = usePatchField(patch, "debateModeratorFloorOpen");
  const setVoteOptionAreas = usePatchField(patch, "voteOptionAreas");
  const setRawVotes = usePatchField(patch, "rawVotes");
  const setFinalizeResult = usePatchField(patch, "finalizeResult");
  const setBusy = usePatchField(patch, "busy");
  const setError = usePatchField(patch, "error");
  const setFactSkippedIds = usePatchField(patch, "factSkippedIds");
  const setFactLoading = usePatchField(patch, "factLoading");
  const setFactFocusPersonaId = usePatchField(patch, "factFocusPersonaId");

  return {
    state,
    patch,
    reset,
    setPhase,
    setPersonas,
    setProblemDraft,
    setProblemTranscript,
    setProblemSummary,
    setSlugKeywords,
    setNewPersonaName,
    setNewPersonaInstruction,
    setLibEditName,
    setLibEditDraft,
    setPublicFigBusy,
    setFactThreads,
    setQuestionsAsked,
    setOpinions,
    setCollisionAreas,
    setSelectedCollisionIds,
    setDebateTranscripts,
    setDebateAreaIdx,
    setDebateMsgCount,
    setDebateMsgLimit,
    setDebatePaused,
    setDebateUserLine,
    setDebateSpeedMult,
    setDebateAutoProgress,
    setDebateModeratorFloorOpen,
    setVoteOptionAreas,
    setRawVotes,
    setFinalizeResult,
    setBusy,
    setError,
    setFactSkippedIds,
    setFactLoading,
    setFactFocusPersonaId
  };
}
