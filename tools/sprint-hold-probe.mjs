// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, repo, startPreviewServer, stopServer, SEED } from './probe-lib.mjs';
import { collectBuildReceipt, sameBuildReceipt } from './playtest-profile-receipt.mjs';

const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? `sprint-hold-${Date.now()}`;
assert.match(label, /^[a-z0-9_-]+$/i);
const out = join(repo, 'captures', 'input', label);
mkdirSync(out, { recursive: true });
const build = collectBuildReceipt(repo);
const report = { build, errors: [], samples: [], pass: false };
let server, browser;
try {
  server = await startPreviewServer(5364);
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ entries: [], token: 'local-test', authSecret: 'local-test',
      playerProfile: { persistentId: 'local-test', displayName: 'Review' } }) }));
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  await page.goto(`http://localhost:5364/?seed=${SEED}&debug=webgl`);
  await page.locator('.herd-app[data-ready="true"]').waitFor({ state: 'attached', timeout: 60000 });
  assert.equal(await page.locator('.herd-app').getAttribute('data-backend'), 'webgl2');
  await page.locator('.herd-title-actions > .herd-button--primary').click();
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await page.locator('.herd-stamina[data-sprinting="true"]').waitFor();
  report.samples = await page.evaluate(async () => {
    const samples = [];
    for (let i = 0; i < 160; i++) {
      const meter = document.querySelector('.herd-stamina');
      samples.push({ stamina: Number(meter.getAttribute('aria-valuenow')), sprinting: meter.dataset.sprinting === 'true' });
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return samples;
  });
  const exhausted = report.samples.findIndex(sample => sample.stamina <= 10 && !sample.sprinting);
  assert.ok(exhausted >= 0, 'Normal sprint did not reach exhaustion');
  assert.ok(report.samples.slice(exhausted).every(sample => !sample.sprinting), 'Held sprint restarted during recovery');
  assert.ok(report.samples.at(-1).stamina >= 35, 'Stamina did not recover while held');
  await page.screenshot({ path: join(out, 'held-after-exhaustion.png') });
  await page.keyboard.up('ShiftLeft');
  await page.waitForTimeout(100);
  await page.keyboard.down('ShiftLeft');
  await page.locator('.herd-stamina[data-sprinting="true"]').waitFor({ timeout: 3000 });
  report.repressStartsSprint = true;
  await page.screenshot({ path: join(out, 'release-and-repress.png') });
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
  report.stable = sameBuildReceipt(build, collectBuildReceipt(repo));
  assert.ok(report.stable); assert.deepEqual(report.errors, []);
  report.pass = true;
  await context.close();
} catch (error) {
  report.failure = String(error);
  process.exitCode = 1;
} finally {
  await browser?.close(); if (server) stopServer(server);
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ pass: report.pass, failure: report.failure, out }));
