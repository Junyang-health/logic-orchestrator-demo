import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCopy, Link2, MessageSquare, Plus, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../i18n/useI18n";
import useUiStore, { type SkillKey } from "../../store/useUiStore";
import { mergeBranchSubgraphs } from "../../lib/graphBranch";
import { mindmapBranchSelectionToMarkdown } from "../../lib/mindmapMarkdown";
import {
  type PptDeckStyleId,
  type PptSlide,
  frameworkToMarkdown,
  frameworkToPptPrompt,
  readSourceFileSnippets
} from "../../lib/pptFrameworkExport";
import type { MessageKey } from "../../i18n/messages";
import type { MindmapJson } from "../../types/mindmap";

const ENRICH_BATCH_SIZE = 3;

const DECK_STYLE_ROWS: { id: PptDeckStyleId; name: MessageKey; blurb: MessageKey }[] = [
  { id: "consulting_mbb", name: "ppt_deck_style_mbb", blurb: "ppt_deck_blurb_mbb" },
  { id: "government", name: "ppt_deck_style_government", blurb: "ppt_deck_blurb_government" },
  { id: "academic", name: "ppt_deck_style_academic", blurb: "ppt_deck_blurb_academic" },
  { id: "creative", name: "ppt_deck_style_creative", blurb: "ppt_deck_blurb_creative" }
];

type ChatRow = { id: string; role: "user" | "assistant"; content: string };

type CustomSkillRow = { id: string; name: string; instruction: string; enabled: boolean };

function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function newId() {
  return `ppt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function slideFromServer(s: {
  id: string;
  title: string;
  subtitle: string;
  main: string;
  visual?: string;
  beat?: string;
}): PptSlide {
  return {
    id: s.id || newId(),
    title: s.title,
    subtitle: s.subtitle,
    beat: typeof s.beat === "string" ? s.beat : "",
    main: s.main,
    visual: typeof s.visual === "string" ? s.visual : ""
  };
}

function slidesToPptRequestPayload(slides: PptSlide[]) {
  return slides.map((s) => ({
    id: s.id,
    title: s.title,
    subtitle: s.subtitle,
    beat: s.beat,
    main: s.main,
    visual: s.visual
  }));
}

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

  const [customSkills, setCustomSkills] = useState<CustomSkillRow[]>([]);
  const [skillImportUrl, setSkillImportUrl] = useState("");
  const [skillImportBusy, setSkillImportBusy] = useState(false);
  const [skillImportMsg, setSkillImportMsg] = useState("");

  const [slides, setSlides] = useState<PptSlide[]>([]);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [genPhase, setGenPhase] = useState<
    | null
    | { kind: "skeleton" }
    | { kind: "enrich"; batch: number; batches: number }
    | { kind: "reconcile" }
  >(null);
  const [reconcileNote, setReconcileNote] = useState("");
  const [copyPromptFeedback, setCopyPromptFeedback] = useState<"ok" | "err" | null>(null);
  const copyPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (copyPromptTimerRef.current) clearTimeout(copyPromptTimerRef.current);
    };
  }, []);

  const [chatMessages, setChatMessages] = useState<ChatRow[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [targetSlideForChat, setTargetSlideForChat] = useState<string>("all");

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
      const res = await fetch(`${backendBase}/assistant/fetch-skill-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u })
      });
      const err = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : `Fetch failed (${res.status})`);
      }
      const data = (await res.json()) as { instruction: string; suggested_name: string; fetched_url?: string };
      setCustomSkills((prev) => [
        ...prev,
        {
          id: newId(),
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

  const onGenerate = useCallback(async () => {
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
    const mindmap_markdown = mindmapBranchSelectionToMarkdown(combined, selectedList);
    let source_snippets: { name: string; text: string }[] = [];
    try {
      source_snippets = await readSourceFileSnippets(sourceFiles);
    } catch {
      source_snippets = [];
    }
    const baseBody = {
      mindmap_markdown,
      intent: intent.trim(),
      audience: audience.trim(),
      page_count: pageCount,
      deck_style: deckStyle,
      style: style.trim(),
      custom_skills: customSkills
        .filter((s) => s.enabled && s.instruction.trim().length > 0)
        .map((s) => ({ name: s.name, instruction: s.instruction, enabled: true })),
      builtin_skills: {
        webSearch: skills.webSearch,
        financialAnalyst: skills.financialAnalyst
      },
      source_snippets,
      web_search_query: skills.webSearch ? webQuery.trim() || null : null
    };

    setReconcileNote("");
    setGenPhase({ kind: "skeleton" });
    setGenerateBusy(true);
    try {
      const skelRes = await fetch(`${backendBase}/assistant/ppt-framework/skeleton`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseBody)
      });
      if (!skelRes.ok) {
        const j = await skelRes.json().catch(() => ({}));
        const d = (j as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : `Skeleton failed (${skelRes.status})`);
      }
      const skelData = (await skelRes.json()) as {
        slides: { id: string; title: string; subtitle: string; main: string; visual?: string; beat?: string }[];
      };
      let current: PptSlide[] = (skelData.slides || []).map(slideFromServer);
      setSlides(current);
      setChatMessages([]);

      if (current.length === 0) {
        throw new Error(t("ppt_err_empty_slides"));
      }

      const n = current.length;
      const batches: number[][] = [];
      for (let i = 0; i < n; i += ENRICH_BATCH_SIZE) {
        batches.push(
          Array.from({ length: Math.min(ENRICH_BATCH_SIZE, n - i) }, (_, k) => i + k)
        );
      }

      for (let b = 0; b < batches.length; b++) {
        const indices = batches[b]!;
        setGenPhase({ kind: "enrich", batch: b + 1, batches: batches.length });
        const enrRes = await fetch(`${backendBase}/assistant/ppt-framework/enrich-batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...baseBody,
            slides: slidesToPptRequestPayload(current),
            indices
          })
        });
        if (!enrRes.ok) {
          const j = await enrRes.json().catch(() => ({}));
          const d = (j as { detail?: unknown }).detail;
          throw new Error(typeof d === "string" ? d : `Enrich failed (${enrRes.status})`);
        }
        const enrData = (await enrRes.json()) as {
          slides: { id: string; title: string; subtitle: string; main: string; visual?: string; beat?: string }[];
        };
        const batch = (enrData.slides || []).map(slideFromServer);
        const next = [...current];
        for (let k = 0; k < Math.min(batch.length, indices.length); k++) {
          const j = indices[k]!;
          const inc = batch[k]!;
          next[j] = {
            ...next[j]!,
            ...inc,
            id: next[j]!.id
          };
        }
        current = next;
        setSlides([...current]);
      }

      setGenPhase({ kind: "reconcile" });
      const recRes = await fetch(`${backendBase}/assistant/ppt-framework/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...baseBody,
          slides: slidesToPptRequestPayload(current)
        })
      });
      if (!recRes.ok) {
        const j = await recRes.json().catch(() => ({}));
        const d = (j as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : `Reconcile failed (${recRes.status})`);
      }
      const recData = (await recRes.json()) as {
        reply: string;
        slides: { id: string; title: string; subtitle: string; main: string; visual?: string; beat?: string }[];
      };
      setSlides((recData.slides || []).map(slideFromServer));
      setReconcileNote((recData.reply || "").trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("ppt_err_generate"));
    } finally {
      setGenPhase(null);
      setGenerateBusy(false);
    }
  }, [
    selectedList,
    intent,
    audience,
    pageCount,
    style,
    combined,
    backendBase,
    customSkills,
    skills,
    sourceFiles,
    webQuery,
    hasGraph,
    deckStyle,
    t
  ]);

  const contextPayload = useCallback(async () => {
    const mindmap_markdown = mindmapBranchSelectionToMarkdown(combined, selectedList);
    let source_snippets: { name: string; text: string }[] = [];
    try {
      source_snippets = await readSourceFileSnippets(sourceFiles);
    } catch {
      source_snippets = [];
    }
    return {
      mindmap_markdown,
      source_snippets,
      intent: intent.trim(),
      audience: audience.trim(),
      page_count: pageCount,
      style: style.trim(),
      deck_style: deckStyle
    };
  }, [combined, selectedList, sourceFiles, intent, audience, pageCount, style, deckStyle]);

  const onSendChat = useCallback(async () => {
    const text = chatDraft.trim();
    if (!text || chatBusy) return;
    if (slides.length === 0) {
      setError(t("ppt_err_chat_noslides"));
      return;
    }
    setError("");
    const userRow: ChatRow = { id: newId(), role: "user", content: text };
    const next = [...chatMessages, userRow];
    setChatMessages(next);
    setChatDraft("");
    setChatBusy(true);
    try {
      const ctx = await contextPayload();
      const target_slide_index =
        targetSlideForChat === "all" ? null : Math.max(0, parseInt(targetSlideForChat, 10) || 0);
      const res = await fetch(`${backendBase}/assistant/ppt-framework/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          slides: slides.map((s) => ({
            id: s.id,
            title: s.title,
            subtitle: s.subtitle,
            beat: s.beat,
            main: s.main,
            visual: s.visual
          })),
          mindmap_markdown: ctx.mindmap_markdown,
          intent: ctx.intent,
          audience: ctx.audience,
          page_count: ctx.page_count,
          style: ctx.style,
          deck_style: ctx.deck_style,
          target_slide_index,
          custom_skills: customSkills
            .filter((s) => s.enabled && s.instruction.trim().length > 0)
            .map((s) => ({ name: s.name, instruction: s.instruction, enabled: true })),
          builtin_skills: {
            webSearch: skills.webSearch,
            financialAnalyst: skills.financialAnalyst
          },
          source_snippets: ctx.source_snippets,
          web_search_query: skills.webSearch ? webQuery.trim() || null : null
        })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const d = (j as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : `Chat failed (${res.status})`);
      }
      const data = (await res.json()) as {
        reply: string;
        slides: { id: string; title: string; subtitle: string; main: string; visual?: string; beat?: string }[];
      };
      setSlides((data.slides || []).map(slideFromServer));
      setChatMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", content: (data.reply || "…").trim() || "…" }
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
    slides,
    chatMessages,
    backendBase,
    contextPayload,
    targetSlideForChat,
    customSkills,
    skills,
    webQuery,
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
      { id: newId(), title: t("ppt_slide_untitled"), subtitle: "", beat: "", main: "", visual: "" }
    ]);
  };

  const updateSlide = (index: number, field: keyof PptSlide, value: string) => {
    setSlides((s) =>
      s.map((sl, i) => (i === index ? { ...sl, [field]: value } : sl))
    );
  };

  const exportMd = () => {
    if (slides.length === 0) return;
    const row = DECK_STYLE_ROWS.find((r) => r.id === deckStyle) ?? DECK_STYLE_ROWS[0]!;
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
    const row = DECK_STYLE_ROWS.find((r) => r.id === deckStyle) ?? DECK_STYLE_ROWS[0]!;
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

      <div>
        <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{t("ppt_brief")}</div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t("ppt_intent")}
        </label>
        <textarea
          className="ios-field mb-2 min-h-[56px] w-full py-1.5 text-xs"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder={t("ppt_intent_ph")}
        />
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t("ppt_audience")}
        </label>
        <input
          className="ios-field mb-2 w-full text-xs"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder={t("ppt_audience_ph")}
        />
        <div className="mb-2 flex flex-wrap gap-2">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("ppt_pages")}
            </label>
            <input
              type="number"
              min={1}
              max={40}
              className="ios-field w-full text-xs"
              value={pageCount}
              onChange={(e) => setPageCount(Math.min(40, Math.max(1, Number(e.target.value) || 8)))}
            />
          </div>
        </div>
        <div className="mb-2">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("ppt_deck_style_label")}
          </label>
          <p className="mb-1.5 text-[9px] leading-snug text-slate-500 dark:text-slate-400">
            {t("ppt_deck_style_help")}
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {DECK_STYLE_ROWS.map((r) => (
              <button
                key={r.id}
                type="button"
                className={[
                  "rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium leading-snug transition",
                  deckStyle === r.id
                    ? "border-violet-300/80 bg-violet-50/90 text-stone-900 dark:border-violet-500/50 dark:bg-violet-950/40 dark:text-stone-50"
                    : "border-rose-100/50 bg-stone-50/70 text-stone-700 hover:bg-white/90 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-200"
                ].join(" ")}
                onClick={() => setDeckStyle(r.id)}
              >
                {t(r.name)}
              </button>
            ))}
          </div>
        </div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t("ppt_style")}
        </label>
        <textarea
          className="ios-field min-h-[48px] w-full py-1.5 text-xs"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          placeholder={t("ppt_style_ph")}
        />
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{t("ppt_skills")}</div>
        <p className="mb-2 text-[10px] text-slate-500 dark:text-slate-400">{t("ppt_skills_hint")}</p>
        <div className="mb-2 flex flex-wrap gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200/80 bg-white/80 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-900/60">
            <input type="checkbox" checked={skills.webSearch} onChange={() => toggleSkill("webSearch" as SkillKey)} />
            <span>{t("skills_web_lens")}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200/80 bg-white/80 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-900/60">
            <input
              type="checkbox"
              checked={skills.financialAnalyst}
              onChange={() => toggleSkill("financialAnalyst" as SkillKey)}
            />
            <span>{t("skills_finance_lens")}</span>
          </label>
        </div>
        {skills.webSearch ? (
          <input
            className="ios-field mb-2 w-full text-xs"
            value={webQuery}
            onChange={(e) => setWebQuery(e.target.value)}
            placeholder={t("ppt_web_q_ph")}
          />
        ) : null}
        <div className="mb-2 rounded-md border border-slate-200/80 bg-white/70 p-2 dark:border-slate-600 dark:bg-slate-900/50">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
            <Link2 className="h-3 w-3" />
            {t("ppt_gh_skill")}
          </div>
          <div className="flex gap-1">
            <input
              className="ios-field min-w-0 flex-1 font-mono text-[10px]"
              value={skillImportUrl}
              onChange={(e) => setSkillImportUrl(e.target.value)}
              placeholder="https://raw.githubusercontent.com/…"
            />
            <button
              type="button"
              className="ios-button shrink-0 px-2 text-[10px]"
              disabled={skillImportBusy}
              onClick={onFetchSkillUrl}
            >
              {skillImportBusy ? t("skills_fetching") : t("skills_fetch")}
            </button>
          </div>
          {skillImportMsg ? <div className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">{skillImportMsg}</div> : null}
        </div>
        {customSkills.length > 0 ? (
          <ul className="space-y-1.5">
            {customSkills.map((s) => (
              <li key={s.id} className="rounded-md border border-slate-200/60 bg-slate-50/80 p-2 dark:border-slate-600 dark:bg-slate-800/50">
                <div className="mb-1 flex items-center justify-between gap-1">
                  <input
                    className="ios-field min-w-0 flex-1 py-0.5 text-[11px]"
                    value={s.name}
                    onChange={(e) =>
                      setCustomSkills((p) => p.map((r) => (r.id === s.id ? { ...r, name: e.target.value } : r)))
                    }
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <label className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={() =>
                          setCustomSkills((p) => p.map((r) => (r.id === s.id ? { ...r, enabled: !r.enabled } : r)))
                        }
                      />
                      {t("ppt_use_skill")}
                    </label>
                    <button
                      type="button"
                      className="rounded p-0.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400"
                      title={t("skills_remove")}
                      onClick={() => setCustomSkills((p) => p.filter((r) => r.id !== s.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <textarea
                  className="ios-field min-h-[48px] w-full py-1 text-[10px]"
                  value={s.instruction}
                  onChange={(e) =>
                    setCustomSkills((p) => p.map((r) => (r.id === s.id ? { ...r, instruction: e.target.value } : r)))
                  }
                />
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-500">
          {t("ppt_source_hint", { n: sourceFiles.length })}
        </p>
      </div>

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

      <button
        type="button"
        className="ios-button-primary w-full py-2 text-sm font-semibold disabled:opacity-50"
        disabled={!canGenerate}
        onClick={onGenerate}
      >
        {generateBusy
          ? genPhase?.kind === "skeleton"
            ? t("ppt_gen_skeleton")
            : genPhase?.kind === "enrich"
              ? t("ppt_gen_enrich", { n: genPhase.batch, total: genPhase.batches })
              : genPhase?.kind === "reconcile"
                ? t("ppt_gen_reconcile")
                : t("ppt_generating")
          : t("ppt_generate")}
      </button>
      {generateBusy && genPhase ? (
        <p className="text-center text-[10px] text-slate-500 dark:text-slate-400">
          {t("ppt_gen_step_hint")}
        </p>
      ) : null}

      {slides.length > 0 ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{t("ppt_deck")}</div>
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" className="ios-button py-0.5 text-[10px]" onClick={exportPrompt}>
                {t("ppt_export_prompt")}
              </button>
              <button
                type="button"
                className="ios-button flex items-center gap-0.5 py-0.5 text-[10px]"
                onClick={() => void copyPptPrompt()}
                title={t("ppt_copy_prompt_title")}
              >
                <ClipboardCopy className="h-3 w-3 shrink-0 opacity-80" />
                {t("ppt_copy_prompt")}
              </button>
              {copyPromptFeedback === "ok" ? (
                <span className="text-[9px] text-emerald-600 dark:text-emerald-400">{t("ppt_copied")}</span>
              ) : copyPromptFeedback === "err" ? (
                <span className="text-[9px] text-rose-600 dark:text-rose-400">{t("ppt_copy_failed")}</span>
              ) : null}
              <button type="button" className="ios-button py-0.5 text-[10px]" onClick={exportMd}>
                {t("ppt_export_md")}
              </button>
            </div>
          </div>
          <p className="mb-2 text-[10px] text-slate-500 dark:text-slate-400">{t("ppt_deck_edit_hint")}</p>
          <div className="space-y-3">
            {slides.map((sl, i) => (
              <div
                key={sl.id}
                className="rounded-lg border border-rose-100/50 bg-white/60 p-2 shadow-pastel dark:border-violet-900/30 dark:bg-slate-900/40"
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    {t("ppt_slide_n", { n: i + 1 })}
                  </span>
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      className="ios-button py-0 px-1.5 text-[10px]"
                      onClick={() => moveSlide(i, -1)}
                      disabled={i === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ios-button py-0 px-1.5 text-[10px]"
                      onClick={() => moveSlide(i, 1)}
                      disabled={i === slides.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="ios-button py-0 px-1.5 text-[10px] text-rose-700 dark:text-rose-300"
                      onClick={() => removeSlide(i)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <input
                  className="ios-field mb-1 w-full py-0.5 text-xs font-semibold"
                  value={sl.title}
                  onChange={(e) => updateSlide(i, "title", e.target.value)}
                />
                <input
                  className="ios-field mb-1 w-full py-0.5 text-[11px]"
                  value={sl.subtitle}
                  onChange={(e) => updateSlide(i, "subtitle", e.target.value)}
                />
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("ppt_beat")}
                </div>
                <input
                  className="ios-field mb-1.5 w-full py-0.5 text-[11px] italic"
                  value={sl.beat}
                  onChange={(e) => updateSlide(i, "beat", e.target.value)}
                  placeholder={t("ppt_beat_ph")}
                />
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("ppt_section_content")}
                </div>
                <textarea
                  className="ios-field mb-2 min-h-[72px] w-full text-[11px] leading-relaxed"
                  value={sl.main}
                  onChange={(e) => updateSlide(i, "main", e.target.value)}
                  placeholder={t("ppt_main_ph")}
                />
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("ppt_section_visual")}
                </div>
                <p className="mb-1 text-[9px] leading-snug text-slate-500 dark:text-slate-400">
                  {t("ppt_visual_help")}
                </p>
                <textarea
                  className="ios-field min-h-[64px] w-full text-[11px] leading-relaxed"
                  value={sl.visual}
                  onChange={(e) => updateSlide(i, "visual", e.target.value)}
                  placeholder={t("ppt_visual_ph")}
                />
              </div>
            ))}
            <button type="button" className="ios-button w-full py-1.5 text-xs" onClick={addSlide}>
              <Plus className="mr-1 inline h-3.5 w-3.5" />
              {t("ppt_add_slide")}
            </button>
          </div>
        </div>
      ) : null}

      {slides.length > 0 ? (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
            <MessageSquare className="h-3.5 w-3.5" />
            {t("ppt_refine_title")}
          </div>
          <p className="mb-2 text-[10px] text-slate-500 dark:text-slate-400">{t("ppt_refine_hint")}</p>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="text-[10px] text-slate-500 dark:text-slate-400">{t("ppt_chat_focus")}</label>
            <select
              className="ios-select max-w-full py-0.5 text-[10px]"
              value={targetSlideForChat}
              onChange={(e) => setTargetSlideForChat(e.target.value)}
            >
              <option value="all">{t("ppt_focus_all")}</option>
              {slides.map((_, i) => (
                <option key={i} value={String(i)}>
                  {t("ppt_focus_slide", { n: i + 1 })}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-2 max-h-[200px] space-y-1.5 overflow-auto rounded-md border border-slate-200/60 bg-slate-50/80 p-2 dark:border-slate-600 dark:bg-slate-800/50">
            {chatMessages.length === 0 ? (
              <div className="text-[10px] text-slate-500">{t("ppt_chat_empty")}</div>
            ) : (
              chatMessages.map((m) => (
                <div
                  key={m.id}
                  className={[
                    "rounded px-2 py-1 text-[10px] leading-relaxed",
                    m.role === "user"
                      ? "ml-4 border border-rose-100/50 bg-rose-50/50 dark:border-violet-800/30 dark:bg-violet-950/20"
                      : "mr-4 border border-slate-200/60 bg-white dark:border-slate-600 dark:bg-slate-900/60"
                  ].join(" ")}
                >
                  <div className="text-[9px] font-bold uppercase text-slate-400">{m.role === "user" ? "You" : "AI"}</div>
                  {m.content}
                </div>
              ))
            )}
          </div>
          <textarea
            className="ios-field mb-1 min-h-[56px] w-full text-xs"
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            placeholder={t("ppt_chat_ph")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void onSendChat();
              }
            }}
          />
          <button
            type="button"
            className="ios-button-primary w-full py-1.5 text-xs disabled:opacity-50"
            disabled={chatBusy || !chatDraft.trim()}
            onClick={onSendChat}
          >
            {chatBusy ? t("ppt_chat_sending") : t("ppt_chat_send")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
