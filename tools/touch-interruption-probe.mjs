// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { repo, startPreviewServer, stopServer } from './probe-lib.mjs';
import { collectBuiltFiles } from './playtest-profile-receipt.mjs';
const buildDir = resolve(process.argv.find(x => x.startsWith('--dist='))?.slice(7) ?? join(repo, 'dist'));
const out = join(repo, 'captures/stability/touch-interruption');
mkdirSync(out, { recursive: true });
let browser; let server; let failure;
const report = { build: collectBuiltFiles(buildDir), errors: [], samples: [], limitation: 'Trusted CDP touch on desktop emulation, Escape pause, not physical mobile or performance evidence. Normal stopping inertia is permitted.' };
try {
  server = await startPreviewServer(5365, buildDir);
  browser = await chromium.launch({ channel: 'chrome', headless: false });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page.on('pageerror', e => report.errors.push(String(e)));
  await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: '{"entries":[]}' }));
  await page.addInitScript(() => {
    localStorage.setItem('herd.settings.v1', JSON.stringify({ quality: 'low' }));
    const roots = new Map(); let id = 0;
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, inject: () => ++id,
      onCommitFiberRoot: (id, root) => roots.set(id, root), onCommitFiberUnmount: () => {} };
    globalThis.__touchDog = () => {
      for (const root of roots.values()) {
        const stack = [root.current];
        while (stack.length) {
          const fiber = stack.pop();
          for (let hook = fiber.memoizedState; hook; hook = hook.next) {
            const sim = hook.memoizedState;
            if (sim?.state?.sheep && sim?.dogPositions) {
              const dog = sim.state.dogs[0];
              return { x: dog.position.x, z: dog.position.z, stamina: sim.dogStamina[0] };
            }
          }
          if (fiber.child) stack.push(fiber.child);
          if (fiber.sibling) stack.push(fiber.sibling);
        }
      }
      throw new Error('Live sim not found');
    };
  });
  await page.goto('http://localhost:5365/?seed=20260821&debug=webgl');
  await page.locator('.herd-app[data-ready="true"]').waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const cdp = await page.context().newCDPSession(page);
  const dog = () => page.evaluate(() => globalThis.__touchDog());
  report.samples.push(await dog());
  const sprint = page.getByRole('button', { name: 'Hold to sprint' });
  const bounds = await sprint.boundingBox(); assert.ok(bounds);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 80, y: 660, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 80, y: 604, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 80, y: 604, id: 1 }, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 2 }] });
  await page.waitForTimeout(700);
  assert.equal(await sprint.getAttribute('aria-pressed'), 'true');
  report.samples.push(await dog());
  assert.ok(report.samples[1].stamina < report.samples[0].stamina);
  await page.keyboard.press('Escape');
  await page.locator('.herd-app[data-phase="paused"]').waitFor();
  report.paused = await dog();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  report.resumeImmediate = await dog();
  await page.waitForTimeout(1500);
  report.samples.push(await dog());
  await page.waitForTimeout(800);
  report.samples.push(await dog());
  await page.screenshot({ path: join(out, 'resumed.png') });
  const [a, b] = report.samples.slice(-2);
  assert.ok(Math.hypot(b.x - a.x, b.z - a.z) < .1, 'Dog keeps moving after touch interruption');
  assert.ok(b.stamina >= a.stamina, 'Sprint stayed held after touch interruption');
  await cdp.detach();
} catch (error) { failure = String(error.stack ?? error); }
finally { await browser?.close(); stopServer(server); }
report.buildAfter = collectBuiltFiles(buildDir);
report.stable = JSON.stringify(report.build) === JSON.stringify(report.buildAfter);
writeFileSync(join(out, 'report.json'), JSON.stringify({ ...report, failure }, null, 2));
console.log(JSON.stringify({ ...report, failure }));
if (failure || !report.stable || report.errors.length) process.exitCode = 1;
