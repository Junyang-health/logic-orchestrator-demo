import { memo } from "react";
import { Send } from "lucide-react";
import { useI18n } from "../../i18n/useI18n";
import type { AssistantPanelMode } from "./assistantPanelMode";

export type AssistantPanelRightComposerProps = {
  mode: AssistantPanelMode;
  rtSteering: string;
  onRtSteeringChange: (value: string) => void;
  rtRoundBusy: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  chatBusy: boolean;
  onSendChat: () => void;
};

function AssistantPanelRightComposerInner(props: AssistantPanelRightComposerProps) {
  const { mode, rtSteering, onRtSteeringChange, rtRoundBusy, draft, onDraftChange, chatBusy, onSendChat } = props;
  const { t } = useI18n();
  const isRoundtable = mode === "roundtable";

  return (
    <div className="shrink-0 space-y-2 border-t border-slate-200 bg-slate-50/95 p-2 dark:border-slate-800 dark:bg-slate-950/95">
      {isRoundtable ? (
        <>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("footer_steering")}
          </label>
          <textarea
            className="max-h-36 min-h-[4.25rem] w-full resize-y overflow-y-auto rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder={t("footer_steering_ph")}
            rows={2}
            value={rtSteering}
            disabled={rtRoundBusy}
            onChange={(e) => onRtSteeringChange(e.target.value)}
          />
        </>
      ) : (
        <>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("footer_message")}
          </label>
          <textarea
            className="max-h-36 min-h-[4.25rem] w-full resize-y overflow-y-auto rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder={t("footer_message_ph")}
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
          <p className="text-[9px] leading-snug text-slate-500 dark:text-slate-500">{t("assistant_mode_slash_hint")}</p>
          <button
            type="button"
            disabled={chatBusy || !draft.trim()}
            className="ios-button-primary flex w-full items-center justify-center gap-1.5 text-[11px]"
            onClick={() => void onSendChat()}
          >
            <Send className="h-3.5 w-3.5" />
            {chatBusy ? t("footer_sending") : t("footer_send")}
          </button>
        </>
      )}
    </div>
  );
}

export default memo(AssistantPanelRightComposerInner);
