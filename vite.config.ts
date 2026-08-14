import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const DEFAULT_PORT = Number(process.env.PORT || 4173);
const githubRepository = process.env.GITHUB_REPOSITORY?.split("/").pop();
const githubPagesBase = process.env.GITHUB_PAGES === "true" ? `/${githubRepository || "Travel-Planner-pro"}/` : "/";

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || githubPagesBase,
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    host: true,
    port: DEFAULT_PORT,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: DEFAULT_PORT,
    strictPort: true,
    allowedHosts: true,
  },
});
