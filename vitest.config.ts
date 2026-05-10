import { defineConfig } from "vitest/config";

// Vitest runs independently of the Vite app bundle config. Do not merge
// with vite.config.js - the app needs its own build pipeline (manualChunks,
// dual-target, Tailwind plugin) that Vitest should not inherit.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts", "tests/**/*.spec.js"],
    exclude: ["tests/e2e/**", "tests/browserstack/**", "node_modules/**"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    reporters: process.env.CI ? ["default"] : ["default"],
  },
});
