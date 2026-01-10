import { fileURLToPath } from "url";
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: "/static/frontend/",
  build: {
    outDir: path.resolve(__dirname, "../app/static/frontend"),
    emptyOutDir: true,
    manifest: true,
  },
});
