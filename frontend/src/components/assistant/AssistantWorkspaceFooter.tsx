import { memo, useLayoutEffect, useRef } from "react";
import { MessageCircle, Send, Wand2 } from "lucide-react";
import { Fragment } from "react";
import { useI18n } from "../../i18n/useI18n";
import { SLASH_MODE_CHIP_ITEMS } from "./slashModeCommands";
import type { AssistantPanelMode } from "./assistantPanelMode";

export type AssistantWorkspaceFooterProps = {
  error: string;
  mode: AssistantPanelMode;
  selectedNodeId: string | undefined;
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
  messagesCount: number;
  onApplyToMindmap: () => void;
  rtSteering: string;
  onRtSteeringChange: (value: string) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  chatBusy: boolean;
  onSendChat: () => void;
  meceFooterPrimary: null | {
    label: string;
    disabled: boolean;
    busy: boolean;
    onClick: () => void;
  };
};

function AssistantWorkspaceFooterInner(props: AssistantWorkspaceFooterProps) {
  const {
    error,
    mode,
    selectedNodeId,
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
    messagesCount,
    onApplyToMindmap,
    rtSteering,
    onRtSteeringChange,
    draft,
    onDraftChange,
    chatBusy,
    onSendChat,
    meceFooterPrimary
  } = props;

  const { t } = useI18n();
  const isRoundtable = mode === "roundtable";
  const isMece = mode === "mece";
  const isChat = mode === "chat";
  const steeringRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!isRoundtable) return;
    const el = steeringRef.current;
    if (!el) return;
    el.style.height = "auto";
    const h = Math.min(Math.max(el.scrollHeight, 36), 120);
    el.style.height = `${h}px`;
  }, [isRoundtable, rtSteering]);

  return (
    <div className="mm-assistant-footer-glass shrink-0">
      <div className="flex flex-col gap-3 px-4 pb-4 pt-3 sm:px-6">
        <div className="flex justify-center px-1">
          <div className="inline-flex flex-wrap items-center justify-center gap-1.5 text-center">
            <span className="text-[10px] text-slate-500 dark:text-slate-400">{t("footer_applying_to")}</span>
            {selectedNodeId ? (
              <code className="mm-assistant-code-pill font-mono">{selectedNodeId}</code>
            ) : (
              <span className="mm-assistant-code-pill font-mono text-amber-800 dark:text-amber-200">—</span>
            )}
          </div>
        </div>

        {!selectedNodeId ? (
          <p className="text-center text-[10px] text-amber-800 dark:text-amber-200">
            {isRoundtable ? t("footer_select_roundtable") : isMece ? t("footer_select_mece") : t("footer_select_apply")}
          </p>
        ) : null}
        {error ? <p className="text-center text-[10px] text-red-700 dark:text-red-400">{error}</p> : null}

        {isRoundtable ? (
          <>
            <label className="sr-only" htmlFor="assistant-rt-steering-footer">
              {t("footer_steering")}
            </label>
            <div className="rounded-full border border-slate-200/90 bg-white/92 px-3 py-1 shadow-sm dark:border-slate-600/85 dark:bg-slate-900/82">
              <textarea
                ref={steeringRef}
                id="assistant-rt-steering-footer"
                className="block max-h-[7.5rem] min-h-[2.25rem] w-full resize-none overflow-hidden rounded-full bg-transparent py-2 pl-0.5 pr-1 font-mono text-[11px] leading-snug text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder={t("footer_mission_brief_ph")}
                rows={1}
                value={rtSteering}
                disabled={rtRoundBusy}
                onChange={(e) => onRtSteeringChange(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={rtRoundBusy || rtPersonasCount < 1 || !selectedNodeId}
                className="flex min-h-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-slate-300/80 bg-white/55 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-800 shadow-sm transition hover:bg-white/90 disabled:pointer-events-none disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/65"
                onClick={() => void onRunRoundtableRound()}
              >
                <MessageCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                {rtRoundBusy ? t("footer_run_round_busy") : t("footer_run_round_next")}
              </button>
              <button
                type="button"
                disabled={rtProposeBusy || rtTranscriptCount < 1 || !selectedNodeId}
                className="mm-assistant-summarize-cta !w-auto min-w-0 flex-1 !py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] disabled:pointer-events-none disabled:opacity-[0.38]"
                onClick={() => void onProposeRoundtable()}
              >
                <Wand2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                {rtProposeBusy ? t("footer_propose_busy") : t("footer_propose")}
              </button>
            </div>
            {hasRoundtableProposal ? (
              <div className="mt-1 space-y-2 rounded-xl border border-slate-200/70 bg-white/50 p-2.5 dark:border-slate-600 dark:bg-slate-900/50">
                <label className="flex cursor-pointer items-start gap-2 text-[10px] text-slate-800 dark:text-slate-100">
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
                  className="mm-assistant-summarize-cta !py-2 text-[10px]"
                  onClick={() => void onApplyRoundtablePatch()}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  {rtApplyBusy ? t("footer_applying") : t("footer_apply_confirmed")}
                </button>
              </div>
            ) : null}
          </>
        ) : isChat ? (
          <>
            <div className="flex items-end gap-1 rounded-[1.75rem] border border-slate-200/90 bg-white/85 py-1 pl-4 pr-1 shadow-sm dark:border-slate-600/80 dark:bg-slate-900/75">
              <textarea
                className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent py-2.5 text-[11px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder={t("footer_message_ph")}
                rows={1}
                value={draft}
                disabled={chatBusy}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSendChat();
                  }
                }}
                aria-label={t("footer_message")}
              />
              <button
                type="button"
                disabled={chatBusy || !draft.trim()}
                className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--mm-cta-blue)] text-white shadow-sm transition hover:brightness-105 disabled:opacity-45 dark:shadow-[0_0_14px_rgba(6,182,212,0.35)]"
                title={chatBusy ? t("footer_sending") : t("footer_send")}
                onClick={() => void onSendChat()}
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="text-center text-[9px] leading-snug text-slate-500 dark:text-slate-500">
              <p>{t("assistant_mode_slash_hint_lead")}</p>
              <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 font-mono text-[8.5px] text-slate-600 dark:text-slate-400">
                {SLASH_MODE_CHIP_ITEMS.map(({ label }, i) => (
                  <Fragment key={label}>
                    {i > 0 ? <span aria-hidden className="text-slate-400 dark:text-slate-600">·</span> : null}
                    <kbd className="rounded border border-slate-200/90 bg-slate-100/90 px-1 py-px text-[8.5px] dark:border-slate-600 dark:bg-slate-800/90">
                      {label}
                    </kbd>
                  </Fragment>
                ))}
              </p>
            </div>
          </>
        ) : null}

        {isChat ? (
          <button
            type="button"
            disabled={applyBusy || messagesCount === 0 || !selectedNodeId}
            className="mm-assistant-summarize-cta"
            onClick={() => void onApplyToMindmap()}
          >
            <Wand2 className="h-4 w-4" />
            {applyBusy ? t("footer_applying") : t("footer_summarize_node")}
          </button>
        ) : isMece && meceFooterPrimary ? (
          <button
            type="button"
            disabled={meceFooterPrimary.disabled || meceFooterPrimary.busy}
            className="mm-assistant-summarize-cta"
            onClick={() => void meceFooterPrimary.onClick()}
          >
            <Wand2 className="h-4 w-4" />
            {meceFooterPrimary.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default memo(AssistantWorkspaceFooterInner);
