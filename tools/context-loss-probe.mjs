// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, startPreviewServer, stopServer } from './probe-lib.mjs';
import { collectBuiltFiles } from './playtest-profile-receipt.mjs';
const mobile = process.argv.includes('--mobile');
const title = process.argv.includes('--title');
const settings = process.argv.includes('--settings');
const boot = process.argv.includes('--boot');
const out = join(repo, `captures/stability/context-loss${mobile ? '-mobile' : ''}${title ? '-title' : ''}${settings ? '-settings' : ''}${boot ? '-boot' : ''}`);
mkdirSync(out, { recursive: true });
const report = { beforeBuild: collectBuiltFiles(join(repo, 'dist')), samples: [], errors: [], limitation: 'Forced WebGL2 loss through WEBGL_lose_context on desktop; not spontaneous GPU failure or physical mobile.' };
let browser; let server;
try {
  server = await startPreviewServer(5366);
  browser = await chromium.launch({ channel: 'chrome', headless: false });
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: mobile, isMobile: mobile });
  page.on('pageerror', error => report.errors.push(String(error)));
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '{"entries":[]}' }));
  await page.addInitScript(() => localStorage.setItem('herd.settings.v1', JSON.stringify({ quality: 'low' })));
  await page.addInitScript(() => {
    globalThis.__lossAudioContexts = [];
    globalThis.AudioContext = new Proxy(globalThis.AudioContext, { construct(Target, args) {
      const context = new Target(...args); globalThis.__lossAudioContexts.push(context); return context;
    } });
  });
  await page.addInitScript(() => {
    const roots = new Map(); let id = 0;
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, inject: () => ++id,
      onCommitFiberRoot: (id, root) => roots.set(id, root), onCommitFiberUnmount: () => {} };
    globalThis.__lossSim = () => {
      if (!globalThis.__observedLossSim) {
        for (const root of roots.values()) {
          const stack = [root.current];
          while (stack.length) {
            const fiber = stack.pop();
            for (let hook = fiber.memoizedState; hook; hook = hook.next) {
              const sim = hook.memoizedState;
              if (sim?.state?.sheep && sim?.dogPositions) globalThis.__observedLossSim = sim;
            }
            if (fiber.child) stack.push(fiber.child);
            if (fiber.sibling) stack.push(fiber.sibling);
          }
        }
      }
      const sim = globalThis.__observedLossSim;
      if (!sim) throw new Error('Live sim not found');
      return { tick: sim.state.tick, stamina: sim.dogStamina[0] };
    };
  });
  if (boot) await page.addInitScript(() => {
    if (sessionStorage.getItem('loss-probe-boot-fired')) return;
    const enums = new WeakMap();
    const prototype = WebGL2RenderingContext.prototype;
    const extension = prototype.getExtension;
    const parameter = prototype.getProgramParameter;
    prototype.getExtension = function (name) {
      const result = extension.call(this, name);
      if (name === 'KHR_parallel_shader_compile' && result) enums.set(this, result.COMPLETION_STATUS_KHR);
      return result;
    };
    prototype.getProgramParameter = function (program, name) {
      const result = parameter.call(this, program, name);
      if (name === enums.get(this) && result === false
          && performance.getEntriesByName('herd:boot:scene').length
          && !sessionStorage.getItem('loss-probe-boot-fired')) {
        sessionStorage.setItem('loss-probe-boot-fired', 'true');
        globalThis.__bootLoss = { at: performance.now(), ready: document.querySelector('.herd-app')?.dataset.ready,
          shadersReady: performance.getEntriesByName('herd:boot:shaders').length, sim: globalThis.__lossSim() };
        const lose = extension.call(this, 'WEBGL_lose_context');
        if (!lose) throw new Error('WEBGL_lose_context unavailable');
        queueMicrotask(() => lose.loseContext());
      }
      return result;
    };
  });
  await page.goto('http://localhost:5366/?seed=20260821&debug=webgl');
  if (boot) {
    await page.waitForFunction(() => globalThis.__bootLoss, undefined, { timeout: 60000 });
    report.bootLoss = await page.evaluate(() => globalThis.__bootLoss);
    assert.equal(report.bootLoss.ready, 'false');
    assert.equal(report.bootLoss.shadersReady, 0);
  } else await page.locator('.herd-app[data-ready="true"]').waitFor({ timeout: 60000 });
  if (!title && !boot) {
    await page.locator('.herd-title-actions > .herd-button--primary').click();
    await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
  }
  await page.waitForTimeout(700);
  if (settings) {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
  }
  const sample = () => page.evaluate(() => ({ phase: document.querySelector('.herd-app')?.dataset.phase,
    sim: globalThis.__lossSim(), canvasCount: document.querySelectorAll('canvas').length,
    audio: globalThis.__lossAudioContexts.map(context => context.state),
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].map(node => node.textContent) }));
  report.samples.push(await sample());
  if (!boot) await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context unavailable');
    extension.loseContext();
  });
  await page.waitForTimeout(800); report.samples.push(await sample());
  await page.waitForTimeout(800); report.samples.push(await sample());
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
  await page.screenshot({ path: join(out, 'lost.png') });
  assert.notEqual(report.samples[1].phase, 'playing', 'Run continues after renderer loss');
  assert.deepEqual(report.samples[1].sim, report.samples[2].sim, 'Simulation continues while graphics are unavailable');
  assert.equal(report.samples[1].canvasCount, 0, 'Lost renderer remains mounted');
  assert.ok(report.samples[1].dialogs.some(text => /reload/i.test(text)), 'No visible reload recovery');
  const reload = page.getByRole('button', { name: 'Reload game', exact: true });
  assert.equal(await reload.evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await reload.evaluate(node => node === document.activeElement), true);
  const audio = (await sample()).audio;
  assert.ok(audio.length > 0 && audio.every(state => state === 'closed'), 'Audio survives graphics recovery');
  await page.keyboard.press('Escape');
  assert.equal((await sample()).phase, 'paused');
  await reload.click();
  await page.locator('.herd-app[data-ready="true"][data-phase="title"]').waitFor({ timeout: 60000 });
  await page.screenshot({ path: join(out, 'reloaded.png') });
  report.reloaded = true;
} catch (error) { report.failure = String(error.stack ?? error); }
finally { await browser?.close(); stopServer(server); }
report.afterBuild = collectBuiltFiles(join(repo, 'dist'));
report.stable = JSON.stringify(report.beforeBuild) === JSON.stringify(report.afterBuild);
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ samples: report.samples, failure: report.failure, errors: report.errors, stable: report.stable }));
if (report.failure || report.errors.length || !report.stable) process.exitCode = 1;
