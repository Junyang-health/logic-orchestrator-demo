import { MessageCircle, X } from "lucide-react";

type Props = {
  title: string;
  closeLabel: string;
  onClose: () => void;
};

export default function AssistantPanelHeader({ title, closeLabel, onClose }: Props) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-2 py-2 dark:border-slate-800">
      <MessageCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{title}</span>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-[10px] font-medium text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-900 dark:hover:text-slate-200"
          title={closeLabel}
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
