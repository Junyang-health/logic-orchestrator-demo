import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import SlideDeckFilmstrip from "./slideDeck/SlideDeckFilmstrip";
import SlideDeckQuestionnaire from "./slideDeck/SlideDeckQuestionnaire";
import SlideDeckRightRail from "./slideDeck/SlideDeckRightRail";
import { readWizardDone, readWizardStyle, writeWizardDone, writeWizardStyle } from "./slideDeck/slideDeckWizardKeys";
import { runSequentialSlideGeneration } from "./slideDeck/runSequentialSlideGeneration";
import {
  frameworkWithSlides,
  orderedFrameworkSlideRows,
  slidesFromFrameworkRecord
} from "../lib/slideDeckFramework";
import { useI18n } from "../i18n/useI18n";
import { getBackendBase } from "../lib/backendBase";
import type { PptSlide } from "../lib/pptFrameworkExport";
import {
  enqueueSlideJob,
  getSlideBuildSession,
  patchSlideSessionFramework,
  slideBuildDownloadPdfUrl,
  slideBuildDownloadPptxUrl,
  slideBuildPreviewUrl,
  type SlideBuildJobOut,
  type SlideBuildSessionOut
} from "../lib/slideBuildApi";
import useUiStore from "../store/useUiStore";

type Props = {
  backendBase: string;
};

function latestJobCompleted(snap: SlideBuildSessionOut | null, kind: string): SlideBuildJobOut | null {
  const jobs = snap?.jobs ?? [];
  for (let i = jobs.length - 1; i >= 0; i--) {
    const j = jobs[i]!;
    if (j.kind === kind && j.status === "completed") return j;
  }
  return null;
}

export default function SlideDeckCenterWorkspace(props: Props) {
  const { backendBase } = props;
  const { t } = useI18n();
  const {
    pptSlides,
    deckViewerIndex,
    setDeckViewerIndex,
    slideBuildSessionId,
    setCenterWorkspace,
    skills,
    setActivePanel,
    setExportPanelTab,
    setRightDockOpen,
    setPptSlides
  } = useUiStore(
    useShallow((s) => ({
      pptSlides: s.pptSlides,
      deckViewerIndex: s.deckViewerIndex,
      setDeckViewerIndex: s.setDeckViewerIndex,
      slideBuildSessionId: s.slideBuildSessionId,
      setCenterWorkspace: s.setCenterWorkspace,
      skills: s.skills,
      setActivePanel: s.setActivePanel,
      setExportPanelTab: s.setExportPanelTab,
      setRightDockOpen: s.setRightDockOpen,
      setPptSlides: s.setPptSlides
    }))
  );

  const [wizardDone, setWizardDone] = useState(false);
  const [persistedStyle, setPersistedStyle] = useState("");
  const [sessionSnap, setSessionSnap] = useState<SlideBuildSessionOut | null>(null);
  const [seqBusy, setSeqBusy] = useState(false);
  const [seqErr, setSeqErr] = useState("");
  const [seqProg, setSeqProg] = useState<{ cur: number; total: number } | null>(null);
  const [previewTick, setPreviewTick] = useState(0);
  const [previewScale, setPreviewScale] = useState(1);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [stripBusy, setStripBusy] = useState(false);
  const [stripErr, setStripErr] = useState("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [selectedSectionHtml, setSelectedSectionHtml] = useState("");

  const bumpPreview = useCallback(() => setPreviewTick((x) => x + 1), []);

  const fitPreviewFrame = useCallback(() => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    const root = doc.documentElement;
    const body = doc.body;
    const contentWidth = Math.max(root.scrollWidth, root.clientWidth, body?.scrollWidth ?? 0);
    const contentHeight = Math.max(root.scrollHeight, root.clientHeight, body?.scrollHeight ?? 0);
    const frameWidth = Math.max(frame.clientWidth, 1);
    const frameHeight = Math.max(frame.clientHeight, 1);
    const scale = Math.min(1, frameWidth / Math.max(contentWidth, 1), frameHeight / Math.max(contentHeight, 1));
    setPreviewScale((prev) => (Math.abs(prev - scale) > 0.02 ? scale : prev));
  }, []);

  const wirePreviewSelection = useCallback(() => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;
    fitPreviewFrame();
    const styleId = "unbox-slide-section-select-style";
    if (!doc.getElementById(styleId)) {
      const st = doc.createElement("style");
      st.id = styleId;
      st.textContent = `
        .unbox-section-selected {
          outline: 3px solid #38bdf8 !important;
          outline-offset: 4px !important;
          box-shadow: 0 0 0 7px rgba(56,189,248,.22) !important;
          cursor: pointer !important;
        }
        body.unbox-section-picker * { cursor: pointer; }
      `;
      doc.head.appendChild(st);
    }
    doc.body.classList.add("unbox-section-picker");
    const onClick = (ev: MouseEvent) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      const slideEl = doc.querySelector(".slide");
      if (!slideEl || target === doc.body || target === doc.documentElement) return;
      ev.preventDefault();
      ev.stopPropagation();
      doc.querySelectorAll(".unbox-section-selected").forEach((el) => el.classList.remove("unbox-section-selected"));
      const pick =
        target.closest(".visual, .body, figure, table, section, article, h1, p, ul, ol, div") ?? target;
      if (!(pick instanceof HTMLElement) || pick === slideEl) return;
      pick.classList.add("unbox-section-selected");
      setSelectedSectionHtml(pick.outerHTML);
    };
    doc.addEventListener("click", onClick, true);
    window.requestAnimationFrame(() => {
      fitPreviewFrame();
      window.setTimeout(() => fitPreviewFrame(), 80);
    });
  }, [fitPreviewFrame]);

  const applySessionToDeckState = useCallback(
    (s: SlideBuildSessionOut) => {
      setSessionSnap(s);
      const fw = (s.framework ?? {}) as Record<string, unknown>;
      const slidesUnknown =
        fw && typeof fw === "object" && "slides" in fw ? (fw as { slides?: unknown }).slides : undefined;
      if (!Array.isArray(slidesUnknown)) return;

      const parsed = slidesFromFrameworkRecord(fw);
      setPptSlides((prev) => {
        const prevById = new Map(prev.map((x) => [x.id, x]));
        return parsed.map((row) => {
          const old = prevById.get(row.id);
          return old ? { ...old, ...row } : row;
        });
      });
    },
    [setPptSlides]
  );

  useEffect(() => {
    const sid = slideBuildSessionId;
    if (!sid) {
      setWizardDone(false);
      setPersistedStyle("");
      return;
    }
    const done = readWizardDone(sid);
    const style = readWizardStyle(sid);
    setWizardDone(done);
    setPersistedStyle(style);
  }, [slideBuildSessionId]);

  useEffect(() => {
    const sid = slideBuildSessionId;
    if (!sid) {
      setSessionSnap(null);
      return undefined;
    }
    const poll = async () => {
      try {
        const s = await getSlideBuildSession(backendBase, sid);
        applySessionToDeckState(s);
      } catch {
        /* ignored */
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 2500);
    return () => clearInterval(id);
  }, [backendBase, slideBuildSessionId, applySessionToDeckState]);

  const refreshDeckSnap = useCallback(async () => {
    const sid = slideBuildSessionId;
    if (!sid) return;
    try {
      const s = await getSlideBuildSession(backendBase, sid);
      applySessionToDeckState(s);
    } catch {
      /* ignore */
    }
  }, [backendBase, slideBuildSessionId, applySessionToDeckState]);

  const fwRecord = (sessionSnap?.framework ?? {}) as Record<string, unknown>;
  const fwSlides = useMemo(() => slidesFromFrameworkRecord(fwRecord), [fwRecord]);
  /** Sorted id multiset — reorder alone must not restart sequential generation. */
  const slideIdsKey = useMemo(
    () =>
      [...pptSlides]
        .map((s) => s.id)
        .sort()
        .join("|"),
    [pptSlides]
  );

  const wizardStyleSeed = useMemo(
    () => (slideBuildSessionId ? readWizardStyle(slideBuildSessionId) : ""),
    [slideBuildSessionId]
  );

  useEffect(() => {
    const sid = slideBuildSessionId;
    if (!sid || !wizardDone) return undefined;
    const ac = new AbortController();
    const styleNotes = persistedStyle || readWizardStyle(sid);
    const ids = pptSlides.map((s) => s.id);

    (async () => {
      setSeqErr("");
      setSeqBusy(true);
      try {
        await runSequentialSlideGeneration({
          backendBase,
          sessionId: sid,
          slideIdsOrdered: ids,
          styleNotes,
          signal: ac.signal,
          onProgress: (idx, total) => setSeqProg({ cur: Math.min(total, idx + 1), total })
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setSeqErr(e instanceof Error ? e.message : String(e));
      } finally {
        setSeqBusy(false);
        setSeqProg(null);
      }
    })();

    return () => ac.abort();
  }, [backendBase, slideBuildSessionId, wizardDone, slideIdsKey]);

  const handleWizardSubmit = (notes: string) => {
    const sid = slideBuildSessionId;
    if (!sid) return;
    writeWizardStyle(sid, notes);
    writeWizardDone(sid);
    setPersistedStyle(notes);
    setWizardDone(true);
  };

  const persistOrderedSlides = useCallback(
    async (ordered: readonly PptSlide[]) => {
      const sid = slideBuildSessionId;
      if (!sid) throw new Error("No slide session");
      const fw = (sessionSnap?.framework ?? {}) as Record<string, unknown>;
      const rows = orderedFrameworkSlideRows(fw, ordered);
      await patchSlideSessionFramework(backendBase, sid, frameworkWithSlides(fw, rows));
    },
    [slideBuildSessionId, backendBase, sessionSnap]
  );

  const handleFilmstripReorder = useCallback(
    async (next: PptSlide[]) => {
      if (!slideBuildSessionId || stripBusy) return;
      const activeId = pptSlides[deckViewerIndex]?.id;
      const prevSlides = pptSlides;
      const prevIdx = deckViewerIndex;

      let resolvedIdx = Math.min(prevIdx, Math.max(0, next.length - 1));
      if (activeId) {
        const ix = next.findIndex((s) => s.id === activeId);
        if (ix >= 0) resolvedIdx = ix;
      }

      setStripErr("");
      setStripBusy(true);
      setPptSlides(next);
      setDeckViewerIndex(resolvedIdx);
      try {
        await persistOrderedSlides(next);
        await refreshDeckSnap();
        bumpPreview();
      } catch (e) {
        setPptSlides(prevSlides);
        setDeckViewerIndex(prevIdx);
        setStripErr(e instanceof Error ? e.message : t("slide_deck_strip_save_err"));
      } finally {
        setStripBusy(false);
      }
    },
    [
      slideBuildSessionId,
      stripBusy,
      pptSlides,
      deckViewerIndex,
      setPptSlides,
      setDeckViewerIndex,
      persistOrderedSlides,
      refreshDeckSnap,
      bumpPreview,
      t
    ]
  );

  const handleFilmstripDelete = useCallback(
    async (slideId: string) => {
      if (!slideBuildSessionId || stripBusy) return;
      const prevSlides = pptSlides;
      const prevIdx = deckViewerIndex;
      const removedIdx = prevSlides.findIndex((s) => s.id === slideId);
      const nextSlides = prevSlides.filter((s) => s.id !== slideId);
      let nextIdx = prevIdx;
      if (removedIdx >= 0) {
        if (removedIdx === prevIdx) nextIdx = Math.min(prevIdx, Math.max(0, nextSlides.length - 1));
        else if (removedIdx < prevIdx) nextIdx = prevIdx - 1;
      }

      setStripErr("");
      setStripBusy(true);
      setPptSlides(nextSlides);
      setDeckViewerIndex(nextIdx);
      try {
        await persistOrderedSlides(nextSlides);
        await refreshDeckSnap();
        bumpPreview();
      } catch (e) {
        setPptSlides(prevSlides);
        setDeckViewerIndex(prevIdx);
        setStripErr(e instanceof Error ? e.message : t("slide_deck_strip_save_err"));
      } finally {
        setStripBusy(false);
      }
    },
    [
      slideBuildSessionId,
      stripBusy,
      pptSlides,
      deckViewerIndex,
      setPptSlides,
      setDeckViewerIndex,
      persistOrderedSlides,
      refreshDeckSnap,
      bumpPreview,
      t
    ]
  );

  const n = pptSlides.length;
  const active = n > 0 ? pptSlides[Math.min(deckViewerIndex, n - 1)]! : null;
  const deckSlide =
    active && fwSlides.some((s) => s.id === active.id)
      ? (fwSlides.find((s) => s.id === active.id) ?? active)
      : active;
  const base = (backendBase || getBackendBase()).replace(/\/$/, "");

  const previewSrc =
    slideBuildSessionId && active
      ? slideBuildPreviewUrl(base, slideBuildSessionId, active.id)
      : "";

  const goPrev = useCallback(() => {
    setDeckViewerIndex(deckViewerIndex - 1);
  }, [deckViewerIndex, setDeckViewerIndex]);

  const goNext = useCallback(() => {
    setDeckViewerIndex(deckViewerIndex + 1);
  }, [deckViewerIndex, setDeckViewerIndex]);

  useEffect(() => {
    setSelectedSectionHtml("");
    setPreviewScale(1);
  }, [active?.id, previewTick]);

  useEffect(() => {
    const onResize = () => fitPreviewFrame();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitPreviewFrame]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target;
      if (el instanceof HTMLElement) {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      }
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  const exportDeck = async (kind: "export_pptx" | "export_pdf") => {
    if (!slideBuildSessionId) return;
    setExportBusy(kind);
    try {
      await enqueueSlideJob(backendBase, slideBuildSessionId, { kind, payload: {} });
      await getSlideBuildSession(backendBase, slideBuildSessionId).then(setSessionSnap).catch(() => {});
    } catch {
      /* ignore */
    } finally {
      setExportBusy(null);
    }
  };

  const openExportsPanel = () => {
    setActivePanel("export");
    setExportPanelTab("ppt");
    setRightDockOpen(true);
  };

  if (n === 0) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-4 bg-[var(--mm-bg-app)] px-6 text-center">
        <p className="max-w-sm text-sm text-slate-600 dark:text-slate-400">{t("slide_deck_empty")}</p>
        <button
          type="button"
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white dark:bg-violet-500"
          onClick={() => setCenterWorkspace("canvas")}
        >
          {t("slide_deck_back_canvas")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 bg-[var(--mm-bg-app)]">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <SlideDeckQuestionnaire
          open={Boolean(slideBuildSessionId && !wizardDone)}
          backendBase={backendBase}
          sessionId={slideBuildSessionId}
          skills={{
            webSearch: skills.webSearch ?? false,
            financialAnalyst: skills.financialAnalyst ?? false
          }}
          slideCount={pptSlides.length}
          initialStyleNotes={wizardStyleSeed || undefined}
          onSubmit={handleWizardSubmit}
        />

        <div className="border-b border-[var(--mm-border-subtle)] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Slide deck
              </div>
              <div className="mt-1 truncate text-[22px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                {deckSlide?.title || "—"}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500 dark:text-slate-400">
                <span>{t("slide_deck_counter", { current: Math.min(deckViewerIndex, n - 1) + 1, total: n })}</span>
                <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:border-violet-500/35 dark:bg-violet-950/35 dark:text-violet-200">
                  PPT-master
                </span>
                {deckSlide?.subtitle ? <span className="truncate">{deckSlide.subtitle}</span> : null}
                {selectedSectionHtml.trim() ? (
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:border-sky-500/35 dark:bg-sky-950/35 dark:text-sky-200">
                    Section selected
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-[12px] font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                onClick={openExportsPanel}
              >
                {t("slide_deck_link_exports")}
              </button>
              <button
                type="button"
                disabled={!slideBuildSessionId || !!exportBusy}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                onClick={() => void exportDeck("export_pptx")}
              >
                {exportBusy === "export_pptx" ? t("ppt_builder_export_pptx") + "…" : t("ppt_builder_export_pptx")}
              </button>
              <button
                type="button"
                disabled={!slideBuildSessionId || !!exportBusy}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                onClick={() => void exportDeck("export_pdf")}
              >
                {exportBusy === "export_pdf" ? t("ppt_builder_export_pdf") + "…" : t("ppt_builder_export_pdf")}
              </button>
              {latestJobCompleted(sessionSnap, "export_pptx") ? (
                <a
                  href={slideBuildSessionId ? slideBuildDownloadPptxUrl(base, slideBuildSessionId) : "#"}
                  className="text-[12px] font-semibold text-violet-700 underline dark:text-violet-300"
                  download
                >
                  {t("ppt_builder_download_pptx")}
                </a>
              ) : null}
              {latestJobCompleted(sessionSnap, "export_pdf") ? (
                <a
                  href={slideBuildSessionId ? slideBuildDownloadPdfUrl(base, slideBuildSessionId) : "#"}
                  className="text-[12px] font-semibold text-violet-700 underline dark:text-violet-300"
                  download
                >
                  {t("ppt_builder_download_pdf")}
                </a>
              ) : null}
              <div className="ml-1 flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 p-2 text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
                  disabled={deckViewerIndex <= 0}
                  onClick={goPrev}
                  aria-label={t("slide_deck_prev")}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 p-2 text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
                  disabled={deckViewerIndex >= n - 1}
                  onClick={goNext}
                  aria-label={t("slide_deck_next")}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {wizardDone ? (
          <>
            {(seqBusy || seqProg || seqErr) && (
              <div
                className={[
                  "shrink-0 px-5 py-2.5 text-[12px] font-medium text-white",
                  seqErr ? "bg-rose-600/95" : "bg-violet-600/90 dark:bg-violet-500"
                ].join(" ")}
              >
                {seqErr
                  ? seqErr
                  : seqProg
                    ? t("slide_deck_generating_progress", {
                        cur: seqProg.cur,
                        total: seqProg.total,
                        pct: seqProg.total > 0 ? Math.round((Math.min(seqProg.cur, seqProg.total) / seqProg.total) * 100) : 0
                      })
                    : t("slide_deck_generating_banner")}
              </div>
            )}

            <div className="flex min-h-0 flex-wrap items-center gap-2 border-b border-[var(--mm-border-subtle)] px-5 py-2 text-[12px] text-slate-600 dark:text-slate-400">
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                Preview-first editing
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                Live storyboard thumbnails
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                AI section targeting
              </span>
            </div>
          </>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden px-5 py-5">
          <div className="mx-auto flex h-full max-h-full w-full max-w-6xl flex-col">
            <div className="rounded-[28px] border border-slate-200/80 bg-slate-900/98 p-4 shadow-[0_24px_70px_-32px_rgba(15,23,42,0.85)] dark:border-slate-700">
              <div
                className="relative w-full overflow-hidden rounded-[22px] border border-slate-200/10 bg-slate-950"
                style={{ aspectRatio: "16 / 9" }}
              >
              {previewSrc ? (
                <iframe
                  ref={iframeRef}
                  key={`${previewSrc}-${previewTick}`}
                  title={t("slide_deck_frame_title")}
                  className="absolute left-0 top-0 border-0 bg-white"
                  style={{
                    width: `${100 / previewScale}%`,
                    height: `${100 / previewScale}%`,
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left"
                  }}
                  src={previewSrc}
                  onLoad={wirePreviewSelection}
                />
              ) : (
                <div className="flex h-full w-full flex-col justify-center gap-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-10 text-left">
                  <h2 className="text-3xl font-bold leading-tight text-white">{deckSlide?.title || "—"}</h2>
                  {deckSlide?.subtitle ? <p className="text-lg text-slate-300">{deckSlide.subtitle}</p> : null}
                  <div className="mt-3 line-clamp-12 whitespace-pre-wrap text-base leading-relaxed text-slate-200">
                    {deckSlide?.main || t("slide_deck_no_body")}
                  </div>
                  <p className="mt-auto text-[12px] text-slate-500">{t("slide_deck_no_html_hint")}</p>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>

        <div className="group/filmstrip shrink-0 border-t border-[var(--mm-border-subtle)] bg-[var(--mm-bg-app)] px-4 py-2">
          {stripErr ? (
            <div className="mx-auto mb-3 max-w-6xl rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900 dark:border-rose-500/35 dark:bg-rose-950/40 dark:text-rose-100">
              {stripErr}
            </div>
          ) : null}
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center justify-center pb-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:border-slate-700/80 dark:bg-slate-900/85 dark:text-slate-400">
                <span className="h-1.5 w-10 rounded-full bg-violet-500/75" />
                Slide strip
                <span className="text-[10px] normal-case tracking-normal text-slate-400 dark:text-slate-500">hover to expand</span>
              </div>
            </div>
            <div className="overflow-hidden transition-[max-height,opacity,padding] duration-250 ease-out max-h-0 opacity-70 group-hover/filmstrip:max-h-[18rem] group-hover/filmstrip:pt-2 group-hover/filmstrip:opacity-100 group-focus-within/filmstrip:max-h-[18rem] group-focus-within/filmstrip:pt-2 group-focus-within/filmstrip:opacity-100">
              <SlideDeckFilmstrip
                slides={pptSlides}
                activeIndex={Math.min(deckViewerIndex, Math.max(0, pptSlides.length - 1))}
                onSelectIndex={setDeckViewerIndex}
                canMutate={Boolean(slideBuildSessionId)}
                disabled={stripBusy}
                onReorder={(next) => void handleFilmstripReorder(next)}
                onDeleteSlide={(id) => void handleFilmstripDelete(id)}
                backendBase={backendBase}
                sessionId={slideBuildSessionId}
              />
            </div>
          </div>
        </div>
      </div>

      {wizardDone && slideBuildSessionId && deckSlide ? (
        <SlideDeckRightRail
          backendBase={backendBase}
          sessionId={slideBuildSessionId}
          slide={deckSlide}
          frameworkRecord={fwRecord}
          selectedSectionHtml={selectedSectionHtml}
          onDeckRefresh={refreshDeckSnap}
          onPreviewBump={bumpPreview}
        />
      ) : null}
    </div>
  );
}
