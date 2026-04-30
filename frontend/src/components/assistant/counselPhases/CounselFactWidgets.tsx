import { useState } from "react";
import { Send } from "lucide-react";

export function FactQuestionProgressDots({
  posted,
  max,
  ariaLabel
}: {
  posted: number;
  max: number;
  ariaLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1" role="img" aria-label={ariaLabel}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={[
            "h-1.5 w-1.5 rounded-full transition-colors",
            i < posted
              ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.45)] dark:bg-emerald-400"
              : "bg-slate-300/90 dark:bg-slate-600"
          ].join(" ")}
        />
      ))}
    </div>
  );
}

export function FactAnswerBar({
  onSubmit,
  disabled,
  placeholder,
  sendAria
}: {
  onSubmit: (s: string) => void;
  disabled?: boolean;
  placeholder: string;
  sendAria: string;
}) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const s = draft.trim();
    if (!s) return;
    onSubmit(s);
    setDraft("");
  };
  return (
    <div className="mt-2.5 flex rounded-full border border-slate-200/90 bg-slate-50/95 py-0.5 pl-3 pr-0.5 dark:border-slate-600/85 dark:bg-slate-950/55">
      <input
        className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[10px] text-slate-800 outline-none ring-0 placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full bg-sky-600 text-white transition hover:bg-sky-500 disabled:pointer-events-none disabled:opacity-40 dark:bg-sky-500 dark:hover:bg-sky-400"
        disabled={disabled || !draft.trim()}
        title={sendAria}
        aria-label={sendAria}
        onMouseDown={(e) => e.preventDefault()}
        onClick={submit}
      >
        <Send className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
