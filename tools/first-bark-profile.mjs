// SPDX-License-Identifier: AGPL-3.0-or-later
// Measure actual keyboard first use in fresh browser processes, with no driver.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, repo, startPreviewServer, stopServer } from './probe-lib.mjs';
import { collectBuildReceipt, sameBuildReceipt } from './playtest-profile-receipt.mjs';
import { analyzeScreenshot } from './screenshot-analysis.mjs';

const label = process.argv[2] ?? 'baseline';
const quality = process.argv[3] ?? 'auto';
const mobile = process.argv.includes('--mobile');
if (!['auto', 'high', 'low'].includes(quality)) throw new Error('Invalid quality');
if (!/^[\w-]+$/.test(label)) throw new Error('Invalid label');
const output = join(repo, 'captures', 'profiling', `first-bark-${label}`);
mkdirSync(output, { recursive: true });
const before = collectBuildReceipt(repo);
const server = await startPreviewServer(5347);
const results = [];
let failure = null;
try {
  for (const backend of ['webgpu', 'webgl2']) {
    for (let trial = 0; trial < 3; trial++) {
      const browser = await launchBrowser();
      try {
        const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}), serviceWorkers: 'block' });
        await page.addInitScript(value => localStorage.setItem('herd.settings.v1', JSON.stringify({ quality: value })), quality);
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('crash', () => errors.push('Page crashed'));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [], token: 'probe', authSecret: 'probe', playerProfile: { persistentId: 'probe', displayName: 'Probe' } }) }));
        await page.goto(`http://localhost:5347/?seed=20260821&debug=readout,follow${backend === 'webgl2' ? ',webgl' : ''}`);
        const play = page.locator('.herd-title-actions > .herd-button--primary');
        await page.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true');
        await page.locator('.herd-size').filter({ hasText: '200' }).click();
        await play.click();
        await play.waitFor({ state: 'hidden' });
        const samples = [];
        for (let bark = 0; bark < 3; bark++) {
          await page.waitForTimeout(1200);
          const sampling = page.evaluate(() => new Promise(resolve => {
            const frames = []; let previous; const start = performance.now();
            const tick = now => {
              if (previous !== undefined) frames.push(now - previous);
              previous = now;
              if (now - start < 1000) requestAnimationFrame(tick);
              else resolve(frames);
            };
            requestAnimationFrame(tick);
          }));
          void sampling.catch(() => {});
          await page.waitForTimeout(100);
          await page.keyboard.press('Space');
          const frames = (await sampling).sort((a, b) => a - b);
          samples.push({ bark, max: frames.at(-1), p95: frames[Math.ceil(frames.length * .95) - 1], over33: frames.filter(v => v > 33.4).length });
        }
        const actual = await page.locator('.herd-app').evaluate(node => ({ ...node.dataset }));
        await page.keyboard.press('Space');
        await page.waitForTimeout(100);
        const png = await page.screenshot({ path: join(output, `${backend}-${trial}.png`) });
        const visual = await analyzeScreenshot(page, png);
        await page.waitForTimeout(250);
        const retryPng = await page.screenshot({ path: join(output, `${backend}-${trial}-followup.png`) });
        const followupVisual = await analyzeScreenshot(page, retryPng);
        results.push({ backend, trial, actual, samples, errors, visual, followupVisual });
        console.log(JSON.stringify({ backend, trial, samples, errors }));
      } finally { await browser.close(); }
    }
  }
} catch (error) {
  failure = String(error?.stack ?? error);
} finally { stopServer(server); }
const after = collectBuildReceipt(repo);
const stable = sameBuildReceipt(before, after);
writeFileSync(join(output, 'report.json'), JSON.stringify({ before, after, stable, quality, mobile, failure, results }, null, 2));
if (failure) console.error(failure);
if (failure || !stable || results.length !== 6 || results.some(r => !r.visual.nonblank || !r.followupVisual.nonblank || r.actual.backend !== r.backend || r.errors.length || r.samples.length !== 3 || r.samples.some(s => !Number.isFinite(s.max) || s.max > 33.4))) process.exitCode = 1;
