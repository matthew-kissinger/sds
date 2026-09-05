// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated Linux hardware probe: copy this file, its two helper modules and dist
// to a private directory. Uses an existing Playwright installation read-only.
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { hostname, loadavg } from 'node:os';
import { collectBuiltFiles } from './playtest-profile-receipt.mjs';
import { installArtRenderCounters } from './art-render-counters.mjs';

const arg = (name, fallback) => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const dependency = arg('playwright', '');
const executablePath = arg('chrome', '/opt/google/chrome/chrome');
const backend = arg('backend', 'webgpu');
const phone = arg('viewport', 'desktop') === 'phone';
const bootOnly = process.argv.includes('--boot-only');
const seconds = Number(arg('seconds', '60'));
if (!dependency || !['webgpu', 'webgl2'].includes(backend) || seconds < 60 || seconds > 600) throw new Error('Supply --playwright, valid backend and 60–600 seconds');
const { chromium } = await import(pathToFileURL(resolve(dependency)).href);
const root = resolve('dist');
const out = resolve('receipts', `${backend}-${phone ? 'phone-emulation' : 'desktop'}-${Date.now()}`);
mkdirSync(out, { recursive: true });
const command = (file, args) => {
  try { return execFileSync(file, args, { encoding: 'utf8', timeout: 5000 }).trim(); }
  catch (error) { return `UNAVAILABLE: ${error.message}`; }
};
const activity = () => ({ at: new Date().toISOString(), load: loadavg(),
  gpu: command('nvidia-smi', ['--query-gpu=name,utilization.gpu,utilization.memory,memory.used', '--format=csv,noheader']),
  processes: command('ps', ['-eo', 'pid,ppid,comm,pcpu', '--sort=-pcpu']).split('\n').slice(0, 18),
});
const report = { host: hostname(), backend, phoneEmulation: phone, seconds,
  measurement: bootOnly ? 'startup diagnostic only; no frame-budget acceptance' : '60-second-or-longer runtime',
  power: command('powerprofilesctl', ['get']), before: activity(), samples: [],
  build: collectBuiltFiles(root), errors: [], requestsFailed: [],
  isolation: 'Review before/during process samples. Timings alone do not establish isolation.',
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const file = path === root ? resolve(root, 'index.html') : path;
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
let browser, monitor;
try {
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  browser = await chromium.launch({ executablePath, headless: false,
    args: backend === 'webgpu'
      ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-features=Vulkan', '--use-angle=vulkan']
      : ['--ignore-gpu-blocklist', '--use-angle=gl'] });
  const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 2560, height: 1440 },
    deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone, serviceWorkers: 'block' });
  await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ entries: [], token: 'local-review', authSecret: 'local-review', playerProfile: { persistentId: 'local-review', displayName: 'Review' } }) }));
  await context.addInitScript(installArtRenderCounters);
  await context.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('.herd-app')?.getAttribute('data-ready') !== 'true') return;
      performance.mark('herd:probe:ready');
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ready'] });
  });
  await context.addInitScript(quality => localStorage.setItem('herd.settings.v1', JSON.stringify({ quality })), phone ? 'low' : 'high');
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('requestfailed', r => report.requestsFailed.push({ url: r.url(), failure: r.failure() }));
  monitor = setInterval(() => report.samples.push(activity()), 5000);
  const started = Date.now();
  await page.goto(`http://127.0.0.1:${server.address().port}/?seed=20260821&debug=${backend === 'webgl2' ? 'webgl' : '1'}`);
  await page.locator('.herd-app[data-ready="true"]').waitFor({ state: 'attached', timeout: 90000 });
  report.observedWallReadyMs = Date.now() - started;
  report.readyMs = await page.evaluate(() => performance.getEntriesByName('herd:probe:ready')[0]?.startTime ?? null);
  if (report.readyMs === null) throw new Error('Missing in-browser readiness timestamp');
  report.bootTiming = await page.evaluate(() => ({
    marks: performance.getEntriesByType('mark').filter(entry => entry.name.startsWith('herd:boot:'))
      .map(entry => ({ name: entry.name, startTime: entry.startTime })),
    navigation: performance.getEntriesByType('navigation').map(entry => entry.toJSON()),
    resources: performance.getEntriesByType('resource').map(entry => ({ name: entry.name,
      startTime: entry.startTime, duration: entry.duration, transferSize: entry.transferSize })),
  }));
  report.surface = await page.locator('.herd-app').evaluate(node => ({ ...node.dataset }));
  report.adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) return null;
    const info = adapter.info;
    return { vendor: info.vendor, architecture: info.architecture, device: info.device,
      description: info.description, fallback: adapter.isFallbackAdapter ?? info.isFallbackAdapter };
  });
  const cdp = await browser.newBrowserCDPSession();
  report.gpuSystem = (await cdp.send('SystemInfo.getInfo')).gpu;
  if (report.surface.backend !== backend) throw new Error(`Requested ${backend}, rendered ${report.surface.backend}`);
  if (/swiftshader|llvmpipe|software rasterizer/i.test(JSON.stringify(report.gpuSystem))) throw new Error('Software renderer detected; hardware evidence invalid');
  if (!bootOnly) {
  await page.locator('.herd-size').filter({ hasText: '200' }).click();
  await page.locator('.herd-title-actions > .herd-button--primary').click();
  await page.waitForTimeout(3000);
  const framesPromise = page.evaluate(duration => new Promise(resolveFrames => {
    const frames = []; let previous; const start = performance.now();
    const tick = now => {
      if (previous !== undefined) frames.push(now - previous);
      previous = now;
      if (now - start < duration) requestAnimationFrame(tick);
      else resolveFrames(frames);
    };
    requestAnimationFrame(tick);
  }), seconds * 1000);
  for (let elapsed = 0; elapsed < seconds; elapsed += 5) {
    const key = ['KeyW', 'KeyD', 'KeyS', 'KeyA'][Math.floor(elapsed / 5) % 4];
    await page.keyboard.down(key);
    if (elapsed % 15 === 0) await page.keyboard.press('Space');
    await page.waitForTimeout(Math.min(5, seconds - elapsed) * 1000);
    await page.keyboard.up(key);
  }
  const frames = await framesPromise;
  const sorted = [...frames].sort((a, b) => a - b);
  const percentile = p => sorted[Math.ceil(sorted.length * p) - 1];
  report.frames = { count: frames.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1), over100: frames.filter(x => x > 100).length };
  report.render = await page.locator('[data-testid="render-readout"]').evaluate(node => ({ ...node.dataset }));
  await page.screenshot({ path: resolve(out, 'active-play.png') });
  report.budgets = { frameMs: phone ? 33.4 : 16.7, startupMs: phone ? 5000 : 2000,
    framePass: report.frames.p95 <= (phone ? 33.4 : 16.7), startupPass: report.readyMs < (phone ? 5000 : 2000),
    freezePass: report.frames.max <= 100,
    sampledDrawsPass: Number(report.render.drawCalls) >= 0 && Number(report.render.drawCalls) < 100 };
  report.drawCoverage = 'Final 250 ms API submission window only; not a whole-run maximum.';
  report.framesRaw = frames;
  }
  await context.close();
} catch (error) {
  report.errors.push(String(error)); process.exitCode = 1;
} finally {
  clearInterval(monitor);
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
  report.after = activity();
  report.buildStable = JSON.stringify(report.build) === JSON.stringify(collectBuiltFiles(root));
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out, frames: report.frames, budgets: report.budgets, adapter: report.adapter, errors: report.errors }));
}
