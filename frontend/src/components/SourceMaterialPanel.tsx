import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { useI18n } from "../i18n/useI18n";
import { MIN_INTENT_BOOTSTRAP, runMindmapBuild } from "../lib/mindmapBuild";
import useUiStore from "../store/useUiStore";
import { combineGraphs } from "../lib/graphBranch";
import { classifySourceKind } from "../types/sourceMaterial";
import type { MindmapJson } from "../types/mindmap";
import { formatBytes } from "../lib/formatBytes";
import {
  markCanvasAutoFetched,
  shouldSkipCanvasAutoFetch,
  clearCanvasAutoFetchForProject
} from "./sourceMaterial/canvasAutoFetch";
import { PREV_PROJECT_SESSION_KEY } from "./sourceMaterial/projectSessionKeys";
import type { SourceSortKey, StoredProjectFile } from "./sourceMaterial/sourceFileSort";
import { sortStoredProjectFiles } from "./sourceMaterial/sourceFileSort";
import { SOURCE_FILE_INPUT_ACCEPT } from "./sourceMaterial/sourceFileAccept";
import { SourceMaterialStoredFilesBlock } from "./sourceMaterial/SourceMaterialStoredFilesBlock";

/** Canvas auto-fetch guard: see `sourceMaterial/canvasAutoFetch.ts` (avoids duplicate nodes on dock remount). */

type Project = { id: string; name: string };

export default function SourceMaterialPanel(props: { backendBase: string }) {
  const { t, locale } = useI18n();
  const projectId = useUiStore((s) => s.projectId);
  const setProjectId = useUiStore((s) => s.setProjectId);
  const projects = useUiStore((s) => s.projects);
  const setProjects = useUiStore((s) => s.setProjects);
  const intent = useUiStore((s) => s.intent);
  const setIntent = useUiStore((s) => s.setIntent);
  const openProjectLanding = useUiStore((s) => s.openProjectLanding);

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
  const [newProjectName, setNewProjectName] = useState("");
  const [storedFiles, setStoredFiles] = useState<StoredProjectFile[]>([]);
  /** Stored file ids to include when generating from the project (not the upload queue). */
  const [selectedStoredIds, setSelectedStoredIds] = useState<string[]>([]);
  const [sourceSort, setSourceSort] = useState<SourceSortKey>("date_new");
  const prevStoredIdsRef = useRef<string[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [savedCanvasUpdatedMs, setSavedCanvasUpdatedMs] = useState<number | null>(null);
  const [projectDeleteBusy, setProjectDeleteBusy] = useState(false);

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

  const refreshProjects = useCallback(async () => {
    const res = await fetch(`${props.backendBase}/projects`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as Project[];
    setProjects(data);
    return data;
  }, [props.backendBase, setProjects]);

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
    (async () => {
      try {
        const data = await refreshProjects();
        // Auto-create a default project on first run.
        if ((!projectId || !data.some((p) => p.id === projectId)) && data.length === 0) {
          const res = await fetch(`${props.backendBase}/projects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Default" })
          });
          if (res.ok) {
            const p = (await res.json()) as Project;
            setProjectId(p.id);
            setProjects([p]);
          }
        }
      } catch {
        // ignore: backend may be down
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.backendBase]);

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

  const deleteEntireProject = useCallback(async () => {
    const pid = projectId.trim();
    if (!pid) return;
    const meta = projects.find((p) => p.id === pid);
    const name = meta?.name ?? pid;
    if (!window.confirm(t("sm_project_delete_confirm", { name, id: pid }))) return;
    setProjectDeleteBusy(true);
    setError("");
    setSaveMessage("");
    try {
      const res = await fetch(`${props.backendBase}/projects/${encodeURIComponent(pid)}`, { method: "DELETE" });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = (raw as { detail?: unknown }).detail;
        setError(typeof d === "string" ? d : t("sm_project_delete_err"));
        return;
      }
      const cur = useUiStore.getState().projects;
      setProjects(cur.filter((p) => p.id !== pid));
      clearCanvasAutoFetchForProject(pid);
      if (useUiStore.getState().projectId === pid) {
        setProjectId("");
        loadMainGraph({ nodes: [], edges: [] });
        clearSandbox();
        setSandboxMode(false);
        useUiStore.getState().setSelectedNode(null);
        setStoredFiles([]);
        setSelectedStoredIds([]);
        setSavedCanvasUpdatedMs(null);
        setSaveMessage(t("sm_project_deleted_canvas_cleared"));
      }
    } catch {
      setError(t("err_delete_net"));
    } finally {
      setProjectDeleteBusy(false);
    }
  }, [
    projectId,
    projects,
    props.backendBase,
    setProjects,
    setProjectId,
    loadMainGraph,
    clearSandbox,
    setSandboxMode,
    t
  ]);

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
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{t("sm_title")}</div>
          <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300">{t("sm_intro")}</p>
        </div>
        <Upload className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </div>

      <div className="mt-3">
        <button
          type="button"
          className="ios-button-primary w-full py-2 text-[12px]"
          onClick={() => {
            try {
              const cur = useUiStore.getState().projectId;
              if (cur) sessionStorage.setItem(PREV_PROJECT_SESSION_KEY, cur);
            } catch {
              /* ignore */
            }
            openProjectLanding("new_project");
          }}
        >
          {t("sm_new_project_wizard")}
        </button>
        <button type="button" className="mt-1.5 text-[10px] text-sky-700 underline dark:text-sky-400" onClick={() => openProjectLanding("first_visit")}>
          {t("sm_open_setup")}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[11px] text-slate-700 dark:text-slate-200">
          {t("sm_project")}
          <select
            className="mt-1 ios-select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">{t("sm_no_project")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
        </label>
        <div className="text-[11px] text-slate-700 dark:text-slate-200">
          {t("sm_quick_create")}
          <div className="mt-1 flex gap-2">
            <input
              className="ios-input py-1.5"
              value={newProjectName}
              placeholder={t("sm_new_project_ph")}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key !== "Enter") return;
                const name = newProjectName.trim();
                if (!name) return;
                const res = await fetch(`${props.backendBase}/projects`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name })
                });
                if (!res.ok) return;
                const p = (await res.json()) as Project;
                const cur = useUiStore.getState().projects;
                setProjects([p, ...cur.filter((x) => x.id !== p.id)]);
                setProjectId(p.id);
                setNewProjectName("");
              }}
            />
            <button
              type="button"
              className="ios-button shrink-0"
              onClick={async () => {
                const name = newProjectName.trim();
                if (!name) return;
                const res = await fetch(`${props.backendBase}/projects`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name })
                });
                if (!res.ok) return;
                const p = (await res.json()) as Project;
                const cur = useUiStore.getState().projects;
                setProjects([p, ...cur.filter((x) => x.id !== p.id)]);
                setProjectId(p.id);
                setNewProjectName("");
              }}
            >
              {t("sm_create")}
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50/80 py-1.5 text-[11px] font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 disabled:opacity-50"
        disabled={!projectId || projectDeleteBusy}
        onClick={() => void deleteEntireProject()}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        {t("sm_project_delete_btn")}
      </button>

      {projectId ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-2.5 dark:border-slate-600 dark:bg-slate-950/40">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {t("sm_saved_canvas")}
          </div>
          <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">{t("sm_saved_help")}</p>
          {savedCanvasUpdatedMs ? (
            <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
              {t("sm_last_saved")} {new Date(savedCanvasUpdatedMs).toLocaleString()}
            </p>
          ) : (
            <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">{t("sm_no_save_yet")}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="ios-button-primary px-3 py-1.5 text-[11px] disabled:opacity-50"
              disabled={saveBusy || !hasCanvasNodes}
              onClick={() => void saveCanvasToProject()}
            >
              {saveBusy ? t("sm_save_busy") : t("sm_save_btn")}
            </button>
            <button type="button" className="ios-button px-3 py-1.5 text-[11px]" onClick={() => void fetchAndApplySavedCanvas()}>
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

      <label className="mt-3 block text-[11px] text-slate-700 dark:text-slate-200">
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
          "mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-3 py-6 text-center transition-colors",
          dragOver
            ? "border-sky-500 bg-white/70 shadow-sm backdrop-blur-xl dark:bg-slate-900/60"
            : "border-slate-200/80 bg-white/55 hover:border-slate-300 shadow-sm backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/40 dark:hover:border-slate-600"
        ].join(" ")}
      >
        <span className="text-xs font-medium text-slate-700 dark:text-slate-100">{t("sm_drop")}</span>
        <span className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">{t("sm_multi")}</span>
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
          <div className="flex items-center justify-between text-[11px] text-slate-600">
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
          <ul className="max-h-40 space-y-1 overflow-auto rounded border border-slate-100 bg-slate-50 p-1">
            {sourceFiles.map((entry) => {
              const kind = classifySourceKind(entry.file);
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 rounded bg-white px-2 py-1.5 text-[11px] text-slate-800"
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
                  <span className="shrink-0 text-slate-500">{formatBytes(entry.file.size)}</span>
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

      {error ? <p className="mt-2 text-[11px] text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
