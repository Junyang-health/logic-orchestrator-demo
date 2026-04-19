import { memo } from "react";
import { MessageCircle, Send, Wand2 } from "lucide-react";

export type AssistantPanelMode = "chat" | "optimism" | "blackSwan" | "mece" | "roundtable";

export type AssistantPanelFooterProps = {
  error: string;
  mode: AssistantPanelMode;
  selectedNodeId: string | undefined;
  rtSteering: string;
  onRtSteeringChange: (value: string) => void;
  rtRoundBusy: boolean;
  rtPersonasCount: number;
  onRunRoundtableRound: () => void;
  rtProposeBusy: boolean;
  rtTranscriptCount: number;
  onProposeRoundtable: () => void;
  hasRoundtableProposal: boolean;
  rtConfirmApply: boolean;
  onRtConfirmApplyChange: (checked: boolean) => void;
  rtApplyBusy: boolean;
  onApplyRoundtablePatch: () => void;
  applyInstruction: string;
  onApplyInstructionChange: (value: string) => void;
  applyBusy: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  chatBusy: boolean;
  onSendChat: () => void;
  messagesCount: number;
  onApplyToMindmap: () => void;
  onApplyWithInstruction: () => void;
};

function AssistantPanelFooterInner(props: AssistantPanelFooterProps) {
  const {
    error,
    mode,
    selectedNodeId,
    rtSteering,
    onRtSteeringChange,
    rtRoundBusy,
    rtPersonasCount,
    onRunRoundtableRound,
    rtProposeBusy,
    rtTranscriptCount,
    onProposeRoundtable,
    hasRoundtableProposal,
    rtConfirmApply,
    onRtConfirmApplyChange,
    rtApplyBusy,
    onApplyRoundtablePatch,
    applyInstruction,
    onApplyInstructionChange,
    applyBusy,
    draft,
    onDraftChange,
    chatBusy,
    onSendChat,
    messagesCount,
    onApplyToMindmap,
    onApplyWithInstruction
  } = props;

  const isRoundtable = mode === "roundtable";
  const isMece = mode === "mece";

  return (
    <div className="shrink-0 space-y-2 p-2">
      {error ? <p className="text-[10px] text-red-700 dark:text-red-400">{error}</p> : null}
      {!selectedNodeId ? (
        <p className="text-[10px] text-amber-800 dark:text-amber-200">
          {isRoundtable ? (
            <>
              Select a node on the canvas — the roundtable focuses on that node, and edits apply to its subtree root (same as session
              target).
            </>
          ) : isMece ? (
            <>
              Select an anchor node on the canvas. MECE analysis covers its <span className="font-medium">direct children</span> and{" "}
              <span className="font-medium">their children</span> (two levels only). Evidence uses project files (if a project is selected
              in Source material) plus Evidence nodes in the subtree.
            </>
          ) : (
            <>
              Select the branch root node on the canvas for <span className="font-medium">Summarize &amp; apply</span>.
            </>
          )}
        </p>
      ) : (
        <p className="text-[10px] text-slate-600 dark:text-slate-400">
          {isRoundtable ? "Focus & apply root: " : "Apply target (subtree root): "}
          <code className="rounded bg-white px-0.5 dark:bg-slate-900 dark:text-slate-200">{selectedNodeId}</code>
        </p>
      )}
      {isRoundtable ? (
        <>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Steering for next round (optional)
          </label>
          <textarea
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="e.g. Push on evidence gaps, or ask everyone for one concrete map tweak (discussion only)."
            rows={2}
            value={rtSteering}
            disabled={rtRoundBusy}
            onChange={(e) => onRtSteeringChange(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={rtRoundBusy || rtPersonasCount < 1 || !selectedNodeId}
              className="ios-button-primary flex items-center justify-center gap-1.5 text-[11px]"
              onClick={() => void onRunRoundtableRound()}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {rtRoundBusy ? "Running round…" : "Run discussion round"}
            </button>
            <button
              type="button"
              disabled={rtProposeBusy || rtTranscriptCount < 1 || !selectedNodeId}
              className="ios-button flex items-center justify-center gap-1.5 text-[11px]"
              onClick={() => void onProposeRoundtable()}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {rtProposeBusy ? "Summarizing…" : "Summarize & propose mindmap edits"}
            </button>
            {hasRoundtableProposal ? (
              <>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] text-slate-800 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={rtConfirmApply}
                    onChange={(e) => onRtConfirmApplyChange(e.target.checked)}
                  />
                  <span>I confirm applying the proposed patch to the mindmap (subtree rooted at the target node).</span>
                </label>
                <button
                  type="button"
                  disabled={rtApplyBusy || !rtConfirmApply || !selectedNodeId}
                  className="ios-button-primary flex items-center justify-center gap-1.5 text-[11px]"
                  onClick={() => void onApplyRoundtablePatch()}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  {rtApplyBusy ? "Applying…" : "Apply confirmed edits to mindmap"}
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Apply instruction (optional)
          </label>
          <textarea
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="Example: Add a new inferred node summarizing risks, then connect evidence nodes that support it."
            rows={2}
            value={applyInstruction}
            disabled={applyBusy}
            onChange={(e) => onApplyInstructionChange(e.target.value)}
          />
          <textarea
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="Message…"
            rows={3}
            value={draft}
            disabled={chatBusy}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSendChat();
              }
            }}
          />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={chatBusy || !draft.trim()}
              className="ios-button-primary flex items-center justify-center gap-1.5 text-[11px]"
              onClick={() => void onSendChat()}
            >
              <Send className="h-3.5 w-3.5" />
              {chatBusy ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              disabled={applyBusy || messagesCount === 0 || !selectedNodeId}
              className="ios-button flex items-center justify-center gap-1.5 text-[11px]"
              onClick={() => void onApplyToMindmap()}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {applyBusy ? "Applying…" : "Summarize & apply to selected node"}
            </button>
            <button
              type="button"
              disabled={applyBusy || messagesCount === 0 || !selectedNodeId || !applyInstruction.trim()}
              className="ios-button-primary flex items-center justify-center gap-1.5 text-[11px]"
              onClick={() => void onApplyWithInstruction()}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {applyBusy ? "Applying…" : "Apply instruction"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(AssistantPanelFooterInner);
