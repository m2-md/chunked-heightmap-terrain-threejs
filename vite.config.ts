import { defineConfig } from "vite";

// Demo compiles for modern target (three r185 ESM). Tests run in vitest's
// node environment — no browser, canvas, or WebGL context required.
export default defineConfig({
  server: {
    // Each demo in repo has its own port (see .claude/launch.json).
    port: 5216,
  },
  build: {
    target: "esnext",
  },
  esbuild: {
    target: "esnext",
  },
});
