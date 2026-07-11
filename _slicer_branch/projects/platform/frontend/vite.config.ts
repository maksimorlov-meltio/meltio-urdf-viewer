import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies API + health to the platform backend so `npm run dev`
// (http://localhost:5173) talks to a locally running platform on :8090.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8090",
      "/health": "http://localhost:8090",
    },
  },
  build: { outDir: "dist" },
});
