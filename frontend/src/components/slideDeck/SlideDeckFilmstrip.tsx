import { GripVertical, Trash2 } from "lucide-react";
import { useCallback, useState, type DragEvent } from "react";
import type { PptSlide } from "../../lib/pptFrameworkExport";
import { useI18n } from "../../i18n/useI18n";
import { slideBuildPreviewUrl } from "../../lib/slideBuildApi";

const DT_INDEX = "application/x-slide-deck-index";

type Props = {
  slides: readonly PptSlide[];
  activeIndex: number;
  onSelectIndex: (index: number) => void;
  canMutate: boolean;
  disabled?: boolean;
  onReorder: (nextOrdered: PptSlide[]) => void;
  onDeleteSlide: (slideId: string) => void;
  backendBase: string;
  sessionId: string | null;
};

export default function SlideDeckFilmstrip(props: Props) {
  const {
    slides,
    activeIndex,
    onSelectIndex,
    canMutate,
    disabled,
    onReorder,
    onDeleteSlide,
    backendBase,
    sessionId
  } = props;
  const { t } = useI18n();
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const reorderFromDrag = useCallback(
    (from: number, to: number) => {
      if (!canMutate || disabled || from === to || from < 0 || to < 0) return;
      if (from >= slides.length || to >= slides.length) return;
      const next = [...slides];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      onReorder(next);
    },
    [canMutate, disabled, slides, onReorder]
  );

  const onGripDragStart = useCallback(
    (e: DragEvent, index: number) => {
      if (!canMutate || disabled) {
        e.preventDefault();
        return;
      }
      setDragIndex(index);
      e.dataTransfer.effectAllowed = "move";
      const s = String(index);
      e.dataTransfer.setData(DT_INDEX, s);
      e.dataTransfer.setData("text/plain", s);
      try {
        const img = new Image();
        img.src =
          "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        e.dataTransfer.setDragImage(img, 0, 0);
      } catch {
        /* ignore */
      }
    },
    [canMutate, disabled]
  );

  const onGripDragEnd = useCallback(() => setDragIndex(null), []);

  const onStripDragOver = useCallback(
    (e: DragEvent) => {
      if (!canMutate || disabled) return;
      const types = Array.from(e.dataTransfer.types || []);
      if (!types.some((ty) => ty === DT_INDEX || ty === "text/plain")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    [canMutate, disabled]
  );

  const onThumbDrop = useCallback(
    (e: DragEvent, dropIndex: number) => {
      if (!canMutate || disabled) return;
      e.preventDefault();
      const raw = e.dataTransfer.getData(DT_INDEX) || e.dataTransfer.getData("text/plain");
      const from = parseInt(raw, 10);
      if (Number.isNaN(from)) return;
      reorderFromDrag(from, dropIndex);
      setDragIndex(null);
    },
    [canMutate, disabled, reorderFromDrag]
  );

  return (
    <div className="mx-auto flex max-w-[88rem] gap-2 overflow-x-auto pb-1" onDragOver={onStripDragOver}>
      {slides.map((s, i) => {
        const previewSrc =
          sessionId && s.id ? slideBuildPreviewUrl(backendBase.replace(/\/$/, ""), sessionId, s.id) : "";
        return (
          <div
            key={s.id}
            className={[
              "group relative flex w-[8.75rem] shrink-0 flex-col gap-1.5 rounded-xl border p-1.5 transition",
              i === activeIndex
                ? "border-violet-500/80 bg-violet-500/12 shadow-[0_0_0_1px_rgba(139,92,246,0.25)]"
                : "border-slate-200/80 bg-white/90 hover:border-slate-300 dark:border-slate-700/80 dark:bg-slate-900/80 dark:hover:border-slate-600",
              dragIndex === i ? "opacity-60" : ""
            ].join(" ")}
            onDragOver={onStripDragOver}
            onDrop={(e) => onThumbDrop(e, i)}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelectIndex(i)}
                className="min-w-0 text-left"
              >
                <div className="text-[10px] font-semibold text-slate-900 dark:text-slate-50">#{i + 1}</div>
                <div className="mt-0.5 line-clamp-1 text-[11px] font-medium leading-tight text-slate-700 dark:text-slate-200">
                  {s.title || "Untitled slide"}
                </div>
              </button>
              <div className="flex items-center gap-1">
                {canMutate ? (
                  <div
                    role="button"
                    tabIndex={0}
                    draggable={!disabled}
                    aria-label={t("slide_deck_strip_drag_handle")}
                    title={t("slide_deck_strip_drag_hint")}
                    className={[
                      "rounded-lg p-1 text-slate-400 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 dark:text-slate-500",
                      disabled ? "cursor-not-allowed opacity-40" : "cursor-grab hover:bg-slate-200/80 dark:hover:bg-slate-700/80"
                    ].join(" ")}
                    onDragStart={(e) => onGripDragStart(e, i)}
                    onDragEnd={onGripDragEnd}
                    onKeyDown={(e) => {
                      if (disabled) return;
                      if (e.key === "ArrowLeft" && i > 0) {
                        e.preventDefault();
                        reorderFromDrag(i, i - 1);
                      }
                      if (e.key === "ArrowRight" && i < slides.length - 1) {
                        e.preventDefault();
                        reorderFromDrag(i, i + 1);
                      }
                    }}
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>
                ) : null}
                {canMutate ? (
                  <button
                    type="button"
                    className="rounded-lg p-1 text-slate-400 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-600 group-hover:opacity-100 group-focus-within:opacity-100 dark:hover:text-rose-400"
                    aria-label={t("slide_deck_strip_delete")}
                    title={t("slide_deck_strip_delete")}
                    disabled={disabled}
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      if (disabled) return;
                      if (!window.confirm(t("slide_deck_strip_delete_confirm"))) return;
                      onDeleteSlide(s.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelectIndex(i)}
              className="block rounded-lg text-left outline-none ring-offset-2 ring-offset-[var(--mm-bg-app)] focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <div className="relative overflow-hidden rounded-lg border border-slate-200/80 bg-slate-100 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div style={{ aspectRatio: "16 / 9" }} className="relative w-full overflow-hidden">
                  {previewSrc ? (
                    <iframe
                      title={`${s.title || "Slide"} thumbnail`}
                      src={previewSrc}
                      loading="lazy"
                      className="pointer-events-none absolute left-0 top-0 h-[400%] w-[400%] origin-top-left scale-[0.25] border-0 bg-white"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-3 text-center text-[11px] font-medium text-slate-500 dark:from-slate-800 dark:to-slate-700 dark:text-slate-300">
                      {s.title || "Slide preview"}
                    </div>
                  )}
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
