// SPDX-License-Identifier: AGPL-3.0-or-later
// Tools-only first-use attribution through real public controls.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GPU_ARGS, repo, startPreviewServer, stopServer } from './probe-lib.mjs';
import { collectBuildReceipt, sameBuildReceipt } from './playtest-profile-receipt.mjs';
import { analyzeScreenshot } from './screenshot-analysis.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const label = option('label', 'trace');
if (!/^[\w-]+$/.test(label)) throw new Error('Invalid label');
const backend = option('backend', 'webgpu');
const quality = option('quality', 'low');
const mobile = args.includes('--mobile');
const headed = args.includes('--headed');
const dpr = Number(option('dpr', mobile ? '2' : '1'));
const out = join(repo, 'captures', 'stability', label);
mkdirSync(out, { recursive: true });
const sourceRoot = resolve(option('root', repo));
const base = option('url', 'http://localhost:5351');
const before = collectBuildReceipt(sourceRoot);
let server; let browser; let failure;
const errors = []; const warnings = []; const captures = [];
let receipt;
try {
  if (!args.some(a => a.startsWith('--url='))) server = await startPreviewServer(5351);
  browser = await chromium.launch({ channel: option('channel', 'chromium'), headless: !headed, args: args.includes('--native-gpu') ? [] : GPU_ARGS });
  const page = await browser.newPage({ viewport: mobile || args.includes('--narrow') ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: (mobile || args.includes('--touch')) && !args.includes('--no-touch'), serviceWorkers: 'block' });
  const profiler = args.includes('--cpu-boot') ? await page.context().newCDPSession(page) : null;
  if (profiler) { await profiler.send('Profiler.enable'); await profiler.send('Profiler.start'); }
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); else if (message.type() === 'warning') warnings.push(message.text()); });
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [], token: 'probe', authSecret: 'probe', playerProfile: { persistentId: 'probe', displayName: 'Probe' } }) }));
  await page.addInitScript(({ quality, shaderSources, instrumentGpu }) => {
    localStorage.setItem('herd.settings.v1', JSON.stringify({ quality }));
    const trace = { frames: [], events: [], calls: [], longTasks: [], counts: {}, viewports: [], live: true,
      schedulerYieldAvailable: typeof globalThis.scheduler?.yield === 'function', programs: [] };
    globalThis.__stability = trace;
    if (instrumentGpu && globalThis.GPUAdapter) {
      const requestDevice = GPUAdapter.prototype.requestDevice;
      GPUAdapter.prototype.requestDevice = async function (...args) {
        const device = await Reflect.apply(requestDevice, this, args);
        device.addEventListener('uncapturederror', event => trace.events.push({ name: 'gpu-error', at: performance.now(), message: event.error.message }));
        return device;
      };
    }
    const wrap = (prototype, name, always = false) => {
      if (!instrumentGpu) return;
      if (!prototype?.[name]) return;
      const original = prototype[name];
      prototype[name] = function (...args) {
        const start = performance.now();
        const result = Reflect.apply(original, this, args);
        if (shaderSources && name === 'linkProgram') {
          trace.programs.push({ at: start, sources: this.getAttachedShaders(args[0]).map(shader => this.getShaderSource(shader)) });
        }
        const duration = performance.now() - start;
        trace.counts[name] = (trace.counts[name] ?? 0) + 1;
        if (always || duration > 2) trace.calls.push({ name, start, duration, label: args[0]?.label });
        if (result instanceof Promise && (always || name === 'yield')) {
          void result.then(() => {
            const duration = performance.now() - start;
            if (trace.live && (always || duration > 2)) trace.calls.push({ name: `${name}:resolved`, start, duration, label: args[0]?.label });
          }, () => {});
        }
        return result;
      };
    };
    wrap(globalThis.GPUDevice?.prototype, 'createRenderPipeline', true);
    wrap(globalThis.GPUDevice?.prototype, 'createRenderPipelineAsync', true);
    if (globalThis.scheduler) wrap(Object.getPrototypeOf(globalThis.scheduler), 'yield');
    wrap(globalThis.GPUQueue?.prototype, 'submit');
    wrap(globalThis.GPUCanvasContext?.prototype, 'configure', true);
    wrap(globalThis.GPUCanvasContext?.prototype, 'getCurrentTexture');
    for (const name of ['setViewport', 'setScissorRect']) {
      if (!instrumentGpu) break;
      if (!globalThis.GPURenderPassEncoder) break;
      const original = GPURenderPassEncoder.prototype[name];
      const seen = new Set();
      GPURenderPassEncoder.prototype[name] = function (...args) {
        const key = JSON.stringify(args);
        if (!seen.has(key)) { trace.viewports.push({ name, args, at: performance.now() }); seen.add(key); }
        return Reflect.apply(original, this, args);
      };
    }
    wrap(globalThis.WebGL2RenderingContext?.prototype, 'compileShader', true);
    wrap(globalThis.WebGL2RenderingContext?.prototype, 'linkProgram', true);
    wrap(globalThis.WebGL2RenderingContext?.prototype, 'drawElementsInstanced');
    const observer = new PerformanceObserver(list => {
      for (const e of list.getEntries()) trace.longTasks.push({ start: e.startTime, duration: e.duration });
    });
    observer.observe({ type: 'longtask' });
    trace.stop = () => { trace.live = false; observer.disconnect(); };
    let last;
    const tick = now => {
      if (!trace.live) return;
      if (last !== undefined) trace.frames.push({ at: now, delta: now - last });
      last = now; requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, { quality, shaderSources: args.includes('--shader-sources'), instrumentGpu: !args.includes('--unpatched-gpu') });
  await page.goto(`${base}/?seed=20260821${backend === 'webgl2' ? '&debug=webgl' : ''}`);
  await page.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true', undefined, { timeout: 60000 });
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop');
    writeFileSync(join(out, 'boot.cpuprofile'), JSON.stringify(profile));
    await profiler.detach();
  }
  const mark = name => page.evaluate(name => globalThis.__stability.events.push({ name, at: performance.now() }), name);
  const capture = async name => {
    await mark(`capture-${name}`);
    const png = await page.screenshot({ path: join(out, `${name}.png`) });
    captures.push({ name, visual: await analyzeScreenshot(page, png) });
  };
  await mark('ready');
  if (args.includes('--capture-title')) await capture('title');
  await page.locator('.herd-size').filter({ hasText: '200' }).click();
  await mark('play');
  await page.locator('.herd-title-actions > .herd-button--primary').click();
  await page.waitForTimeout(1000);
  await mark(args.includes('--stationary') ? 'idle-before-bark' : 'move');
  if (!args.includes('--stationary')) await page.keyboard.down('KeyW');
  await page.waitForTimeout(3000);
  await mark('bark'); await page.keyboard.press('Space');
  await page.waitForTimeout(1000);
  await mark('sprint'); await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(2000);
  await mark('camera'); await page.keyboard.press('KeyC');
  await page.waitForTimeout(2000);
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
  await mark('end-input');
  await capture('field');
  await page.waitForTimeout(500);
  await capture('field-followup');
  if (args.includes('--quality-recovery')) {
    for (const nextQuality of ['low', 'high']) {
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('combobox', { name: /Render quality/ }).selectOption(nextQuality);
      await page.getByRole('button', { name: 'Close settings' }).click();
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await page.waitForTimeout(1000);
      await capture(`recovery-${nextQuality}`);
    }
  }
  if (args.includes('--compositor-check')) {
    const canvasData = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve(document.querySelector('canvas').toDataURL()))));
    writeFileSync(join(out, 'canvas.png'), Buffer.from(canvasData.split(',')[1], 'base64'));
    await page.addStyleTag({ content: '.herd-app { isolation: auto !important; } canvas { transform: translateZ(0) !important; }' });
    await page.waitForTimeout(500);
    await capture('compositor-change');
  }
  receipt = await page.evaluate(() => {
    globalThis.__stability.stop();
    const { stop: _stop, ...trace } = globalThis.__stability;
    const canvas = document.querySelector('canvas');
    return { ...trace, canvas: { width: canvas.width, height: canvas.height, rect: canvas.getBoundingClientRect().toJSON() }, app: { ...document.querySelector('.herd-app').dataset }, marks: performance.getEntriesByType('mark').map(e => ({ name: e.name, at: e.startTime })) };
  });
  if (args.includes('--gpu-control')) {
    const control = page;
    await control.route('**/gpu-control', route => route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><canvas width="312" height="675"></canvas>' }));
    await control.goto(`${base}/gpu-control`);
    await control.evaluate(async () => {
      const adapter = await navigator.gpu.requestAdapter();
      const device = await adapter.requestDevice();
      const context = document.querySelector('canvas').getContext('webgpu');
      context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'premultiplied' });
      const render = () => {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 1, g: 0, b: 0, a: 1 } }] });
        pass.end(); device.queue.submit([encoder.finish()]); requestAnimationFrame(render);
      };
      render();
    });
    await control.waitForTimeout(500);
    await control.screenshot({ path: join(out, 'gpu-control.png') });
    await control.close();
  }
} catch (error) { failure = String(error?.stack ?? error); }
finally { if (browser) await browser.close(); stopServer(server); }
const after = collectBuildReceipt(sourceRoot);
const report = { before, after, stable: sameBuildReceipt(before, after), backend, quality, mobile, headed, channel: option('channel', 'chromium'), nativeGpu: args.includes('--native-gpu'), instrumentGpu: !args.includes('--unpatched-gpu'), receipt, captures, errors, warnings, failure };
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ label, failure, events: receipt?.events, gaps: receipt?.frames.filter(f => f.delta > 33.4), captures, errors, warnings }));
if (failure || !report.stable || errors.length || captures.some(c => !c.visual.nonblank)) process.exitCode = 1;
