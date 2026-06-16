import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, PencilLine, Trash2 } from "lucide-react";
import { useState } from "react";
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

function summarize(text: string, fallback: string) {
  const clean = text.trim();
  if (!clean) return fallback;
  return clean.length > 160 ? `${clean.slice(0, 160)}…` : clean;
}

export function PptFrameworkSlideCard({ index, slide: sl, slideCount, onMove, onRemove, onChange }: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(index === 0);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/88 p-3 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/65">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {t("ppt_slide_n", { n: index + 1 })}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
              <PencilLine className="h-3.5 w-3.5" />
              {expanded ? "Editing" : "Summary"}
            </span>
          </div>
          <div className="mt-2 text-[18px] font-semibold leading-tight text-slate-950 dark:text-slate-50">
            {sl.title || "(untitled)"}
          </div>
          <div className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            {sl.subtitle || "No subtitle yet"}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-35 dark:border-slate-700 dark:text-slate-300"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move slide up"
            title="Move slide up"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-35 dark:border-slate-700 dark:text-slate-300"
            onClick={() => onMove(1)}
            disabled={index === slideCount - 1}
            aria-label="Move slide down"
            title="Move slide down"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-xl border border-rose-200 p-2 text-rose-700 dark:border-rose-500/35 dark:text-rose-300"
            onClick={onRemove}
            aria-label="Delete slide"
            title="Delete slide"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-xl border border-slate-200 p-2 text-slate-500 dark:border-slate-700 dark:text-slate-300"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse slide details" : "Expand slide details"}
            title={expanded ? "Collapse slide details" : "Expand slide details"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/85 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/45">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Story beat</div>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-800 dark:text-slate-100">
            {summarize(sl.beat, "Add the slide’s narrative role.")}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/85 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/45">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Message</div>
          <p className="mt-1 line-clamp-4 text-[13px] leading-relaxed text-slate-800 dark:text-slate-100">
            {summarize(sl.main, "Add the key content and proof points.")}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/85 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/45">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Visual</div>
          <p className="mt-1 line-clamp-4 text-[13px] leading-relaxed text-slate-800 dark:text-slate-100">
            {summarize(sl.visual, "Specify the core visual anchor, chart, or layout.")}
          </p>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3 border-t border-slate-200/80 pt-4 dark:border-slate-700/70">
          <div className="grid gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_fw_title")}</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] font-semibold dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                value={sl.title}
                onChange={(e) => onChange("title", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("slide_deck_fw_subtitle")}</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                value={sl.subtitle}
                onChange={(e) => onChange("subtitle", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("ppt_beat")}</span>
              <textarea
                className="mt-1 min-h-[4.5rem] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] italic dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                value={sl.beat}
                onChange={(e) => onChange("beat", e.target.value)}
                placeholder={t("ppt_beat_ph")}
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("ppt_section_content")}</span>
              <textarea
                className="mt-1 min-h-[8rem] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] leading-relaxed dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                value={sl.main}
                onChange={(e) => onChange("main", e.target.value)}
                placeholder={t("ppt_main_ph")}
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{t("ppt_section_visual")}</span>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">{t("ppt_visual_help")}</p>
              <textarea
                className="mt-1.5 min-h-[7rem] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] leading-relaxed dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                value={sl.visual}
                onChange={(e) => onChange("visual", e.target.value)}
                placeholder={t("ppt_visual_ph")}
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
