import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { MessageKey } from "../../../i18n/messages";
import { readAssistantSourceFilePickMap, writeAssistantSourceFilePickForProject } from "../assistantSourceFilePick";
import useUiStore from "../../../store/useUiStore";

export type UseAssistantPanelSourcesArgs = {
  projectId: string | undefined;
  backendBase: string;
  setError: Dispatch<SetStateAction<string>>;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

export function useAssistantPanelSources(args: UseAssistantPanelSourcesArgs) {
  const { projectId, backendBase, setError, t } = args;

  const [webSearchQuery, setWebSearchQuery] = useState<string>(() => localStorage.getItem("mindmap_web_search_query") || "");
  const [projectFiles, setProjectFiles] = useState<{ id: string; filename: string }[]>([]);
  const [projectFilesLoadError, setProjectFilesLoadError] = useState(false);
  const [selectedSourceFileIds, setSelectedSourceFileIds] = useState<string[]>([]);
  const [ingestWebBusy, setIngestWebBusy] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("mindmap_web_search_query", webSearchQuery);
    } catch {
      // ignore
    }
  }, [webSearchQuery]);

  const loadProjectFiles = useCallback(
    async (signal?: AbortSignal) => {
      const pid = projectId?.trim() || "";
      if (!pid) {
        setProjectFiles([]);
        setProjectFilesLoadError(false);
        return;
      }
      setProjectFilesLoadError(false);
      try {
        const res = await fetch(`${backendBase}/projects/${encodeURIComponent(pid)}/files`, { signal });
        if (!res.ok) {
          setProjectFilesLoadError(true);
          setProjectFiles([]);
          return;
        }
        const rows = (await res.json()) as { id: string; filename: string }[];
        if (signal?.aborted) return;
        setProjectFiles(Array.isArray(rows) ? rows.map((r) => ({ id: r.id, filename: r.filename || r.id })) : []);
      } catch {
        if (!signal?.aborted) {
          setProjectFilesLoadError(true);
          setProjectFiles([]);
        }
      }
    },
    [projectId, backendBase]
  );

  useEffect(() => {
    const ac = new AbortController();
    void loadProjectFiles(ac.signal);
    return () => ac.abort();
  }, [loadProjectFiles]);

  const ingestWebToSources = useCallback(async () => {
    const pid = projectId?.trim() || "";
    if (!pid) {
      setError(t("assistant_ingest_no_project"));
      return;
    }
    const lines = webSearchQuery
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setError(t("assistant_ingest_no_queries"));
      return;
    }
    setIngestWebBusy(true);
    setError("");
    try {
      const res = await fetch(`${backendBase}/projects/${encodeURIComponent(pid)}/files/ingest-web`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries: lines, max_results_per_query: 3, max_pages_ingest: 15 })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        throw new Error(typeof d === "string" ? d : d != null ? JSON.stringify(d) : `ingest ${res.status}`);
      }
      const data = (await res.json()) as { stored: { id: string }[]; notices: string[] };
      await loadProjectFiles();
      const newIds = (data.stored || []).map((s) => s.id);
      if (newIds.length > 0) {
        setSelectedSourceFileIds((prev) => Array.from(new Set([...prev, ...newIds])));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("assistant_ingest_fail"));
    } finally {
      setIngestWebBusy(false);
    }
  }, [projectId, backendBase, loadProjectFiles, t, webSearchQuery, setError]);

  useEffect(() => {
    const pid = projectId?.trim() || "";
    if (!pid) {
      setSelectedSourceFileIds([]);
      return;
    }
    if (projectFiles.length === 0) {
      setSelectedSourceFileIds([]);
      return;
    }
    const idSet = new Set(projectFiles.map((f) => f.id));
    setSelectedSourceFileIds((prev) => {
      if (prev.length > 0) {
        const kept = prev.filter((id) => idSet.has(id));
        if (kept.length > 0) return kept;
      }
      const map = readAssistantSourceFilePickMap();
      const saved = (map[pid] ?? []).filter((id) => idSet.has(id));
      if (saved.length > 0) return saved;
      const fromDock = useUiStore.getState().projectSelectedFileIds.filter((id) => idSet.has(id));
      if (fromDock.length > 0) return fromDock;
      return projectFiles.map((f) => f.id);
    });
  }, [projectId, projectFiles]);

  useEffect(() => {
    const pid = projectId?.trim() || "";
    if (!pid) return;
    writeAssistantSourceFilePickForProject(pid, selectedSourceFileIds);
  }, [projectId, selectedSourceFileIds]);

  return {
    webSearchQuery,
    setWebSearchQuery,
    projectFiles,
    projectFilesLoadError,
    selectedSourceFileIds,
    setSelectedSourceFileIds,
    ingestWebBusy,
    ingestWebToSources
  };
}
