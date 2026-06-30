import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Info, Trash2, Upload } from "lucide-react";
import { useI18n } from "../i18n/useI18n";
import { MIN_INTENT_BOOTSTRAP, runMindmapBuild } from "../lib/mindmapBuild";
import useUiStore from "../store/useUiStore";
import { combineGraphs } from "../lib/graphBranch";
import { classifySourceKind } from "../types/sourceMaterial";
import type { MindmapJson } from "../types/mindmap";
import { formatBytes } from "../lib/formatBytes";
import {
  markCanvasAutoFetched,
  shouldSkipCanvasAutoFetch
} from "./sourceMaterial/canvasAutoFetch";
import type { SourceSortKey, StoredProjectFile } from "./sourceMaterial/sourceFileSort";
import { sortStoredProjectFiles } from "./sourceMaterial/sourceFileSort";
import { SOURCE_FILE_INPUT_ACCEPT } from "./sourceMaterial/sourceFileAccept";
import { SourceMaterialStoredFilesBlock } from "./sourceMaterial/SourceMaterialStoredFilesBlock";

/** Canvas auto-fetch guard: see `sourceMaterial/canvasAutoFetch.ts` (avoids duplicate nodes on dock remount). */

export default function SourceMaterialPanel(props: { backendBase: string }) {
  const { t, locale } = useI18n();
  const projectId = useUiStore((s) => s.projectId);
  const intent = useUiStore((s) => s.intent);
  const setIntent = useUiStore((s) => s.setIntent);

  const sourceFiles = useUiStore((s) => s.sourceFiles);
  const addSourceFiles = useUiStore((s) => s.addSourceFiles);
  const removeSourceFile = useUiStore((s) => s.removeSourceFile);
  const clearSourceFiles = useUiStore((s) => s.clearSourceFiles);
  const setProjectSelectedFileIds = useUiStore((s) => s.setProjectSelectedFileIds);
  const loadMainGraph = useUiStore((s) => s.loadMainGraph);
  const mainGraph = useUiStore((s) => s.mainGraph);
  const sandboxGraph = useUiStore((s) => s.sandboxGraph);
  const clearSandbox = useUiStore((s) => s.clearSandbox);
  const setSandboxMode = useUiStore((s) => s.setSandboxMode);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storedFiles, setStoredFiles] = useState<StoredProjectFile[]>([]);
  /** Stored file ids to include when generating from the project (not the upload queue). */
  const [selectedStoredIds, setSelectedStoredIds] = useState<string[]>([]);
  const [sourceSort, setSourceSort] = useState<SourceSortKey>("date_new");
  const prevStoredIdsRef = useRef<string[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [savedCanvasUpdatedMs, setSavedCanvasUpdatedMs] = useState<number | null>(null);

  const sortedStoredFiles = useMemo(() => sortStoredProjectFiles(storedFiles, sourceSort), [storedFiles, sourceSort]);

  const projectDownloadBase = useMemo(() => {
    return projectId ? `${props.backendBase}/projects/${encodeURIComponent(projectId)}/files` : "";
  }, [props.backendBase, projectId]);

  const hasCanvasNodes = useMemo(
    () => combineGraphs(mainGraph, sandboxGraph).nodes.length > 0,
    [mainGraph, sandboxGraph]
  );

  useEffect(() => {
    setProjectSelectedFileIds(selectedStoredIds);
  }, [selectedStoredIds, setProjectSelectedFileIds]);

  const trimmedIntent = intent.trim();
  const canGenerateFromStoredSelection =
    Boolean(projectId) && storedFiles.length > 0 && selectedStoredIds.length > 0;
  const canBootstrapFromIntent = trimmedIntent.length >= MIN_INTENT_BOOTSTRAP && sourceFiles.length === 0;
  const canGenerateMindmap =
    sourceFiles.length > 0 || canGenerateFromStoredSelection || canBootstrapFromIntent;

  const pickFiles = useCallback(
    (list: FileList | File[]) => {
      const arr = Array.from(list);
      if (arr.length === 0) return;
      addSourceFiles(arr);
      setError("");
    },
    [addSourceFiles]
  );

  const refreshStoredFiles = useCallback(async () => {
    if (!projectId) {
      setStoredFiles([]);
      return;
    }
    const res = await fetch(`${props.backendBase}/projects/${encodeURIComponent(projectId)}/files`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as StoredProjectFile[];
    setStoredFiles(data);
  }, [props.backendBase, projectId]);

  const fetchAndApplySavedCanvas = useCallback(async () => {
    if (!projectId) {
      setSavedCanvasUpdatedMs(null);
      return;
    }
    try {
      const res = await fetch(`${props.backendBase}/projects/${encodeURIComponent(projectId)}/mindmap/canvas`);
      if (!res.ok) {
        setSavedCanvasUpdatedMs(null);
        return;
      }
      const data = (await res.json()) as { mindmap: MindmapJson | null; updated_at_ms: number | null };
      const mm = data.mindmap;
      setSavedCanvasUpdatedMs(typeof data.updated_at_ms === "number" ? data.updated_at_ms : null);
      if (mm && Array.isArray(mm.nodes) && mm.nodes.length > 0) {
        loadMainGraph(mm);
        clearSandbox();
        setSandboxMode(false);
        useUiStore.getState().setSelectedNode(null);
      } else {
        loadMainGraph({ nodes: [], edges: [] });
        clearSandbox();
        setSandboxMode(false);
        useUiStore.getState().setSelectedNode(null);
      }
      markCanvasAutoFetched(projectId);
    } catch {
      setSavedCanvasUpdatedMs(null);
    }
  }, [
    projectId,
    props.backendBase,
    loadMainGraph,
    clearSandbox,
    setSandboxMode
  ]);

  const saveCanvasToProject = useCallback(async () => {
    if (!projectId) {
      setSaveMessage(t("err_select_project"));
      return;
    }
    const combined = combineGraphs(mainGraph, sandboxGraph);
    if (!combined.nodes.length) {
      setSaveMessage(t("err_canvas_empty"));
      return;
    }
    setSaveBusy(true);
    setSaveMessage("");
    try {
      const res = await fetch(`${props.backendBase}/projects/${encodeURIComponent(projectId)}/mindmap/canvas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mindmap: combined })
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = (raw as { detail?: unknown }).detail;
        setSaveMessage(
          typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Save failed (${res.status})`
        );
        return;
      }
      const ts = (raw as { updated_at_ms?: number }).updated_at_ms;
      if (typeof ts === "number") setSavedCanvasUpdatedMs(ts);
      setSaveMessage(t("sm_saved_ok"));
    } catch {
      setSaveMessage(t("err_save_net"));
    } finally {
      setSaveBusy(false);
    }
  }, [projectId, props.backendBase, mainGraph, sandboxGraph, t]);

  useEffect(() => {
    if (!projectId) return;
    refreshStoredFiles().catch(() => {});
    if (shouldSkipCanvasAutoFetch(projectId)) {
      return;
    }
    fetchAndApplySavedCanvas().catch(() => {});
  }, [projectId, refreshStoredFiles, fetchAndApplySavedCanvas]);

  useEffect(() => {
    setSelectedStoredIds([]);
    prevStoredIdsRef.current = [];
    setSaveMessage("");
  }, [projectId]);

  useEffect(() => {
    setSaveMessage("");
  }, [locale]);

  useEffect(() => {
    const ids = storedFiles.map((f) => f.id);
    const prevSet = new Set(prevStoredIdsRef.current);
    prevStoredIdsRef.current = ids;
    setSelectedStoredIds((sel) => {
      const idSet = new Set(ids);
      const next = sel.filter((id) => idSet.has(id));
      for (const id of ids) {
        if (!prevSet.has(id)) next.push(id);
      }
      return next;
    });
  }, [storedFiles]);

  const messages = useMemo(
    () => ({
      netError: t("err_net"),
      pickFiles: t("err_pick_files"),
      addFilesOrIntent: t("err_add_files_intent", { n: MIN_INTENT_BOOTSTRAP })
    }),
    [t, locale]
  );

  const buildMindmap = useCallback(async () => {
    setBusy(true);
    setError("");
    const result = await runMindmapBuild({
      backendBase: props.backendBase,
      projectId,
      intent,
      sourceFiles,
      selectedStoredIds,
      storedFilesCount: storedFiles.length,
      loadMainGraph,
      clearSourceFiles,
      refreshStoredFiles,
      messages
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
    }
  }, [
    props.backendBase,
    projectId,
    intent,
    sourceFiles,
    selectedStoredIds,
    storedFiles.length,
    loadMainGraph,
    clearSourceFiles,
    refreshStoredFiles,
    messages
  ]);

  return (
    <div className="ios-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-[var(--mm-text-title)]">{t("sm_title")}</div>
          <p className="mt-1 text-[11px] font-medium leading-[1.5] text-[var(--mm-text-muted)]">{t("sm_intro")}</p>
        </div>
        <Upload className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mm-cta-blue)] dark:text-slate-400" aria-hidden />
      </div>

      {projectId ? (
        <div className="mm-sidebar-section mt-3 p-2.5 dark:border-[var(--mm-border-subtle)] dark:bg-slate-950/40 dark:shadow-none">
          <div className="flex items-center gap-1.5">
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--mm-text-title)]">{t("sm_saved_canvas")}</div>
            <button
              type="button"
              className="inline-flex rounded p-0.5 text-[var(--mm-text-placeholder)] hover:bg-black/[0.05] hover:text-[var(--mm-text-muted)] dark:text-slate-500 dark:hover:bg-slate-800/80 dark:hover:text-slate-300"
              title={t("sm_saved_help")}
              aria-label={t("sm_saved_help")}
            >
              <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </button>
          </div>
          {savedCanvasUpdatedMs ? (
            <p className="mt-1 text-[9px] font-medium text-[var(--mm-text-muted)]">
              {t("sm_last_saved")} {new Date(savedCanvasUpdatedMs).toLocaleString()}
            </p>
          ) : (
            <p className="mt-1 text-[9px] font-medium text-[var(--mm-text-placeholder)]">{t("sm_no_save_yet")}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="ios-button-secondary px-3 py-1.5 text-[11px] disabled:opacity-50"
              disabled={saveBusy || !hasCanvasNodes}
              onClick={() => void saveCanvasToProject()}
            >
              {saveBusy ? t("sm_save_busy") : t("sm_save_btn")}
            </button>
            <button
              type="button"
              className="ios-button-ghost px-3 py-1.5 text-[11px]"
              onClick={() => void fetchAndApplySavedCanvas()}
            >
              {t("sm_reload")}
            </button>
          </div>
          {saveMessage ? (
            <p
              className={`mt-1.5 text-[10px] ${
                saveMessage === t("sm_saved_ok") ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-300"
              }`}
            >
              {saveMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="mt-3 block text-[11px] font-medium text-[var(--mm-text-title)]">
        {t("sm_intent", { n: MIN_INTENT_BOOTSTRAP })}
        <textarea
          className="mt-1 ios-input resize-y"
          rows={3}
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder={t("sm_intent_ph")}
        />
      </label>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={[
          "mm-sidebar-section mt-3 flex cursor-pointer flex-col items-center justify-center border-2 border-dashed bg-[var(--mm-card-bg)] px-3 py-6 text-center transition-colors dark:border-[var(--mm-drop-zone-border)]",
          dragOver
            ? "border-[var(--mm-cta-blue)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--mm-cta-blue)_16%,transparent)] dark:bg-slate-900/60"
            : "border-[var(--mm-drop-zone-border)] hover:border-[color-mix(in_srgb,var(--mm-cta-blue)_45%,var(--mm-section-border))] dark:border-slate-700/70 dark:bg-slate-900/40 dark:hover:border-slate-600"
        ].join(" ")}
      >
        <Upload className="mb-2 h-8 w-8 text-[var(--mm-cta-blue)] dark:text-slate-400" strokeWidth={1.75} aria-hidden />
        <span className="text-xs font-medium text-[var(--mm-text-title)]">{t("sm_drop")}</span>
        <span className="mt-1 text-[11px] font-medium leading-[1.5] text-[var(--mm-text-muted)]">{t("sm_multi")}</span>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept={SOURCE_FILE_INPUT_ACCEPT}
          onChange={(e) => {
            if (e.target.files?.length) pickFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <SourceMaterialStoredFilesBlock
        backendBase={props.backendBase}
        projectId={projectId}
        projectDownloadBase={projectDownloadBase}
        storedFiles={storedFiles}
        sortedStoredFiles={sortedStoredFiles}
        sourceSort={sourceSort}
        onSourceSortChange={setSourceSort}
        selectedStoredIds={selectedStoredIds}
        setSelectedStoredIds={setSelectedStoredIds}
        refreshStoredFiles={() => void refreshStoredFiles()}
        setError={setError}
      />

      {sourceFiles.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-[var(--mm-text-muted)]">
            <span>{t("sm_queued", { n: sourceFiles.length })}</span>
            <button
              type="button"
              className="text-red-700 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                clearSourceFiles();
              }}
            >
              {t("sm_clear_all")}
            </button>
          </div>
          <ul className="mm-sidebar-section max-h-40 space-y-1 overflow-auto p-1 dark:border-[var(--mm-border-subtle)] dark:bg-slate-900/40 dark:shadow-none">
            {sourceFiles.map((entry) => {
              const kind = classifySourceKind(entry.file);
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 rounded-md bg-[color-mix(in_srgb,var(--mm-sidebar-bg)_55%,var(--mm-card-bg))] px-2 py-1.5 text-[11px] text-[var(--mm-text-title)] dark:bg-slate-900/50"
                >
                  {kind === "excel" ? (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : kind === "image" ? (
                    <ImageIcon className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium" title={entry.file.name}>
                    {entry.file.name}
                  </span>
                  <span className="mm-hud-mono shrink-0 tabular-nums text-[var(--mm-text-muted)]">{formatBytes(entry.file.size)}</span>
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-red-700"
                    title={t("sm_remove")}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSourceFile(entry.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        type="button"
        disabled={busy || !canGenerateMindmap}
        className="mt-3 w-full ios-button-primary disabled:cursor-not-allowed"
        onClick={() => buildMindmap()}
      >
        {busy
          ? t("sm_generating")
          : sourceFiles.length > 0
            ? t("sm_gen_queued")
            : canGenerateFromStoredSelection
              ? t("sm_gen_stored")
              : canBootstrapFromIntent
                ? t("sm_gen_intent")
                : t("sm_gen")}
      </button>

      {error ? <p className="mt-2 text-[11px] font-medium text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
