import { useMemo, type MutableRefObject } from "react";
import type { AssistantPanelActionsCtx } from "./assistantPanelActionsContext";
import { useAssistantChatApplyActions } from "./useAssistantChatApplyActions";
import { useAssistantMeceActions } from "./useAssistantMeceActions";
import { useAssistantRoundtableActions } from "./useAssistantRoundtableActions";
import { useAssistantSimulationActions } from "./useAssistantSimulationActions";

export type { AssistantPanelActionsCtx };

/**
 * Stable async handlers for assistant HTTP calls. Assign `ctxRef.current` on every render
 * with a fresh {@link AssistantPanelActionsCtx} snapshot before any handler runs.
 */
export function useAssistantPanelActions(ctxRef: MutableRefObject<AssistantPanelActionsCtx>) {
  const chatApply = useAssistantChatApplyActions(ctxRef);
  const simulation = useAssistantSimulationActions(ctxRef);
  const mece = useAssistantMeceActions(ctxRef);
  const roundtable = useAssistantRoundtableActions(ctxRef);

  return useMemo(
    () => ({
      ...chatApply,
      ...simulation,
      ...mece,
      ...roundtable
    }),
    [chatApply, mece, roundtable, simulation]
  );
}
