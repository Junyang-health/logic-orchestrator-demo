import { Trash2 } from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";
import type { PptSlide } from "../../../lib/pptFrameworkExport";

type Props = {
  index: number;
  slide: PptSlide;
  slideCount: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onChange: (field: keyof PptSlide, value: string) => void;
};

export function PptFrameworkSlideCard({ index, slide: sl, slideCount, onMove, onRemove, onChange }: Props) {
  const { t } = useI18n();

  return (
    <div className="rounded-lg border border-rose-100/50 bg-white/60 p-2 shadow-pastel dark:border-violet-900/30 dark:bg-slate-900/40">
        <div className="mb-1 flex items-center justify-between gap-1">
          <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
            {t("ppt_slide_n", { n: index + 1 })}
          </span>
          <div className="flex gap-0.5">
            <button
              type="button"
              className="ios-button py-0 px-1.5 text-[10px]"
              onClick={() => onMove(-1)}
              disabled={index === 0}
            >
              ↑
            </button>
            <button
              type="button"
              className="ios-button py-0 px-1.5 text-[10px]"
              onClick={() => onMove(1)}
              disabled={index === slideCount - 1}
            >
              ↓
            </button>
            <button
              type="button"
              className="ios-button py-0 px-1.5 text-[10px] text-rose-700 dark:text-rose-300"
              onClick={onRemove}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        <input
          className="ios-field mb-1 w-full py-0.5 text-xs font-semibold"
          value={sl.title}
          onChange={(e) => onChange("title", e.target.value)}
        />
        <input
          className="ios-field mb-1 w-full py-0.5 text-[11px]"
          value={sl.subtitle}
          onChange={(e) => onChange("subtitle", e.target.value)}
        />
        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t("ppt_beat")}
        </div>
        <input
          className="ios-field mb-1.5 w-full py-0.5 text-[11px] italic"
          value={sl.beat}
          onChange={(e) => onChange("beat", e.target.value)}
          placeholder={t("ppt_beat_ph")}
        />
        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t("ppt_section_content")}
        </div>
        <textarea
          className="ios-field mb-2 min-h-[72px] w-full text-[11px] leading-relaxed"
          value={sl.main}
          onChange={(e) => onChange("main", e.target.value)}
          placeholder={t("ppt_main_ph")}
        />
        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t("ppt_section_visual")}
        </div>
        <p className="mb-1 text-[9px] leading-snug text-slate-500 dark:text-slate-400">{t("ppt_visual_help")}</p>
        <textarea
          className="ios-field min-h-[64px] w-full text-[11px] leading-relaxed"
          value={sl.visual}
          onChange={(e) => onChange("visual", e.target.value)}
          placeholder={t("ppt_visual_ph")}
        />
    </div>
  );
}
