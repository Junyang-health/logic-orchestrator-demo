import { Code2, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PptSlide } from "../../lib/pptFrameworkExport";
import { frameworkWithSlides, pptSlideToFrameworkRow } from "../../lib/slideDeckFramework";
import { useI18n } from "../../i18n/useI18n";
import {
  enqueueSlideJob,
  getSlideInnerHtml,
  patchSlideInnerHtml,
  patchSlideSessionFramework,
  postSlideDeckAssistChat
} from "../../lib/slideBuildApi";

type Msg = { role: "user" | "assistant"; content: string };

function cloneFw(src: Record<string, unknown>): Record<string, unknown> {
  try {
    return structuredClone(src) as Record<string, unknown>;
  } catch {
    return JSON.parse(JSON.stringify(src)) as Record<string, unknown>;
  }
}

type Props = {
  backendBase: string;
  sessionId: string;
  slide: PptSlide;
  frameworkRecord: Record<string, unknown>;
  selectedSectionHtml: string;
  onDeckRefresh: () => Promise<void>;
  onPreviewBump: () => void;
};

export default function SlideDeckRightRail(props: Props) {
  const { backendBase, sessionId, slide, frameworkRecord, selectedSectionHtml, onDeckRefresh, onPreviewBump } = props;
  const { t } = useI18n();
  const slideId = slide.id;

  const [mode, setMode] = useState<"edit" | "assist">("edit");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [fwTitle, setFwTitle] = useState(slide.title);
  const [fwSubtitle, setFwSubtitle] = useState(slide.subtitle);
  const [fwBeat, setFwBeat] = useState(slide.beat);
  const [fwMain, setFwMain] = useState(slide.main);
  const [fwVisual, setFwVisual] = useState(slide.visual);
  const [fwErr, setFwErr] = useState("");
  const [fwSaving, setFwSaving] = useState(false);
  const [fwRegen, setFwRegen] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [assistBusy, setAssistBusy] = useState(false);

  const [editorHtml, setEditorHtml] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFwTitle(slide.title);
    setFwSubtitle(slide.subtitle);
    setFwBeat(slide.beat);
    setFwMain(slide.main);
    setFwVisual(slide.visual);
  }, [slideId, slide.title, slide.subtitle, slide.beat, slide.main, slide.visual]);

  useEffect(() => {
    setMessages([]);
    setDraft("");
    setEditorHtml("");
    setEditorDirty(false);
    setMode("edit");
    setAdvancedOpen(false);
  }, [slideId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const loadInner = useCallback(async () => {
    if (!slideId) return;
    setEditorBusy(true);
    try {
      const inner = await getSlideInnerHtml(backendBase, sessionId, slideId);
      setEditorHtml(inner);
      setEditorDirty(false);
    } finally {
      setEditorBusy(false);
    }
  }, [backendBase, sessionId, slideId]);

  useEffect(() => {
    if (!advancedOpen || !slideId) return;
    void loadInner();
  }, [advancedOpen, slideId, loadInner]);

  const persistFrameworkDraft = async () => {
    const baseFw = cloneFw(frameworkRecord);
    const slides = Array.isArray(baseFw.slides) ? [...(baseFw.slides as unknown[])] : [];
    const ix = slides.findIndex(
      (s) => !!s && typeof s === "object" && String((s as Record<string, unknown>).id ?? "") === slideId
    );
    if (ix < 0) throw new Error("Slide not present in backend framework");
    const row = pptSlideToFrameworkRow({
      id: slideId,
      title: fwTitle,
      subtitle: fwSubtitle,
      beat: fwBeat,
      main: fwMain,
      visual: fwVisual
    });
    slides[ix] = { ...(slides[ix] as object as Record<string, unknown>), ...row };
    await patchSlideSessionFramework(
      backendBase,
      sessionId,
      frameworkWithSlides(baseFw, slides as Record<string, unknown>[])
    );
    await onDeckRefresh();
  };

  const saveFrameworkDraft = async () => {
    setFwErr("");
    setFwSaving(true);
    try {
      await persistFrameworkDraft();
    } catch (e) {
      setFwErr(e instanceof Error ? e.message : t("slide_deck_fw_err"));
    } finally {
      setFwSaving(false);
    }
  };

  const regenerateCurrentSlide = async () => {
    setFwErr("");
    setFwRegen(true);
    try {
      await persistFrameworkDraft();
      await enqueueSlideJob(backendBase, sessionId, {
        kind: "slide_generate",
        slide_id: slideId,
        payload: {}
      });
      await onDeckRefresh();
      onPreviewBump();
    } catch (e) {
      setFwErr(e instanceof Error ? e.message : t("slide_deck_fw_err"));
    } finally {
      setFwRegen(false);
    }
  };

  const sendAssist = async () => {
    if (!slideId || !draft.trim()) return;
    const text = draft.trim();
    const scopedText = selectedSectionHtml.trim()
      ? [
          "Modify only the selected slide section unless the request explicitly requires broader context.",
          "Selected section HTML:",
          selectedSectionHtml.trim().slice(0, 12000),
          "",
          "User instruction:",
          text
        ].join("\n")
      : text;
    setDraft("");
    setAssistBusy(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    try {
      const { reply } = await postSlideDeckAssistChat(backendBase, sessionId, slideId, scopedText);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply.trim() || t("slide_deck_chat_generic_reply") }
      ]);
      onPreviewBump();
      if (advancedOpen) void loadInner();
      await onDeckRefresh();
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: e instanceof Error ? e.message : t("slide_deck_chat_err") }
      ]);
    } finally {
      setAssistBusy(false);
    }
  };

  const saveInner = async () => {
    if (!slideId) return;
    setEditorBusy(true);
    try {
      await patchSlideInnerHtml(backendBase, sessionId, slideId, editorHtml);
      setEditorDirty(false);
      onPreviewBump();
      await onDeckRefresh();
    } finally {
      setEditorBusy(false);
    }
  };

  const modeButton = (id: typeof mode, label: string, icon: JSX.Element) => (
    <button
      type="button"
      className={[
        "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold transition",
        mode === id
          ? "bg-violet-600 text-white shadow-sm dark:bg-violet-500"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      ].join(" ")}
      onClick={() => setMode(id)}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <aside className="flex h-full min-h-0 w-[min(100%,28rem)] shrink-0 flex-col border-l border-[var(--mm-border-subtle)] bg-white/72 backdrop-blur-sm dark:bg-slate-950/55">
      <div className="shrink-0 border-b border-[var(--mm-border-subtle)] px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          Slide editor
        </div>
        <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">
          {fwTitle || slide.title || "Untitled slide"}
        </div>
        <div className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
          Update the slide brief, regenerate visuals, or ask AI to rewrite a selected section.
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {modeButton("edit", "Edit slide", <Wand2 className="h-4 w-4" />)}
          {modeButton("assist", "AI modify", <Sparkles className="h-4 w-4" />)}
        </div>
      </div>

      {mode === "edit" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Structure
              </div>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_fw_title")}</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    value={fwTitle}
                    onChange={(e) => setFwTitle(e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_fw_subtitle")}</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    value={fwSubtitle}
                    onChange={(e) => setFwSubtitle(e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("ppt_beat")}</span>
                  <textarea
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    value={fwBeat}
                    onChange={(e) => setFwBeat(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Content
              </div>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_fw_content")}</span>
                  <textarea
                    rows={7}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    spellCheck
                    value={fwMain}
                    onChange={(e) => setFwMain(e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_fw_visual")}</span>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {t("slide_deck_fw_visual_hint")}
                  </p>
                  <textarea
                    rows={6}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    spellCheck
                    value={fwVisual}
                    onChange={(e) => setFwVisual(e.target.value)}
                  />
                </label>
              </div>
            </div>

            {fwErr ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900 dark:border-rose-500/35 dark:bg-rose-950/40 dark:text-rose-100">
                {fwErr}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              disabled={fwSaving || fwRegen}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-800 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              onClick={() => void saveFrameworkDraft()}
            >
              {fwSaving ? t("slide_deck_fw_saving") : t("slide_deck_fw_save")}
            </button>
            <button
              type="button"
              disabled={fwSaving || fwRegen}
              className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40 dark:bg-violet-500"
              onClick={() => void regenerateCurrentSlide()}
            >
              {fwRegen ? t("slide_deck_fw_regenerating") : t("slide_deck_fw_regen")}
            </button>
          </div>
        </div>
      ) : null}

      {mode === "assist" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-[var(--mm-border-subtle)] px-4 py-3">
            <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">AI modify</div>
            <div className="mt-1 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
              Ask for rewrites, layout adjustments, chart changes, or a tighter visual story for this slide.
            </div>
            {selectedSectionHtml.trim() ? (
              <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] leading-relaxed text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/35 dark:text-sky-100">
                Selected section mode is active. The next instruction will target that area first.
              </div>
            ) : null}
          </div>

          <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {!messages.length ? (
              <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-3 py-3 text-[13px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
                {t("slide_deck_chat_intro")}
              </div>
            ) : null}
            {messages.map((m, i) => (
              <div
                key={i}
                className={[
                  "rounded-2xl px-3 py-2.5 text-[13px] leading-relaxed shadow-sm",
                  m.role === "user"
                    ? "ml-6 bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                    : "mr-6 border border-slate-200/80 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                ].join(" ")}
              >
                {m.content}
              </div>
            ))}
          </div>

          <div className="shrink-0 border-t border-[var(--mm-border-subtle)] px-4 py-4">
            <textarea
              disabled={assistBusy}
              className="min-h-[7rem] w-full rounded-2xl border border-slate-200 bg-white p-3 text-[14px] text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              placeholder={t("slide_deck_chat_ph")}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void sendAssist();
                }
              }}
            />
            <button
              type="button"
              disabled={assistBusy || !draft.trim()}
              className="mt-3 w-full rounded-xl bg-violet-600 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40 dark:bg-violet-500"
              onClick={() => void sendAssist()}
            >
              {assistBusy ? t("slide_deck_chat_sending") : t("slide_deck_chat_send")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="shrink-0 border-t border-[var(--mm-border-subtle)] px-4 py-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-[12px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <Code2 className="h-4 w-4" />
          {advancedOpen ? "Hide advanced HTML" : "Show advanced HTML"}
        </button>
      </div>

      {advancedOpen ? (
        <div className="flex min-h-0 flex-[0_0_22rem] flex-col border-t border-[var(--mm-border-subtle)] bg-slate-50/70 px-4 py-3 dark:bg-slate-950/55">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">Advanced HTML</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">For direct markup edits only.</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={editorBusy}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium dark:border-slate-600"
                onClick={() => void loadInner()}
              >
                {t("slide_deck_edit_load")}
              </button>
              <button
                type="button"
                disabled={editorBusy || !editorDirty}
                className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40 dark:bg-emerald-500"
                onClick={() => void saveInner()}
              >
                {t("slide_deck_edit_save")}
              </button>
            </div>
          </div>
          <textarea
            disabled={editorBusy}
            className="min-h-0 w-full flex-1 resize-none rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-emerald-100"
            spellCheck={false}
            value={editorHtml}
            onChange={(e) => {
              setEditorHtml(e.target.value);
              setEditorDirty(true);
            }}
          />
        </div>
      ) : null}
    </aside>
  );
}
