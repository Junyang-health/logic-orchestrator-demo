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
      className="pointer-events-auto absolute left-4 top-4 z-[50] flex items-center gap-1 rounded-full border border-[var(--mm-border-subtle)] bg-white/78 p-1 shadow-[0_14px_32px_rgba(45,82,140,0.12)] backdrop-blur-xl dark:bg-slate-950/62 dark:shadow-[0_18px_42px_rgba(0,0,0,0.28)]"
      role="tablist"
      aria-label={t("workspace_toggle_aria")}
    >
      <button
        type="button"
        role="tab"
        aria-selected={centerWorkspace === "canvas"}
        className={[
          "rounded-full px-5 py-2 text-[12px] font-semibold transition",
          centerWorkspace === "canvas"
            ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-[0_10px_20px_rgba(47,109,246,0.22)]"
            : "text-slate-600 hover:bg-blue-50 dark:text-slate-300 dark:hover:bg-blue-500/10"
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
          "rounded-full px-5 py-2 text-[12px] font-semibold transition",
          centerWorkspace === "slide_deck"
            ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-[0_10px_20px_rgba(47,109,246,0.22)]"
            : "text-slate-600 hover:bg-blue-50 dark:text-slate-300 dark:hover:bg-blue-500/10"
        ].join(" ")}
        onClick={goDeck}
      >
        {t("workspace_slide_deck")}
      </button>
    </div>
  );
}
