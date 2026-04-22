type JsonBody = Record<string, unknown> | unknown[];

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e && typeof e === "object" && "name" in e && (e as { name: string }).name === "AbortError") {
    return true;
  }
  return false;
}

/**
 * POST JSON, read the response body once, throw `HttpError` with status when !ok, or rethrow on abort.
 */
export async function postJson<T>(url: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(init?.headers as HeadersInit | undefined) },
    body: JSON.stringify(body),
    signal: init?.signal
  });
  const data = (await res.json().catch(() => ({}))) as JsonBody;
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    const msg = typeof d === "string" ? d : `Request failed (${res.status})`;
    throw new HttpError(msg, res.status, data);
  }
  return data as T;
}
