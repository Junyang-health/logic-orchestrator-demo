import { useI18n } from "../../../i18n/useI18n";
import type { PptDeckStyleId } from "../../../lib/pptFrameworkExport";
import { PPT_DECK_STYLE_ROWS } from "./constants";

type Props = {
  intent: string;
  onIntent: (v: string) => void;
  audience: string;
  onAudience: (v: string) => void;
  pageCount: number;
  onPageCount: (n: number) => void;
  deckStyle: PptDeckStyleId;
  onDeckStyle: (id: PptDeckStyleId) => void;
  style: string;
  onStyle: (v: string) => void;
  enrichBatchSize: number;
  onEnrichBatchSize: (n: number) => void;
  showAdvanced?: boolean;
};

export default function PptFrameworkBriefSection(props: Props) {
  const { t } = useI18n();
  const {
    intent,
    onIntent,
    audience,
    onAudience,
    pageCount,
    onPageCount,
    deckStyle,
    onDeckStyle,
    style,
    onStyle,
    enrichBatchSize,
    onEnrichBatchSize,
    showAdvanced = true
  } = props;

  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{t("ppt_brief")}</div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {t("ppt_intent")}
      </label>
      <textarea
        className="ios-field mb-2 min-h-[56px] w-full py-1.5 text-xs"
        value={intent}
        onChange={(e) => onIntent(e.target.value)}
        placeholder={t("ppt_intent_ph")}
      />
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {t("ppt_audience")}
      </label>
      <input
        className="ios-field mb-2 w-full text-xs"
        value={audience}
        onChange={(e) => onAudience(e.target.value)}
        placeholder={t("ppt_audience_ph")}
      />
      <div className="mb-2 flex flex-wrap gap-2">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("ppt_pages")}
          </label>
          <input
            type="number"
            min={1}
            max={40}
            className="ios-field w-full text-xs"
            value={pageCount}
            onChange={(e) => onPageCount(Math.min(40, Math.max(1, Number(e.target.value) || 8)))}
          />
        </div>
        {showAdvanced ? (
          <div className="w-full min-w-[6.5rem] sm:w-28">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("ppt_enrich_batch")}
            </label>
            <input
              type="number"
              min={1}
              max={8}
              className="ios-field w-full text-xs"
              value={enrichBatchSize}
              onChange={(e) => onEnrichBatchSize(Math.min(8, Math.max(1, Number(e.target.value) || 3)))}
              title={t("ppt_enrich_batch_help")}
            />
          </div>
        ) : null}
      </div>
      {showAdvanced ? (
        <p className="mb-2 text-[9px] leading-snug text-slate-500 dark:text-slate-400">{t("ppt_enrich_batch_help")}</p>
      ) : null}
      <div className="mb-2">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t("ppt_deck_style_label")}
        </label>
        <p className="mb-1.5 text-[9px] leading-snug text-slate-500 dark:text-slate-400">{t("ppt_deck_style_help")}</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {PPT_DECK_STYLE_ROWS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={[
                "rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium leading-snug transition",
                deckStyle === r.id
                  ? "border-violet-300/80 bg-violet-50/90 text-stone-900 dark:border-violet-500/50 dark:bg-violet-950/40 dark:text-stone-50"
                  : "border-rose-100/50 bg-stone-50/70 text-stone-700 hover:bg-white/90 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-200"
              ].join(" ")}
              onClick={() => onDeckStyle(r.id)}
            >
              {t(r.name)}
            </button>
          ))}
        </div>
      </div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {t("ppt_style")}
      </label>
      <textarea
        className="ios-field min-h-[48px] w-full py-1.5 text-xs"
        value={style}
        onChange={(e) => onStyle(e.target.value)}
        placeholder={t("ppt_style_ph")}
      />
    </div>
  );
}
