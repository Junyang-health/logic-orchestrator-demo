import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import { FileText, Image as ImageIcon } from "lucide-react";
import { useI18n } from "../../i18n/useI18n";
import { MIN_INTENT_BOOTSTRAP } from "../../lib/mindmapBuild";
import { formatBytes } from "../../lib/formatBytes";
import type { SourceFileEntry } from "../../types/sourceMaterial";
import { classifySourceKind } from "../../types/sourceMaterial";
import { PREV_PROJECT_SESSION_KEY } from "../sourceMaterial/projectSessionKeys";
import { SOURCE_FILE_INPUT_ACCEPT } from "../sourceMaterial/sourceFileAccept";

type Project = { id: string; name: string };

type StoredLandingFile = { id: string; filename: string; origin?: string; uploaded_at_ms: number };

type Props = {
  projectChoice: "create" | "existing";
  setProjectChoice: (c: "create" | "existing") => void;
  newWizardInitRef: MutableRefObject<boolean>;
  projects: Project[];
  projectId: string;
  setProjectId: (id: string) => void;
  draftProjectName: string;
  setDraftProjectName: (s: string) => void;
  intent: string;
  setIntent: (s: string) => void;
  storedFiles: StoredLandingFile[];
  selectedStoredIds: string[];
  setSelectedStoredIds: Dispatch<SetStateAction<string[]>>;
  inputRef: RefObject<HTMLInputElement | null>;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  pickFiles: (list: FileList | File[]) => void;
  sourceFiles: SourceFileEntry[];
  removeSourceFile: (id: string) => void;
  setStoredFiles: Dispatch<SetStateAction<StoredLandingFile[]>>;
};

export function ProjectLandingSetupStep(props: Props) {
  const { t } = useI18n();
  const {
    projectChoice,
    setProjectChoice,
    newWizardInitRef,
    projects,
    projectId,
    setProjectId,
    draftProjectName,
    setDraftProjectName,
    intent,
    setIntent,
    storedFiles,
    selectedStoredIds,
    setSelectedStoredIds,
    inputRef,
    dragOver,
    setDragOver,
    pickFiles,
    sourceFiles,
    removeSourceFile,
    setStoredFiles
  } = props;

  return (
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
          <select className="mt-1 ios-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
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
                <li key={f.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px] dark:bg-slate-900/50">
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
          accept={SOURCE_FILE_INPUT_ACCEPT}
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
  );
}
