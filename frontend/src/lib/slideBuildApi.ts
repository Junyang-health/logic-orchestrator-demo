import { HttpError } from "./postJson";

export type SlideBuildJobOut = {
  id: string;
  session_id: string;
  kind: string;
  slide_id: string | null;
  status: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at_ms: number;
  started_at_ms: number | null;
  finished_at_ms: number | null;
};

export type SlideBuildSessionOut = {
  id: string;
  title: string;
  framework: Record<string, unknown>;
  created_at_ms: number;
  updated_at_ms: number;
  jobs: SlideBuildJobOut[];
};

export async function postSlideBuildSession(
  base: string,
  body: { title: string; framework: Record<string, unknown> }
): Promise<{ session_id: string }> {
  const res = await fetch(`${base}/slide-build/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = (await res.json().catch(() => ({}))) as { session_id?: string; detail?: unknown };
  if (!res.ok) {
    const d = data.detail;
    const msg = typeof d === "string" ? d : `Request failed (${res.status})`;
    throw new HttpError(msg, res.status, data);
  }
  return { session_id: String(data.session_id || "") };
}

export async function getSlideBuildSession(base: string, sessionId: string): Promise<SlideBuildSessionOut> {
  const res = await fetch(`${base}/slide-build/sessions/${encodeURIComponent(sessionId)}`);
  const data = (await res.json().catch(() => ({}))) as SlideBuildSessionOut & { detail?: unknown };
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    const msg = typeof d === "string" ? d : `Request failed (${res.status})`;
    throw new HttpError(msg, res.status, data);
  }
  return data as SlideBuildSessionOut;
}

export async function enqueueSlideJob(
  base: string,
  sessionId: string,
  body: { kind: "slide_generate" | "export_pptx" | "export_pdf"; slide_id?: string; payload?: Record<string, unknown> }
): Promise<SlideBuildJobOut> {
  const res = await fetch(`${base}/slide-build/sessions/${encodeURIComponent(sessionId)}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = (await res.json().catch(() => ({}))) as SlideBuildJobOut & { detail?: unknown };
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    const msg = typeof d === "string" ? d : `Request failed (${res.status})`;
    throw new HttpError(msg, res.status, data);
  }
  return data as SlideBuildJobOut;
}

export async function patchSlideSessionFramework(
  base: string,
  sessionId: string,
  framework: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${base}/slide-build/sessions/${encodeURIComponent(sessionId)}/framework`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ framework })
  });
  const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    const msg = typeof d === "string" ? d : `Request failed (${res.status})`;
    throw new HttpError(msg, res.status, data);
  }
}

export async function listSlideReferenceAssets(base: string, sessionId: string): Promise<string[]> {
  const res = await fetch(`${base}/slide-build/sessions/${encodeURIComponent(sessionId)}/reference-assets`);
  const data = (await res.json().catch(() => ({}))) as { stored_names?: string[]; detail?: unknown };
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    const msg = typeof d === "string" ? d : `Request failed (${res.status})`;
    throw new HttpError(msg, res.status, data);
  }
  return Array.isArray(data.stored_names) ? data.stored_names : [];
}

export async function uploadSlideReferenceAssets(base: string, sessionId: string, files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const res = await fetch(`${base}/slide-build/sessions/${encodeURIComponent(sessionId)}/reference-assets`, {
    method: "POST",
    body: fd
  });
  const data = (await res.json().catch(() => ({}))) as { stored_names?: string[]; detail?: unknown };
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    const msg = typeof d === "string" ? d : `Request failed (${res.status})`;
    throw new HttpError(msg, res.status, data);
  }
  return Array.isArray(data.stored_names) ? data.stored_names : [];
}

export async function putSlideBuildPreferences(
  base: string,
  sessionId: string,
  body: { style_notes_full: string; design: Record<string, string>; reference_stored_names: string[] }
): Promise<void> {
  const res = await fetch(`${base}/slide-build/sessions/${encodeURIComponent(sessionId)}/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    const msg = typeof d === "string" ? d : `Request failed (${res.status})`;
    throw new HttpError(msg, res.status, data);
  }
}

export async function getSlideInnerHtml(base: string, sessionId: string, slideId: string): Promise<string> {
  const res = await fetch(
    `${base}/slide-build/sessions/${encodeURIComponent(sessionId)}/slides/${encodeURIComponent(slideId)}/inner`
  );
  const data = (await res.json().catch(() => ({}))) as { inner_html?: string; detail?: unknown };
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    const msg = typeof d === "string" ? d : `Request failed (${res.status})`;
    throw new HttpError(msg, res.status, data);
  }
  return typeof data.inner_html === "string" ? data.inner_html : "";
}

export async function patchSlideInnerHtml(base: string, sessionId: string, slideId: string, innerHtml: string): Promise<void> {
  const res = await fetch(
    `${base}/slide-build/sessions/${encodeURIComponent(sessionId)}/slides/${encodeURIComponent(slideId)}/inner`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inner_html: innerHtml })
    }
  );
  const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    const msg = typeof d === "string" ? d : `Request failed (${res.status})`;
    throw new HttpError(msg, res.status, data);
  }
}

export async function postSlideDeckAssistChat(
  base: string,
  sessionId: string,
  slideId: string,
  message: string
): Promise<{ reply: string }> {
  const res = await fetch(
    `${base}/slide-build/sessions/${encodeURIComponent(sessionId)}/slides/${encodeURIComponent(slideId)}/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    }
  );
  const data = (await res.json().catch(() => ({}))) as { reply?: string; detail?: unknown };
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    const msg = typeof d === "string" ? d : `Request failed (${res.status})`;
    throw new HttpError(msg, res.status, data);
  }
  return { reply: typeof data.reply === "string" ? data.reply : "" };
}

export function slideBuildPreviewUrl(base: string, sessionId: string, slideId: string): string {
  const root = base.replace(/\/$/, "");
  return `${root}/slide-build/sessions/${encodeURIComponent(sessionId)}/slides/${encodeURIComponent(slideId)}/preview`;
}

export function slideBuildDownloadPptxUrl(base: string, sessionId: string): string {
  const root = base.replace(/\/$/, "");
  return `${root}/slide-build/sessions/${encodeURIComponent(sessionId)}/files/pptx`;
}

export function slideBuildDownloadPdfUrl(base: string, sessionId: string): string {
  const root = base.replace(/\/$/, "");
  return `${root}/slide-build/sessions/${encodeURIComponent(sessionId)}/files/pdf`;
}

export async function postSlideBuildPptxPreviewImages(
  base: string,
  sessionId: string,
  images: string[]
): Promise<void> {
  const res = await fetch(
    `${base}/slide-build/sessions/${encodeURIComponent(sessionId)}/files/pptx-from-preview-images`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images })
    }
  );
  const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
  if (!res.ok) {
    const d = data.detail;
    const msg = typeof d === "string" ? d : `Request failed (${res.status})`;
    throw new HttpError(msg, res.status, data);
  }
}
