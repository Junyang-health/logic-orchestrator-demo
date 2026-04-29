/**
 * Backend origin for API `fetch` calls.
 * - In dev, default is "" so requests are same-origin and Vite proxies them to uvicorn (avoids
 *   "Failed to fetch" when the UI is opened via LAN IP / non-localhost host while the API stays on :8000).
 * - Set `VITE_BACKEND_URL` to override in any mode.
 * - Production / preview: defaults to http://localhost:8000 when unset.
 */
export function getBackendBase(): string {
  const raw = (import.meta as unknown as { env?: { VITE_BACKEND_URL?: string } }).env?.VITE_BACKEND_URL;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed) {
    return trimmed.replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "";
  }
  return "http://localhost:8000";
}
