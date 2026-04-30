import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AssistantPanelMode } from "../assistantPanelMode";
import type { ChatRow } from "../assistantTypes";

export type UseAssistantPanelChatSessionArgs = {
  mode: AssistantPanelMode;
  setError: Dispatch<SetStateAction<string>>;
  rtTranscriptLength: number;
  rtRoundBusy: boolean;
};

/** Chat transcript, composer draft, and scroll affordances. Slash-command switching lives in the panel after `sendChat` is bound. */
export function useAssistantPanelChatSession(args: UseAssistantPanelChatSessionArgs) {
  const { mode, setError, rtTranscriptLength, rtRoundBusy } = args;

  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [draft, setDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const prevAssistantModeRef = useRef<AssistantPanelMode>(mode);

  useEffect(() => {
    const prev = prevAssistantModeRef.current;
    prevAssistantModeRef.current = mode;
    if (prev === "chat" && mode !== "chat") {
      setMessages([]);
      setDraft("");
      setChatBusy(false);
      setError("");
    }
  }, [mode, setError]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chatBusy, mode, rtTranscriptLength, rtRoundBusy]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError("");
  }, [setError]);

  return {
    messages,
    setMessages,
    draft,
    setDraft,
    chatBusy,
    setChatBusy,
    applyBusy,
    setApplyBusy,
    listRef,
    clearChat
  };
}
