import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ClipboardCopy, Plus } from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";
import type { PptSlide } from "../../../lib/pptFrameworkExport";
import { PptFrameworkSlideCard } from "./PptFrameworkSlideCard";
import { PPT_DECK_VIRTUALIZE_AT } from "./constants";

type CopyFeedback = "ok" | "err" | null;

type Props = {
  slides: PptSlide[];
  copyPromptFeedback: CopyFeedback;
  onExportPrompt: () => void;
  onCopyPptPrompt: () => void;
  onExportMd: () => void;
  onMoveSlide: (index: number, dir: -1 | 1) => void;
  onRemoveSlide: (index: number) => void;
  onAddSlide: () => void;
  onUpdateSlide: (index: number, field: keyof PptSlide, value: string) => void;
  showExportActions?: boolean;
};

export default function PptFrameworkDeckSection({
  slides,
  copyPromptFeedback,
  onExportPrompt,
  onCopyPptPrompt,
  onExportMd,
  onMoveSlide,
  onRemoveSlide,
  onAddSlide,
  onUpdateSlide,
  showExportActions = true
}: Props) {
  const { t } = useI18n();
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtual = slides.length > PPT_DECK_VIRTUALIZE_AT;

  const virtualizer = useVirtualizer({
    count: shouldVirtual ? slides.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 420,
    overscan: 3,
    measureElement: (el) => (el as HTMLElement).getBoundingClientRect().height
  });

  if (slides.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Slides
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{t("ppt_deck")}</div>
          <p className="mt-1 max-w-[28rem] text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
            Review each slide as a story unit first, then expand only the cards you want to edit.
          </p>
        </div>
        {showExportActions ? (
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className="ios-button py-1 text-[11px]" onClick={onExportPrompt}>
              {t("ppt_export_prompt")}
            </button>
            <button
              type="button"
              className="ios-button flex items-center gap-1 py-1 text-[11px]"
              onClick={() => void onCopyPptPrompt()}
              title={t("ppt_copy_prompt_title")}
            >
              <ClipboardCopy className="h-3 w-3 shrink-0 opacity-80" />
              {t("ppt_copy_prompt")}
            </button>
            {copyPromptFeedback === "ok" ? (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">{t("ppt_copied")}</span>
            ) : copyPromptFeedback === "err" ? (
              <span className="text-[10px] text-rose-600 dark:text-rose-400">{t("ppt_copy_failed")}</span>
            ) : null}
            <button type="button" className="ios-button py-1 text-[11px]" onClick={onExportMd}>
              {t("ppt_export_md")}
            </button>
          </div>
        ) : null}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {slides.length} slide{slides.length === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Summary-first review
        </span>
      </div>

      {shouldVirtual ? (
        <div
          ref={parentRef}
          className="max-h-[min(70vh,560px)] overflow-auto rounded-2xl border border-slate-200/80 bg-slate-50/55 p-2 dark:border-slate-700/70 dark:bg-slate-950/25"
        >
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() > 0 ? virtualizer.getTotalSize() : "auto" }}
          >
            {virtualizer.getVirtualItems().map((v) => {
              const i = v.index;
              const sl = slides[i]!;
              return (
                <div
                  key={sl.id}
                  data-index={v.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full px-1"
                  style={{ transform: `translateY(${v.start}px)` }}
                >
                  <div className="pb-3">
                    <PptFrameworkSlideCard
                      index={i}
                      slide={sl}
                      slideCount={slides.length}
                      onMove={(dir) => onMoveSlide(i, dir)}
                      onRemove={() => onRemoveSlide(i)}
                      onChange={(field, value) => onUpdateSlide(i, field, value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {slides.map((sl, i) => (
            <PptFrameworkSlideCard
              key={sl.id}
              index={i}
              slide={sl}
              slideCount={slides.length}
              onMove={(dir) => onMoveSlide(i, dir)}
              onRemove={() => onRemoveSlide(i)}
              onChange={(field, value) => onUpdateSlide(i, field, value)}
            />
          ))}
        </div>
      )}

      <button type="button" className="ios-button mt-3 w-full py-2 text-[12px] font-semibold" onClick={onAddSlide}>
        <Plus className="mr-1 inline h-3.5 w-3.5" />
        Add slide after last
      </button>
    </div>
  );
}
