/**
 * Server-side MarkItDown extraction — same path as project file sidecars, for ad-hoc source queue.
 */

export type SourceExtractSnippet = { filename: string; markdown: string | null; error: string | null };

export async function postSourceExtractText(
  backendBase: string,
  files: File[]
): Promise<SourceExtractSnippet[]> {
  if (files.length === 0) return [];
  const base = backendBase.replace(/\/$/, "");
  const fd = new FormData();
  for (const f of files) {
    fd.append("files", f, f.name);
  }
  const res = await fetch(`${base}/source/extract-text`, { method: "POST", body: fd });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `extract-text failed: ${res.status}`);
  }
  const data = (await res.json()) as { snippets: SourceExtractSnippet[] };
  return data.snippets ?? [];
}
