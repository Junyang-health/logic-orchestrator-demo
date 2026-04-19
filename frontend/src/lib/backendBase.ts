export function getBackendBase(): string {
  return ((import.meta as unknown as { env?: { VITE_BACKEND_URL?: string } }).env?.VITE_BACKEND_URL as
    | string
    | undefined) || "http://localhost:8000";
}
