export type SourceSortKey = "date_new" | "date_old" | "type" | "origin";

export type StoredProjectFile = {
  id: string;
  filename: string;
  size: number;
  content_type?: string | null;
  uploaded_at_ms: number;
  origin?: string;
};

export function fileExtension(fn: string): string {
  const i = fn.lastIndexOf(".");
  return i >= 0 ? fn.slice(i + 1).toLowerCase() : "";
}

export function sortStoredProjectFiles(files: StoredProjectFile[], key: SourceSortKey): StoredProjectFile[] {
  const out = [...files];
  switch (key) {
    case "date_new":
      return out.sort((a, b) => b.uploaded_at_ms - a.uploaded_at_ms);
    case "date_old":
      return out.sort((a, b) => a.uploaded_at_ms - b.uploaded_at_ms);
    case "type":
      return out.sort((a, b) => {
        const ea = fileExtension(a.filename);
        const eb = fileExtension(b.filename);
        const c = ea.localeCompare(eb);
        if (c !== 0) return c;
        return a.filename.localeCompare(b.filename);
      });
    case "origin":
      return out.sort((a, b) => {
        const oa = a.origin === "llm_ingest" ? 1 : 0;
        const ob = b.origin === "llm_ingest" ? 1 : 0;
        if (oa !== ob) return oa - ob;
        return b.uploaded_at_ms - a.uploaded_at_ms;
      });
    default:
      return out;
  }
}
