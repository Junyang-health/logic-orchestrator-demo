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
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-[var(--mm-text-muted)] dark:text-slate-300">
        <span>
          {t("sm_stored_line", { files: storedFiles.length, n: selectedStoredIds.length })}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] font-medium">
            <span className="text-[var(--mm-text-placeholder)] dark:text-slate-400">{t("sm_sort_label")}</span>
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
          <button type="button" className="ios-button-ghost px-1 py-0 text-[10px]" onClick={() => refreshStoredFiles()}>
            {t("sm_refresh")}
          </button>
          <button
            type="button"
            className="ios-button-ghost px-1 py-0 text-[10px]"
            onClick={() => setSelectedStoredIds(storedFiles.map((x) => x.id))}
          >
            {t("review_select_all")}
          </button>
          <button type="button" className="ios-button-ghost px-1 py-0 text-[10px]" onClick={() => setSelectedStoredIds([])}>
            {t("review_clear_selection")}
          </button>
        </div>
      </div>
      <p className="mt-1 text-[10px] font-medium leading-[1.5] text-[var(--mm-text-placeholder)] dark:text-slate-400">
        {t("sm_stored_help")}
      </p>
      <ul className="mm-sidebar-section mt-1 max-h-40 space-y-1 overflow-auto p-1 dark:border-[var(--mm-border-subtle)] dark:bg-slate-950/30 dark:shadow-none">
        {sortedStoredFiles.map((f) => {
          const checked = selectedStoredIds.includes(f.id);
          const originLabel = f.origin === "llm_ingest" ? t("sm_origin_llm") : t("sm_origin_user");
          return (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-md bg-[color-mix(in_srgb,var(--mm-sidebar-bg)_58%,var(--mm-card-bg))] px-2 py-1.5 text-[11px] dark:bg-slate-900/60"
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 rounded border-[var(--mm-border-subtle)] text-[var(--mm-cta-blue)] focus:ring-[var(--mm-cta-blue)]"
                checked={checked}
                onChange={() => {
                  setSelectedStoredIds((prev) =>
                    prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                  );
                }}
                aria-label={t("sm_include_aria", { name: f.filename })}
              />
              <a
                className="min-w-0 flex-1 truncate font-medium text-[var(--mm-text-title)] underline dark:text-slate-100"
                href={`${projectDownloadBase}/${encodeURIComponent(f.id)}`}
                target="_blank"
                rel="noreferrer"
                title={t("sm_download")}
                onClick={(e) => e.stopPropagation()}
              >
                {f.filename}
              </a>
              <span
                className="hidden shrink-0 text-[9px] font-medium text-[var(--mm-text-placeholder)] sm:inline"
                title={t("sm_sort_origin")}
              >
                {originLabel}
              </span>
              <span className="mm-hud-mono shrink-0 tabular-nums text-[var(--mm-text-muted)]">{formatBytes(f.size)}</span>
              <button
                type="button"
                className="shrink-0 rounded-md border border-[var(--mm-border-subtle)] bg-transparent px-2 py-0.5 text-[10px] font-medium text-[var(--mm-text-muted)] transition hover:border-rose-300/60 hover:text-rose-700 dark:hover:border-rose-500/40 dark:hover:text-rose-300"
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
