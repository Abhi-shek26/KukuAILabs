import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React dev server proxies /api to the Express API, so the app talks to one origin
// in development and in production (Express serves the built files).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:4000", changeOrigin: false } },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
