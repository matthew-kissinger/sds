import { defineConfig } from "vitest/config";

// Vitest runs independently of the Vite app bundle config. Do not merge
// with vite.config.js - the app needs its own build pipeline (manualChunks,
// dual-target, Tailwind plugin) that Vitest should not inherit.
export default defineConfig({
  // Cycle 47 P2: component specs are .tsx and use the React automatic JSX
  // runtime, so esbuild transforms <Jsx/> without an explicit React import.
  // This applies to all test transforms; the existing createElement .js
  // specs contain no JSX and are unaffected.
  esbuild: { jsx: "automatic" },
  test: {
    // Default to node for the fast pure-logic + sim-baseline suites. Component
    // render specs opt into jsdom per-file via a `@vitest-environment jsdom`
    // docblock, so the bulk of the suite keeps the lighter node environment.
    environment: "node",
    include: [
      "tests/**/*.spec.ts",
      "tests/**/*.spec.js",
      "tests/**/*.spec.tsx",
      "tests/**/*.spec.jsx",
    ],
    exclude: ["tests/e2e/**", "tests/browserstack/**", "node_modules/**"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    reporters: process.env.CI ? ["default"] : ["default"],
  },
});
