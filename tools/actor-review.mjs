// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, startPreviewServer, stopServer, scratchDir, removeDir, repo, SEED } from './probe-lib.mjs';
import { collectBuildReceipt, sameBuildReceipt } from './playtest-profile-receipt.mjs';
const arg = (name, fallback) => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const label = arg('label', 'actors');
const backend = arg('backend', 'webgpu');
if (!/^[a-z0-9_-]+$/i.test(label) || !['webgpu', 'webgl2'].includes(backend)) throw new Error('Invalid label/backend');
const out = join(repo, 'captures', 'actors', label);
mkdirSync(out, { recursive: true });
const build = collectBuildReceipt(repo);
const server = await startPreviewServer(5325);
const profile = scratchDir(`actors-${label}`);
let browser, context, video;
const errors = [], shots = [];
try {
  browser = await launchBrowser(profile);
  context = await browser.newContext({ viewport: { width: 1600, height: 1000 },
    recordVideo: { dir: out, size: { width: 1600, height: 1000 } } });
  await context.route('**/api/**', route => route.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ entries: [], token: 'local-actor', authSecret: 'local-actor',
      playerProfile: { persistentId: 'local-actor', displayName: 'Review', fullName: 'Review' } }) }));
  const page = await context.newPage();
  video = page.video();
  page.on('pageerror', error => errors.push(String(error)));
  const shot = async name => { await page.screenshot({ path: join(out, `${name}.png`) }); shots.push(name); };
  const move = async (keys, milliseconds) => {
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(milliseconds);
    for (const key of keys) await page.keyboard.up(key);
  };
  await page.goto(`http://localhost:5325/?seed=${SEED}${backend === 'webgl2' ? '&debug=webgl' : ''}`);
  await page.locator('.herd-app[data-ready="true"]').waitFor({ state: 'attached', timeout: 60000 });
  const actualBackend = await page.locator('.herd-app').getAttribute('data-backend');
  if (actualBackend !== backend) throw new Error(`Expected ${backend}, got ${actualBackend}`);
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await page.waitForTimeout(2000);
  await shot('dog-studio');
  for (const angle of ['Profile', 'Front']) {
    await page.getByRole('button', { name: angle, exact: true }).click();
    await page.waitForTimeout(1400);
    await shot(`dog-${angle.toLowerCase()}`);
  }
  await page.getByRole('button', { name: 'Close customization studio' }).click();
  await page.locator('.herd-size').filter({ hasText: '200' }).click();
  await page.locator('.herd-title-actions > .herd-button--primary').click();
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(7000);
  await shot('sit');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(180);
  await shot('get-up');
  await page.waitForTimeout(1800);
  await shot('run');
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(1600);
  await shot('sprint');
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
  await shot('bark');
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  await move(['KeyA'], 1100);
  await shot('turn');
  // Owner reproduction: sustained W+A / W+D reveals front-leg support and
  // steering gait more clearly than a stationary or straight-running pose.
  for (const [name, key] of [['left', 'KeyA'], ['right', 'KeyD']]) {
    await page.keyboard.down('KeyW');
    await page.keyboard.down(key);
    await page.waitForTimeout(900);
    for (let i = 0; i < 3; i++) {
      await shot(`diagonal-${name}-${i}`);
      await page.waitForTimeout(180);
    }
    await page.keyboard.up(key);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(300);
  }
  await page.locator('.herd-pause-button').click();
  await page.waitForTimeout(1000);
  await shot('pause');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  if (!process.argv.includes('--dog-only')) {
  await page.keyboard.press('KeyC');
  await move(['KeyW', 'ShiftLeft'], 8500);
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(700);
  await shot('homestead');
  await page.waitForTimeout(10000);
  await shot('homestead-later');
  await page.keyboard.press('KeyC');
  await move(['KeyA'], 4000);
  await move(['KeyW'], 500);
  await page.keyboard.press('KeyC');
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(i === 0 ? 1000 : 6000);
    await shot(`farmer-${i}`);
  }
  }
  await context.close(); context = null;
  renameSync(await video.path(), join(out, 'motion.webm'));
  const stable = sameBuildReceipt(build, collectBuildReceipt(repo));
  writeFileSync(join(out, 'report.json'), JSON.stringify({ build, stable, backend, shots, errors,
    note: 'Normal production UI and keyboard. Video capture adds overhead; this is not performance evidence.',
    pass: stable && errors.length === 0 }, null, 2));
  if (!stable || errors.length) process.exitCode = 1;
  console.log(`Actor review: ${out}`);
} finally {
  await context?.close(); await browser?.close(); stopServer(server); removeDir(profile);
}
