// SPDX-License-Identifier: AGPL-3.0-or-later
// Inspect React's committed R3F store from tools only; drive normal controls.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { repo, startPreviewServer, stopServer } from './probe-lib.mjs';
import { analyzeScreenshot } from './screenshot-analysis.mjs';
import { collectBuildReceipt, sameBuildReceipt } from './playtest-profile-receipt.mjs';
const label = process.argv[2] ?? 'startup-render';
if (!/^[\w-]+$/.test(label)) throw new Error('Invalid label');
const out = join(repo, 'captures', 'stability', label);
mkdirSync(out, { recursive: true });
let server; let browser; let failure; let chrome; let profile; let page;
const native = process.argv.includes('--native-focus');
const snapshots = []; const errors = [];
const before = collectBuildReceipt(repo);
try {
  server = await startPreviewServer(5356);
  if (native) {
    profile = mkdtempSync(join(tmpdir(), 'sds-render-'));
    chrome = spawn(join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      [`--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--window-size=1456,987', '--window-position=0,0'], { windowsHide: false, stdio: 'ignore' });
    const portFile = join(profile, 'DevToolsActivePort');
    const deadline = Date.now() + 10000;
    while (!existsSync(portFile) && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
    const port = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
    page = await browser.contexts()[0].newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.bringToFront();
  } else {
    browser = await chromium.launch({ channel: 'chrome', headless: false });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  }
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '{"entries":[]}' }));
  await page.addInitScript(({ resources, inspector }) => {
    localStorage.setItem('herd.settings.v1', JSON.stringify({ quality: 'low' }));
    if (resources && globalThis.GPUDevice && globalThis.GPUTexture) {
      const live = new WeakSet();
      const create = GPUDevice.prototype.createTexture;
      const destroy = GPUTexture.prototype.destroy;
      GPUDevice.prototype.createTexture = function (...args) {
        const texture = Reflect.apply(create, this, args);
        if (texture) live.add(texture);
        return texture;
      };
      GPUTexture.prototype.destroy = function (...args) {
        const result = Reflect.apply(destroy, this, args);
        live.delete(this);
        return result;
      };
    }
    const roots = new Map();
    let id = 0;
    if (inspector) globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, inject: () => ++id,
      onCommitFiberRoot: (id, root) => roots.set(id, root),
      onCommitFiberUnmount: () => {},
    };
    globalThis.__readRenderState = () => {
      if (!inspector) return { visibility: document.visibilityState, focused: document.hasFocus() };
      for (const root of roots.values()) {
        const stack = [root.current];
        while (stack.length) {
          const fiber = stack.pop();
          const props = fiber.memoizedProps;
          const store = props?.store ?? props?.value;
          const s = store?.getState?.();
          if (s?.gl && s?.camera && s?.scene) {
            const { gl, camera } = s;
            const target = gl.getRenderTarget();
            return {
              visibility: document.visibilityState, focused: document.hasFocus(),
              backend: document.querySelector('.herd-app')?.dataset.backend,
              frameloop: s.frameloop, priority: s.internal.priority,
              camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), projection: camera.projectionMatrix.toArray(), inverse: camera.matrixWorldInverse.toArray(), coordinateSystem: camera.coordinateSystem, near: camera.near, far: camera.far, aspect: camera.aspect, fov: camera.fov },
              renderer: { calls: gl.info.render.drawCalls, triangles: gl.info.render.triangles, target: target ? { width: target.width, height: target.height } : null, toneMapping: gl.toneMapping, colorSpace: gl.outputColorSpace, canvas: { width: gl.domElement.width, height: gl.domElement.height } },
            };
          }
          if (fiber.child) stack.push(fiber.child);
          if (fiber.sibling) stack.push(fiber.sibling);
        }
      }
      throw new Error('Committed R3F store not found');
    };
  }, { resources: process.argv.includes('--resources'), inspector: !process.argv.includes('--no-inspector') });
  await page.goto('http://localhost:5356/?seed=20260821');
  if (native) await page.waitForFunction(() => document.hasFocus(), undefined, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true', undefined, { timeout: 60000 });
  await page.locator('.herd-size').filter({ hasText: '200' }).click();
  await page.locator('.herd-title-actions > .herd-button--primary').click();
  const sample = async name => {
    if (native) {
      await page.bringToFront();
      await page.waitForFunction(() => document.hasFocus() && document.visibilityState === 'visible', undefined, { timeout: 5000 });
    }
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => globalThis.__readRenderState());
    const png = await page.screenshot({ path: join(out, `${name}.png`) });
    snapshots.push({ name, state, visual: await analyzeScreenshot(page, png) });
  };
  await sample('initial');
  await page.waitForTimeout(5000);
  await sample('waited');
  await page.keyboard.press('KeyC'); await sample('follow');
  await page.keyboard.press('KeyC'); await sample('classic-return');
  await page.setViewportSize({ width: 1439, height: 900 }); await sample('resize');
  await page.setViewportSize({ width: 1440, height: 900 }); await sample('resize-return');
} catch (error) {
  failure = String(error?.stack ?? error);
  if (page) {
    await page.screenshot({ path: join(out, 'failure.png'), timeout: 5000 }).catch(() => {});
    const state = await page.evaluate(() => ({ text: document.body.innerText, visibility: document.visibilityState, focused: document.hasFocus(), data: { ...document.querySelector('.herd-app')?.dataset } })).catch(() => null);
    writeFileSync(join(out, 'failure-state.json'), JSON.stringify(state, null, 2));
  }
}
finally {
  if (native && browser?.isConnected()) {
    const session = await browser.newBrowserCDPSession();
    await session.send('Browser.close').catch(() => {});
  }
  if (browser) await browser.close();
  chrome?.kill(); stopServer(server);
  if (profile && dirname(resolve(profile)) === resolve(tmpdir()) && basename(profile).startsWith('sds-render-')) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
    catch (error) { errors.push(`Profile cleanup ${profile}: ${error.message}`); }
  }
}
const after = collectBuildReceipt(repo);
const stable = sameBuildReceipt(before, after);
writeFileSync(join(out, 'report.json'), JSON.stringify({ before, after, stable, native, resources: process.argv.includes('--resources'), inspector: !process.argv.includes('--no-inspector'), snapshots, errors, failure }, null, 2));
console.log(JSON.stringify({ snapshots, errors, failure }));
if (failure || !stable || snapshots.length !== 6 || errors.length || snapshots.some(s => !s.visual.nonblank || (native && (!s.state.focused || s.state.visibility !== 'visible')))) process.exitCode = 1;
