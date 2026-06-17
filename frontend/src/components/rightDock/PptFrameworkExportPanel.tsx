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
import PptFrameworkSlideBuildSection from "./pptFramework/PptFrameworkSlideBuildSection";
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

  const { sourceFiles, skills, toggleSkill, pptSlides, setPptSlides } = useUiStore(
    useShallow((s) => ({
      sourceFiles: s.sourceFiles,
      skills: s.skills,
      toggleSkill: s.toggleSkill,
      pptSlides: s.pptSlides,
      setPptSlides: s.setPptSlides
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

  const [reconcileNote, setReconcileNote] = useState("");
  const [copyPromptFeedback, setCopyPromptFeedback] = useState<"ok" | "err" | null>(null);
  const copyPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [error, setError] = useState("");

  const [chatMessages, setChatMessages] = useState<PptChatRow[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [targetSlideForChat, setTargetSlideForChat] = useState("all");

  const slides = pptSlides;
  const slidesRef = useRef(pptSlides);
  const chatMessagesRef = useRef<PptChatRow[]>([]);
  slidesRef.current = pptSlides;
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
    setPptSlides,
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

  const deckTitleForBuild = useMemo(
    () => (intent.trim().length > 0 ? intent.trim().slice(0, 200) : t("ppt_md_title")),
    [intent, t]
  );

  const outlineReady = slides.length > 0;

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
      setPptSlides((data.slides || []).map(slideFromServer));
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
    setPptSlides((s) => {
      const j = index + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
  };

  const removeSlide = (index: number) => {
    setPptSlides((s) => s.filter((_, i) => i !== index));
  };

  const addSlide = () => {
    setPptSlides((s) => [
      ...s,
      { id: newPptSlideId(), title: t("ppt_slide_untitled"), subtitle: "", beat: "", main: "", visual: "" }
    ]);
  };

  const updateSlide = (index: number, field: keyof PptSlide, value: string) => {
    setPptSlides((s) => s.map((sl, i) => (i === index ? { ...sl, [field]: value } : sl)));
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
      deckStyleBlurb: t(row.blurb),
      layoutRulesBlock: t("ppt_layout_rules_block")
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
      layoutRules: t("ppt_layout_rules_block"),
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
      <div className="border-b border-slate-200/80 pb-3 dark:border-slate-700/70">
        <div className="text-base font-semibold tracking-tight text-slate-950 dark:text-slate-50">PPT framework</div>
        <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200/80 rounded-lg border border-slate-200/80 bg-white/70 text-center dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900/45">
          {[
            ["Branches", selectedList.length],
            ["Nodes", subGraph.nodes.length],
            ["Sources", sourceFiles.length]
          ].map(([label, value]) => (
            <div key={label} className="px-2 py-2">
              <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">{value}</div>
              <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{label}</div>
            </div>
          ))}
        </div>
        {selectedList.length === 0 ? (
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">{t("export_err_select")}</p>
        ) : null}
      </div>

      <section className="space-y-3">
        <div>
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-50">Create outline</div>
          <div className="mt-1 h-px bg-slate-200/80 dark:bg-slate-700/70" />
        </div>
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
          showAdvanced={false}
        />

        {error ? (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100">
            {error}
          </div>
        ) : null}

        {reconcileNote ? (
          <div className="mt-3 rounded-md border border-slate-200/80 bg-slate-50/90 px-2 py-1.5 text-[11px] leading-relaxed text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
            <div className="mb-0.5 text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400">
              {t("ppt_reconcile_label")}
            </div>
            {reconcileNote}
          </div>
        ) : null}

        <div className="mt-3">
          <PptFrameworkGenerateSection
            canGenerate={canGenerate}
            generateBusy={generateBusy}
            genPhase={genPhase}
            onGenerate={handleGenerate}
            onCancel={cancelGeneration}
          />
        </div>
      </section>

      <section className="space-y-3 border-t border-slate-200/80 pt-4 dark:border-slate-700/70">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-50">Review and build</div>
          {outlineReady ? (
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{slides.length} slides</div>
          ) : null}
        </div>

        {outlineReady ? (
          <>
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
              showExportActions={false}
            />
            <div className="mt-5">
              <PptFrameworkSlideBuildSection backendBase={backendBase} deckTitle={deckTitleForBuild} deckStyle={deckStyle} slides={slides} />
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-[12px] text-slate-500 dark:border-slate-600 dark:text-slate-400">
            Generate an outline to review slides and start the deck build.
          </div>
        )}
      </section>

      <details className="rounded-lg border border-slate-200/80 bg-white/50 p-3 dark:border-slate-700/70 dark:bg-slate-900/30">
        <summary className="cursor-pointer select-none text-xs font-semibold text-slate-700 dark:text-slate-200">
          Options
        </summary>
        <div className="mt-3 space-y-4 border-t border-slate-200/70 pt-3 dark:border-slate-700/70">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("ppt_enrich_batch")}
            </label>
            <input
              type="number"
              min={1}
              max={8}
              className="ios-field w-28 text-xs"
              value={enrichBatchSize}
              onChange={(e) => setEnrichBatchSize(Math.min(8, Math.max(1, Number(e.target.value) || 3)))}
              title={t("ppt_enrich_batch_help")}
            />
            <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">{t("ppt_enrich_batch_help")}</p>
          </div>

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

          {outlineReady ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="ios-button py-1 text-xs" onClick={exportPrompt}>
                  {t("ppt_export_prompt")}
                </button>
                <button type="button" className="ios-button py-1 text-xs" onClick={() => void copyPptPrompt()}>
                  {t("ppt_copy_prompt")}
                </button>
                <button type="button" className="ios-button py-1 text-xs" onClick={exportMd}>
                  {t("ppt_export_md")}
                </button>
                {copyPromptFeedback === "ok" ? (
                  <span className="self-center text-[10px] text-emerald-600 dark:text-emerald-400">{t("ppt_copied")}</span>
                ) : copyPromptFeedback === "err" ? (
                  <span className="self-center text-[10px] text-rose-600 dark:text-rose-400">{t("ppt_copy_failed")}</span>
                ) : null}
              </div>
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
            </>
          ) : null}
        </div>
      </details>
    </div>
  );
}
