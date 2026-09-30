import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { agentPlugin } from "./tools/agentPlugin.ts";

export default defineConfig({
  root: "frontend",
  plugins: [react(), agentPlugin("frontend/src/agent/index.ts")],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: { outDir: "../dist", emptyOutDir: true },
  test: { environment: "jsdom", include: ["src/**/*.test.ts"] },
});
