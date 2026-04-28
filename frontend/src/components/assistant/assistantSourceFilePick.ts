const ASSISTANT_SOURCE_FILE_PICK_KEY = "mindmap_assistant_source_file_pick_v1";

export function readAssistantSourceFilePickMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(ASSISTANT_SOURCE_FILE_PICK_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (p && typeof p === "object" && !Array.isArray(p)) {
      return Object.fromEntries(
        Object.entries(p as Record<string, unknown>).map(([k, v]) => [
          k,
          Array.isArray(v) ? (v as unknown[]).map((x) => String(x)) : []
        ])
      );
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function writeAssistantSourceFilePickForProject(projectId: string, ids: string[]) {
  try {
    const m = readAssistantSourceFilePickMap();
    m[projectId] = ids;
    localStorage.setItem(ASSISTANT_SOURCE_FILE_PICK_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}
