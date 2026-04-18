import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import useUiStore from "../store/useUiStore";
import { combineGraphs } from "../lib/graphBranch";
import { classifySourceKind } from "../types/sourceMaterial";
import type { MindmapJson } from "../types/mindmap";

type Project = { id: string; name: string };
type StoredFile = { id: string; filename: string; size: number; content_type?: string | null; uploaded_at_ms: number };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SourceMaterialPanel(props: { backendBase: string }) {
  const sourceFiles = useUiStore((s) => s.sourceFiles);
  const addSourceFiles = useUiStore((s) => s.addSourceFiles);
  const removeSourceFile = useUiStore((s) => s.removeSourceFile);
  const clearSourceFiles = useUiStore((s) => s.clearSourceFiles);
  const loadMainGraph = useUiStore((s) => s.loadMainGraph);
  const mainGraph = useUiStore((s) => s.mainGraph);
  const sandboxGraph = useUiStore((s) => s.sandboxGraph);
  const clearSandbox = useUiStore((s) => s.clearSandbox);
  const setSandboxMode = useUiStore((s) => s.setSandboxMode);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>(() => localStorage.getItem("mindmap_project_id") || "");
  const [newProjectName, setNewProjectName] = useState("");
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  /** Stored file ids to include when generating from the project (not the upload queue). */
  const [selectedStoredIds, setSelectedStoredIds] = useState<string[]>([]);
  const prevStoredIdsRef = useRef<string[]>([]);
  const [intent, setIntent] = useState<string>(() => localStorage.getItem("mindmap_intent") || "");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [savedCanvasUpdatedMs, setSavedCanvasUpdatedMs] = useState<number | null>(null);

  const projectDownloadBase = useMemo(() => {
    return projectId ? `${props.backendBase}/projects/${encodeURIComponent(projectId)}/files` : "";
  }, [props.backendBase, projectId]);

  const hasCanvasNodes = useMemo(
    () => combineGraphs(mainGraph, sandboxGraph).nodes.length > 0,
    [mainGraph, sandboxGraph]
  );

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
  }, [props.backendBase]);

  const refreshStoredFiles = useCallback(async () => {
    if (!projectId) {
      setStoredFiles([]);
      return;
    }
    const res = await fetch(`${props.backendBase}/projects/${encodeURIComponent(projectId)}/files`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as StoredFile[];
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
      setSaveMessage("Select a project first.");
      return;
    }
    const combined = combineGraphs(mainGraph, sandboxGraph);
    if (!combined.nodes.length) {
      setSaveMessage("Nothing to save — the canvas is empty.");
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
      setSaveMessage("Mindmap saved to this project.");
    } catch {
      setSaveMessage("Save failed (network error).");
    } finally {
      setSaveBusy(false);
    }
  }, [projectId, props.backendBase, mainGraph, sandboxGraph]);

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
            localStorage.setItem("mindmap_project_id", p.id);
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
    localStorage.setItem("mindmap_project_id", projectId);
    refreshStoredFiles().catch(() => {});
    fetchAndApplySavedCanvas().catch(() => {});
  }, [projectId, refreshStoredFiles, fetchAndApplySavedCanvas]);

  useEffect(() => {
    setSelectedStoredIds([]);
    prevStoredIdsRef.current = [];
    setSaveMessage("");
  }, [projectId]);

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

  useEffect(() => {
    localStorage.setItem("mindmap_intent", intent);
  }, [intent]);

  const buildMindmap = useCallback(async () => {
    if (sourceFiles.length === 0) {
      // If no local files are queued, fall back to generating from selected stored project files.
      if (projectId && storedFiles.length > 0) {
        if (selectedStoredIds.length === 0) {
          setError("Select at least one stored file (checkboxes above) to include in the mindmap.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          const url = `${props.backendBase}/projects/${encodeURIComponent(projectId)}/mindmap`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intent: intent.trim() || null,
              file_ids: selectedStoredIds
            })
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const d = (err as { detail?: unknown }).detail;
            setError(
              typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Generate failed (${res.status})`
            );
            return;
          }
          const payload = (await res.json()) as any;
          const json = (payload?.mindmap ?? payload) as MindmapJson;
          loadMainGraph(json);
          return;
        } catch {
          setError("Network error — is the backend running?");
          return;
        } finally {
          setBusy(false);
        }
      }

      setError("Add at least one file (or select a project with stored files).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      if (projectId) fd.append("project_id", projectId);
      if (intent.trim()) fd.append("intent", intent.trim());
      for (const e of sourceFiles) {
        fd.append("files", e.file, e.file.name);
      }
      const res = await fetch(`${props.backendBase}/upload`, {
        method: "POST",
        body: fd
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        setError(
          typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Upload failed (${res.status})`
        );
        return;
      }
      const payload = (await res.json()) as any;
      const json = (payload?.mindmap ?? payload) as MindmapJson;
      loadMainGraph(json);
      // Clear queued files but keep the project list.
      clearSourceFiles();
      refreshStoredFiles().catch(() => {});
    } catch {
      setError("Network error — is the backend running?");
    } finally {
      setBusy(false);
    }
  }, [
    props.backendBase,
    sourceFiles,
    loadMainGraph,
    projectId,
    clearSourceFiles,
    refreshStoredFiles,
    storedFiles,
    intent,
    selectedStoredIds
  ]);

  return (
    <div className="ios-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">Source material</div>
          <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
            Upload PDFs, Word/Excel, or images. Some file types may be summarized only as placeholders. Then generate
            a mindmap from the combined content.
          </p>
        </div>
        <Upload className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[11px] text-slate-700 dark:text-slate-200">
          Project
          <select
            className="mt-1 ios-select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">(no project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
        </label>
        <div className="text-[11px] text-slate-700 dark:text-slate-200">
          New project
          <div className="mt-1 flex gap-2">
            <input
              className="ios-input py-1.5"
              value={newProjectName}
              placeholder="e.g. Client A"
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
                setProjects((cur) => [p, ...cur]);
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
                setProjects((cur) => [p, ...cur]);
                setProjectId(p.id);
                setNewProjectName("");
              }}
            >
              Create
            </button>
          </div>
        </div>
      </div>

      {projectId ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-2.5 dark:border-slate-600 dark:bg-slate-950/40">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Saved canvas
          </div>
          <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
            Save the current graph to this project so it reloads when you open the project again. Uses main map +
            sandbox drafts as one snapshot.
          </p>
          {savedCanvasUpdatedMs ? (
            <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
              Last saved: {new Date(savedCanvasUpdatedMs).toLocaleString()}
            </p>
          ) : (
            <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">No save on disk yet for this project.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="ios-button-primary px-3 py-1.5 text-[11px] disabled:opacity-50"
              disabled={saveBusy || !hasCanvasNodes}
              onClick={() => void saveCanvasToProject()}
            >
              {saveBusy ? "Saving…" : "Save mindmap to project"}
            </button>
            <button type="button" className="ios-button px-3 py-1.5 text-[11px]" onClick={() => void fetchAndApplySavedCanvas()}>
              Reload from project
            </button>
          </div>
          {saveMessage ? (
            <p
              className={`mt-1.5 text-[10px] ${
                saveMessage.includes("saved") ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-300"
              }`}
            >
              {saveMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="mt-3 block text-[11px] text-slate-700 dark:text-slate-200">
        Intent / goal (guides the mindmap)
        <textarea
          className="mt-1 ios-input resize-y"
          rows={3}
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Example: Summarize the document into a mindmap focused on key risks, causes, and recommended actions."
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
        <span className="text-xs font-medium text-slate-700 dark:text-slate-100">Drop files here or click to browse</span>
        <span className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">Multiple files allowed</span>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept={[
            // Documents
            ".pdf,.doc,.docx,.xls,.xlsx",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            // Images
            "image/png,image/jpeg,image/webp,image/gif",
            ".png,.jpg,.jpeg,.webp,.gif"
          ].join(",")}
          onChange={(e) => {
            if (e.target.files?.length) pickFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {projectId && storedFiles.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <span>
              {storedFiles.length} file(s) stored — {selectedStoredIds.length} selected for mindmap
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="text-slate-600 underline dark:text-slate-300" onClick={() => refreshStoredFiles()}>
                Refresh
              </button>
              <button
                type="button"
                className="text-sky-700 underline"
                onClick={() => setSelectedStoredIds(storedFiles.map((x) => x.id))}
              >
                Select all
              </button>
              <button type="button" className="text-slate-600 underline dark:text-slate-300" onClick={() => setSelectedStoredIds([])}>
                Clear selection
              </button>
            </div>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
            Check the files to include when you generate from stored project. Uncheck files you want to skip.
          </p>
          <ul className="mt-1 max-h-40 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-white/60 p-1 shadow-sm backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-950/30">
            {storedFiles.map((f) => {
              const checked = selectedStoredIds.includes(f.id);
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
                    aria-label={`Include ${f.filename} in mindmap`}
                  />
                  <a className="min-w-0 flex-1 truncate font-medium text-slate-800 underline dark:text-slate-100" href={`${projectDownloadBase}/${encodeURIComponent(f.id)}`} target="_blank" rel="noreferrer" title="Download" onClick={(e) => e.stopPropagation()}>
                    {f.filename}
                  </a>
                  <span className="shrink-0 text-slate-500">{formatBytes(f.size)}</span>
                  <button type="button" className="shrink-0 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-red-700 shadow-sm backdrop-blur-xl hover:bg-white dark:border-slate-700 dark:bg-slate-950/40 dark:text-red-300 dark:hover:bg-slate-950/60" onClick={async () => {
                      if (!projectId) return;
                      try {
                        const res = await fetch(
                          `${props.backendBase}/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(f.id)}`,
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
                        refreshStoredFiles().catch(() => {});
                      } catch {
                        setError("Delete failed (network error)");
                      }
                    }}
                    title="Delete from project"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {sourceFiles.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-600">
            <span>{sourceFiles.length} file(s) queued</span>
            <button
              type="button"
              className="text-red-700 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                clearSourceFiles();
              }}
            >
              Clear all
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
                    title="Remove"
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
        disabled={
          busy ||
          (sourceFiles.length === 0 &&
            !(projectId && storedFiles.length > 0 && selectedStoredIds.length > 0))
        }
        className="mt-3 w-full ios-button-primary disabled:cursor-not-allowed"
        onClick={() => buildMindmap()}
      >
        {busy ? "Generating mindmap…" : sourceFiles.length > 0 ? "Generate mindmap from queued files" : "Generate mindmap from stored project"}
      </button>

      {error ? <p className="mt-2 text-[11px] text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
