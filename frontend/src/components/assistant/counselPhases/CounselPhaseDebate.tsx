import CounselSpotlightTranscript from "../CounselSpotlightTranscript";
import { useI18n } from "../../../i18n/useI18n";

export type CounselPhaseDebateProps = {
  currentDebateArea: { id: string; title: string };
  debateTranscripts: Record<string, { speaker: string; content: string }[]>;
  debateMsgCount: number;
  debateMsgLimit: number;
  busy: boolean;
  debatePaused: boolean;
  onExtendMessageLimit: () => void;
  onEndCurrentAreaOrNext: () => void;
  onAdvanceDebate: () => void;
};

export default function CounselPhaseDebate(props: CounselPhaseDebateProps) {
  const { t } = useI18n();
  const {
    currentDebateArea,
    debateTranscripts,
    debateMsgCount,
    debateMsgLimit,
    busy,
    debatePaused,
    onExtendMessageLimit,
    onEndCurrentAreaOrNext,
    onAdvanceDebate
  } = props;

  return (
    <div className="flex min-h-[min(58vh,32rem)] flex-col gap-3">
      <div className="shrink-0 font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {t("counsel_debate_area", { title: currentDebateArea.title })}
        <span className="ml-2 tabular-nums opacity-80">
          · {debateMsgCount}/{debateMsgLimit} {t("counsel_messages")}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/55 bg-gradient-to-b from-white/55 to-slate-50/35 shadow-inner dark:border-slate-600/40 dark:from-slate-900/40 dark:to-slate-950/35">
        <CounselSpotlightTranscript
          lines={debateTranscripts[currentDebateArea.id] || []}
          className="max-h-[min(52vh,30rem)] min-h-[12rem]"
        />
      </div>
      {debateMsgCount >= debateMsgLimit ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className="ios-button flex-1 py-2 text-[10px]" onClick={onEndCurrentAreaOrNext}>
            {t("counsel_end_area")}
          </button>
          <button
            type="button"
            className="ios-button flex-1 py-2 text-[10px]"
            onClick={onExtendMessageLimit}
          >
            {t("counsel_extend_10")}
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className="ios-button flex-1 py-1.5 text-[10px]"
            disabled={busy || debatePaused}
            onClick={() => void onAdvanceDebate()}
          >
            {t("counsel_debate_advance")}
          </button>
          <button type="button" className="ios-button flex-1 py-1.5 text-[10px]" onClick={onEndCurrentAreaOrNext}>
            {t("counsel_skip_area")}
          </button>
        </div>
      )}
    </div>
  );
}
