import { memo, type ReactNode } from "react";
import { MessageCircle, Send, Wand2 } from "lucide-react";
import { useI18n } from "../../i18n/useI18n";

export type AssistantPanelMode = "chat" | "optimism" | "blackSwan" | "mece" | "roundtable";

export type AssistantPanelFooterProps = {
  /** Skills & lens block; rendered after the message area and before primary actions. */
  children?: ReactNode;
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
  applyBusy: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  chatBusy: boolean;
  onSendChat: () => void;
  messagesCount: number;
  onApplyToMindmap: () => void;
};

function AssistantPanelFooterInner(props: AssistantPanelFooterProps) {
  const {
    children: skillsSlot,
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
    applyBusy,
    draft,
    onDraftChange,
    chatBusy,
    onSendChat,
    messagesCount,
    onApplyToMindmap
  } = props;

  const { t } = useI18n();
  const isRoundtable = mode === "roundtable";
  const isMece = mode === "mece";

  return (
    <div className="min-h-0 max-h-[min(42dvh,400px)] shrink-0 space-y-2 overflow-x-hidden overflow-y-auto overscroll-contain border-t border-slate-200 p-2 dark:border-slate-800">
      {error ? <p className="text-[10px] text-red-700 dark:text-red-400">{error}</p> : null}
      {!selectedNodeId ? (
        <p className="text-[10px] text-amber-800 dark:text-amber-200">
          {isRoundtable
            ? t("footer_select_roundtable")
            : isMece
              ? t("footer_select_mece")
              : t("footer_select_apply")}
        </p>
      ) : (
        <p className="text-[10px] text-slate-600 dark:text-slate-400">
          {isRoundtable ? t("footer_apply_root") : t("footer_apply_target")}
          <code className="rounded bg-white px-0.5 dark:bg-slate-900 dark:text-slate-200">{selectedNodeId}</code>
        </p>
      )}
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
          {skillsSlot ? <div className="space-y-2">{skillsSlot}</div> : null}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={rtRoundBusy || rtPersonasCount < 1 || !selectedNodeId}
              className="ios-button-primary flex items-center justify-center gap-1.5 text-[11px]"
              onClick={() => void onRunRoundtableRound()}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {rtRoundBusy ? t("footer_run_round_busy") : t("footer_run_round")}
            </button>
            <button
              type="button"
              disabled={rtProposeBusy || rtTranscriptCount < 1 || !selectedNodeId}
              className="ios-button flex items-center justify-center gap-1.5 text-[11px]"
              onClick={() => void onProposeRoundtable()}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {rtProposeBusy ? t("footer_propose_busy") : t("footer_propose")}
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
                  <span>{t("footer_confirm_apply")}</span>
                </label>
                <button
                  type="button"
                  disabled={rtApplyBusy || !rtConfirmApply || !selectedNodeId}
                  className="ios-button-primary flex items-center justify-center gap-1.5 text-[11px]"
                  onClick={() => void onApplyRoundtablePatch()}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  {rtApplyBusy ? t("footer_applying") : t("footer_apply_confirmed")}
                </button>
              </>
            ) : null}
          </div>
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
          {skillsSlot ? <div className="space-y-2">{skillsSlot}</div> : null}
          <button
            type="button"
            disabled={chatBusy || !draft.trim()}
            className="ios-button-primary flex w-full items-center justify-center gap-1.5 text-[11px]"
            onClick={() => void onSendChat()}
          >
            <Send className="h-3.5 w-3.5" />
            {chatBusy ? t("footer_sending") : t("footer_send")}
          </button>
          <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
            <button
              type="button"
              disabled={applyBusy || messagesCount === 0 || !selectedNodeId}
              className="ios-button flex w-full items-center justify-center gap-1.5 text-[11px]"
              onClick={() => void onApplyToMindmap()}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {applyBusy ? t("footer_applying") : t("footer_summarize_node")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(AssistantPanelFooterInner);
