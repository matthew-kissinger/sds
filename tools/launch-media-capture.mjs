// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Rebuild the 1200 x 630 launch card from the production bundle. The capture
 * uses the real title scene and UI. Only identity registration is replaced by
 * a fixed local response, so the recipe never writes to the public score
 * service and the visible running name remains stable.
 */

import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { analyzeScreenshot } from './screenshot-analysis.mjs';
import {
  SEED,
  launchBrowser,
  removeDir,
  repo,
  scratchDir,
  startPreviewServer,
  stopServer,
} from './probe-lib.mjs';

const PORT = 5324;
const OUTPUT = join(repo, 'app', 'public', 'og', 'sheepdog-sim.png');
const GITHUB_OUTPUT = join(repo, 'docs', 'launch', 'media', 'sheepdog-sim-github.jpg');
const SCORE_ORIGIN = 'https://sds-worker.matt-m-kissinger.workers.dev';

mkdirSync(dirname(OUTPUT), { recursive: true });
mkdirSync(dirname(GITHUB_OUTPUT), { recursive: true });

let server = null;
let browser = null;
let profile = null;

try {
  server = await startPreviewServer(PORT);
  profile = scratchDir('sds-v3-launch-media');
  browser = await launchBrowser(profile);
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.route(`${SCORE_ORIGIN}/**`, (route) => route.abort('blockedbyclient'));
  await page.route(`${SCORE_ORIGIN}/api/register`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'capture-only-token',
        authSecret: 'capture-only-secret',
        playerProfile: {
          persistentId: 'capture-only-player',
          displayName: 'Meadow Scout',
          fullName: 'Meadow Scout#0001',
        },
      }),
    });
  });
  await page.goto(`http://localhost:${PORT}/?seed=${SEED}`, {
    waitUntil: 'load',
    timeout: 60_000,
  });
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.waitForSelector('.herd-app[data-ready="true"]', { timeout: 90_000 });
  await page.waitForFunction(
    () => document.body.textContent?.includes('Meadow Scout') === true,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(1_000);

  const backend = await page.locator('canvas').evaluate((canvas) => {
    try {
      if (canvas.getContext('webgpu') !== null) return 'webgpu';
    } catch {}
    try {
      if (canvas.getContext('webgl2') !== null) return 'webgl2';
    } catch {}
    return 'unknown';
  });
  if (errors.length > 0) throw new Error(`runtime errors: ${errors.join(' | ')}`);
  let fieldVisible = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const canvasPng = await page.locator('canvas').screenshot();
    const pixels = await analyzeScreenshot(page, canvasPng);
    if (pixels.nonblank && pixels.quantizedColorBuckets >= 40) {
      fieldVisible = true;
      break;
    }
    await page.waitForTimeout(750);
  }
  if (!fieldVisible) throw new Error('title field did not produce a nonblank capture');
  await page.screenshot({ path: OUTPUT, animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: GITHUB_OUTPUT,
    type: 'jpeg',
    quality: 88,
    animations: 'disabled',
  });
  const githubBytes = statSync(GITHUB_OUTPUT).size;
  if (githubBytes >= 1_000_000) throw new Error(`GitHub social preview is ${githubBytes} bytes; it must stay below 1 MB`);
  console.log(JSON.stringify({
    output: OUTPUT,
    githubOutput: GITHUB_OUTPUT,
    githubBytes,
    width: 1200,
    height: 630,
    seed: SEED,
    backend,
    scoreWrites: false,
  }, null, 2));

  await page.close();
  await context.close();
} finally {
  if (browser) await browser.close().catch(() => {});
  stopServer(server);
  removeDir(profile);
}
