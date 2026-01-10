import { fileURLToPath } from "url";
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "serve" ? "/" : "/static/frontend/",
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/login": "http://127.0.0.1:8000",
      "/logout": "http://127.0.0.1:8000",
      "/admin": "http://127.0.0.1:8000",
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../app/static/frontend"),
    emptyOutDir: true,
    manifest: true,
  },
}));
