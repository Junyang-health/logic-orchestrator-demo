import { ChevronRight, Moon, Sparkles, SunMedium } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../i18n/useI18n";
import useUiStore from "../../store/useUiStore";

export default function RightDockNav() {
  const { t, locale, setLocale } = useI18n();
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
      <nav className="border-b border-[var(--mm-border-subtle)] px-4 pb-3 pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-[0_12px_22px_rgba(47,109,246,0.28)]">
            <Sparkles className="h-[18px] w-[18px]" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-[var(--mm-text-title)]">Workspace panels</div>
            <div className="mt-0.5 text-[11px] font-medium text-[var(--mm-text-muted)]">{t("nav_appearance")}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            className="ios-segment shrink-0"
            role="group"
            aria-label={t("nav_language")}
          >
            <button
              type="button"
              className={[
                "ios-segment-item px-2 py-0.5 text-[10px] font-medium",
                locale === "en" ? "ios-segment-item-active" : "ios-segment-item-inactive"
              ].join(" ")}
              onClick={() => setLocale("en")}
            >
              {t("nav_en")}
            </button>
            <button
              type="button"
              className={[
                "ios-segment-item px-2 py-0.5 text-[10px] font-medium",
                locale === "zh" ? "ios-segment-item-active" : "ios-segment-item-inactive"
              ].join(" ")}
              onClick={() => setLocale("zh")}
            >
              {t("nav_zh")}
            </button>
          </div>
          <button
            type="button"
            className="ios-toggle"
            aria-label={t("nav_toggle_night")}
            aria-pressed={theme === "dark"}
            onClick={() => toggleTheme()}
          >
            <span className="ios-toggle-track" data-on={theme === "dark"} />
            <span className="ios-toggle-knob" data-on={theme === "dark"} />
            <span className="ios-toggle-icon" aria-hidden>
              {theme === "dark" ? <Moon className="h-3 w-3" /> : <SunMedium className="h-3 w-3" />}
            </span>
          </button>
          <button
            type="button"
            className="ios-button flex shrink-0 items-center gap-1 px-2 py-1 text-[10px]"
            onClick={() => setRightDockOpen(false)}
            title={t("nav_hide_title")}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            {t("nav_hide")}
          </button>
        </div>
      </div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        Task
      </div>
      <div className="ios-segment w-full">
            <button
              type="button"
              className={[
                "ios-segment-item min-w-0 flex-1 px-1.5 text-[11px] font-medium",
            activePanel === "source" ? "ios-segment-item-active" : "ios-segment-item-inactive"
          ].join(" ")}
          onClick={() => setActivePanel("source")}
        >
          {t("nav_source")}
        </button>
            <button
              type="button"
              className={[
                "ios-segment-item min-w-0 flex-1 px-1.5 text-[11px] font-medium",
            activePanel === "review" ? "ios-segment-item-active" : "ios-segment-item-inactive"
          ].join(" ")}
          onClick={() => setActivePanel("review")}
        >
          {t("nav_review")}
        </button>
            <button
              type="button"
              className={[
                "ios-segment-item min-w-0 flex-1 px-1.5 text-[11px] font-medium",
            activePanel === "export" ? "ios-segment-item-active" : "ios-segment-item-inactive"
          ].join(" ")}
          onClick={() => setActivePanel("export")}
        >
          {t("nav_export")}
        </button>
      </div>
    </nav>
  );
}
