// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Normal production controls bring the farmer corridor into both game cameras.
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, repo, startPreviewServer, stopServer } from './probe-lib.mjs';
import { collectBuildReceipt, sameBuildReceipt } from './playtest-profile-receipt.mjs';

const option = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const label = option('label', `farmer-${Date.now()}`);
const backend = option('backend', 'webgl2');
const port = Number(option('port', '5363'));
if (!/^[a-z0-9_-]+$/i.test(label) || !['webgpu', 'webgl2'].includes(backend)
  || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid label, backend or port.');
const output = join(repo, 'captures', 'actors', label);
if (existsSync(output)) throw new Error(`Capture already exists: ${output}`);
mkdirSync(output, { recursive: true });
const build = collectBuildReceipt(repo);
const shots = [], errors = [];
let server, browser, context, actualBackend, video;
try {
  server = await startPreviewServer(port);
  browser = await launchBrowser();
  context = await browser.newContext({ viewport: { width: 2560, height: 1440 },
    recordVideo: { dir: output, size: { width: 2560, height: 1440 } } });
  await context.route('**/api/**', (route) => route.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ entries: [], token: 'local-review',
      authSecret: 'local-review', playerProfile: { persistentId: 'local-review', displayName: 'Review', fullName: 'Review' } }) }));
  const page = await context.newPage();
  video = page.video();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`http://localhost:${port}/?seed=20260821${backend === 'webgl2' ? '&debug=webgl' : ''}`);
  await page.locator('.herd-app[data-ready="true"]').waitFor({ state: 'attached', timeout: 60000 });
  actualBackend = await page.locator('.herd-app').getAttribute('data-backend');
  if (actualBackend !== backend) throw new Error(`Expected ${backend}; got ${actualBackend}`);
  await page.locator('.herd-size').filter({ hasText: '25' }).click();
  await page.locator('.herd-title-actions > .herd-button--primary').click();
  await page.mouse.move(10, 700);
  const move = async (key, duration) => {
    await page.keyboard.down(key); await page.waitForTimeout(duration);
    await page.keyboard.up(key); await page.waitForTimeout(450);
  };
  const capture = async (name) => {
    shots.push({ name, time: await page.evaluate(() => performance.now()),
      gateDistance: await page.locator('.herd-gate-cue__distance').textContent() });
    await page.screenshot({ path: join(output, `${name}.png`) });
  };
  // Classic A points east. Line up with the actual gate, enter the pen, and
  // reach its north rail before shifting east to center the farmer corridor.
  // These are timed normal controls, not assertions about private transforms.
  await move('KeyA', 1400); await move('KeyW', 17000);
  await capture('gate-entry-position');
  await move('KeyA', 1550); await move('KeyW', 500); await page.waitForTimeout(800);
  await capture('classic-centered');
  for (let i = 0; i < 7; i++) {
    await page.waitForTimeout(5000); await capture(`classic-motion-${i}`);
  }
  await page.keyboard.press('KeyC'); await page.waitForTimeout(1200);
  await capture('follow-centered');
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(5000); await capture(`follow-motion-${i}`);
  }
} catch (error) {
  errors.push(String(error)); process.exitCode = 1;
} finally {
  await context?.close();
  if (video) renameSync(await video.path(), join(output, 'motion.webm'));
  await browser?.close(); stopServer(server);
  const stable = sameBuildReceipt(build, collectBuildReceipt(repo));
  writeFileSync(join(output, 'report.json'), JSON.stringify({ build, stable, backend: actualBackend,
    shots, errors, note: 'Normal UI approach; inspect gate-entry-position to confirm successful navigation. Farmer is approximately70px tall in Classic and180px in Follow at this resolution. Follow rail sometimes hides boots. No physical-mobile, foot-contact or performance acceptance follows from these captures.' }, null, 2));
  if (!stable || errors.length) process.exitCode = 1;
}
