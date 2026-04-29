import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Forward API paths to FastAPI so dev can use same-origin URLs (works for localhost and LAN). */
const DEV_API_TARGET = "http://127.0.0.1:8000";
const devApiProxy = Object.fromEntries(
  [
    "/session",
    "/projects",
    "/models",
    "/health",
    "/mindmap",
    "/upload",
    "/source",
    "/validate",
    "/review",
    "/assistant",
    "/export"
  ].map((prefix) => [prefix, { target: DEV_API_TARGET, changeOrigin: true }] as const)
);

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  },
  server: {
    port: 5173,
    // If 5173 is already in use, try the next free port instead of failing immediately.
    strictPort: false,
    host: true,
    proxy: devApiProxy
  }
});

