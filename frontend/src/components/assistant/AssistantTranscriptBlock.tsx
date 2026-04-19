import { memo, type RefObject } from "react";
import type { ChatRow, RoundtableTranscriptRow } from "./assistantTypes";

export type AssistantTranscriptBlockProps = {
  listRef: RefObject<HTMLDivElement>;
  isRoundtable: boolean;
  messages: ChatRow[];
  chatBusy: boolean;
  rtTranscript: RoundtableTranscriptRow[];
  rtRoundBusy: boolean;
  rtProposal: {
    discussion_summary: string;
    recommended_mindmap_changes: string;
  } | null;
  onClearChat: () => void;
  onClearRoundtable: () => void;
};

function AssistantTranscriptBlockInner(props: AssistantTranscriptBlockProps) {
  const {
    listRef,
    isRoundtable,
    messages,
    chatBusy,
    rtTranscript,
    rtRoundBusy,
    rtProposal,
    onClearChat,
    onClearRoundtable
  } = props;

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {isRoundtable ? "Roundtable discussion" : "Conversation"}
        </div>
        <button
          type="button"
          className="text-[10px] text-slate-500 underline dark:text-slate-400"
          onClick={isRoundtable ? onClearRoundtable : onClearChat}
        >
          {isRoundtable ? "Clear roundtable" : "Clear chat"}
        </button>
      </div>
      <div
        ref={listRef}
        className="min-h-[12rem] max-h-[min(52vh,560px)] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white/80 p-2 dark:border-slate-700 dark:bg-slate-900/60"
      >
        {isRoundtable ? (
          <>
            {rtTranscript.length === 0 && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Add personas above, then run a round. Optional: type a steering prompt for the next round (e.g. “Stress test regulatory
                risk”). When the discussion is enough, use <span className="font-medium">Summarize &amp; propose edits</span> in the footer.
              </p>
            )}
            {rtTranscript.map((r) => (
              <div
                key={r.id}
                className={`rounded-lg px-2 py-1.5 text-[11px] leading-snug ${
                  r.role === "user"
                    ? "ml-2 bg-sky-100 text-slate-900 dark:bg-sky-950/60 dark:text-sky-100"
                    : "mr-2 border border-violet-200/80 bg-violet-50 text-slate-800 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-slate-100"
                }`}
              >
                <div className="mb-0.5 text-[9px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  {r.role === "user" ? "You" : r.persona_name || "Persona"}
                </div>
                <p className="whitespace-pre-wrap">{r.content}</p>
              </div>
            ))}
            {rtRoundBusy && (
              <div className="mr-2 rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] italic text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                Personas are thinking…
              </div>
            )}
            {rtProposal ? (
              <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/90 p-2 text-[11px] text-slate-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-slate-100">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                  Proposed wrap-up
                </div>
                <p className="mt-1 whitespace-pre-wrap font-medium text-slate-900 dark:text-slate-50">
                  {rtProposal.discussion_summary || "—"}
                </p>
                <div className="mt-2 text-[9px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                  Recommended mindmap changes
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                  {rtProposal.recommended_mindmap_changes || "—"}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {messages.length === 0 && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Turn on <span className="font-medium">Sandbox mode</span> to explore with the assistant and build draft structure on the
                canvas. When you are satisfied, select a branch root and use{" "}
                <span className="font-medium">Summarize &amp; apply</span> to merge the discussion and drafts into the firm map.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg px-2 py-1.5 text-[11px] leading-snug ${
                  m.role === "user"
                    ? "ml-2 bg-sky-100 text-slate-900 dark:bg-sky-950/60 dark:text-sky-100"
                    : "mr-2 bg-slate-100 text-slate-800 dark:bg-slate-800/80 dark:text-slate-100"
                }`}
              >
                <div className="mb-0.5 text-[9px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  {m.role === "user" ? "You" : "Assistant"}
                </div>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            ))}
            {chatBusy && (
              <div className="mr-2 rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] italic text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                Thinking…
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default memo(AssistantTranscriptBlockInner);
