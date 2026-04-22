import { PanelLeft, PanelRight } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../i18n/useI18n";
import useUiStore from "../../store/useUiStore";

export default function ClosedDockRevealTabs() {
  const { t } = useI18n();
  const { assistantDockOpen, setAssistantDockOpen, rightDockOpen, setRightDockOpen } = useUiStore(
    useShallow((s) => ({
      assistantDockOpen: s.assistantDockOpen,
      setAssistantDockOpen: s.setAssistantDockOpen,
      rightDockOpen: s.rightDockOpen,
      setRightDockOpen: s.setRightDockOpen
    }))
  );

  return (
    <>
      {!assistantDockOpen ? (
        <button
          type="button"
          className="fixed left-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1 rounded-r-xl border border-l-0 border-slate-200 bg-slate-50 py-3 pl-1 pr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600 shadow-md backdrop-blur-sm hover:bg-white dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => setAssistantDockOpen(true)}
          title={t("reveal_show_assistant")}
        >
          <PanelLeft className="h-4 w-4 shrink-0" aria-hidden />
          <span className="max-w-[4.5rem] leading-tight">{t("reveal_assistant")}</span>
        </button>
      ) : null}
      {!rightDockOpen ? (
        <button
          type="button"
          className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1 rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 py-3 pl-2 pr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 shadow-md backdrop-blur-sm hover:bg-white dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => setRightDockOpen(true)}
          title={t("reveal_show_panels")}
        >
          <span className="max-w-[4.5rem] text-right leading-tight">{t("reveal_source")}</span>
          <PanelRight className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      ) : null}
    </>
  );
}
