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
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
          {t("ppt_intent")}
        </label>
        <textarea
          className="ios-field min-h-[64px] w-full py-2 text-xs"
          value={intent}
          onChange={(e) => onIntent(e.target.value)}
          placeholder={t("ppt_intent_ph")}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
          {t("ppt_audience")}
        </label>
        <input
          className="ios-field w-full text-xs"
          value={audience}
          onChange={(e) => onAudience(e.target.value)}
          placeholder={t("ppt_audience_ph")}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
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
            <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
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
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
          {t("ppt_deck_style_label")}
        </label>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {PPT_DECK_STYLE_ROWS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={[
                "rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium leading-snug transition",
                deckStyle === r.id
                  ? "border-slate-900 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950"
                  : "border-slate-200/80 bg-white/70 text-slate-700 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:border-slate-500"
              ].join(" ")}
              onClick={() => onDeckStyle(r.id)}
            >
              {t(r.name)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
          {t("ppt_style")}
        </label>
        <textarea
          className="ios-field min-h-[56px] w-full py-2 text-xs"
          value={style}
          onChange={(e) => onStyle(e.target.value)}
          placeholder={t("ppt_style_ph")}
        />
      </div>
    </div>
  );
}
