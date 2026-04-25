import { useShallow } from "zustand/react/shallow";
import useUiStore from "../../store/useUiStore";

/** Graph + sandbox mutations used by assistant flows. */
export function useAssistantGraphSlice() {
  return useUiStore(
    useShallow((s) => ({
      mainGraph: s.mainGraph,
      sandboxGraph: s.sandboxGraph,
      sandboxMode: s.sandboxMode,
      setSandboxMode: s.setSandboxMode,
      loadMainGraph: s.loadMainGraph,
      clearSandbox: s.clearSandbox
    }))
  );
}

/** Session chrome: selection, assistant on/off, overlay. */
export function useAssistantSessionSlice() {
  return useUiStore(
    useShallow((s) => ({
      selectedNode: s.selectedNode,
      assistantActive: s.assistantActive,
      setAssistantActive: s.setAssistantActive,
      setAssistantOverlayOpen: s.setAssistantOverlayOpen,
      closeAssistantSession: s.closeAssistantSession
    }))
  );
}

/** Builtin toggles only — isolates from graph updates when possible. */
export function useAssistantSkillsSlice() {
  return useUiStore(
    useShallow((s) => ({
      skills: s.skills,
      toggleSkill: s.toggleSkill
    }))
  );
}
