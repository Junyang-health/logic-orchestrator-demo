/**
 * Avoids re-fetching `/mindmap/canvas` when Source panel remounts with the same project
 * (see SourceMaterialPanel comment).
 */
let lastAutoFetchedCanvasProjectId: string | null = null;

export function shouldSkipCanvasAutoFetch(projectId: string): boolean {
  return lastAutoFetchedCanvasProjectId === projectId;
}

export function markCanvasAutoFetched(projectId: string): void {
  lastAutoFetchedCanvasProjectId = projectId;
}

export function clearCanvasAutoFetchForProject(projectId: string): void {
  if (lastAutoFetchedCanvasProjectId === projectId) {
    lastAutoFetchedCanvasProjectId = null;
  }
}
