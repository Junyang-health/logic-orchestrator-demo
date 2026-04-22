import { MessageSquare } from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";
import type { PptChatRow } from "./types";

type Props = {
  slideCount: number;
  chatMessages: PptChatRow[];
  targetSlideForChat: string;
  onTargetSlide: (v: string) => void;
  chatDraft: string;
  onChatDraft: (v: string) => void;
  onSendChat: () => void;
  chatBusy: boolean;
};

export default function PptFrameworkRefineSection({
  slideCount,
  chatMessages,
  targetSlideForChat,
  onTargetSlide,
  chatDraft,
  onChatDraft,
  onSendChat,
  chatBusy
}: Props) {
  const { t } = useI18n();

  if (slideCount === 0) return null;

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
        <MessageSquare className="h-3.5 w-3.5" />
        {t("ppt_refine_title")}
      </div>
      <p className="mb-2 text-[10px] text-slate-500 dark:text-slate-400">{t("ppt_refine_hint")}</p>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="text-[10px] text-slate-500 dark:text-slate-400">{t("ppt_chat_focus")}</label>
        <select
          className="ios-select max-w-full py-0.5 text-[10px]"
          value={targetSlideForChat}
          onChange={(e) => onTargetSlide(e.target.value)}
        >
          <option value="all">{t("ppt_focus_all")}</option>
          {Array.from({ length: slideCount }, (_, i) => (
            <option key={i} value={String(i)}>
              {t("ppt_focus_slide", { n: i + 1 })}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-2 max-h-[200px] space-y-1.5 overflow-auto rounded-md border border-slate-200/60 bg-slate-50/80 p-2 dark:border-slate-600 dark:bg-slate-800/50">
        {chatMessages.length === 0 ? (
          <div className="text-[10px] text-slate-500">{t("ppt_chat_empty")}</div>
        ) : (
          chatMessages.map((m) => (
            <div
              key={m.id}
              className={[
                "rounded px-2 py-1 text-[10px] leading-relaxed",
                m.role === "user"
                  ? "ml-4 border border-rose-100/50 bg-rose-50/50 dark:border-violet-800/30 dark:bg-violet-950/20"
                  : "mr-4 border border-slate-200/60 bg-white dark:border-slate-600 dark:bg-slate-900/60"
              ].join(" ")}
            >
              <div className="text-[9px] font-bold uppercase text-slate-400">
                {m.role === "user" ? "You" : "AI"}
              </div>
              {m.content}
            </div>
          ))
        )}
      </div>
      <textarea
        className="ios-field mb-1 min-h-[56px] w-full text-xs"
        value={chatDraft}
        onChange={(e) => onChatDraft(e.target.value)}
        placeholder={t("ppt_chat_ph")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void onSendChat();
          }
        }}
      />
      <button
        type="button"
        className="ios-button-primary w-full py-1.5 text-xs disabled:opacity-50"
        disabled={chatBusy || !chatDraft.trim()}
        onClick={onSendChat}
      >
        {chatBusy ? t("ppt_chat_sending") : t("ppt_chat_send")}
      </button>
    </div>
  );
}
