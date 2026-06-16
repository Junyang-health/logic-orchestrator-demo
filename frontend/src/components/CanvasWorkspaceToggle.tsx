import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../i18n/useI18n";
import useUiStore from "../store/useUiStore";

/**
 * Switches the main area between the mindmap canvas and the PPT slide deck viewer.
 */
export default function CanvasWorkspaceToggle() {
  const { t } = useI18n();
  const { centerWorkspace, setCenterWorkspace, setActivePanel, setExportPanelTab, setRightDockOpen } =
    useUiStore(
      useShallow((s) => ({
        centerWorkspace: s.centerWorkspace,
        setCenterWorkspace: s.setCenterWorkspace,
        setActivePanel: s.setActivePanel,
        setExportPanelTab: s.setExportPanelTab,
        setRightDockOpen: s.setRightDockOpen
      }))
    );

  const goDeck = () => {
    setCenterWorkspace("slide_deck");
    setActivePanel("export");
    setExportPanelTab("ppt");
    setRightDockOpen(true);
  };

  const goCanvas = () => setCenterWorkspace("canvas");

  return (
    <div
      className="pointer-events-auto absolute left-3 top-3 z-[50] flex items-center gap-0.5 rounded-xl border border-slate-200/90 bg-white/95 p-0.5 shadow-lg backdrop-blur-sm dark:border-slate-600 dark:bg-slate-900/95"
      role="tablist"
      aria-label={t("workspace_toggle_aria")}
    >
      <button
        type="button"
        role="tab"
        aria-selected={centerWorkspace === "canvas"}
        className={[
          "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition",
          centerWorkspace === "canvas"
            ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        ].join(" ")}
        onClick={goCanvas}
      >
        {t("workspace_canvas")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={centerWorkspace === "slide_deck"}
        className={[
          "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition",
          centerWorkspace === "slide_deck"
            ? "bg-violet-600 text-white dark:bg-violet-500"
            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        ].join(" ")}
        onClick={goDeck}
      >
        {t("workspace_slide_deck")}
      </button>
    </div>
  );
}
