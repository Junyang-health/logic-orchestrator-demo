import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Cell, Graph } from "@antv/x6";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../i18n/useI18n";
import useUiStore from "../../store/useUiStore";
import { collectBranchSubgraph, combineGraphs, mergeBranchSubgraphs } from "../../lib/graphBranch";
import { mindmapBranchSelectionToMarkdown } from "../../lib/mindmapMarkdown";
import {
  buildMindmapTreeRows,
  buildOutgoingChildIdsByParent,
  visibleNodeIdsForTreeFilter
} from "../../lib/mindmapTreeRows";
import PptFrameworkExportPanel from "./PptFrameworkExportPanel";
import "@antv/x6-plugin-export/lib/api";

function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadDataUri(filename: string, dataUri: string) {
  const a = document.createElement("a");
  a.href = dataUri;
  a.download = filename;
  a.click();
}

function exportStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function subtreeFullySelected(
  id: string,
  sel: Record<string, boolean>,
  childMap: ReadonlyMap<string, readonly string[]>
): boolean {
  if (!sel[id]) return false;
  for (const cid of childMap.get(id) ?? []) {
    if (!subtreeFullySelected(cid, sel, childMap)) return false;
  }
  return true;
}

function subtreeHasSelection(
  id: string,
  sel: Record<string, boolean>,
  childMap: ReadonlyMap<string, readonly string[]>
): boolean {
  if (sel[id]) return true;
  for (const cid of childMap.get(id) ?? []) {
    if (subtreeHasSelection(cid, sel, childMap)) return true;
  }
  return false;
}

export default function ExportSidebarPanel(props: { graph: Graph | null; backendBase: string }) {
  const { t, locale } = useI18n();
  const { graph, backendBase } = props;
  const { mainGraph, sandboxGraph, theme } = useUiStore(
    useShallow((s) => ({
      mainGraph: s.mainGraph,
      sandboxGraph: s.sandboxGraph,
      theme: s.theme
    }))
  );

  const combined = useMemo(() => combineGraphs(mainGraph, sandboxGraph), [mainGraph, sandboxGraph]);

  const treeRows = useMemo(() => buildMindmapTreeRows(combined), [combined]);
  const childIdsByParent = useMemo(() => buildOutgoingChildIdsByParent(combined), [combined]);

  const [filter, setFilter] = useState("");
  const visibleIds = useMemo(() => visibleNodeIdsForTreeFilter(combined, filter), [combined, filter]);

  const displayRows = useMemo(() => {
    if (!visibleIds) return treeRows;
    return treeRows.filter((r) => visibleIds.has(r.node.id));
  }, [treeRows, visibleIds]);

  const allIds = useMemo(() => combined.nodes.map((n) => n.id), [combined.nodes]);

  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [exportTab, setExportTab] = useState<"mindmap" | "ppt">("mindmap");
  const [format, setFormat] = useState<"markdown" | "jpeg">("markdown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedList = useMemo(
    () => Object.entries(selectedIds).filter(([, on]) => on).map(([id]) => id),
    [selectedIds]
  );

  const total = allIds.length;
  const selectedCount = selectedList.length;
  const allSelected = total > 0 && selectedCount === total;
  const someSelected = selectedCount > 0 && !allSelected;

  const masterRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const el = masterRef.current;
    if (el) el.indeterminate = someSelected;
  }, [someSelected, allSelected]);

  const toggleId = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const fully = subtreeFullySelected(id, prev, childIdsByParent);
        const sub = collectBranchSubgraph(id, combined);
        const next = { ...prev };
        if (fully) {
          for (const n of sub.nodes) next[n.id] = false;
        } else {
          for (const n of sub.nodes) next[n.id] = true;
        }
        return next;
      });
    },
    [childIdsByParent, combined]
  );

  const selectAllBranches = useCallback(() => {
    setSelectedIds(Object.fromEntries(allIds.map((id) => [id, true])));
  }, [allIds]);

  const deselectAllBranches = useCallback(() => setSelectedIds({}), []);

  const onMasterCheckboxChange = useCallback(() => {
    if (allSelected) deselectAllBranches();
    else selectAllBranches();
  }, [allSelected, deselectAllBranches, selectAllBranches]);

  const runExport = useCallback(() => {
    setError("");
    if (selectedList.length === 0) {
      setError(t("export_err_select"));
      return;
    }
    const sub = mergeBranchSubgraphs(selectedList, combined);
    if (sub.nodes.length === 0) {
      setError(t("export_err_empty"));
      return;
    }

    const stamp = exportStamp();

    if (format === "markdown") {
      const md = mindmapBranchSelectionToMarkdown(combined, selectedList);
      downloadTextFile(`mindmap-export-${stamp}.md`, md, "text/markdown;charset=utf-8");
      return;
    }

    if (!graph) {
      setError(t("export_err_canvas"));
      return;
    }

    const gAny = graph as Graph & {
      toJPEG?: (cb: (dataUri: string) => void, opts?: Record<string, unknown>) => void;
    };
    if (typeof gAny.toJPEG !== "function") {
      setError(t("export_err_plugin"));
      return;
    }

    const nodeCells = sub.nodes
      .map((n) => graph.getCellById(n.id))
      .filter((c): c is Cell => Boolean(c));
    const cells = graph.getSubGraph(nodeCells, {});
    const bbox = graph.getCellsBBox(cells);
    if (!bbox) {
      setError(t("export_err_bounds"));
      return;
    }

    const vb = graph.localToGraph(bbox);
    const rootStyle = getComputedStyle(document.documentElement);
    const cssBg = rootStyle.getPropertyValue("--mm-canvas-bg").trim();
    const backgroundColor =
      cssBg && !cssBg.startsWith("var(") ? cssBg : theme === "dark" ? "#0f172a" : "#f8fafc";

    setBusy(true);
    try {
      gAny.toJPEG(
        (dataUri: string) => {
          if (!dataUri) setError(t("export_err_jpeg_empty"));
          else downloadDataUri(`mindmap-export-${stamp}.jpg`, dataUri);
          setBusy(false);
        },
        {
          viewBox: { x: vb.x, y: vb.y, width: vb.width, height: vb.height },
          backgroundColor,
          quality: 0.92,
          padding: 16,
          copyStyles: true
        }
      );
    } catch {
      setError(t("export_err_jpeg_fail"));
      setBusy(false);
    }
  }, [combined, format, graph, selectedList, theme, t, locale]);

  return (
    <div className="space-y-4 text-sm text-slate-800 dark:text-slate-100">
      <div>
        <div className="text-base font-semibold text-slate-900 dark:text-slate-50">{t("export_title")}</div>
        <div className="mt-2 ios-segment w-full">
          <button
            type="button"
            className={[
              "ios-segment-item flex-1 text-[11px]",
              exportTab === "mindmap" ? "ios-segment-item-active" : "ios-segment-item-inactive"
            ].join(" ")}
            onClick={() => {
              setError("");
              setExportTab("mindmap");
            }}
          >
            {t("export_tab_mindmap")}
          </button>
          <button
            type="button"
            className={[
              "ios-segment-item flex-1 text-[11px]",
              exportTab === "ppt" ? "ios-segment-item-active" : "ios-segment-item-inactive"
            ].join(" ")}
            onClick={() => {
              setError("");
              setExportTab("ppt");
            }}
          >
            {t("export_tab_ppt")}
          </button>
        </div>
        {exportTab === "mindmap" ? (
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{t("export_intro")}</p>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{t("export_ppt_subtitle")}</p>
        )}
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{t("export_branches")}</div>
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border ios-divider bg-slate-50/90 px-2 py-2 dark:bg-slate-900/50">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-800 dark:text-slate-100">
            <input
              ref={masterRef}
              type="checkbox"
              className="mt-0.5"
              checked={allSelected}
              onChange={onMasterCheckboxChange}
              aria-label={allSelected ? t("export_deselect_all_branches") : t("export_select_all_branches")}
            />
            <span>{allSelected ? t("export_deselect_all") : t("review_select_all")}</span>
          </label>
          <button
            type="button"
            className="text-xs font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
            onClick={deselectAllBranches}
            disabled={selectedCount === 0}
          >
            {t("export_deselect_all")}
          </button>
        </div>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("export_filter_ph")}
          className="ios-field mb-2 w-full px-2 py-1.5 text-xs"
        />
        <div className="max-h-[min(40vh,320px)] space-y-0.5 overflow-auto rounded-md border ios-divider bg-slate-50/80 p-2 dark:bg-slate-900/40">
          {combined.nodes.length === 0 ? (
            <div className="text-xs text-slate-500 dark:text-slate-400">{t("export_no_mindmap")}</div>
          ) : displayRows.length === 0 ? (
            <div className="text-xs text-slate-500 dark:text-slate-400">{t("export_no_filter_match")}</div>
          ) : (
            displayRows.map(({ node: n, depth }) => {
              const fully = subtreeFullySelected(n.id, selectedIds, childIdsByParent);
              const has = subtreeHasSelection(n.id, selectedIds, childIdsByParent);
              const indeterminate = has && !fully;
              return (
                <label
                  key={n.id}
                  className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-white/80 dark:hover:bg-slate-800/60"
                  style={{ paddingLeft: depth * 14 }}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={fully}
                    ref={(el) => {
                      if (el) el.indeterminate = indeterminate;
                    }}
                    onChange={() => toggleId(n.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="mr-1.5 inline-block min-w-[1.75rem] text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {t("level_l", { depth })}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{n.label}</span>
                    <span className="ml-1 text-slate-500 dark:text-slate-400">
                      · {n.type || t("export_node_fallback")} · <code className="text-[10px]">{n.id}</code>
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          {t("export_nodes_in_sel", { n: selectedList.length })}
        </div>
      </div>

      {exportTab === "mindmap" ? (
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">{t("export_format")}</div>
          <div className="ios-segment w-full">
            <button
              type="button"
              className={[
                "ios-segment-item flex-1 text-[11px]",
                format === "markdown" ? "ios-segment-item-active" : "ios-segment-item-inactive"
              ].join(" ")}
              onClick={() => setFormat("markdown")}
            >
              {t("export_markdown")}
            </button>
            <button
              type="button"
              className={[
                "ios-segment-item flex-1 text-[11px]",
                format === "jpeg" ? "ios-segment-item-active" : "ios-segment-item-inactive"
              ].join(" ")}
              onClick={() => setFormat("jpeg")}
            >
              {t("export_jpeg")}
            </button>
          </div>
        </div>
      ) : null}

      {exportTab === "mindmap" && error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      {exportTab === "mindmap" ? (
        <button
          type="button"
          className="ios-button-primary w-full py-2 text-sm font-semibold disabled:opacity-50"
          disabled={busy || combined.nodes.length === 0}
          onClick={runExport}
        >
          {busy ? t("export_exporting") : t("export_cta")}
        </button>
      ) : null}

      {exportTab === "ppt" ? (
        <PptFrameworkExportPanel
          backendBase={backendBase}
          combined={combined}
          selectedList={selectedList}
        />
      ) : null}
    </div>
  );
}
