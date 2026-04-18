import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // If 5173 is already in use, try the next free port instead of failing immediately.
    strictPort: false,
    host: true
  }
});

