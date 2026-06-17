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
    <div className="rounded-lg border border-slate-200/80 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/45">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">Build deck</div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {slides.length} slides / {styleLabel}
          </div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
          PPT-master
        </div>
      </div>

      <button
        type="button"
        className="mt-3 w-full rounded-lg bg-slate-950 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
        disabled={busy || slides.length === 0}
        onClick={() => void startDeckBuild()}
      >
        {busy ? t("ppt_builder_starting") : "Open slide deck"}
      </button>

      {activeSession ? (
        <div className="mt-3 text-[11px] text-slate-600 dark:text-slate-400">
          <span>{t("ppt_builder_session")}</span>: <span className="break-all font-mono text-[9px]">{activeSession}</span>
        </div>
      ) : null}

      {err ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      ) : null}
    </div>
  );
}
