import { RotateCcw } from "lucide-react";

type Props = {
  line: string;
  discardLabel: string;
  onDiscard: () => void;
};

export default function AssistantSandboxDraftBanner({ line, discardLabel, onDiscard }: Props) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-[10px] text-slate-600 dark:text-slate-400">{line}</span>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[10px] text-slate-600 underline dark:text-slate-400"
        onClick={onDiscard}
      >
        <RotateCcw className="h-3 w-3" />
        {discardLabel}
      </button>
    </div>
  );
}
