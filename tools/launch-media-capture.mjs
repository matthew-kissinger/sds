// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Rebuild the 1200 x 630 launch card from the production bundle. The capture
 * uses the real 200-sheep simulation and a presentation camera while the dog
 * splits the flock. Only identity registration is replaced by a fixed local
 * response, so the recipe never writes to the public score service.
 */

import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { analyzeScreenshot } from './screenshot-analysis.mjs';
import { installCapture } from './trailer/capture-browser.mjs';
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
const OUTPUT = join(repo, 'app', 'public', 'og', 'sheepdog-sim-v2.png');
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
  await context.addInitScript(installCapture);
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
  await page.goto(`http://localhost:${PORT}/?seed=${SEED}&debug=webgl`, {
    waitUntil: 'load',
    timeout: 60_000,
  });
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.waitForSelector('.herd-app[data-ready="true"]', { timeout: 90_000 });
  await page.waitForFunction(
    () => document.body.textContent?.includes('Meadow Scout') === true,
    { timeout: 10_000 },
  );
  await page.locator('.herd-size').filter({ hasText: '200' }).click();
  await page.locator('.herd-button--primary').click();
  await page.waitForSelector('.herd-app[data-phase="playing"]', { timeout: 30_000 });
  await page.waitForTimeout(700);
  await page.evaluate(() => globalThis.__trailer.find());
  await page.evaluate(() => {
    const api = globalThis.__trailer;
    const state = api.sim.state;
    const flock = state.sheep;
    const densest = flock.reduce((best, sheep) => {
      const count = flock.filter((other) => Math.hypot(
        other.position.x - sheep.position.x,
        other.position.z - sheep.position.z,
      ) < 12).length;
      return count > best.count ? { count, point: sheep.position } : best;
    }, { count: 0, point: flock[0].position });
    const group = flock.filter((sheep) => Math.hypot(
      sheep.position.x - densest.point.x,
      sheep.position.z - densest.point.z,
    ) < 12);
    const cx = group.reduce((sum, sheep) => sum + sheep.position.x, 0) / group.length;
    const cz = group.reduce((sum, sheep) => sum + sheep.position.z, 0) / group.length;
    const heading = Math.atan2(
      cz - state.dogs[0].position.z,
      cx - state.dogs[0].position.x,
    );
    const native = navigator.getGamepads.bind(navigator);
    const began = performance.now();
    let trackAngle = heading;
    let crossedAt = null;
    api.socialDirection = { x: Math.cos(heading), z: Math.sin(heading) };
    navigator.getGamepads = () => {
      const elapsed = (performance.now() - began) / 1000;
      const gx = group.reduce((sum, sheep) => sum + sheep.position.x, 0) / group.length;
      const gz = group.reduce((sum, sheep) => sum + sheep.position.z, 0) / group.length;
      const dog = state.dogs[0].position;
      if (crossedAt === null) {
        const wanted = Math.atan2(gz - dog.z, gx - dog.x);
        const delta = Math.atan2(Math.sin(wanted - trackAngle), Math.cos(wanted - trackAngle));
        trackAngle += Math.max(-0.035, Math.min(0.035, delta));
        if (Math.hypot(gx - dog.x, gz - dog.z) < 7) crossedAt = elapsed;
      }
      const bend = Math.max(0, Math.min(1, (elapsed - (crossedAt ?? elapsed) - 1.5) / 4));
      const angle = trackAngle - bend * bend * (3 - 2 * bend) * 1.3;
      api.socialDirection = { x: Math.cos(angle), z: Math.sin(angle) };
      return [{
        connected: true,
        mapping: 'standard',
        axes: [-Math.cos(angle), -Math.sin(angle)],
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: index === 7 && elapsed < 2,
          value: index === 7 && elapsed < 2 ? 1 : 0,
        })),
      }];
    };
    api.stopSocialDrive = () => { navigator.getGamepads = native; };
  });
  await page.waitForTimeout(1_620);
  await page.addStyleTag({
    content: '.herd-app > * { visibility: hidden } canvas { visibility: visible !important }',
  });
  await page.evaluate(() => {
    const api = globalThis.__trailer;
    const dog = api.sim.state.dogs[0].position;
    const direction = api.socialDirection;
    const perpendicular = { x: -direction.z, z: direction.x };
    const camera = [
      dog.x - perpendicular.x * 9 - direction.x * 8.5,
      6.8,
      dog.z - perpendicular.z * 9 - direction.z * 8.5,
    ];
    const aim = [dog.x + direction.x * 5.2, 2.05, dog.z + direction.z * 5.2];
    api.cinema({ from: camera, to: camera, aim, seconds: 0.01, fov: 54, exclusive: true });
  });
  await page.waitForTimeout(120);

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
    const framePng = await page.screenshot({ animations: 'disabled' });
    const pixels = await analyzeScreenshot(page, framePng);
    if (pixels.nonblank && pixels.quantizedColorBuckets >= 40) {
      fieldVisible = true;
      break;
    }
    await page.waitForTimeout(750);
  }
  if (!fieldVisible) throw new Error('gameplay field did not produce a nonblank capture');
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
    flockSize: 200,
    camera: 'flock-split presentation',
    backend,
    scoreWrites: false,
  }, null, 2));

  await page.evaluate(() => globalThis.__trailer.stopSocialDrive?.());

  await page.close();
  await context.close();
} finally {
  if (browser) await browser.close().catch(() => {});
  stopServer(server);
  removeDir(profile);
}
