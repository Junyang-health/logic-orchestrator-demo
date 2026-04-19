import { ChevronRight } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import useUiStore from "../../store/useUiStore";

export default function RightDockNav() {
  const { theme, toggleTheme, setRightDockOpen, activePanel, setActivePanel } = useUiStore(
    useShallow((s) => ({
      theme: s.theme,
      toggleTheme: s.toggleTheme,
      setRightDockOpen: s.setRightDockOpen,
      activePanel: s.activePanel,
      setActivePanel: s.setActivePanel
    }))
  );

  return (
    <nav className="border-b ios-divider px-4 pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Appearance</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="ios-toggle"
            aria-label="Toggle night mode"
            aria-pressed={theme === "dark"}
            onClick={() => toggleTheme()}
          >
            <span className="ios-toggle-track" data-on={theme === "dark"} />
            <span className="ios-toggle-knob" data-on={theme === "dark"} />
            <span className="ios-toggle-icon" aria-hidden>
              {theme === "dark" ? "🌙" : "☀️"}
            </span>
          </button>
          <button
            type="button"
            className="ios-button flex shrink-0 items-center gap-1 px-2 py-1 text-[10px]"
            onClick={() => setRightDockOpen(false)}
            title="Hide panel — full width canvas"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            Hide
          </button>
        </div>
      </div>
      <div className="ios-segment w-full">
        <button
          type="button"
          className={[
            "ios-segment-item flex-1",
            activePanel === "source" ? "ios-segment-item-active" : "ios-segment-item-inactive"
          ].join(" ")}
          onClick={() => setActivePanel("source")}
        >
          Source
        </button>
        <button
          type="button"
          className={[
            "ios-segment-item flex-1",
            activePanel === "review" ? "ios-segment-item-active" : "ios-segment-item-inactive"
          ].join(" ")}
          onClick={() => setActivePanel("review")}
        >
          Review
        </button>
      </div>
    </nav>
  );
}
