import { FileSpreadsheet, FileText, Image as ImageIcon } from "lucide-react";

type ProjectFileRow = { id: string; filename: string };

function fileChipVisual(filename: string): { Icon: typeof FileText; iconClass: string } {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return { Icon: FileText, iconClass: "text-red-600 dark:text-red-400" };
  }
  if (/\.(doc|docx)$/i.test(lower)) {
    return { Icon: FileText, iconClass: "text-blue-600 dark:text-blue-400" };
  }
  if (/\.(xls|xlsx|csv)$/i.test(lower)) {
    return { Icon: FileSpreadsheet, iconClass: "text-emerald-600 dark:text-emerald-400" };
  }
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(lower)) {
    return { Icon: ImageIcon, iconClass: "text-violet-600 dark:text-violet-400" };
  }
  if (/\.(md|txt|markdown|rtf)$/i.test(lower)) {
    return { Icon: FileText, iconClass: "text-slate-600 dark:text-slate-400" };
  }
  return { Icon: FileText, iconClass: "text-slate-500 dark:text-slate-400" };
}

type Props = {
  sessionLabel: string;
  targetNodeLabel: string;
  selectedNodeId: string | undefined;
  sandboxHint: string;
  skillsWebSearch: boolean;
  webQueryLabel: string;
  webQueryHelp: string;
  webQueryPlaceholder: string;
  webSearchQuery: string;
  onWebSearchQueryChange: (v: string) => void;
  activeProjectId: string;
  ingestBusy: boolean;
  ingestCta: string;
  ingestBusyLabel: string;
  ingestHint: string;
  onIngestWeb: () => void;
  sourceFilesLabel: string;
  sourceFilesHint: string;
  sourceFilesNoProject: string;
  sourceFilesError: string;
  sourceFilesEmpty: string;
  selectAllSources: string;
  selectNoSources: string;
  selectionCount: (n: number) => string;
  projectFilesLoadError: boolean;
  projectFiles: ProjectFileRow[];
  selectedSourceFileIds: string[];
  onSelectedSourceFileIdsChange: (ids: string[]) => void;
};

export default function AssistantSessionSourcesCard({
  sessionLabel,
  targetNodeLabel,
  selectedNodeId,
  sandboxHint,
  skillsWebSearch,
  webQueryLabel,
  webQueryHelp,
  webQueryPlaceholder,
  webSearchQuery,
  onWebSearchQueryChange,
  activeProjectId,
  ingestBusy,
  ingestCta,
  ingestBusyLabel,
  ingestHint,
  onIngestWeb,
  sourceFilesLabel,
  sourceFilesHint,
  sourceFilesNoProject,
  sourceFilesError,
  sourceFilesEmpty,
  selectAllSources,
  selectNoSources,
  selectionCount,
  projectFilesLoadError,
  projectFiles,
  selectedSourceFileIds,
  onSelectedSourceFileIdsChange
}: Props) {
  const toggleFile = (id: string, checked: boolean) => {
    if (checked) {
      if (selectedSourceFileIds.includes(id)) return;
      onSelectedSourceFileIdsChange([...selectedSourceFileIds, id]);
    } else {
      onSelectedSourceFileIdsChange(selectedSourceFileIds.filter((x) => x !== id));
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {sessionLabel}
      </div>
      <div className="mt-1 text-[11px] text-slate-700 dark:text-slate-200">
        {targetNodeLabel}{" "}
        {selectedNodeId ? (
          <code className="mm-assistant-code-pill">{selectedNodeId}</code>
        ) : (
          <code className="mm-assistant-code-pill opacity-70">—</code>
        )}
      </div>
      <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{sandboxHint}</div>
      {skillsWebSearch && (
        <div className="mt-2 text-[11px] text-slate-700 dark:text-slate-200">
          <label className="block" htmlFor="assistant-web-search-queries">
            {webQueryLabel}
          </label>
          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{webQueryHelp}</p>
          <textarea
            id="assistant-web-search-queries"
            className="mt-1 min-h-[4.5rem] w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            rows={4}
            value={webSearchQuery}
            onChange={(e) => onWebSearchQueryChange(e.target.value)}
            placeholder={webQueryPlaceholder}
          />
          {activeProjectId ? (
            <div className="mt-1.5">
              <button
                type="button"
                className="ios-button w-full py-1.5 text-[10px] disabled:opacity-50"
                disabled={ingestBusy}
                onClick={onIngestWeb}
              >
                {ingestBusy ? ingestBusyLabel : ingestCta}
              </button>
              <p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-500">{ingestHint}</p>
            </div>
          ) : null}
        </div>
      )}
      <div className="mt-2 text-[11px] text-slate-700 dark:text-slate-200">
        <div className="font-medium">{sourceFilesLabel}</div>
        <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{sourceFilesHint}</p>
        {!activeProjectId ? (
          <p className="mt-2 text-[10px] text-amber-800 dark:text-amber-200/90">{sourceFilesNoProject}</p>
        ) : projectFilesLoadError ? (
          <p className="mt-2 text-[10px] text-red-600 dark:text-red-400">{sourceFilesError}</p>
        ) : projectFiles.length === 0 ? (
          <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">{sourceFilesEmpty}</p>
        ) : (
          <>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button
                type="button"
                className="text-[10px] text-sky-600 underline dark:text-sky-400"
                onClick={() => onSelectedSourceFileIdsChange(projectFiles.map((f) => f.id))}
              >
                {selectAllSources}
              </button>
              <button
                type="button"
                className="text-[10px] text-sky-600 underline dark:text-sky-400"
                onClick={() => onSelectedSourceFileIdsChange([])}
              >
                {selectNoSources}
              </button>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5" aria-label={sourceFilesLabel}>
              {projectFiles.map((f) => {
                const checked = selectedSourceFileIds.includes(f.id);
                const { Icon, iconClass } = fileChipVisual(f.filename);
                return (
                  <li key={f.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200/90 bg-white/95 px-2 py-1.5 shadow-sm transition hover:border-slate-300/90 dark:border-slate-600/70 dark:bg-slate-900/55 dark:hover:border-slate-500/80">
                      <input
                        type="checkbox"
                        className="shrink-0 rounded border-slate-300 text-sky-600 dark:border-slate-600"
                        checked={checked}
                        onChange={(e) => toggleFile(f.id, e.target.checked)}
                      />
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-800 dark:text-slate-100" title={f.filename}>
                        {f.filename}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">{selectionCount(selectedSourceFileIds.length)}</p>
          </>
        )}
      </div>
    </div>
  );
}
