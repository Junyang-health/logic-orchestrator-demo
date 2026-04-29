type ProjectFileRow = { id: string; filename: string };

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
  return (
    <div className="ios-card p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{sessionLabel}</div>
      <div className="mt-1 text-[11px] text-slate-700 dark:text-slate-200">
        {targetNodeLabel} <span className="font-mono">{selectedNodeId ?? "—"}</span>
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
            <label className="mt-1.5 block">
              <span className="sr-only">{sourceFilesLabel}</span>
              <select
                multiple
                size={Math.min(8, Math.max(3, projectFiles.length))}
                className="w-full max-w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                value={selectedSourceFileIds}
                onChange={(e) => {
                  const next = Array.from(e.target.selectedOptions, (o) => o.value);
                  onSelectedSourceFileIdsChange(next);
                }}
                aria-label={sourceFilesLabel}
              >
                {projectFiles.map((f) => (
                  <option key={f.id} value={f.id} title={f.filename}>
                    {f.filename}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{selectionCount(selectedSourceFileIds.length)}</p>
          </>
        )}
      </div>
    </div>
  );
}
