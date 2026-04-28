import { LayoutGrid, ListCollapse, ListTree, Trash2 } from "lucide-react";
import { useI18n } from "../i18n/useI18n";

type Props = {
  hasCollapsedSubtrees: boolean;
  canCollapseToTop: boolean;
  onExpandAllSubtrees: () => void;
  onCollapseAllToTop: () => void;
  canvasGridVisible: boolean;
  onToggleGrid: () => void;
  selectedEdgeId: string | null;
  onRemoveSelectedEdge: () => void;
};

export default function X6CanvasToolbar({
  hasCollapsedSubtrees,
  canCollapseToTop,
  onExpandAllSubtrees,
  onCollapseAllToTop,
  canvasGridVisible,
  onToggleGrid,
  selectedEdgeId,
  onRemoveSelectedEdge
}: Props) {
  const { t } = useI18n();

  return (
    <>
      <div
        className="pointer-events-auto absolute right-2 top-2 z-[45] flex max-w-[min(100%,20rem)] flex-col items-stretch gap-1.5 sm:right-3 sm:top-3"
        role="toolbar"
        aria-label={t("canvas_subtree_bar_aria")}
      >
        <div className="flex flex-wrap items-stretch justify-end gap-1 rounded-2xl border border-slate-200/90 bg-white/95 p-1 shadow-md backdrop-blur-sm dark:border-slate-600/90 dark:bg-slate-900/95">
          <button
            type="button"
            disabled={!hasCollapsedSubtrees}
            className="inline-flex min-h-[1.75rem] shrink-0 items-center gap-1 rounded-xl border border-transparent bg-transparent px-2 py-1 text-[10px] font-semibold text-sky-800 hover:bg-sky-100/90 disabled:cursor-not-allowed disabled:opacity-40 dark:text-sky-200 dark:hover:bg-sky-900/50"
            onClick={onExpandAllSubtrees}
            title={hasCollapsedSubtrees ? t("canvas_expand_all_subtrees_title") : t("canvas_expand_all_subtrees_disabled")}
            aria-label={
              hasCollapsedSubtrees ? t("canvas_expand_all_subtrees_title") : t("canvas_expand_all_subtrees_disabled")
            }
          >
            <ListTree className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">{t("canvas_expand_all_subtrees")}</span>
          </button>
          <button
            type="button"
            disabled={!canCollapseToTop}
            className="inline-flex min-h-[1.75rem] shrink-0 items-center gap-1 rounded-xl border border-transparent bg-transparent px-2 py-1 text-[10px] font-semibold text-violet-900 hover:bg-violet-100/80 disabled:cursor-not-allowed disabled:opacity-40 dark:text-violet-200 dark:hover:bg-violet-950/50"
            onClick={onCollapseAllToTop}
            title={canCollapseToTop ? t("canvas_collapse_to_top_title") : t("canvas_collapse_to_top_disabled")}
            aria-label={canCollapseToTop ? t("canvas_collapse_to_top_title") : t("canvas_collapse_to_top_disabled")}
          >
            <ListCollapse className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">{t("canvas_collapse_to_top")}</span>
          </button>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-100/50 bg-stone-50/90 px-2.5 py-1.5 text-[10px] font-medium text-stone-600 shadow-pastel backdrop-blur-sm hover:bg-rose-50/80 dark:border-violet-800/50 dark:bg-[#2a2633]/90 dark:text-stone-200 dark:hover:bg-[#34303c]"
            onClick={onToggleGrid}
            title={canvasGridVisible ? t("canvas_grid_hide") : t("canvas_grid_show")}
            aria-pressed={canvasGridVisible}
          >
            <LayoutGrid className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            {canvasGridVisible ? t("canvas_grid_off") : t("canvas_grid_on")}
          </button>
        </div>
      </div>
      {selectedEdgeId ? (
        <div className="pointer-events-auto absolute bottom-3 left-1/2 z-30 max-w-[min(96%,28rem)] -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2 text-[10px] text-slate-800 shadow-pastel backdrop-blur-sm dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-100">
            <span className="shrink-0 text-slate-500 dark:text-slate-400">{t("edge_selected_hint")}</span>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200/80 bg-rose-50/90 px-2 py-1 font-medium text-rose-800 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/60 dark:text-rose-100 dark:hover:bg-rose-900/50"
              onClick={onRemoveSelectedEdge}
              aria-label={t("edge_delete_aria")}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {t("edge_delete")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
