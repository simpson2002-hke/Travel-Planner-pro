import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

import { cloudflare } from "@cloudflare/vite-plugin";

const DEFAULT_PORT = Number(process.env.PORT || 4173);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), cloudflare()],
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