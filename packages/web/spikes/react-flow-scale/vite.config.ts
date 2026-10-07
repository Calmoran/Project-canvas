// Builds and serves the spike page on its own. `root` is this folder, so the
// spike shares nothing with the real app's build (WEB-2).
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  preview: { port: 4173, strictPort: true },
});
