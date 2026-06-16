import { PanelRight } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../i18n/useI18n";
import useUiStore from "../../store/useUiStore";

export default function ClosedDockRevealTabs() {
  const { t } = useI18n();
  const { rightDockOpen, setRightDockOpen } = useUiStore(
    useShallow((s) => ({
      rightDockOpen: s.rightDockOpen,
      setRightDockOpen: s.setRightDockOpen
    }))
  );

  return (
    <>
      {!rightDockOpen ? (
        <button
          type="button"
          className="fixed right-0 top-1/2 z-30 flex min-h-[7.5rem] -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-l-2xl border border-r-0 border-slate-200 bg-slate-50/96 px-2 py-3 text-[10px] font-semibold text-slate-600 shadow-md backdrop-blur-sm hover:bg-white dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => setRightDockOpen(true)}
          title={t("reveal_show_panels")}
        >
          <PanelRight className="h-4 w-4 shrink-0" aria-hidden />
          <span className="max-w-[4.75rem] text-center uppercase tracking-[0.16em] leading-tight">{t("reveal_show_panels")}</span>
          <span className="max-w-[4.75rem] text-center text-[9px] font-medium leading-tight opacity-75">{t("reveal_source")}</span>
        </button>
      ) : null}
    </>
  );
}
