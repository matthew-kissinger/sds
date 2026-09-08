// SPDX-License-Identifier: AGPL-3.0-or-later
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { installCapture } from './capture-browser.mjs';

const out = resolve('captures/trailer');
mkdirSync(out, { recursive: true });
const report = { release: await (await fetch('https://sheepdogsim.com/release.json')).json(), errors: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, acceptDownloads: true });
  await context.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Capture session: scores disabled"}' }));
  await context.addInitScript(installCapture);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  await page.goto('https://sheepdogsim.com/?seed=20260821');
  await page.locator('.herd-app[data-ready="true"]').waitFor({ timeout: 90000 });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(4000);
  report.scene = await page.evaluate(() => __trailer.find());
  console.log(JSON.stringify(report.scene));
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(2000);
  await page.locator('canvas').click({ position: { x: 1600, y: 800 } });
  const download = page.waitForEvent('download', { timeout: 60000 });
  await page.evaluate(() => __trailer.start('capture-proof'));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(3000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(3000);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(out, 'capture-proof.png') });
  report.timing = await page.evaluate(() => __trailer.stop());
  await (await download).saveAs(join(out, 'capture-proof.webm'));
  writeFileSync(join(out, 'capture-proof.json'), JSON.stringify(report, null, 2));
  console.log('Saved capture proof');
} finally { await browser.close(); }
