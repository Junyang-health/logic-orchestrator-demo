import { useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../../i18n/useI18n";
import type { PptDeckStyleId, PptSlide } from "../../../lib/pptFrameworkExport";
import { postSlideBuildSession } from "../../../lib/slideBuildApi";
import useUiStore from "../../../store/useUiStore";

type Props = {
  backendBase: string;
  deckTitle: string;
  deckStyle: PptDeckStyleId;
  slides: PptSlide[];
};

function frameworkPayload(slides: PptSlide[], deckStyle: PptDeckStyleId): Record<string, unknown> {
  return {
    deck_style: deckStyle,
    build_engine: "ppt_master",
    slides: slides.map((s) => ({
      id: s.id,
      title: s.title,
      subtitle: s.subtitle,
      beat: s.beat,
      main: s.main,
      visual: s.visual
    }))
  };
}

export default function PptFrameworkSlideBuildSection(props: Props) {
  const { backendBase, deckTitle, deckStyle, slides } = props;
  const { t } = useI18n();
  const { setSlideBuildSessionId, setCenterWorkspace, setRightDockOpen } = useUiStore(
    useShallow((s) => ({
      setSlideBuildSessionId: s.setSlideBuildSessionId,
      setCenterWorkspace: s.setCenterWorkspace,
      setRightDockOpen: s.setRightDockOpen
    }))
  );

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const startDeckBuild = useCallback(async () => {
    if (slides.length === 0) {
      setErr(t("ppt_builder_err_slides"));
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const { session_id } = await postSlideBuildSession(backendBase, {
        title: deckTitle.trim() || t("ppt_md_title"),
        framework: frameworkPayload(slides, deckStyle)
      });
      setSlideBuildSessionId(session_id);
      setCenterWorkspace("slide_deck");
      setRightDockOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "session failed");
    } finally {
      setBusy(false);
    }
  }, [
    backendBase,
    deckStyle,
    deckTitle,
    setCenterWorkspace,
    setRightDockOpen,
    setSlideBuildSessionId,
    slides,
    t
  ]);

  const activeSession = useUiStore((s) => s.slideBuildSessionId);
  const styleLabel = deckStyle
    .replace("consulting_", "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-slate-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-950/30 dark:via-slate-900/60 dark:to-slate-950/45">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">
            Build deck
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">{t("ppt_builder_title")}</div>
          <p className="mt-1 max-w-[26rem] text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
            Lock the outline, then open the Slide deck workspace to generate visuals and page layouts slide by slide.
          </p>
        </div>
        <div className="rounded-full border border-violet-200 bg-white/80 px-3 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-950/35 dark:text-violet-200">
          {slides.length} ready
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/85 p-3 dark:border-slate-700 dark:bg-slate-900/70">
        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Build engine</div>
        <div className="mt-2 rounded-xl border border-violet-200 bg-violet-500/8 px-3 py-3 text-[12px] dark:border-violet-500/30 dark:bg-violet-950/30">
          <div className="font-semibold text-violet-700 dark:text-violet-200">PPT-master</div>
          <div className="mt-1 leading-relaxed text-slate-600 dark:text-slate-400">
            Framework planning, slide generation, and editable export now stay on one PPT-master workflow.
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-white/85 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Slides</div>
          <div className="mt-1 text-base font-semibold text-slate-950 dark:text-slate-50">{slides.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/85 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Style</div>
          <div className="mt-1 text-base font-semibold text-slate-950 dark:text-slate-50">{styleLabel}</div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/85 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Destination</div>
          <div className="mt-1 text-base font-semibold text-slate-950 dark:text-slate-50">Slide deck</div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/85 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70 sm:col-span-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Engine</div>
          <div className="mt-1 text-base font-semibold text-slate-950 dark:text-slate-50">PPT-master</div>
        </div>
      </div>

      <button
        type="button"
        className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 text-[13px] font-semibold text-white shadow-sm disabled:opacity-40 dark:bg-violet-500"
        disabled={busy || slides.length === 0}
        onClick={() => void startDeckBuild()}
      >
        {busy ? t("ppt_builder_starting") : "Open Slide deck with PPT-master"}
      </button>

      {activeSession ? (
        <div className="mt-3 text-[11px] text-slate-600 dark:text-slate-400">
          <span>{t("ppt_builder_session")}</span>: <span className="break-all font-mono text-[9px]">{activeSession}</span>
        </div>
      ) : null}

      {err ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-500">{t("ppt_builder_worker_hint")}</p>
    </div>
  );
}
