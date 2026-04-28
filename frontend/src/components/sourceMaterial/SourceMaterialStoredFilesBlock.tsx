import type { Dispatch, SetStateAction } from "react";
import { useI18n } from "../../i18n/useI18n";
import { formatBytes } from "../../lib/formatBytes";
import type { SourceSortKey, StoredProjectFile } from "./sourceFileSort";

type Props = {
  backendBase: string;
  projectId: string;
  projectDownloadBase: string;
  storedFiles: StoredProjectFile[];
  sortedStoredFiles: StoredProjectFile[];
  sourceSort: SourceSortKey;
  onSourceSortChange: (key: SourceSortKey) => void;
  selectedStoredIds: string[];
  setSelectedStoredIds: Dispatch<SetStateAction<string[]>>;
  refreshStoredFiles: () => void | Promise<void>;
  setError: (msg: string) => void;
};

export function SourceMaterialStoredFilesBlock(props: Props) {
  const { t } = useI18n();
  const {
    backendBase,
    projectId,
    projectDownloadBase,
    storedFiles,
    sortedStoredFiles,
    sourceSort,
    onSourceSortChange,
    selectedStoredIds,
    setSelectedStoredIds,
    refreshStoredFiles,
    setError
  } = props;

  if (!projectId || storedFiles.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
        <span>
          {t("sm_stored_line", { files: storedFiles.length, n: selectedStoredIds.length })}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[10px]">
            <span className="text-slate-500">{t("sm_sort_label")}</span>
            <select
              className="ios-select max-w-[10rem] py-1 text-[10px]"
              value={sourceSort}
              onChange={(e) => onSourceSortChange(e.target.value as SourceSortKey)}
            >
              <option value="date_new">{t("sm_sort_date_new")}</option>
              <option value="date_old">{t("sm_sort_date_old")}</option>
              <option value="type">{t("sm_sort_type")}</option>
              <option value="origin">{t("sm_sort_origin")}</option>
            </select>
          </label>
          <button type="button" className="text-slate-600 underline dark:text-slate-300" onClick={() => refreshStoredFiles()}>
            {t("sm_refresh")}
          </button>
          <button
            type="button"
            className="text-sky-700 underline"
            onClick={() => setSelectedStoredIds(storedFiles.map((x) => x.id))}
          >
            {t("review_select_all")}
          </button>
          <button type="button" className="text-slate-600 underline dark:text-slate-300" onClick={() => setSelectedStoredIds([])}>
            {t("review_clear_selection")}
          </button>
        </div>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">{t("sm_stored_help")}</p>
      <ul className="mt-1 max-h-40 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-white/60 p-1 shadow-sm backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-950/30">
        {sortedStoredFiles.map((f) => {
          const checked = selectedStoredIds.includes(f.id);
          const originLabel = f.origin === "llm_ingest" ? t("sm_origin_llm") : t("sm_origin_user");
          return (
            <li key={f.id} className="flex items-center gap-2 rounded-lg bg-white/80 px-2 py-1.5 text-[11px] dark:bg-slate-900/60">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                checked={checked}
                onChange={() => {
                  setSelectedStoredIds((prev) =>
                    prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                  );
                }}
                aria-label={t("sm_include_aria", { name: f.filename })}
              />
              <a
                className="min-w-0 flex-1 truncate font-medium text-slate-800 underline dark:text-slate-100"
                href={`${projectDownloadBase}/${encodeURIComponent(f.id)}`}
                target="_blank"
                rel="noreferrer"
                title={t("sm_download")}
                onClick={(e) => e.stopPropagation()}
              >
                {f.filename}
              </a>
              <span className="hidden shrink-0 text-[9px] text-slate-400 sm:inline" title={t("sm_sort_origin")}>
                {originLabel}
              </span>
              <span className="shrink-0 text-slate-500">{formatBytes(f.size)}</span>
              <button
                type="button"
                className="shrink-0 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-red-700 shadow-sm backdrop-blur-xl hover:bg-white dark:border-slate-700 dark:bg-slate-950/40 dark:text-red-300 dark:hover:bg-slate-950/60"
                onClick={async () => {
                  if (!projectId) return;
                  try {
                    const res = await fetch(
                      `${backendBase}/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(f.id)}`,
                      { method: "DELETE" }
                    );
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      const d = (err as { detail?: unknown }).detail;
                      setError(
                        typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Delete failed (${res.status})`
                      );
                      return;
                    }
                    setError("");
                    setSelectedStoredIds((prev) => prev.filter((id) => id !== f.id));
                    refreshStoredFiles();
                  } catch {
                    setError(t("err_delete_net"));
                  }
                }}
                title={t("sm_delete_project")}
              >
                {t("sm_delete")}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
