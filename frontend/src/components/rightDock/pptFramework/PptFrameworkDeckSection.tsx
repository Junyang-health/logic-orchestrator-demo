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
  onUpdateSlide
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
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{t("ppt_deck")}</div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className="ios-button py-0.5 text-[10px]" onClick={onExportPrompt}>
            {t("ppt_export_prompt")}
          </button>
          <button
            type="button"
            className="ios-button flex items-center gap-0.5 py-0.5 text-[10px]"
            onClick={() => void onCopyPptPrompt()}
            title={t("ppt_copy_prompt_title")}
          >
            <ClipboardCopy className="h-3 w-3 shrink-0 opacity-80" />
            {t("ppt_copy_prompt")}
          </button>
          {copyPromptFeedback === "ok" ? (
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400">{t("ppt_copied")}</span>
          ) : copyPromptFeedback === "err" ? (
            <span className="text-[9px] text-rose-600 dark:text-rose-400">{t("ppt_copy_failed")}</span>
          ) : null}
          <button type="button" className="ios-button py-0.5 text-[10px]" onClick={onExportMd}>
            {t("ppt_export_md")}
          </button>
        </div>
      </div>
      <p className="mb-2 text-[10px] text-slate-500 dark:text-slate-400">{t("ppt_deck_edit_hint")}</p>

      {shouldVirtual ? (
        <div
          ref={parentRef}
          className="max-h-[min(70vh,520px)] overflow-auto rounded-md border border-rose-100/40 bg-slate-50/30 p-1 dark:border-violet-900/20 dark:bg-slate-900/20"
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

      <button type="button" className="ios-button mt-2 w-full py-1.5 text-xs" onClick={onAddSlide}>
        <Plus className="mr-1 inline h-3.5 w-3.5" />
        {t("ppt_add_slide")}
      </button>
    </div>
  );
}
