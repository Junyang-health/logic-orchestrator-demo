import type { ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  title: string;
  closeLabel: string;
  onClose: () => void;
  /** Centered segmented control (mode switcher). */
  center?: ReactNode;
};

export default function AssistantPanelHeader({ title, closeLabel, onClose, center }: Props) {
  return (
    <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-black/[0.05] px-3 py-2.5 dark:border-white/[0.05] sm:px-4">
      <div className="min-w-0 justify-self-start">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
      </div>
      {center ? (
        <div className="min-w-0 max-w-[min(100vw-10rem,40rem)] justify-self-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {center}
        </div>
      ) : (
        <span className="justify-self-center" aria-hidden />
      )}
      <div className="min-w-0 justify-self-end">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-black/[0.05] dark:text-slate-300 dark:hover:bg-white/[0.08]"
          title={closeLabel}
          aria-label={closeLabel}
          onClick={onClose}
        >
          <X className="h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">{closeLabel}</span>
        </button>
      </div>
    </header>
  );
}
