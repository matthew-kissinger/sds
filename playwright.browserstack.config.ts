// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { defineConfig } from '@playwright/test';

const baseURL = process.env.IOS_WATER_BASE_URL || 'http://localhost:3000';
const useLocalServer = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL);
const testMatch = process.env.BROWSERSTACK_TEST_MATCH
  || (useLocalServer
    ? '**/ios-water.spec.ts'
    : ['**/ios-water.spec.ts', '**/newsheepdogland-first-session.spec.ts']);

export default defineConfig({
  testDir: './tests/browserstack',
  outputDir: 'browserstack-artifacts/ios-water',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'browserstack-artifacts/ios-water-report' }]],
  timeout: 240_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL,
    headless: false,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 45_000,
    navigationTimeout: 90_000,
  },
  projects: [
    {
      name: 'safari@iPhone 15 Pro Max:17@browserstack-mobile',
      use: {
        browserName: 'safari',
        channel: 'safari',
      },
      testMatch,
    },
  ],
  webServer: useLocalServer
    ? {
        command: 'npm run dev:client -- --host 127.0.0.1',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
});
