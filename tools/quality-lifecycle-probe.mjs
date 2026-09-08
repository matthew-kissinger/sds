// SPDX-License-Identifier: AGPL-3.0-or-later
// Count actual resource allocation/release across normal Settings changes.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, startPreviewServer, stopServer } from './probe-lib.mjs';
import { collectBuildReceipt, sameBuildReceipt } from './playtest-profile-receipt.mjs';
import { analyzeScreenshot } from './screenshot-analysis.mjs';

const backend = process.argv[2] ?? 'webgl2';
const label = process.argv[3] ?? `quality-lifecycle-${backend}`;
if (!['webgpu', 'webgl2'].includes(backend) || !/^[\w-]+$/.test(label)) throw new Error('Invalid arguments');
const out = join(repo, 'captures', 'stability', label);
mkdirSync(out, { recursive: true });
const before = collectBuildReceipt(repo);
const errors = []; const snapshots = []; const captures = [];
let browser; let server; let failure;
try {
  server = await startPreviewServer(5355);
  browser = await chromium.launch({ channel: 'chrome', headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '{"entries":[]}' }));
  await page.addInitScript(() => {
    localStorage.setItem('herd.settings.v1', JSON.stringify({ quality: 'low' }));
    const counts = {};
    globalThis.__qualityResources = counts;
    const track = (prototype, create, releasePrototype, release, name, argument) => {
      if (!prototype?.[create] || !releasePrototype?.[release]) return;
      const live = new WeakSet();
      const count = counts[name] = { created: 0, released: 0, live: 0 };
      const originalCreate = prototype[create];
      const originalRelease = releasePrototype[release];
      prototype[create] = function (...args) {
        const result = Reflect.apply(originalCreate, this, args);
        if (result) { live.add(result); count.created++; count.live++; }
        return result;
      };
      releasePrototype[release] = function (...args) {
        const resource = argument ? args[0] : this;
        const result = Reflect.apply(originalRelease, this, args);
        if (resource && live.delete(resource)) { count.released++; count.live--; }
        return result;
      };
    };
    const gl = globalThis.WebGL2RenderingContext?.prototype;
    track(gl, 'createTexture', gl, 'deleteTexture', 'glTextures', true);
    track(gl, 'createFramebuffer', gl, 'deleteFramebuffer', 'glFramebuffers', true);
    track(gl, 'createRenderbuffer', gl, 'deleteRenderbuffer', 'glRenderbuffers', true);
    track(globalThis.GPUDevice?.prototype, 'createTexture', globalThis.GPUTexture?.prototype, 'destroy', 'gpuTextures', false);
  });
  if (process.argv.includes('--inspect')) await page.addInitScript(() => {
    const roots = new Map(); let id = 0;
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, inject: () => ++id,
      onCommitFiberRoot: (id, root) => roots.set(id, root), onCommitFiberUnmount: () => {},
    };
    globalThis.__qualityScene = () => {
      for (const root of roots.values()) {
        const stack = [root.current];
        while (stack.length) {
          const fiber = stack.pop();
          const props = fiber.memoizedProps;
          const state = (props?.store ?? props?.value)?.getState?.();
          if (state?.gl && state?.camera && state?.scene) {
            return { frameloop: state.frameloop, priority: state.internal.priority,
              position: state.camera.position.toArray(), projection: state.camera.projectionMatrix.toArray(),
              calls: state.gl.info.render.drawCalls, triangles: state.gl.info.render.triangles,
              target: state.gl.getRenderTarget()?.texture?.name ?? null,
              canvas: [state.gl.domElement.width, state.gl.domElement.height] };
          }
          if (fiber.child) stack.push(fiber.child);
          if (fiber.sibling) stack.push(fiber.sibling);
        }
      }
      return null;
    };
  });
  await page.goto(`http://localhost:5355/?seed=20260821${backend === 'webgl2' ? '&debug=webgl' : ''}`);
  await page.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true', undefined, { timeout: 60000 });
  await page.locator('.herd-size').filter({ hasText: '200' }).click();
  await page.locator('.herd-title-actions > .herd-button--primary').click();
  const sample = async (quality, cycle) => {
    await page.waitForTimeout(1200);
    snapshots.push(await page.evaluate(({ quality, cycle }) => ({ quality, cycle, counts: globalThis.__qualityResources, scene: globalThis.__qualityScene?.(), focused: document.hasFocus(), visibility: document.visibilityState, app: { ...document.querySelector('.herd-app').dataset } }), { quality, cycle }));
    const png = await page.screenshot({ path: join(out, `${cycle}-${quality}.png`) });
    captures.push({ quality, cycle, visual: await analyzeScreenshot(page, png) });
  };
  await sample('low', 0);
  for (let cycle = 1; cycle <= 5; cycle++) {
    for (const quality of ['high', 'low']) {
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('combobox', { name: /Render quality/ }).selectOption(quality);
      await page.getByRole('button', { name: 'Close settings' }).click();
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await sample(quality, cycle);
    }
  }
} catch (error) { failure = String(error?.stack ?? error); }
finally { if (browser) await browser.close(); stopServer(server); }
const after = collectBuildReceipt(repo);
const low = snapshots.filter(s => s.quality === 'low');
const growth = Object.fromEntries(Object.keys(low[1]?.counts ?? {}).map(name => [name, low.at(-1).counts[name].live - low[1].counts[name].live]));
const modesMatch = snapshots.every(s => s.app.backend === backend && s.app.renderTier === s.quality);
const expectedCounters = backend === 'webgpu' ? ['gpuTextures'] : ['glTextures', 'glFramebuffers', 'glRenderbuffers'];
const countersValid = snapshots.every(s => expectedCounters.every(name => s.counts[name]?.created > 0));
const report = { backend, channel: 'chrome', headed: true, viewport: { width: 1440, height: 900 }, before, after, stable: sameBuildReceipt(before, after), modesMatch, countersValid, growthInterval: 'Low after cycle 1 to Low after cycle 5', snapshots, captures, growth, errors, failure };
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ backend, growth, snapshots, errors, failure, visible: captures.every(c => c.visual.nonblank) }));
if (failure || !report.stable || !modesMatch || !countersValid || errors.length || snapshots.length !== 11 || captures.some(c => !c.visual.nonblank) || Object.values(growth).some(value => value > 0)) process.exitCode = 1;
