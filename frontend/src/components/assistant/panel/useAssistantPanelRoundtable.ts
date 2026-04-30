import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { ROUNDTABLE_LIB_KEY, loadRoundtableLib, presetRoundtableInstruction, type RoundtablePersona, type RoundtableTranscriptRow } from "../assistantTypes";

export type UseAssistantPanelRoundtableArgs = {
  setError: Dispatch<SetStateAction<string>>;
};

export function useAssistantPanelRoundtable(args: UseAssistantPanelRoundtableArgs) {
  const { setError } = args;

  const [rtPersonas, setRtPersonas] = useState<RoundtablePersona[]>([]);
  const [rtTranscript, setRtTranscript] = useState<RoundtableTranscriptRow[]>([]);
  const [rtSteering, setRtSteering] = useState("");
  const [rtNewName, setRtNewName] = useState("");
  const [rtNewInstruction, setRtNewInstruction] = useState("");
  const [rtLib, setRtLib] = useState<{ name: string; instruction: string }[]>(() =>
    typeof localStorage !== "undefined" ? loadRoundtableLib() : []
  );
  const [rtRoundBusy, setRtRoundBusy] = useState(false);
  const [rtProposeBusy, setRtProposeBusy] = useState(false);
  const [rtApplyBusy, setRtApplyBusy] = useState(false);
  const [rtProposal, setRtProposal] = useState<{
    discussion_summary: string;
    recommended_mindmap_changes: string;
    patch: Record<string, unknown>;
  } | null>(null);
  const [rtConfirmApply, setRtConfirmApply] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(ROUNDTABLE_LIB_KEY, JSON.stringify(rtLib));
    } catch {
      /* ignore */
    }
  }, [rtLib]);

  const addRtPreset = useCallback((name: string) => {
    const n = name.trim();
    if (!n) return;
    setRtPersonas((prev) => {
      if (prev.some((p) => p.name.trim().toLowerCase() === n.toLowerCase())) return prev;
      const id = `rtp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      return [...prev, { id, name: n, instruction: presetRoundtableInstruction(n) }];
    });
  }, []);

  const addRtCustom = useCallback(() => {
    const name = rtNewName.trim().slice(0, 120);
    const instruction = rtNewInstruction.trim().slice(0, 4000);
    if (!name || !instruction) return;
    const id = `rtp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    setRtPersonas((prev) => [...prev, { id, name, instruction }]);
    setRtLib((prev) => {
      if (prev.some((x) => x.name.trim().toLowerCase() === name.toLowerCase())) return prev;
      return [...prev, { name, instruction }];
    });
    setRtNewName("");
    setRtNewInstruction("");
  }, [rtNewName, rtNewInstruction]);

  const addRtFromLib = useCallback((name: string, instruction: string) => {
    const n = name.trim();
    const ins = instruction.trim();
    if (!n || !ins) return;
    setRtPersonas((prev) => {
      if (prev.some((p) => p.name.trim().toLowerCase() === n.toLowerCase())) return prev;
      const id = `rtp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      return [...prev, { id, name: n, instruction: ins.slice(0, 4000) }];
    });
  }, []);

  const removeRtPersona = useCallback((id: string) => {
    setRtPersonas((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearRtTranscript = useCallback(() => {
    setRtTranscript([]);
    setRtProposal(null);
    setRtConfirmApply(false);
    setError("");
  }, [setError]);

  const resetOnAssistantClose = useCallback(() => {
    setRtTranscript([]);
    setRtProposal(null);
    setRtConfirmApply(false);
    setRtSteering("");
  }, []);

  return {
    rtPersonas,
    setRtPersonas,
    rtTranscript,
    setRtTranscript,
    rtSteering,
    setRtSteering,
    rtNewName,
    setRtNewName,
    rtNewInstruction,
    setRtNewInstruction,
    rtLib,
    setRtLib,
    rtRoundBusy,
    setRtRoundBusy,
    rtProposeBusy,
    setRtProposeBusy,
    rtApplyBusy,
    setRtApplyBusy,
    rtProposal,
    setRtProposal,
    rtConfirmApply,
    setRtConfirmApply,
    addRtPreset,
    addRtCustom,
    addRtFromLib,
    removeRtPersona,
    clearRtTranscript,
    resetOnAssistantClose
  };
}
