import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  // VITE_API_HOST is inlined at build time (Render sets it as a build env var).
  // We intentionally do NOT use vite-plugin-runtime-env: it rewrites
  // import.meta.env into window.env placeholders that require an envsubst step
  // at deploy time, which a Render static site never runs — leaving the API
  // host unset and falling back to localhost:3001.
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
