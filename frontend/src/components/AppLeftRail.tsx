import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { MindmapJson } from "../types/mindmap";
import type { ProjectRow } from "../store/useUiStore";
import useUiStore from "../store/useUiStore";

type ProjectFilter = "active" | "all" | "archived";
type ProjectSort = "recent" | "name" | "created";

const copy = {
  en: {
    title: "Project Workspace",
    overview: "Overview",
    overviewHelp: "Saved projects",
    projects: "Projects",
    newProject: "New project",
    projectName: "Project name",
    create: "Create",
    creating: "Creating",
    filter: "Filter",
    sort: "Sort",
    active: "Active",
    all: "All",
    archived: "Archived",
    recent: "Recent",
    name: "Name",
    created: "Created",
    open: "Open",
    archive: "Archive",
    restore: "Restore",
    delete: "Delete",
    empty: "No projects here yet.",
    lastActive: "last active",
    justNow: "just now",
    minutes: "mins",
    hours: "h",
    days: "days",
    weeks: "weeks",
    deleteConfirm: "Delete this project permanently?",
    refresh: "Refresh projects"
  },
  zh: {
    title: "项目工作区",
    overview: "概览",
    overviewHelp: "已保存项目",
    projects: "项目",
    newProject: "新建项目",
    projectName: "项目名称",
    create: "创建",
    creating: "创建中",
    filter: "筛选",
    sort: "排序",
    active: "进行中",
    all: "全部",
    archived: "已归档",
    recent: "最近",
    name: "名称",
    created: "创建时间",
    open: "打开",
    archive: "归档",
    restore: "恢复",
    delete: "删除",
    empty: "这里还没有项目。",
    lastActive: "最后活跃",
    justNow: "刚刚",
    minutes: "分钟",
    hours: "小时",
    days: "天",
    weeks: "周",
    deleteConfirm: "永久删除这个项目？",
    refresh: "刷新项目"
  }
};

function projectTime(p: ProjectRow) {
  return Number(p.last_active_ms || p.created_at_ms || 0);
}

function relativeLastActive(ms: number | undefined, locale: "en" | "zh") {
  if (!ms) return locale === "zh" ? "无记录" : "no activity";
  const diff = Math.max(0, Date.now() - ms);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  if (diff < minute) return copy[locale].justNow;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} ${copy[locale].minutes}`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))}${copy[locale].hours}`;
  if (diff < week) return `${Math.max(1, Math.floor(diff / day))} ${copy[locale].days}`;
  return `${Math.max(1, Math.floor(diff / week))} ${copy[locale].weeks}`;
}

export default function AppLeftRail(props: { backendBase: string }) {
  const [filter, setFilter] = useState<ProjectFilter>("active");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const [projectListOpen, setProjectListOpen] = useState(true);
  const [newProjectName, setNewProjectName] = useState("");
  const [busyProjectId, setBusyProjectId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const {
    locale,
    projectId,
    projects,
    setProjectId,
    setProjects,
    setActivePanel,
    setCenterWorkspace,
    setRightDockOpen,
    loadMainGraph,
    clearSandbox,
    setSandboxMode,
    clearSourceFiles
  } = useUiStore(
    useShallow((s) => ({
      locale: s.locale,
      projectId: s.projectId,
      projects: s.projects,
      setProjectId: s.setProjectId,
      setProjects: s.setProjects,
      setActivePanel: s.setActivePanel,
      setCenterWorkspace: s.setCenterWorkspace,
      setRightDockOpen: s.setRightDockOpen,
      loadMainGraph: s.loadMainGraph,
      clearSandbox: s.clearSandbox,
      setSandboxMode: s.setSandboxMode,
      clearSourceFiles: s.clearSourceFiles
    }))
  );

  const text = copy[locale];

  const refreshProjects = useCallback(async () => {
    try {
      const res = await fetch(`${props.backendBase}/projects`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as ProjectRow[];
      setProjects(data);
      setError("");
      if (data.length === 0) {
        const created = await fetch(`${props.backendBase}/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Default" })
        });
        if (created.ok) {
          const p = (await created.json()) as ProjectRow;
          setProjects([p]);
          if (!useUiStore.getState().projectId) setProjectId(p.id);
        }
      } else if (useUiStore.getState().projectId && !data.some((p) => p.id === useUiStore.getState().projectId)) {
        setProjectId("");
      }
    } catch {
      setError(locale === "zh" ? "无法加载项目。" : "Could not load projects.");
    }
  }, [locale, props.backendBase, setProjectId, setProjects]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const visibleProjects = useMemo(() => {
    const filtered = projects.filter((p) => {
      if (filter === "all") return true;
      if (filter === "archived") return Boolean(p.archived);
      return !p.archived;
    });
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "created") return Number(b.created_at_ms || 0) - Number(a.created_at_ms || 0);
      return projectTime(b) - projectTime(a);
    });
  }, [filter, projects, sort]);

  const ongoingProjects = useMemo(
    () => [...projects].filter((p) => !p.archived).sort((a, b) => projectTime(b) - projectTime(a)),
    [projects]
  );

  const clearCanvas = useCallback(() => {
    loadMainGraph({ nodes: [], edges: [] });
    clearSandbox();
    setSandboxMode(false);
    useUiStore.getState().setSelectedNode(null);
  }, [clearSandbox, loadMainGraph, setSandboxMode]);

  const openProject = useCallback(
    async (pid: string) => {
      setProjectId(pid);
      setCenterWorkspace("canvas");
      setActivePanel("source");
      setRightDockOpen(true);
      setError("");
      try {
        const res = await fetch(`${props.backendBase}/projects/${encodeURIComponent(pid)}/mindmap/canvas`);
        if (!res.ok) {
          clearCanvas();
          return;
        }
        const data = (await res.json()) as { mindmap: MindmapJson | null };
        if (data.mindmap?.nodes?.length) {
          loadMainGraph(data.mindmap);
          clearSandbox();
          setSandboxMode(false);
          useUiStore.getState().setSelectedNode(null);
        } else {
          clearCanvas();
        }
      } catch {
        clearCanvas();
      }
    },
    [clearCanvas, clearSandbox, loadMainGraph, props.backendBase, setActivePanel, setCenterWorkspace, setProjectId, setRightDockOpen, setSandboxMode]
  );

  const createProject = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`${props.backendBase}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error(String(res.status));
      const p = (await res.json()) as ProjectRow;
      setProjects([p, ...useUiStore.getState().projects.filter((x) => x.id !== p.id)]);
      setNewProjectName("");
      clearSourceFiles();
      await openProject(p.id);
    } catch {
      setError(locale === "zh" ? "创建项目失败。" : "Could not create project.");
    } finally {
      setCreating(false);
    }
  }, [clearSourceFiles, locale, newProjectName, openProject, props.backendBase, setProjects]);

  const setArchived = useCallback(
    async (p: ProjectRow, archived: boolean) => {
      setBusyProjectId(p.id);
      setError("");
      try {
        const res = await fetch(`${props.backendBase}/projects/${encodeURIComponent(p.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived })
        });
        if (!res.ok) throw new Error(String(res.status));
        const updated = (await res.json()) as ProjectRow;
        setProjects(useUiStore.getState().projects.map((x) => (x.id === updated.id ? updated : x)));
        if (archived && useUiStore.getState().projectId === p.id) {
          setProjectId("");
          clearCanvas();
        }
      } catch {
        setError(locale === "zh" ? "无法更新项目。" : "Could not update project.");
      } finally {
        setBusyProjectId("");
      }
    },
    [clearCanvas, locale, props.backendBase, setProjectId, setProjects]
  );

  const deleteProject = useCallback(
    async (p: ProjectRow) => {
      if (!window.confirm(`${text.deleteConfirm}\n${p.name}`)) return;
      setBusyProjectId(p.id);
      setError("");
      try {
        const res = await fetch(`${props.backendBase}/projects/${encodeURIComponent(p.id)}`, { method: "DELETE" });
        if (!res.ok) throw new Error(String(res.status));
        setProjects(useUiStore.getState().projects.filter((x) => x.id !== p.id));
        if (useUiStore.getState().projectId === p.id) {
          setProjectId("");
          clearSourceFiles();
          clearCanvas();
        }
      } catch {
        setError(locale === "zh" ? "删除项目失败。" : "Could not delete project.");
      } finally {
        setBusyProjectId("");
      }
    },
    [clearCanvas, clearSourceFiles, locale, props.backendBase, setProjectId, setProjects, text.deleteConfirm]
  );

  return (
    <aside className="hidden h-full w-[320px] shrink-0 flex-col overflow-hidden border-r border-[var(--mm-section-border)] bg-[var(--mm-sidebar-bg)] px-3 py-5 shadow-[14px_0_36px_rgba(45,82,140,0.08)] backdrop-blur-xl lg:flex dark:shadow-none">
      <div className="flex items-center gap-3 px-2">
        <div
          className="h-8 w-8 rounded-lg bg-[linear-gradient(135deg,#3b82f6_0%,#7c4dff_54%,#34d399_100%)] shadow-[0_10px_26px_rgba(47,109,246,0.3)]"
          aria-hidden
        />
        <div className="min-w-0">
          <div className="truncate text-2xl font-black tracking-normal text-[#235dff] dark:text-blue-300">UNBOX</div>
          <div className="mt-1 text-xs font-medium text-[var(--mm-text-muted)]">{text.title}</div>
        </div>
        <button
          type="button"
          className="ml-auto rounded-md p-1.5 text-[var(--mm-text-muted)] transition hover:bg-white/70 hover:text-[var(--mm-cta-blue)] dark:hover:bg-slate-900/70"
          onClick={() => void refreshProjects()}
          aria-label={text.refresh}
          title={text.refresh}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        <section className="min-h-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-2 px-1">
            <LayoutDashboard className="h-4 w-4 text-[var(--mm-cta-blue)]" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--mm-text-title)]">{text.overview}</h2>
              <p className="text-[11px] font-medium text-[var(--mm-text-muted)]">{text.overviewHelp}</p>
            </div>
          </div>

          <div className="mt-3 mm-sidebar-section p-2">
            <label className="block text-[11px] font-medium text-[var(--mm-text-title)]">
              {text.newProject}
              <div className="mt-1 flex gap-2">
                <input
                  className="ios-input min-w-0 flex-1 py-1.5 text-xs"
                  value={newProjectName}
                  placeholder={text.projectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createProject();
                  }}
                />
                <button
                  type="button"
                  className="ios-button-primary h-[2.1rem] shrink-0 px-2.5 text-[11px]"
                  disabled={creating || !newProjectName.trim()}
                  onClick={() => void createProject()}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {creating ? text.creating : text.create}
                </button>
              </div>
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-[11px] font-medium text-[var(--mm-text-title)]">
              {text.filter}
              <select className="mt-1 ios-select py-1.5 text-xs" value={filter} onChange={(e) => setFilter(e.target.value as ProjectFilter)}>
                <option value="active">{text.active}</option>
                <option value="all">{text.all}</option>
                <option value="archived">{text.archived}</option>
              </select>
            </label>
            <label className="text-[11px] font-medium text-[var(--mm-text-title)]">
              {text.sort}
              <select className="mt-1 ios-select py-1.5 text-xs" value={sort} onChange={(e) => setSort(e.target.value as ProjectSort)}>
                <option value="recent">{text.recent}</option>
                <option value="name">{text.name}</option>
                <option value="created">{text.created}</option>
              </select>
            </label>
          </div>

          <div className="mt-3 max-h-[calc(100%-11.75rem)] space-y-2 overflow-y-auto pr-1">
            {visibleProjects.length === 0 ? (
              <div className="mm-sidebar-section p-3 text-xs font-medium text-[var(--mm-text-muted)]">{text.empty}</div>
            ) : (
              visibleProjects.map((p) => {
                const active = p.id === projectId;
                const last = relativeLastActive(projectTime(p), locale);
                return (
                  <article
                    key={p.id}
                    className={[
                      "mm-sidebar-section group p-3 transition",
                      active ? "ring-1 ring-[var(--mm-cta-blue)]" : "hover:border-[color-mix(in_srgb,var(--mm-cta-blue)_38%,var(--mm-section-border))]",
                      p.archived ? "opacity-70" : ""
                    ].join(" ")}
                  >
                    <button type="button" className="block w-full text-left" onClick={() => void openProject(p.id)}>
                      <div className="flex items-start gap-2">
                        <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mm-cta-blue)]" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-[13px] font-semibold text-[var(--mm-text-title)]">{p.name}</h3>
                          <p className="mt-0.5 truncate text-[10px] font-medium text-[var(--mm-text-placeholder)]">{p.id}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] font-medium text-[color-mix(in_srgb,var(--mm-text-muted)_58%,transparent)]">
                        {text.lastActive}: {last}
                      </p>
                    </button>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        className="ios-button h-7 px-2 text-[10px]"
                        onClick={() => void openProject(p.id)}
                        disabled={busyProjectId === p.id}
                      >
                        {text.open}
                      </button>
                      <button
                        type="button"
                        className="ios-button h-7 px-2 text-[10px]"
                        onClick={() => void setArchived(p, !p.archived)}
                        disabled={busyProjectId === p.id}
                      >
                        {p.archived ? <ArchiveRestore className="h-3.5 w-3.5" aria-hidden /> : <Archive className="h-3.5 w-3.5" aria-hidden />}
                        {p.archived ? text.restore : text.archive}
                      </button>
                      <button
                        type="button"
                        className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
                        onClick={() => void deleteProject(p)}
                        disabled={busyProjectId === p.id}
                        aria-label={`${text.delete} ${p.name}`}
                        title={text.delete}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="shrink-0 border-t border-[var(--mm-border-subtle)] pt-3">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-1 text-left text-sm font-semibold text-[var(--mm-text-title)]"
            onClick={() => setProjectListOpen((v) => !v)}
            aria-expanded={projectListOpen}
          >
            {projectListOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
            {text.projects}
          </button>
          {projectListOpen ? (
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
              {ongoingProjects.length === 0 ? (
                <div className="px-1 py-2 text-[11px] font-medium text-[var(--mm-text-muted)]">{text.empty}</div>
              ) : (
                ongoingProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={[
                      "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition",
                      p.id === projectId
                        ? "bg-[color-mix(in_srgb,var(--mm-cta-blue)_12%,transparent)] text-[var(--mm-cta-blue)]"
                        : "text-[var(--mm-text-title)] hover:bg-white/60 dark:hover:bg-slate-900/50"
                    ].join(" ")}
                    onClick={() => void openProject(p.id)}
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{p.name}</span>
                    <span className="shrink-0 text-[10px] font-medium text-[color-mix(in_srgb,var(--mm-text-muted)_55%,transparent)]">
                      {relativeLastActive(projectTime(p), locale)}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </section>
      </div>

      {error ? <p className="mt-3 px-1 text-[11px] font-medium text-red-700 dark:text-red-300">{error}</p> : null}
    </aside>
  );
}
