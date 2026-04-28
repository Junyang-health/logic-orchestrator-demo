import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../i18n/useI18n";
import useUiStore from "../../store/useUiStore";
import { mergeBranchSubgraphs } from "../../lib/graphBranch";
import { downloadTextFile } from "../../lib/fileDownload";
import {
  mapNodesForWord,
  postWordChatFramework,
  postWordFinalMarkdown,
  postWordGapReview,
  postWordGenerateFramework,
  type WordChapter,
  type WordChatMessage,
  type WordGapItem,
  type WordNodePromptItem
} from "../../lib/wordReportApi";
import type { MindmapJson } from "../../types/mindmap";

const SKILL_URL =
  "https://github.com/bytedance/deer-flow/blob/main/skills/public/consulting-analysis/SKILL.md";

type Props = {
  backendBase: string;
  combined: MindmapJson;
  selectedList: string[];
};

export default function WordReportExportPanel(props: Props) {
  const { t, locale } = useI18n();
  const { backendBase, combined, selectedList } = props;
  const { setAssistantActive, setAssistantOverlayOpen, setSandboxMode } = useUiStore(
    useShallow((s) => ({
      setAssistantActive: s.setAssistantActive,
      setAssistantOverlayOpen: s.setAssistantOverlayOpen,
      setSandboxMode: s.setSandboxMode
    }))
  );

  const subgraph = useMemo(() => {
    if (selectedList.length === 0) return null;
    return mergeBranchSubgraphs(selectedList, combined);
  }, [combined, selectedList]);

  const nodePayload = useMemo(() => {
    if (!subgraph) return [];
    return subgraph.nodes.map(mapNodesForWord);
  }, [subgraph]);

  const nodeLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodePayload) {
      m.set(n.id, String(n.label || "").trim() || n.id);
    }
    return m;
  }, [nodePayload]);

  const [intent, setIntent] = useState("");
  const [audience, setAudience] = useState("");
  const [sourceNotes, setSourceNotes] = useState("");
  const [frameworkSelection, setFrameworkSelection] = useState("");
  const [chapters, setChapters] = useState<WordChapter[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [chatTarget, setChatTarget] = useState<string | "all">("all");
  const [chatMessages, setChatMessages] = useState<WordChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");

  const [gapSummary, setGapSummary] = useState("");
  const [gapSufficient, setGapSufficient] = useState<boolean | null>(null);
  const [gapItems, setGapItems] = useState<WordGapItem[]>([]);
  const [nodeAssistantPrompts, setNodeAssistantPrompts] = useState<WordNodePromptItem[]>([]);
  const [assistantPrompt, setAssistantPrompt] = useState("");

  const outputLocale = locale === "zh" ? "zh_CN" : "en";

  const runGenerate = useCallback(async () => {
    setError("");
    if (!subgraph?.nodes.length) {
      setError(t("export_word_err_branches"));
      return;
    }
    if (!intent.trim()) {
      setError(t("export_word_err_intent"));
      return;
    }
    setBusy(true);
    try {
      const res = await postWordGenerateFramework(backendBase, {
        intent: intent.trim(),
        target_audience: audience.trim(),
        output_locale: outputLocale,
        source_corpus: sourceNotes.trim(),
        nodes: nodePayload,
        edges: subgraph.edges
      });
      setFrameworkSelection(res.framework_selection || "");
      setChapters(res.chapters);
      setChatMessages([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [audience, backendBase, intent, nodePayload, outputLocale, sourceNotes, subgraph, t]);

  const runChat = useCallback(async () => {
    const text = chatDraft.trim();
    if (!text || !chapters.length || !subgraph) return;
    setError("");
    setBusy(true);
    const nextMsgs: WordChatMessage[] = [...chatMessages, { role: "user", content: text }];
    setChatDraft("");
    try {
      const res = await postWordChatFramework(backendBase, {
        intent: intent.trim(),
        target_audience: audience.trim(),
        source_corpus: sourceNotes.trim(),
        framework_selection: frameworkSelection,
        nodes: nodePayload,
        edges: subgraph.edges,
        chapters,
        messages: nextMsgs,
        target_chapter_id: chatTarget === "all" ? null : chatTarget
      });
      setChapters(res.chapters);
      if (res.framework_selection) setFrameworkSelection(res.framework_selection);
      setChatMessages([...nextMsgs, { role: "assistant", content: res.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [
    audience,
    backendBase,
    chatDraft,
    chatMessages,
    chatTarget,
    chapters,
    frameworkSelection,
    intent,
    nodePayload,
    sourceNotes,
    subgraph
  ]);

  const runGap = useCallback(async () => {
    setError("");
    if (!chapters.length || !subgraph) {
      setError(t("export_word_err_framework"));
      return;
    }
    setBusy(true);
    try {
      const res = await postWordGapReview(backendBase, {
        intent: intent.trim(),
        target_audience: audience.trim(),
        source_corpus: sourceNotes.trim(),
        nodes: nodePayload,
        edges: subgraph.edges,
        framework_selection: frameworkSelection,
        chapters
      });
      setGapSufficient(res.sufficient);
      setGapSummary(res.summary);
      setGapItems(res.gaps || []);
      setNodeAssistantPrompts(res.node_assistant_prompts || []);
      setAssistantPrompt(res.assistant_completion_prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [audience, backendBase, chapters, frameworkSelection, intent, nodePayload, sourceNotes, subgraph, t]);

  const runDownload = useCallback(async () => {
    setError("");
    if (!chapters.length || !subgraph) {
      setError(t("export_word_err_framework"));
      return;
    }
    setBusy(true);
    try {
      const res = await postWordFinalMarkdown(backendBase, {
        intent: intent.trim(),
        target_audience: audience.trim(),
        source_corpus: sourceNotes.trim(),
        nodes: nodePayload,
        edges: subgraph.edges,
        framework_selection: frameworkSelection,
        chapters,
        include_chapter_writing_prompts: true,
        include_visual_ideas: true
      });
      downloadTextFile(
        res.filename || "word-export.md",
        res.markdown,
        "text/markdown;charset=utf-8"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [audience, backendBase, chapters, frameworkSelection, intent, nodePayload, sourceNotes, subgraph, t]);

  const openAssistant = useCallback(() => {
    setAssistantActive(true);
    setSandboxMode(true);
    setAssistantOverlayOpen(true);
  }, [setAssistantActive, setAssistantOverlayOpen, setSandboxMode]);

  const updateChapter = useCallback((id: string, patch: Partial<WordChapter>) => {
    setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  return (
    <div className="space-y-3 text-xs text-slate-800 dark:text-slate-100">
      <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">{t("export_word_intro")}</p>
      <a
        href={SKILL_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-[11px] font-medium text-sky-700 underline dark:text-sky-400"
      >
        {t("export_word_skill_link")}
      </a>

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          {t("export_word_intent")} <span className="text-rose-600">*</span>
        </span>
        <textarea
          className="ios-field mt-1 w-full min-h-[4rem] px-2 py-1.5"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder={t("export_word_intent_ph")}
        />
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          {t("export_word_audience")}
        </span>
        <input
          className="ios-field mt-1 w-full px-2 py-1.5"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder={t("export_word_audience_ph")}
        />
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          {t("export_word_source_corpus")}
        </span>
        <textarea
          className="ios-field mt-1 w-full min-h-[4rem] px-2 py-1.5"
          value={sourceNotes}
          onChange={(e) => setSourceNotes(e.target.value)}
          placeholder={t("export_word_source_corpus_ph")}
        />
      </label>

      <button
        type="button"
        className="ios-button-primary w-full py-1.5 text-xs font-semibold disabled:opacity-50"
        disabled={busy || !subgraph}
        onClick={runGenerate}
      >
        {busy ? t("export_word_generating") : t("export_word_gen_framework")}
      </button>

      {frameworkSelection ? (
        <div>
          <div className="mb-1 text-[11px] font-semibold text-slate-800 dark:text-slate-100">
            {t("export_word_framework_table")}
          </div>
          <textarea
            className="ios-field max-h-40 w-full min-h-[6rem] px-2 py-1.5 font-mono text-[10px] leading-relaxed"
            value={frameworkSelection}
            onChange={(e) => setFrameworkSelection(e.target.value)}
          />
        </div>
      ) : null}

      {chapters.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
            {t("export_word_chapters")}
          </div>
          {chapters.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white/70 p-2 dark:border-slate-600 dark:bg-slate-900/40">
              <div className="text-[10px] font-mono text-slate-500">{c.id}</div>
              <input
                className="ios-field mt-1 w-full px-2 py-1 text-[11px] font-semibold"
                value={c.title}
                onChange={(e) => updateChapter(c.id, { title: e.target.value })}
                aria-label={t("export_word_ch_title")}
              />
              {(
                [
                  ["analysis_objective", t("export_word_col_objective")],
                  ["analysis_logic", t("export_word_col_logic")],
                  ["core_hypothesis", t("export_word_col_hypothesis")],
                  ["data_requirements", t("export_word_col_data")],
                  ["visualization_plan", t("export_word_col_viz")]
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="mt-1.5 block">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {label}
                  </span>
                  <textarea
                    className="ios-field mt-0.5 w-full min-h-[3rem] px-2 py-1 text-[10px] leading-snug"
                    value={c[key]}
                    onChange={(e) => updateChapter(c.id, { [key]: e.target.value } as Partial<WordChapter>)}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      {chapters.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-600 dark:bg-slate-900/30">
          <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">{t("export_word_ai_review")}</div>
          <p className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-400">{t("export_word_ai_review_hint")}</p>
          <label className="mt-2 block text-[10px]">
            {t("export_word_chat_scope")}
            <select
              className="ios-select mt-1 w-full"
              value={chatTarget}
              onChange={(e) => setChatTarget(e.target.value as typeof chatTarget)}
            >
              <option value="all">{t("export_word_scope_all")}</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || c.id}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-2 max-h-32 overflow-y-auto rounded border border-slate-200/80 bg-white/80 p-1.5 text-[10px] dark:border-slate-600 dark:bg-slate-900/50">
            {chatMessages.length === 0 ? (
              <span className="text-slate-500">{t("export_word_no_chat")}</span>
            ) : (
              chatMessages.map((m, i) => (
                <div key={i} className="mb-1.5 last:mb-0">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">{m.role}:</span>{" "}
                  <span className="whitespace-pre-wrap text-slate-800 dark:text-slate-100">{m.content}</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-1 flex gap-1">
            <input
              className="ios-field min-w-0 flex-1 px-2 py-1"
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              placeholder={t("export_word_chat_ph")}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), runChat())}
            />
            <button
              type="button"
              className="ios-button shrink-0 py-1 text-[10px] disabled:opacity-50"
              disabled={busy || !chatDraft.trim()}
              onClick={runChat}
            >
              {t("export_word_send")}
            </button>
          </div>
        </div>
      )}

      {chapters.length > 0 && (
        <div>
          <button
            type="button"
            className="ios-button w-full py-1.5 text-xs disabled:opacity-50"
            disabled={busy}
            onClick={runGap}
          >
            {busy ? t("export_word_checking") : t("export_word_check_data")}
          </button>
          {gapSufficient !== null && (
            <div className="mt-2 space-y-1 rounded-lg border border-amber-200/80 bg-amber-50/80 p-2 text-[10px] dark:border-amber-500/30 dark:bg-amber-950/30">
              <div className="font-semibold text-amber-950 dark:text-amber-100">
                {gapSufficient ? t("export_word_gap_ok") : t("export_word_gap_lacking")}
              </div>
              <p className="whitespace-pre-wrap text-amber-950/90 dark:text-amber-50/90">{gapSummary}</p>
              {gapItems.length > 0 && (
                <ul className="space-y-2 pl-0 text-amber-950/90">
                  {gapItems.map((g, i) => {
                    const tids = g.target_node_ids || [];
                    return (
                      <li key={i} className="list-none border-b border-amber-200/30 pb-2 last:border-0 dark:border-amber-700/20">
                        <div>
                          <span className="font-medium">{g.area}:</span> {g.issue}{" "}
                          <span className="text-amber-800 dark:text-amber-200/90">→ {g.needed_data_or_action}</span>
                        </div>
                        {tids.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-0 text-[9px] text-amber-900/90 dark:text-amber-100/80">
                            <span className="shrink-0 text-amber-800/80 dark:text-amber-200/80">
                              {t("export_word_gap_target_nodes")}:
                            </span>
                            {tids.map((nid) => (
                              <span
                                key={nid}
                                className="rounded border border-amber-300/60 bg-amber-100/90 px-1 font-mono text-[9px] text-amber-950 dark:border-amber-500/30 dark:bg-amber-900/50 dark:text-amber-100"
                                title={nodeLabelById.get(nid) || nid}
                              >
                                {nodeLabelById.get(nid) || nid}
                                <span className="ml-0.5 opacity-60">·{nid}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {nodeAssistantPrompts.length > 0 && (
                <div className="mt-2 space-y-2 border-t border-amber-200/60 pt-2 dark:border-amber-600/30">
                  <div className="text-[10px] font-semibold text-amber-950 dark:text-amber-100">
                    {t("export_word_node_prompts_title")}
                  </div>
                  <p className="text-[9px] text-amber-900/80 dark:text-amber-200/80">{t("export_word_node_prompts_hint")}</p>
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
                    {nodeAssistantPrompts.map((row, ni) => (
                      <div
                        key={`${row.node_id}-${ni}`}
                        className="rounded-lg border border-amber-200/80 bg-white/90 p-1.5 dark:border-amber-600/30 dark:bg-slate-900/50"
                      >
                        <div className="mb-0.5 flex items-start justify-between gap-1 text-[9px] font-mono text-amber-900 dark:text-amber-100">
                          <span>
                            {row.node_label || nodeLabelById.get(row.node_id) || "—"}{" "}
                            <span className="text-amber-700/80 dark:text-amber-300/80">({row.node_id})</span>
                          </span>
                          <button
                            type="button"
                            className="shrink-0 text-sky-700 underline dark:text-sky-400"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(row.prompt);
                              } catch {
                                /* ignore */
                              }
                            }}
                          >
                            {t("export_word_copy_node_prompt")}
                          </button>
                        </div>
                        <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap text-[8px] leading-relaxed text-amber-950/95 dark:text-amber-50/90">
                          {row.prompt}
                        </pre>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-[10px] font-medium text-sky-700 underline dark:text-sky-400"
                    onClick={async () => {
                      const combined = nodeAssistantPrompts
                        .map(
                          (row) =>
                            `### ${row.node_id} — ${row.node_label || nodeLabelById.get(row.node_id) || ""}\n\n${row.prompt}`
                        )
                        .join("\n\n---\n\n");
                      try {
                        await navigator.clipboard.writeText(combined);
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    {t("export_word_copy_all_node_prompts")}
                  </button>
                </div>
              )}
              {assistantPrompt && (
                <div>
                  <div className="mt-2 font-semibold text-amber-950 dark:text-amber-100">
                    {t("export_word_combined_prompt_title")}
                  </div>
                  <p className="text-[9px] text-amber-900/80 dark:text-amber-200/80">{t("export_word_combined_prompt_hint")}</p>
                  <pre className="mt-0.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-amber-200/60 bg-white/80 p-1.5 text-[9px] dark:border-amber-800/50 dark:bg-slate-900/60">
                    {assistantPrompt}
                  </pre>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-[10px] font-medium text-sky-700 underline dark:text-sky-400"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(assistantPrompt);
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      {t("export_word_copy_combined_prompt")}
                    </button>
                    <button
                      type="button"
                      className="text-[10px] font-medium text-sky-700 underline dark:text-sky-400"
                      onClick={openAssistant}
                    >
                      {t("export_word_open_assistant")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {chapters.length > 0 && (
        <button
          type="button"
          className="ios-button-primary w-full py-1.5 text-xs font-semibold disabled:opacity-50"
          disabled={busy}
          onClick={runDownload}
        >
          {busy ? t("export_word_preparing") : t("export_word_download_md")}
        </button>
      )}

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}
