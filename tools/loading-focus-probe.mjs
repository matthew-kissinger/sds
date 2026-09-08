// SPDX-License-Identifier: AGPL-3.0-or-later
// Hold a real field dependency to verify that loading controls cannot be used.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, repo, startPreviewServer, stopServer } from './probe-lib.mjs';
const out = join(repo, 'captures', 'stability', 'loading-focus');
mkdirSync(out, { recursive: true });
const report = { errors: [], checks: [] };
const server = await startPreviewServer(5353);
let browser, release;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => report.errors.push(String(e)));
  const gate = new Promise(r => { release = r; });
  await page.route('**/*heightfield*.bin', async route => { await gate; await route.continue(); });
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ entries: [] }) }));
  await page.goto('http://localhost:5353/', { waitUntil: 'domcontentloaded' });
  const card = page.locator('.herd-title-card');
  await card.waitFor({ state: 'attached' });
  if (!await card.evaluate(node => node.inert)) throw new Error('Loading title controls are not inert');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    if (await card.evaluate(node => node.contains(document.activeElement))) throw new Error('Keyboard reached a loading title control');
    await page.keyboard.press('Enter');
  }
  if (await page.getByRole('dialog').count()) throw new Error('A dialog opened during loading');
  report.checks.push('Loading controls reject Tab and Enter while field data is pending');
  release();
  await page.locator('.herd-app[data-ready="true"]').waitFor({ state: 'attached', timeout: 60000 });
  if (await card.evaluate(node => node.inert)) throw new Error('Title controls stayed inert after readiness');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  await page.getByRole('button', { name: 'Close settings' }).click();
  report.checks.push('Settings opens and closes normally after readiness');
  await page.screenshot({ path: join(out, 'ready.png') });
  if (report.errors.length) throw new Error('Browser errors');
} catch (error) { report.failure = String(error.stack ?? error); process.exitCode = 1; }
finally { release?.(); await browser?.close(); stopServer(server); }
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
