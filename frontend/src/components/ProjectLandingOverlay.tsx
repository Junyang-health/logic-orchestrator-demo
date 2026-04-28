import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Sparkles, X } from "lucide-react";
import { useI18n } from "../i18n/useI18n";
import {
  composeIntentForBuild,
  fetchSurveyClarifications,
  formatClarificationSurveyForIntent,
  getOfflineFallbackClarificationPayload,
  MIN_INTENT_BOOTSTRAP,
  runMindmapBuild,
  type SurveyClarificationPayload
} from "../lib/mindmapBuild";
import useUiStore from "../store/useUiStore";
import { classifySourceKind } from "../types/sourceMaterial";

const PREV_PROJECT_SESSION_KEY = "mindmap_prev_project_id";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type ProjectChoice = "create" | "existing";

export default function ProjectLandingOverlay(props: { backendBase: string }) {
  const { t, locale } = useI18n();
  const projectLandingOpen = useUiStore((s) => s.projectLandingOpen);
  const projectLandingReason = useUiStore((s) => s.projectLandingReason);
  const dismissProjectLandingOnboarding = useUiStore((s) => s.dismissProjectLandingOnboarding);
  const projectId = useUiStore((s) => s.projectId);
  const setProjectId = useUiStore((s) => s.setProjectId);
  const setProjects = useUiStore((s) => s.setProjects);
  const projects = useUiStore((s) => s.projects);
  const intent = useUiStore((s) => s.intent);
  const setIntent = useUiStore((s) => s.setIntent);
  const sourceFiles = useUiStore((s) => s.sourceFiles);
  const addSourceFiles = useUiStore((s) => s.addSourceFiles);
  const removeSourceFile = useUiStore((s) => s.removeSourceFile);
  const clearSourceFiles = useUiStore((s) => s.clearSourceFiles);
  const loadMainGraph = useUiStore((s) => s.loadMainGraph);
  const clearSandbox = useUiStore((s) => s.clearSandbox);
  const setSandboxMode = useUiStore((s) => s.setSandboxMode);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const newWizardInitRef = useRef(false);

  const [projectChoice, setProjectChoice] = useState<ProjectChoice>("existing");
  const [draftProjectName, setDraftProjectName] = useState("");
  const [structureStep, setStructureStep] = useState(false);
  const [clarifyPayload, setClarifyPayload] = useState<SurveyClarificationPayload | null>(null);
  const [clarifyLoading, setClarifyLoading] = useState(false);
  const [clarifyFetchFallback, setClarifyFetchFallback] = useState(false);
  const [mcqSelections, setMcqSelections] = useState<Record<string, string[]>>({});
  const [openFollowupText, setOpenFollowupText] = useState("");

  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storedFiles, setStoredFiles] = useState<
    { id: string; filename: string; origin?: string; uploaded_at_ms: number }[]
  >([]);
  const [selectedStoredIds, setSelectedStoredIds] = useState<string[]>([]);

  const trimmedIntent = intent.trim();
  const canGenerateFromStoredSelection =
    Boolean(projectId) && storedFiles.length > 0 && selectedStoredIds.length > 0;
  const canBootstrapFromIntent =
    trimmedIntent.length >= MIN_INTENT_BOOTSTRAP && sourceFiles.length === 0;
  const canGenerateMindmap =
    sourceFiles.length > 0 || canGenerateFromStoredSelection || canBootstrapFromIntent;

  const refreshProjectsList = useCallback(async () => {
    const res = await fetch(`${props.backendBase}/projects`);
    if (!res.ok) return;
    const data = (await res.json()) as { id: string; name: string }[];
    setProjects(data);
  }, [props.backendBase, setProjects]);

  const fetchStoredForProject = useCallback(
    async (pid: string) => {
      if (!pid) {
        setStoredFiles([]);
        setSelectedStoredIds([]);
        return;
      }
      const res = await fetch(`${props.backendBase}/projects/${encodeURIComponent(pid)}/files`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        id: string;
        filename: string;
        origin?: string;
        uploaded_at_ms: number;
      }[];
      setStoredFiles(data);
    },
    [props.backendBase]
  );

  const refreshStoredFiles = useCallback(async () => {
    await fetchStoredForProject(projectId);
  }, [projectId, fetchStoredForProject]);

  /** Reset landing local state when sheet opens / closes. */
  useEffect(() => {
    if (!projectLandingOpen) {
      newWizardInitRef.current = false;
      setStructureStep(false);
      setClarifyPayload(null);
      setClarifyLoading(false);
      setClarifyFetchFallback(false);
      setMcqSelections({});
      setOpenFollowupText("");
      setError("");
      return;
    }
    setError("");
    setStructureStep(false);
    setClarifyPayload(null);
    setClarifyLoading(false);
    setClarifyFetchFallback(false);
    setMcqSelections({});
    setOpenFollowupText("");
    setStoredFiles([]);
    setSelectedStoredIds([]);
    if (projectLandingReason === "new_project") {
      setProjectChoice("create");
      setProjectId("");
    }
    void (async () => {
      await refreshProjectsList();
      if (!useUiStore.getState().projectLandingOpen) return;
      if (projectLandingReason !== "new_project") {
        const st = useUiStore.getState();
        const next = st.projectId.trim() && st.projects.length > 0 ? "existing" : "create";
        setProjectChoice(next);
        if (next === "create") {
          setStoredFiles([]);
          setSelectedStoredIds([]);
          setProjectId("");
        }
      }
    })();
  }, [projectLandingOpen, projectLandingReason, refreshProjectsList, setProjectId]);

  useEffect(() => {
    if (!projectLandingOpen) return;
    if (projectLandingReason !== "new_project") return;
    if (projectChoice !== "create") return;
    if (newWizardInitRef.current) return;
    newWizardInitRef.current = true;
    loadMainGraph({ nodes: [], edges: [] });
    clearSandbox();
    setSandboxMode(false);
    useUiStore.getState().setSelectedNode(null);
    setProjectId("");
    setIntent("");
    clearSourceFiles();
    setDraftProjectName("");
    setStoredFiles([]);
    setSelectedStoredIds([]);
  }, [
    projectLandingOpen,
    projectLandingReason,
    projectChoice,
    loadMainGraph,
    clearSandbox,
    setSandboxMode,
    setProjectId,
    setIntent,
    clearSourceFiles
  ]);

  useEffect(() => {
    if (!projectLandingOpen) return;
    if (projectChoice !== "existing") return;
    void fetchStoredForProject(projectId).catch(() => {});
  }, [projectLandingOpen, projectChoice, projectId, fetchStoredForProject]);

  useEffect(() => {
    if (!projectLandingOpen) return;
    const ids = storedFiles.map((f) => f.id);
    setSelectedStoredIds((sel) => {
      const idSet = new Set(ids);
      const next = sel.filter((id) => idSet.has(id));
      for (const id of ids) {
        if (!next.includes(id)) next.push(id);
      }
      return next;
    });
  }, [projectLandingOpen, storedFiles]);

  const clarifyContextKey = useMemo(
    () =>
      [
        intent,
        sourceFiles.map((e) => `${e.id}:${e.file.name}`).join("|"),
        selectedStoredIds.slice().sort().join(","),
        storedFiles.map((f) => `${f.id}:${f.filename}`).join("|")
      ].join("\n"),
    [intent, sourceFiles, selectedStoredIds, storedFiles]
  );

  useEffect(() => {
    if (!projectLandingOpen || !structureStep) return;
    let cancelled = false;
    setClarifyLoading(true);
    setClarifyFetchFallback(false);
    setMcqSelections({});
    setOpenFollowupText("");
    setClarifyPayload(null);

    const queued = sourceFiles.map((e) => e.file.name);
    const storedNames = storedFiles.filter((f) => selectedStoredIds.includes(f.id)).map((f) => f.filename);

    void (async () => {
      try {
        const p = await fetchSurveyClarifications(props.backendBase, {
          intent,
          has_queued_files: queued.length > 0,
          queued_filenames: queued,
          has_stored_selection: storedNames.length > 0,
          stored_filenames: storedNames
        });
        if (!cancelled) {
          setClarifyPayload(p);
        }
      } catch {
        if (!cancelled) {
          setClarifyPayload(getOfflineFallbackClarificationPayload());
          setClarifyFetchFallback(true);
        }
      } finally {
        if (!cancelled) setClarifyLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectLandingOpen, structureStep, props.backendBase, clarifyContextKey]);

  const toggleMcq = useCallback((questionId: string, optionId: string, allowMultiple: boolean) => {
    setMcqSelections((prev) => {
      const cur = prev[questionId] ?? [];
      if (allowMultiple) {
        if (cur.includes(optionId)) {
          return { ...prev, [questionId]: cur.filter((x) => x !== optionId) };
        }
        return { ...prev, [questionId]: [...cur, optionId] };
      }
      if (cur.includes(optionId) && cur.length === 1) {
        return { ...prev, [questionId]: [] };
      }
      return { ...prev, [questionId]: [optionId] };
    });
  }, []);

  const pickFiles = useCallback(
    (list: FileList | File[]) => {
      const arr = Array.from(list);
      if (arr.length === 0) return;
      addSourceFiles(arr);
      setError("");
    },
    [addSourceFiles]
  );

  const messages = useMemo(
    () => ({
      netError: t("err_net"),
      pickFiles: t("err_pick_files"),
      addFilesOrIntent: t("err_add_files_intent", { n: MIN_INTENT_BOOTSTRAP })
    }),
    [t, locale]
  );

  const step1Ready =
    projectChoice === "existing"
      ? Boolean(projectId.trim()) && canGenerateMindmap
      : Boolean(draftProjectName.trim()) && canGenerateMindmap;

  const onContinueToSurvey = useCallback(async () => {
    if (!step1Ready) return;
    setError("");

    if (projectChoice === "existing" && !projectId.trim()) {
      setError(t("landing_err_select_project"));
      return;
    }
    if (projectChoice === "create" && !draftProjectName.trim()) {
      setError(t("landing_err_project_name"));
      return;
    }

    setBusy(true);
    try {
      if (projectChoice === "create") {
        const res = await fetch(`${props.backendBase}/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: draftProjectName.trim() })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const d = (err as { detail?: unknown }).detail;
          setError(
            typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Create failed (${res.status})`
          );
          return;
        }
        const p = (await res.json()) as { id: string; name: string };
        setProjectId(p.id);
        const prevList = useUiStore.getState().projects;
        setProjects([p, ...prevList.filter((x) => x.id !== p.id)]);
        await fetchStoredForProject(p.id);
        setSelectedStoredIds([]);
      }

      setStructureStep(true);
    } catch {
      setError(t("err_net"));
    } finally {
      setBusy(false);
    }
  }, [
    step1Ready,
    projectChoice,
    projectId,
    draftProjectName,
    props.backendBase,
    setProjectId,
    setProjects,
    fetchStoredForProject,
    t
  ]);

  const onFinalizeGenerate = useCallback(async () => {
    const pid = useUiStore.getState().projectId;
    if (!pid.trim()) {
      setError(t("landing_err_select_project"));
      return;
    }

    const payload = clarifyPayload ?? getOfflineFallbackClarificationPayload();
    const surveyBlock = formatClarificationSurveyForIntent(payload, mcqSelections, openFollowupText);
    const effectiveIntent = composeIntentForBuild(intent, surveyBlock);

    setBusy(true);
    setError("");
    try {
      const result = await runMindmapBuild({
        backendBase: props.backendBase,
        projectId: pid,
        intent: effectiveIntent,
        sourceFiles,
        selectedStoredIds,
        storedFilesCount: storedFiles.length,
        loadMainGraph,
        clearSourceFiles,
        messages
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      try {
        sessionStorage.removeItem(PREV_PROJECT_SESSION_KEY);
      } catch {
        /* ignore */
      }
      dismissProjectLandingOnboarding();
    } catch {
      setError(t("err_net"));
    } finally {
      setBusy(false);
    }
  }, [
    props.backendBase,
    intent,
    clarifyPayload,
    mcqSelections,
    openFollowupText,
    sourceFiles,
    selectedStoredIds,
    storedFiles.length,
    loadMainGraph,
    clearSourceFiles,
    messages,
    dismissProjectLandingOnboarding,
    t
  ]);

  const onSkip = useCallback(() => {
    if (projectLandingReason === "new_project") {
      try {
        const prev = sessionStorage.getItem(PREV_PROJECT_SESSION_KEY);
        if (prev) setProjectId(prev);
        sessionStorage.removeItem(PREV_PROJECT_SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
    dismissProjectLandingOnboarding();
  }, [dismissProjectLandingOnboarding, projectLandingReason, setProjectId]);

  if (!projectLandingOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-landing-title"
    >
      <div className="ios-card relative flex max-h-[min(92vh,46rem)] w-full max-w-lg flex-col overflow-hidden shadow-2xl">
        <button
          type="button"
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={onSkip}
          aria-label={t("landing_close")}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-2 border-b border-slate-200/80 px-4 pb-3 pt-4 dark:border-slate-700/80">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" aria-hidden />
          <div className="min-w-0 pr-6">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {structureStep ? t("landing_step_2") : t("landing_step_1")}
            </p>
            <h2 id="project-landing-title" className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {structureStep ? t("landing_survey_title") : t("landing_title")}
            </h2>
            <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
              {structureStep ? t("landing_survey_intro") : t("landing_intro")}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!structureStep ? (
            <>
              <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200">{t("landing_project_mode")}</div>
              <div className="mt-1.5 flex flex-wrap gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="landing-project-mode"
                    className="h-3.5 w-3.5 border-slate-300 text-sky-600"
                    checked={projectChoice === "existing"}
                    onChange={() => {
                      setProjectChoice("existing");
                      newWizardInitRef.current = false;
                      try {
                        const prev = sessionStorage.getItem(PREV_PROJECT_SESSION_KEY);
                        if (prev) setProjectId(prev);
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                  {t("landing_mode_existing")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="landing-project-mode"
                    className="h-3.5 w-3.5 border-slate-300 text-sky-600"
                    checked={projectChoice === "create"}
                    onChange={() => {
                      setProjectChoice("create");
                      setStoredFiles([]);
                      setSelectedStoredIds([]);
                      setProjectId("");
                    }}
                  />
                  {t("landing_mode_create")}
                </label>
              </div>

              {projectChoice === "existing" ? (
                <label className="mt-3 block text-[11px] text-slate-700 dark:text-slate-200">
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
              ) : (
                <label className="mt-3 block text-[11px] text-slate-700 dark:text-slate-200">
                  {t("landing_project_name")}
                  <input
                    className="mt-1 ios-input py-2"
                    value={draftProjectName}
                    placeholder={t("sm_new_project_ph")}
                    onChange={(e) => setDraftProjectName(e.target.value)}
                  />
                </label>
              )}

              {projectChoice === "existing" && !projectId ? (
                <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-200">{t("landing_err_select_project")}</p>
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

              {projectId && storedFiles.length > 0 ? (
                <div className="mt-3 text-[10px] text-slate-600 dark:text-slate-400">
                  <div className="font-medium text-slate-700 dark:text-slate-200">{t("landing_stored_heading")}</div>
                  <p className="mt-0.5 leading-snug">{t("sm_stored_help")}</p>
                  <ul className="mt-1 max-h-24 space-y-1 overflow-auto rounded-lg border border-slate-200/80 bg-white/60 p-1 dark:border-slate-700 dark:bg-slate-950/40">
                    {storedFiles.map((f) => {
                      const checked = selectedStoredIds.includes(f.id);
                      return (
                        <li
                          key={f.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px] dark:bg-slate-900/50"
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-sky-600"
                            checked={checked}
                            onChange={() => {
                              setSelectedStoredIds((prev) =>
                                prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                              );
                            }}
                            aria-label={t("sm_include_aria", { name: f.filename })}
                          />
                          <span className="min-w-0 flex-1 truncate">{f.filename}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

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
                  "mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-3 py-5 text-center transition-colors",
                  dragOver
                    ? "border-sky-500 bg-white/70 shadow-sm dark:bg-slate-900/60"
                    : "border-slate-200/80 bg-white/55 hover:border-slate-300 dark:border-slate-700/70 dark:bg-slate-900/40"
                ].join(" ")}
              >
                <span className="text-xs font-medium text-slate-700 dark:text-slate-100">{t("sm_drop")}</span>
                <span className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">{t("sm_multi")}</span>
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept={[
                    ".pdf,.doc,.docx,.xls,.xlsx",
                    "application/pdf",
                    "application/msword",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "application/vnd.ms-excel",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "image/png,image/jpeg,image/webp,image/gif",
                    ".png,.jpg,.jpeg,.webp,.gif"
                  ].join(",")}
                  onChange={(e) => {
                    if (e.target.files?.length) pickFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>

              {sourceFiles.length > 0 ? (
                <ul className="mt-2 max-h-28 space-y-1 overflow-auto rounded-lg border border-slate-200/80 bg-white/50 p-1 dark:border-slate-700 dark:bg-slate-950/40">
                  {sourceFiles.map((entry) => {
                    const kind = classifySourceKind(entry.file);
                    return (
                      <li
                        key={entry.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-slate-800 dark:text-slate-100"
                      >
                        {kind === "excel" ? (
                          <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        ) : kind === "image" ? (
                          <ImageIcon className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{entry.file.name}</span>
                        <span className="shrink-0 text-slate-500">{formatBytes(entry.file.size)}</span>
                        <button
                          type="button"
                          className="shrink-0 text-slate-500 hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSourceFile(entry.id);
                          }}
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </>
          ) : (
            <>
              {clarifyLoading || !clarifyPayload ? (
                <div className="space-y-2 py-6 text-center">
                  <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200">{t("landing_clarify_loading")}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{t("landing_clarify_loading_hint")}</p>
                </div>
              ) : (
                <>
                  {clarifyFetchFallback ? (
                    <p className="mb-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-2 py-1.5 text-[10px] text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/50 dark:text-amber-100">
                      {t("landing_clarify_offline")}
                    </p>
                  ) : null}
                  <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">{clarifyPayload.intro}</p>
                  {clarifyPayload.clarification_note.trim() ? (
                    <p className="mt-2 rounded-lg border border-sky-200/70 bg-sky-50/80 px-2.5 py-2 text-[10px] leading-snug text-sky-950 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-100">
                      <span className="font-semibold">{t("landing_clarify_note_label")}</span>{" "}
                      {clarifyPayload.clarification_note}
                    </p>
                  ) : null}
                  <div className="mt-3 space-y-4">
                    {clarifyPayload.questions.map((q) => {
                      const selected = mcqSelections[q.id] ?? [];
                      return (
                        <fieldset key={q.id} className="rounded-xl border border-slate-200/80 bg-white/50 p-2.5 dark:border-slate-700/70 dark:bg-slate-950/35">
                          <legend className="mb-1.5 px-0.5 text-[11px] font-medium text-slate-800 dark:text-slate-100">
                            {q.prompt}
                          </legend>
                          <p className="mb-2 text-[9px] text-slate-500 dark:text-slate-400">
                            {q.allow_multiple ? t("landing_mcq_hint_multi") : t("landing_mcq_hint_single")}
                          </p>
                          <div className="flex flex-col gap-1.5">
                            {q.options.map((o) => {
                              const checked = selected.includes(o.id);
                              if (q.allow_multiple) {
                                return (
                                  <label
                                    key={o.id}
                                    className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
                                  >
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-sky-600"
                                      checked={checked}
                                      onChange={() => toggleMcq(q.id, o.id, true)}
                                    />
                                    <span className="text-slate-800 dark:text-slate-100">{o.label}</span>
                                  </label>
                                );
                              }
                              return (
                                <label
                                  key={o.id}
                                  className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
                                >
                                  <input
                                    type="radio"
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 border-slate-300 text-sky-600"
                                    name={`landing-mcq-${q.id}`}
                                    checked={checked}
                                    onChange={() => toggleMcq(q.id, o.id, false)}
                                  />
                                  <span className="text-slate-800 dark:text-slate-100">{o.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      );
                    })}
                  </div>
                  <label className="mt-4 block text-[11px] text-slate-700 dark:text-slate-200">
                    {clarifyPayload.open_followup.prompt}
                    <textarea
                      className="mt-1 ios-input resize-y"
                      rows={2}
                      value={openFollowupText}
                      placeholder={clarifyPayload.open_followup.placeholder || t("landing_survey_avoid_ph")}
                      onChange={(e) => setOpenFollowupText(e.target.value)}
                    />
                  </label>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200/80 px-4 py-3 dark:border-slate-700/80">
          {error ? <p className="text-[11px] text-red-700 dark:text-red-300">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            {!structureStep ? (
              <>
                <button
                  type="button"
                  disabled={busy || !step1Ready}
                  className="ios-button-primary min-w-[8rem] flex-1 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void onContinueToSurvey()}
                >
                  {busy ? t("landing_working") : t("landing_next_structure")}
                </button>
                <button type="button" className="ios-button min-w-[6rem]" onClick={onSkip} disabled={busy}>
                  {t("landing_skip")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className="ios-button min-w-[6rem]"
                  onClick={() => {
                    setStructureStep(false);
                    setError("");
                    setClarifyPayload(null);
                    setClarifyFetchFallback(false);
                    setMcqSelections({});
                    setOpenFollowupText("");
                  }}
                >
                  {t("landing_back_setup")}
                </button>
                <button
                  type="button"
                  disabled={busy || clarifyLoading || !clarifyPayload}
                  className="ios-button-primary min-w-[8rem] flex-1 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void onFinalizeGenerate()}
                >
                  {busy ? t("sm_generating") : t("landing_generate_final")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
