import { useCallback, useEffect, useState } from "react";
import type { MessageKey } from "../../../i18n/messages";
import { SKILLS_STORAGE_KEY, loadSkillsFromStorage, type CustomSkillRow } from "../assistantTypes";

export type UseAssistantPanelSkillsArgs = {
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

export function useAssistantPanelSkills(args: UseAssistantPanelSkillsArgs) {
  const { t } = args;

  const [customSkills, setCustomSkills] = useState<CustomSkillRow[]>(() =>
    typeof localStorage !== "undefined" ? loadSkillsFromStorage() : []
  );
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillBody, setNewSkillBody] = useState("");
  const [skillImportUrl, setSkillImportUrl] = useState("");
  const [skillImportBusy, setSkillImportBusy] = useState(false);
  const [skillImportMessage, setSkillImportMessage] = useState("");
  const [skillDetailsOpen, setSkillDetailsOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(customSkills));
    } catch {
      /* ignore quota */
    }
  }, [customSkills]);

  const addSkill = useCallback(() => {
    const instruction = newSkillBody.trim();
    if (!instruction) return;
    setCustomSkills((prev) => [
      ...prev,
      {
        id: `s_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        name: newSkillName.trim() || t("custom_skill"),
        instruction,
        enabled: true
      }
    ]);
    setNewSkillName("");
    setNewSkillBody("");
  }, [newSkillBody, newSkillName, t]);

  const removeSkill = useCallback((id: string) => {
    setCustomSkills((prev) => prev.filter((s) => s.id !== id));
    setSkillDetailsOpen((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const toggleCustom = useCallback((id: string) => {
    setCustomSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }, []);

  const toggleSkillDetails = useCallback((id: string) => {
    setSkillDetailsOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const updateSkillName = useCallback((id: string, name: string) => {
    setCustomSkills((prev) => prev.map((s) => (s.id === id ? { ...s, name: name.slice(0, 120) } : s)));
  }, []);

  const updateSkillInstruction = useCallback((id: string, instruction: string) => {
    setCustomSkills((prev) => prev.map((s) => (s.id === id ? { ...s, instruction: instruction.slice(0, 8000) } : s)));
  }, []);

  const onSkillImportUrlChange = useCallback((value: string) => {
    setSkillImportUrl(value);
    setSkillImportMessage((m) => (m ? "" : m));
  }, []);

  return {
    customSkills,
    setCustomSkills,
    newSkillName,
    setNewSkillName,
    newSkillBody,
    setNewSkillBody,
    skillImportUrl,
    setSkillImportUrl,
    skillImportBusy,
    setSkillImportBusy,
    skillImportMessage,
    setSkillImportMessage,
    skillDetailsOpen,
    onSkillImportUrlChange,
    addSkill,
    removeSkill,
    toggleCustom,
    toggleSkillDetails,
    updateSkillName,
    updateSkillInstruction
  };
}
