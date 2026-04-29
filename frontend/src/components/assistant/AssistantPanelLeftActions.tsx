import { memo } from "react";
import { MessageCircle, Wand2 } from "lucide-react";
import { useI18n } from "../../i18n/useI18n";
import type { AssistantPanelMode } from "./assistantPanelMode";

export type AssistantPanelLeftActionsProps = {
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
};

function AssistantPanelLeftActionsInner(props: AssistantPanelLeftActionsProps) {
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
    onApplyToMindmap
  } = props;

  const { t } = useI18n();
  const isRoundtable = mode === "roundtable";
  const isMece = mode === "mece";

  return (
    <div className="shrink-0 space-y-2 border-t border-slate-200 bg-slate-50/95 p-2 dark:border-slate-800 dark:bg-slate-950/95">
      {error ? <p className="text-[10px] text-red-700 dark:text-red-400">{error}</p> : null}
      {!selectedNodeId ? (
        <p className="text-[10px] text-amber-800 dark:text-amber-200">
          {isRoundtable ? t("footer_select_roundtable") : isMece ? t("footer_select_mece") : t("footer_select_apply")}
        </p>
      ) : (
        <p className="text-[10px] text-slate-600 dark:text-slate-400">
          {isRoundtable ? t("footer_apply_root") : t("footer_apply_target")}
          <code className="rounded bg-white px-0.5 dark:bg-slate-900 dark:text-slate-200">{selectedNodeId}</code>
        </p>
      )}

      {isRoundtable ? (
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
      ) : (
        <button
          type="button"
          disabled={applyBusy || messagesCount === 0 || !selectedNodeId}
          className="ios-button flex w-full items-center justify-center gap-1.5 text-[11px]"
          onClick={() => void onApplyToMindmap()}
        >
          <Wand2 className="h-3.5 w-3.5" />
          {applyBusy ? t("footer_applying") : t("footer_summarize_node")}
        </button>
      )}
    </div>
  );
}

export default memo(AssistantPanelLeftActionsInner);
