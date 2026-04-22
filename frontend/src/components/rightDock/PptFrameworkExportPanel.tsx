import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../i18n/useI18n";
import useUiStore from "../../store/useUiStore";
import { mergeBranchSubgraphs } from "../../lib/graphBranch";
import {
  type PptDeckStyleId,
  type PptSlide,
  frameworkToMarkdown,
  frameworkToPptPrompt
} from "../../lib/pptFrameworkExport";
import { downloadTextFile } from "../../lib/fileDownload";
import { postJson } from "../../lib/postJson";
import { postPptChat } from "../../lib/pptFrameworkApi";
import {
  buildPptFrameworkRequestBody,
  newPptSlideId,
  slideFromServer,
  slidesToPptRequestPayload
} from "../../lib/pptFrameworkShared";
import {
  getEnvEnrichBatchSize,
  loadPptCustomSkillsFromStorage,
  readStoredEnrichBatchSize,
  scheduleSavePptCustomSkills,
  writeStoredEnrichBatchSize
} from "../../lib/pptFrameworkUserSettings";
import type { MindmapJson } from "../../types/mindmap";
import { PPT_DECK_STYLE_ROWS } from "./pptFramework/constants";
import PptFrameworkBriefSection from "./pptFramework/PptFrameworkBriefSection";
import PptFrameworkDeckSection from "./pptFramework/PptFrameworkDeckSection";
import PptFrameworkGenerateSection from "./pptFramework/PptFrameworkGenerateSection";
import PptFrameworkRefineSection from "./pptFramework/PptFrameworkRefineSection";
import PptFrameworkSkillsSection from "./pptFramework/PptFrameworkSkillsSection";
import { usePptFrameworkGeneration } from "./pptFramework/usePptFrameworkGeneration";
import type { PptChatRow, PptCustomSkillRow } from "./pptFramework/types";

type Props = {
  backendBase: string;
  combined: MindmapJson;
  selectedList: string[];
};

export default function PptFrameworkExportPanel(props: Props) {
  const { t } = useI18n();
  const { backendBase, combined, selectedList } = props;

  const { sourceFiles, skills, toggleSkill } = useUiStore(
    useShallow((s) => ({
      sourceFiles: s.sourceFiles,
      skills: s.skills,
      toggleSkill: s.toggleSkill
    }))
  );

  const [intent, setIntent] = useState("");
  const [audience, setAudience] = useState("");
  const [pageCount, setPageCount] = useState(8);
  const [deckStyle, setDeckStyle] = useState<PptDeckStyleId>("consulting_mbb");
  const [style, setStyle] = useState("");
  const [webQuery, setWebQuery] = useState("");

  const [customSkills, setCustomSkills] = useState<PptCustomSkillRow[]>(() => loadPptCustomSkillsFromStorage());
  const [enrichBatchSize, setEnrichBatchSize] = useState(
    () => readStoredEnrichBatchSize() ?? getEnvEnrichBatchSize()
  );
  const [skillImportUrl, setSkillImportUrl] = useState("");
  const [skillImportBusy, setSkillImportBusy] = useState(false);
  const [skillImportMsg, setSkillImportMsg] = useState("");

  const [slides, setSlides] = useState<PptSlide[]>([]);
  const [reconcileNote, setReconcileNote] = useState("");
  const [copyPromptFeedback, setCopyPromptFeedback] = useState<"ok" | "err" | null>(null);
  const copyPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [error, setError] = useState("");

  const [chatMessages, setChatMessages] = useState<PptChatRow[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [targetSlideForChat, setTargetSlideForChat] = useState("all");

  const slidesRef = useRef(slides);
  const chatMessagesRef = useRef<PptChatRow[]>([]);
  slidesRef.current = slides;
  chatMessagesRef.current = chatMessages;

  useEffect(() => {
    return () => {
      if (copyPromptTimerRef.current) clearTimeout(copyPromptTimerRef.current);
    };
  }, []);

  useEffect(() => {
    writeStoredEnrichBatchSize(enrichBatchSize);
  }, [enrichBatchSize]);

  useEffect(() => {
    scheduleSavePptCustomSkills(customSkills);
  }, [customSkills]);

  const {
    runGeneration,
    cancelGeneration,
    generateBusy,
    genPhase
  } = usePptFrameworkGeneration({
    backendBase,
    combined,
    selectedList,
    intent,
    audience,
    pageCount,
    deckStyle,
    style,
    customSkills,
    skills,
    webQuery,
    sourceFiles,
    t,
    setSlides,
    setChatMessages,
    setReconcileNote,
    setError,
    enrichBatchSize
  });

  const canGenerate = useMemo(
    () => selectedList.length > 0 && intent.trim().length > 0 && !generateBusy,
    [selectedList.length, intent, generateBusy]
  );

  const subGraph = useMemo(() => mergeBranchSubgraphs(selectedList, combined), [selectedList, combined]);
  const hasGraph = subGraph.nodes.length > 0;

  const onFetchSkillUrl = useCallback(async () => {
    const u = skillImportUrl.trim();
    if (!u || skillImportBusy) return;
    setSkillImportBusy(true);
    setSkillImportMsg("");
    setError("");
    try {
      const data = await postJson<{ instruction: string; suggested_name: string; fetched_url?: string }>(
        `${backendBase}/assistant/fetch-skill-url`,
        { url: u }
      );
      setCustomSkills((prev) => [
        ...prev,
        {
          id: newPptSlideId(),
          name: data.suggested_name || t("ppt_skill_remote_name"),
          instruction: (data.instruction || "").slice(0, 8000),
          enabled: true
        }
      ]);
      setSkillImportUrl("");
      setSkillImportMsg(t("ppt_skill_added"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Skill fetch failed");
    } finally {
      setSkillImportBusy(false);
    }
  }, [backendBase, skillImportUrl, skillImportBusy, t]);

  const handleGenerate = useCallback(() => {
    setError("");
    if (selectedList.length === 0) {
      setError(t("export_err_select"));
      return;
    }
    if (!intent.trim()) {
      setError(t("ppt_err_intent"));
      return;
    }
    if (!hasGraph) {
      setError(t("export_err_empty"));
      return;
    }
    void runGeneration();
  }, [selectedList.length, intent, hasGraph, runGeneration, t]);

  const onSendChat = useCallback(async () => {
    const text = chatDraft.trim();
    if (!text || chatBusy) return;
    if (slidesRef.current.length === 0) {
      setError(t("ppt_err_chat_noslides"));
      return;
    }
    setError("");
    const userRow: PptChatRow = { id: newPptSlideId(), role: "user", content: text };
    const next = [...chatMessagesRef.current, userRow];
    setChatMessages(next);
    setChatDraft("");
    setChatBusy(true);
    try {
      const baseBody = await buildPptFrameworkRequestBody({
        combined,
        selectedList,
        intent,
        audience,
        pageCount,
        deckStyle,
        style,
        customSkills,
        skills,
        webQuery,
        sourceFiles,
        backendBase
      });
      const target_slide_index =
        targetSlideForChat === "all" ? null : Math.max(0, parseInt(targetSlideForChat, 10) || 0);
      const data = await postPptChat(backendBase, {
        ...baseBody,
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        slides: slidesToPptRequestPayload(slidesRef.current),
        target_slide_index
      });
      setSlides((data.slides || []).map(slideFromServer));
      setChatMessages((prev) => [
        ...prev,
        { id: newPptSlideId(), role: "assistant", content: (data.reply || "…").trim() || "…" }
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("ppt_err_chat"));
      setChatMessages((prev) => prev.filter((m) => m.id !== userRow.id));
    } finally {
      setChatBusy(false);
    }
  }, [
    chatDraft,
    chatBusy,
    backendBase,
    combined,
    selectedList,
    intent,
    audience,
    pageCount,
    deckStyle,
    style,
    customSkills,
    skills,
    webQuery,
    sourceFiles,
    targetSlideForChat,
    t
  ]);

  const moveSlide = (index: number, dir: -1 | 1) => {
    setSlides((s) => {
      const j = index + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
  };

  const removeSlide = (index: number) => {
    setSlides((s) => s.filter((_, i) => i !== index));
  };

  const addSlide = () => {
    setSlides((s) => [
      ...s,
      { id: newPptSlideId(), title: t("ppt_slide_untitled"), subtitle: "", beat: "", main: "", visual: "" }
    ]);
  };

  const updateSlide = (index: number, field: keyof PptSlide, value: string) => {
    setSlides((s) => s.map((sl, i) => (i === index ? { ...sl, [field]: value } : sl)));
  };

  const exportMd = () => {
    if (slides.length === 0) return;
    const row = PPT_DECK_STYLE_ROWS.find((r) => r.id === deckStyle) ?? PPT_DECK_STYLE_ROWS[0]!;
    const md = frameworkToMarkdown(slides, t("ppt_md_title"), {
      storyBeat: t("ppt_beat"),
      sectionContent: t("ppt_section_content"),
      sectionVisual: t("ppt_section_visual"),
      visualEmpty: t("ppt_visual_empty_md"),
      deckStyleSectionTitle: t("ppt_deck_style_md_h"),
      deckStyleName: t(row.name),
      deckStyleBlurb: t(row.blurb)
    });
    downloadTextFile(`ppt-framework-${Date.now()}.md`, md, "text/markdown;charset=utf-8");
  };

  const getPptPromptText = useCallback((): string => {
    if (slides.length === 0) return "";
    const row = PPT_DECK_STYLE_ROWS.find((r) => r.id === deckStyle) ?? PPT_DECK_STYLE_ROWS[0]!;
    return frameworkToPptPrompt(slides, {
      intent,
      audience,
      style,
      deckStyleName: t(row.name),
      deckStyleBlurb: t(row.blurb),
      i18n: {
        contentLabel: t("ppt_section_content"),
        visualLabel: t("ppt_section_visual"),
        visualFallback: t("ppt_prompt_visual_fb")
      }
    });
  }, [slides, deckStyle, intent, audience, style, t]);

  const exportPrompt = () => {
    const p = getPptPromptText();
    if (!p) return;
    downloadTextFile(`ppt-generator-prompt-${Date.now()}.txt`, p, "text/plain;charset=utf-8");
  };

  const copyPptPrompt = useCallback(async () => {
    const p = getPptPromptText();
    if (!p) return;
    if (copyPromptTimerRef.current) clearTimeout(copyPromptTimerRef.current);
    setCopyPromptFeedback(null);
    try {
      await navigator.clipboard.writeText(p);
      setCopyPromptFeedback("ok");
      copyPromptTimerRef.current = setTimeout(() => {
        setCopyPromptFeedback(null);
        copyPromptTimerRef.current = null;
      }, 2000);
    } catch {
      setCopyPromptFeedback("err");
      copyPromptTimerRef.current = setTimeout(() => {
        setCopyPromptFeedback(null);
        copyPromptTimerRef.current = null;
      }, 3000);
    }
  }, [getPptPromptText]);

  return (
    <div className="space-y-4 text-sm text-slate-800 dark:text-slate-100">
      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{t("ppt_intro")}</p>

      <PptFrameworkBriefSection
        intent={intent}
        onIntent={setIntent}
        audience={audience}
        onAudience={setAudience}
        pageCount={pageCount}
        onPageCount={setPageCount}
        deckStyle={deckStyle}
        onDeckStyle={setDeckStyle}
        style={style}
        onStyle={setStyle}
        enrichBatchSize={enrichBatchSize}
        onEnrichBatchSize={setEnrichBatchSize}
      />

      <PptFrameworkSkillsSection
        skills={skills}
        toggleSkill={toggleSkill}
        webQuery={webQuery}
        onWebQuery={setWebQuery}
        customSkills={customSkills}
        onSetCustomSkills={setCustomSkills}
        skillImportUrl={skillImportUrl}
        onSkillImportUrl={setSkillImportUrl}
        skillImportBusy={skillImportBusy}
        onFetchSkillUrl={onFetchSkillUrl}
        skillImportMsg={skillImportMsg}
        sourceFileCount={sourceFiles.length}
      />

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      {reconcileNote ? (
        <div className="rounded-md border border-slate-200/80 bg-slate-50/90 px-2 py-1.5 text-[11px] leading-relaxed text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
          <div className="mb-0.5 text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400">
            {t("ppt_reconcile_label")}
          </div>
          {reconcileNote}
        </div>
      ) : null}

      <PptFrameworkGenerateSection
        canGenerate={canGenerate}
        generateBusy={generateBusy}
        genPhase={genPhase}
        onGenerate={handleGenerate}
        onCancel={cancelGeneration}
      />

      <PptFrameworkDeckSection
        slides={slides}
        copyPromptFeedback={copyPromptFeedback}
        onExportPrompt={exportPrompt}
        onCopyPptPrompt={copyPptPrompt}
        onExportMd={exportMd}
        onMoveSlide={moveSlide}
        onRemoveSlide={removeSlide}
        onAddSlide={addSlide}
        onUpdateSlide={updateSlide}
      />

      <PptFrameworkRefineSection
        slideCount={slides.length}
        chatMessages={chatMessages}
        targetSlideForChat={targetSlideForChat}
        onTargetSlide={setTargetSlideForChat}
        chatDraft={chatDraft}
        onChatDraft={setChatDraft}
        onSendChat={onSendChat}
        chatBusy={chatBusy}
      />
    </div>
  );
}
