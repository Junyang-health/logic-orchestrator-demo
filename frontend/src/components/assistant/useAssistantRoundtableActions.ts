import { useCallback, useMemo } from "react";
import useUiStore from "../../store/useUiStore";
import type { MindmapJson } from "../../types/mindmap";
import { assistantRunAsync } from "./assistantRunAsync";
import { readFetchDetailMessage } from "./assistantFetchDetail";
import type { AssistantPanelActionsRef } from "./assistantPanelActionsContext";

export function useAssistantRoundtableActions(ref: AssistantPanelActionsRef) {
  const runRoundtableRound = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId) {
      c.setError("Select a node on the canvas first.");
      return;
    }
    if (c.rtPersonas.length < 1) {
      c.setError("Add at least one persona to the roundtable.");
      return;
    }
    const steering = c.rtSteering.trim();
    await assistantRunAsync(
      { setBusy: c.setRtRoundBusy, setPanelError: c.setError, t: c.t, label: "roundtable_round" },
      async () => {
        const apiTranscript = c.rtTranscript.map((r) => ({
          role: r.role,
          persona_name: r.role === "persona" ? (r.persona_name ?? null) : null,
          content: r.content
        }));
        const res = await fetch(`${c.backendBase}/assistant/roundtable/round`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_nodes: c.combined.nodes,
            full_edges: c.combined.edges,
            selected_node_id: c.selectedNodeId,
            personas: c.rtPersonas.map((p) => ({ name: p.name, instruction: p.instruction })),
            transcript: apiTranscript,
            user_steering: steering || null,
            custom_skills: c.payloadSkills,
            builtin_skills: c.builtinPayload,
            sandbox_mode: c.sandboxMode
          })
        });
        if (!res.ok) {
          throw new Error(await readFetchDetailMessage(res, "Round failed"));
        }
        const data = (await res.json()) as { speeches: { persona: string; content: string }[]; round_title?: string };
        const speeches = Array.isArray(data.speeches) ? data.speeches : [];
        const now = Date.now();
        c.setRtTranscript((prev) => {
          let next = [...prev];
          if (steering) {
            next.push({ id: `u_${now}`, role: "user", content: steering });
          }
          speeches.forEach((s, i) => {
            next.push({
              id: `p_${now}_${i}`,
              role: "persona",
              persona_name: s.persona,
              content: s.content || "…"
            });
          });
          return next;
        });
        c.setRtProposal(null);
        c.setRtConfirmApply(false);
        c.setRtSteering("");
      }
    );
  }, [ref]);

  const proposeRoundtable = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId) {
      c.setError("Select a branch root node on the canvas.");
      return;
    }
    if (c.rtTranscript.length < 1) {
      c.setError("Run at least one discussion round before summarizing.");
      return;
    }
    c.setRtProposal(null);
    c.setRtConfirmApply(false);
    await assistantRunAsync(
      { setBusy: c.setRtProposeBusy, setPanelError: c.setError, t: c.t, label: "roundtable_propose" },
      async () => {
        const apiTranscript = c.rtTranscript.map((r) => ({
          role: r.role,
          persona_name: r.role === "persona" ? (r.persona_name ?? null) : null,
          content: r.content
        }));
        const res = await fetch(`${c.backendBase}/assistant/roundtable/propose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_root_id: c.selectedNodeId,
            selected_node_id: c.selectedNodeId,
            full_nodes: c.combined.nodes,
            full_edges: c.combined.edges,
            transcript: apiTranscript,
            custom_skills: c.payloadSkills,
            builtin_skills: c.builtinPayload,
            sandbox_mode: c.sandboxMode || c.sandboxHasDrafts
          })
        });
        if (!res.ok) {
          throw new Error(await readFetchDetailMessage(res, "Propose failed"));
        }
        const data = (await res.json()) as {
          discussion_summary: string;
          recommended_mindmap_changes: string;
          patch: Record<string, unknown>;
        };
        c.setRtProposal({
          discussion_summary: data.discussion_summary || "",
          recommended_mindmap_changes: data.recommended_mindmap_changes || "",
          patch: data.patch && typeof data.patch === "object" ? data.patch : {}
        });
      }
    );
  }, [ref]);

  const applyRoundtablePatch = useCallback(async () => {
    const c = ref.current;
    if (!c.selectedNodeId || !c.rtProposal || !c.rtConfirmApply) return;
    await assistantRunAsync(
      { setBusy: c.setRtApplyBusy, setPanelError: c.setError, t: c.t, label: "roundtable_apply" },
      async () => {
        const res = await fetch(`${c.backendBase}/assistant/roundtable/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_root_id: c.selectedNodeId,
            full_nodes: c.combined.nodes,
            full_edges: c.combined.edges,
            patch: c.rtProposal.patch
          })
        });
        if (!res.ok) {
          throw new Error(await readFetchDetailMessage(res, "Apply failed"));
        }
        const data = (await res.json()) as { mindmap: MindmapJson };
        c.loadMainGraph(data.mindmap, { newMarks: "diff" });
        c.clearSandbox();
        c.setRtProposal(null);
        c.setRtConfirmApply(false);
        c.setRtTranscript([]);
        useUiStore.getState().setSelectedNode(null);
        useUiStore.getState().closeAssistantSession();
      }
    );
  }, [ref]);

  return useMemo(
    () => ({ runRoundtableRound, proposeRoundtable, applyRoundtablePatch }),
    [runRoundtableRound, proposeRoundtable, applyRoundtablePatch]
  );
}
