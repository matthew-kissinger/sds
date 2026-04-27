import { defineConfig, devices } from '@playwright/test';

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
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Cycle 9 Phase 3: Firefox + WebKit projects so we catch a class of
    // bugs that Chromium-only smoke misses. WebKit is NOT macOS Safari
    // (different JS engine wrapper, no Metal/ANGLE), but it still flags
    // shader / WebGL extension differences. Real Safari runs nightly on a
    // separate macos-latest GH Actions workflow.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
