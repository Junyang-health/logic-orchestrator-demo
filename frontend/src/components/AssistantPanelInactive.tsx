import { ChevronLeft, MessageCircle } from "lucide-react";
import type { MindmapNodePayload } from "../store/useUiStore";

type Props = {
  selectedNode: MindmapNodePayload | null;
  setAssistantDockOpen: (open: boolean) => void;
  onActivate: () => void;
};

export default function AssistantPanelInactive(props: Props) {
  const { selectedNode, setAssistantDockOpen, onActivate } = props;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-2 py-2 dark:border-slate-800">
        <MessageCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Assistant
        </span>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-0.5 rounded-lg border border-transparent px-1.5 py-1 text-[10px] font-medium text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-900 dark:hover:text-slate-200"
          title="Hide assistant — full width canvas"
          onClick={() => setAssistantDockOpen(false)}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Hide
        </button>
      </div>
      <div className="p-3">
        <div className="ios-card p-3">
          <div className="text-[11px] text-slate-700 dark:text-slate-200">
            Select a node, then activate a session to discuss and edit that branch.
          </div>
          <button
            type="button"
            className="mt-3 w-full ios-button-primary"
            disabled={!selectedNode?.id}
            onClick={onActivate}
          >
            Activate for selected node
          </button>
          {!selectedNode?.id && (
            <div className="mt-2 text-[10px] text-amber-800 dark:text-amber-200">
              Tip: click a node on the canvas first.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
