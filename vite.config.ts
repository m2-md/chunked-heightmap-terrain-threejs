import { defineConfig } from "vite";

// Demo modern hedefle derlenir (three r185 ESM). Testler vitest'in kendi
// node ortamında koşar — tarayıcı, canvas ya da WebGL bağlamı gerekmez.
export default defineConfig({
  server: {
    // Depodaki her demonun kendi portu var (bkz. .claude/launch.json).
    port: 5216,
  },
  build: {
    target: "esnext",
  },
  esbuild: {
    target: "esnext",
  },
});
