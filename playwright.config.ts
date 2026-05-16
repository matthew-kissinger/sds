import { defineConfig, devices } from '@playwright/test';

const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

/**
 * Playwright config for SDS e2e smoke tests.
 *
 * Usage:
 *   npm run test:e2e          - headless run
 *   npm run test:e2e:headed   - run with visible browser
 *   npm run test:e2e:ui       - Playwright UI mode
 *
 * The webServer block below boots `npm run dev`, which starts Vite on
 * port 3000 AND wrangler on port 8787 via concurrently. If a dev server
 * is already running on :3000 we reuse it.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results/',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Cycle 15 Phase 6: bumped from 10s to 30s. The main bundle (~800 KB) +
    // React hydration on a cold GH Actions Linux runner can stall
    // dispatchEvent's actionability wait long enough to trip the 10s ceiling.
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: CHROMIUM_GPU_ARGS } },
      // Cycle 24 Phase 1: MP specs run under their own `mp-*` projects to
      // keep the cross-context boot pattern (host + guest in separate
      // BrowserContexts) from showing up under the smoke-test browser
      // projects. Same browser engine, different test bucket.
      testIgnore: '**/mp/*.spec.ts',
    },
    // Cycle 9 Phase 3: Firefox + WebKit projects so we catch a class of
    // bugs that Chromium-only smoke misses. WebKit is NOT macOS Safari
    // (different JS engine wrapper, no Metal/ANGLE), but it still flags
    // shader / WebGL extension differences. Real Safari runs nightly on a
    // separate macos-latest GH Actions workflow.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: '**/mp/*.spec.ts',
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: '**/mp/*.spec.ts',
    },
    // Cycle 24 Phase 1: dedicated MP projects. Each spec opens host +
    // guest contexts via tests/e2e/mp/_helpers.ts; they assert against
    // window.__sdsMpProbe (installed when ?mpProbe=1 is in the URL).
    // CI runs only `mp` (chromium) by default — local cross-engine runs
    // use `--project=mp` `--project=mp-firefox` `--project=mp-webkit`.
    {
      name: 'mp',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: CHROMIUM_GPU_ARGS } },
      testMatch: '**/mp/*.spec.ts',
    },
    {
      name: 'mp-firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: '**/mp/*.spec.ts',
    },
    {
      name: 'mp-webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: '**/mp/*.spec.ts',
    },
  ],

  webServer: {
    command: 'npx cross-env SDS_SUPPRESS_BROWSER_OPEN=1 npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
