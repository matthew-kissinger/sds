// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, repo } from './probe-lib.mjs';
const out = join(repo, 'captures', 'discovery');
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const results = [];
try {
  for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 900 });
    await context.route('**/api/**', route => route.fulfill({ status: 503, body: '{}' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('http://127.0.0.1:5330/?debug=webgl');
    await page.locator('.herd-app[data-ready="true"]').waitFor({ state: 'attached', timeout: 60000 });
    for (const selector of ['.herd-title-actions > .herd-button--primary', '.herd-title-links a']) {
      for (const element of await page.locator(selector).all()) {
        await element.scrollIntoViewIfNeeded();
        const box = await element.boundingBox();
        await page.screenshot({ path: join(out, `title-${width}.png`) });
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height,
          JSON.stringify({ width, height, selector, box }));
      }
    }
    await page.screenshot({ path: join(out, `title-${width}.png`) });
    assert.deepEqual(errors, []);
    results.push({ width, height, reachable: true, errors });
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(join(out, 'title-layout.json'), JSON.stringify(results, null, 2));
}
