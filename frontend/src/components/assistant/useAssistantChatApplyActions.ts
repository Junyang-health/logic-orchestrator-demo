import { useCallback, useMemo } from "react";
import useUiStore from "../../store/useUiStore";
import type { MindmapJson } from "../../types/mindmap";
import { assistantRunAsync } from "./assistantRunAsync";
import { readFetchDetailMessage } from "./assistantFetchDetail";
import type { AssistantPanelActionsRef } from "./assistantPanelActionsContext";

export function useAssistantChatApplyActions(ref: AssistantPanelActionsRef) {
  const sendChat = useCallback(async () => {
    const c = ref.current;
    if (c.assistantMode !== "chat") return;
    const text = c.draft.trim();
    if (!text || c.chatBusy) return;
    const userRow = { id: `u_${Date.now()}`, role: "user" as const, content: text };
    const nextMessages = [...c.messages, userRow];
    c.setMessages(nextMessages);
    c.setDraft("");
    await assistantRunAsync(
      {
        setBusy: c.setChatBusy,
        setPanelError: c.setError,
        t: c.t,
        label: "chat",
        onFailure: () => {
          c.setMessages((prev) => prev.filter((m) => m.id !== userRow.id));
        }
      },
      async () => {
        const projectId =
          typeof localStorage !== "undefined" ? (localStorage.getItem("mindmap_project_id") || "").trim() : "";
        const src = c.assistantSourceFileIds;
        const includeSources = src.length > 0;
        const apiMessages = nextMessages.map((m) => ({ role: m.role, content: m.content }));
        const res = await fetch(`${c.backendBase}/assistant/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            full_nodes: c.combined.nodes,
            full_edges: c.combined.edges,
            selected_node_id: c.selectedNodeId ?? null,
            web_search_query: c.skillsWebSearch ? c.webSearchQuery.trim() || null : null,
            custom_skills: c.payloadSkills,
            builtin_skills: c.builtinPayload,
            sandbox_mode: c.sandboxMode,
            project_id: projectId || null,
            include_project_sources: includeSources,
            source_file_ids: includeSources ? src : [],
            source_max_chars: 40_000
          })
        });
        if (!res.ok) {
          throw new Error(await readFetchDetailMessage(res, "Chat failed"));
        }
        const data = (await res.json()) as { reply: string };
        if (ref.current.assistantMode !== "chat") return;
        c.setMessages((prev) => [...prev, { id: `a_${Date.now()}`, role: "assistant", content: data.reply || "…" }]);
      }
    );
  }, [ref]);

  const applyToMindmap = useCallback(async () => {
    const c = ref.current;
    if (c.assistantMode !== "chat") return;
    if (!c.selectedNodeId) {
      c.setError("Select a branch root node on the canvas before applying changes to the mindmap.");
      return;
    }
    if (c.messages.length === 0) {
      c.setError("Have at least one message in the conversation before applying.");
      return;
    }
    await assistantRunAsync(
      { setBusy: c.setApplyBusy, setPanelError: c.setError, t: c.t, label: "apply" },
      async () => {
        const projectId =
          typeof localStorage !== "undefined" ? (localStorage.getItem("mindmap_project_id") || "").trim() : "";
        const src = c.assistantSourceFileIds;
        const includeSources = src.length > 0;
        const apiMessages = c.messages.map((m) => ({ role: m.role, content: m.content }));
        const res = await fetch(`${c.backendBase}/assistant/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_root_id: c.selectedNodeId,
            full_nodes: c.combined.nodes,
            full_edges: c.combined.edges,
            messages: apiMessages,
            custom_skills: c.payloadSkills,
            builtin_skills: c.builtinPayload,
            sandbox_mode: c.sandboxMode || c.sandboxHasDrafts,
            project_id: projectId || null,
            include_project_sources: includeSources,
            source_file_ids: includeSources ? src : [],
            source_max_chars: 40_000
          })
        });
        if (!res.ok) {
          throw new Error(await readFetchDetailMessage(res, "Apply failed"));
        }
        const data = (await res.json()) as { mindmap: MindmapJson };
        c.loadMainGraph(data.mindmap, { newMarks: "diff" });
        c.clearSandbox();
        useUiStore.getState().setSelectedNode(null);
        useUiStore.getState().closeAssistantSession();
      }
    );
  }, [ref]);

  const fetchSkillFromUrl = useCallback(async () => {
    const c = ref.current;
    const url = c.skillImportUrl.trim();
    if (!url || c.skillImportBusy) return;
    await assistantRunAsync(
      {
        setBusy: c.setSkillImportBusy,
        t: c.t,
        label: "fetch_skill_url",
        prepare: () => c.setSkillImportMessage(""),
        onErrorMessage: (msg) => c.setSkillImportMessage(msg)
      },
      async () => {
        const res = await fetch(`${c.backendBase}/assistant/fetch-skill-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url })
        });
        const raw = await res.json().catch(() => ({}));
        if (!res.ok) {
          const d = (raw as { detail?: unknown }).detail;
          const msg =
            typeof d === "string"
              ? d
              : Array.isArray(d)
                ? d
                    .map((x: unknown) =>
                      typeof x === "object" && x && "msg" in x ? String((x as { msg: string }).msg) : JSON.stringify(x)
                    )
                    .join("; ")
                : d != null
                  ? JSON.stringify(d)
                  : `Import failed (${res.status})`;
          throw new Error(msg);
        }
        const data = raw as { instruction: string; suggested_name?: string; fetched_url?: string };
        const instruction = (data.instruction || "").trim();
        if (!instruction) throw new Error("Server returned an empty document");
        const name = (data.suggested_name || "Remote skill").trim().slice(0, 120);
        c.setCustomSkills((prev) => [
          ...prev,
          {
            id: `s_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
            name: name || "Remote skill",
            instruction,
            enabled: true
          }
        ]);
        c.setSkillImportUrl("");
        c.setSkillImportMessage(`Added “${name}”.`);
      }
    );
  }, [ref]);

  return useMemo(
    () => ({ sendChat, applyToMindmap, fetchSkillFromUrl }),
    [sendChat, applyToMindmap, fetchSkillFromUrl]
  );
}
