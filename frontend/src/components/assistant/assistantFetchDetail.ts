/** Parses FastAPI-style `{ detail: string | object[] | ... }` bodies after a failed response. */
export async function readFetchDetailMessage(res: Response, fallbackPrefix: string): Promise<string> {
  const raw = await res.json().catch(() => ({}));
  const d = (raw as { detail?: unknown }).detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((x: unknown) =>
        typeof x === "object" && x && "msg" in x ? String((x as { msg: string }).msg) : JSON.stringify(x)
      )
      .join("; ");
  }
  if (d != null) return JSON.stringify(d);
  return `${fallbackPrefix} (${res.status})`;
}
