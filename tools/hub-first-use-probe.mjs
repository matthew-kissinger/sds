// SPDX-License-Identifier: AGPL-3.0-or-later
// Alternating production artifacts; fresh headed browser for every trial.
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { collectBuiltFiles } from './playtest-profile-receipt.mjs';
import { analyzeScreenshot } from './screenshot-analysis.mjs';
import { runSessionSoak } from './session-soak.mjs';
import { installShaderCompletionTrace } from './shader-completion-trace.mjs';
const arg = (name, fallback) => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const { chromium } = await import(pathToFileURL(resolve(arg('playwright', ''))).href);
const roots = { baseline: resolve(arg('baseline', 'baseline/dist')), candidate: resolve(arg('candidate', 'dist')) };
const backends = arg('backend', 'all') === 'all' ? ['webgpu', 'webgl2'] : [arg('backend')];
const qualities = arg('quality', 'all') === 'all' ? ['auto', 'high', 'low'] : [arg('quality')];
if (backends.some(b => !['webgpu', 'webgl2'].includes(b)) || qualities.some(q => !['auto', 'high', 'low'].includes(q))) throw new Error('Invalid backend or quality');
const candidateOnly = process.argv.includes('--candidate-only');
const renderChecks = process.argv.includes('--render-checks');
const cpuTrace = process.argv.includes('--cpu-trace');
const shaderTrace = process.argv.includes('--shader-trace');
const compareParallel = process.argv.includes('--compare-parallel-compile');
if (compareParallel && (candidateOnly || !shaderTrace || backends.some(b => b !== 'webgl2'))) {
  throw new Error('Parallel comparison requires paired WebGL2 shader traces');
}
const rounds = Number(arg('rounds', '5'));
const soakSeconds = Number(arg('soak-seconds', '0'));
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20 || !Number.isFinite(soakSeconds) || soakSeconds < 0) throw new Error('Invalid rounds/soak duration');
const expectedTrials = backends.length * qualities.length * rounds * (candidateOnly ? 1 : 2);
const idleSamples = async () => {
  const samples = [];
  let consecutive = 0;
  const cpuTimes = () => readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1, 9).map(Number);
  let previousCpu = cpuTimes();
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(r => setTimeout(r, 1000));
    const gpu = execFileSync('nvidia-smi', ['--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader'], { encoding: 'utf8' }).trim();
    const cpu = cpuTimes();
    const total = cpu.reduce((sum, value, index) => sum + value - previousCpu[index], 0);
    const idle = cpu[3] + cpu[4] - previousCpu[3] - previousCpu[4];
    const cpuBusyPercent = total > 0 ? 100 * (1 - idle / total) : 100;
    previousCpu = cpu;
    samples.push({ at: Date.now(), gpu, cpuBusyPercent });
    consecutive = Number.parseFloat(gpu) <= 5 && cpuBusyPercent <= 15 ? consecutive + 1 : 0;
    if (consecutive >= 2) return samples;
  }
  throw new Error(`CPU/GPU did not become idle: ${JSON.stringify(samples)}`);
};
const out = resolve('receipts', `first-use-${Date.now()}`);
mkdirSync(out, { recursive: true });
const report = { builds: Object.fromEntries(Object.entries(roots).map(([name, root]) => [name, collectBuiltFiles(root)])),
  candidateOnly, renderChecks, cpuTrace, shaderTrace, compareParallel, focusEmulation: 'Playwright default; not a native focus-recovery receipt',
  trials: [], limitation: 'Fresh browser profiles; OS/driver caches retained. Keyboard desktop, 200 sheep, 1440x900. No screenshot overhead during sampled interactions.' };
const save = () => writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
let currentRoot = roots.baseline;
const server = createServer((req, res) => {
  try {
    const path = resolve(currentRoot, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path !== currentRoot && !path.startsWith(currentRoot + sep)) { res.writeHead(403).end(); return; }
    const file = path === currentRoot ? resolve(currentRoot, 'index.html') : path;
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
let browser;
try {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  for (const backend of backends) for (const quality of qualities) {
    for (let round = 0; round < rounds; round++) for (const variant of candidateOnly ? ['candidate'] : round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
      currentRoot = roots[variant];
      const trial = { backend, quality, round, variant, errors: [], failedRequests: [],
        idleSamples: await idleSamples() };
      browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: false,
        args: backend === 'webgpu' ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-features=Vulkan', '--use-angle=vulkan'] : ['--ignore-gpu-blocklist', '--use-angle=gl'] });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
      if (shaderTrace) await page.addInitScript(installShaderCompletionTrace, { disableParallel: compareParallel && variant === 'candidate' });
      const profiler = cpuTrace ? await page.context().newCDPSession(page) : null;
      if (profiler) { await profiler.send('Performance.enable'); await profiler.send('Profiler.enable'); await profiler.send('Profiler.start'); }
      page.on('pageerror', e => trial.errors.push(String(e)));
      page.on('crash', () => trial.errors.push('crash'));
      page.on('requestfailed', r => trial.failedRequests.push(r.url()));
      await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ entries: [], token: 'probe', authSecret: 'probe', playerProfile: { persistentId: 'probe', displayName: 'Probe' } }) }));
      await page.addInitScript(quality => {
        localStorage.setItem('herd.settings.v1', JSON.stringify({ quality }));
        const trace = { frames: [], events: [], longTasks: [], live: true };
        if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
          new PerformanceObserver(list => {
            if (trace.live) trace.longTasks.push(...list.getEntries().map(e => ({ at: e.startTime, duration: e.duration })));
          }).observe({ type: 'longtask', buffered: true });
        }
        globalThis.__firstUse = trace;
        const readyObserver = new MutationObserver(() => {
          if (document.querySelector('.herd-app')?.getAttribute('data-ready') !== 'true') return;
          trace.ready = performance.now();
          readyObserver.disconnect();
        });
        readyObserver.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ready'] });
        document.addEventListener('keydown', e => trace.events.push({ name: e.code, at: performance.now() }), true);
        let previous;
        const tick = now => {
          if (!trace.live) return;
          if (previous !== undefined) trace.frames.push({ at: now, delta: now - previous });
          previous = now; requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, quality);
      await page.goto(`http://127.0.0.1:${server.address().port}/?seed=20260821${backend === 'webgl2' ? '&debug=webgl' : ''}`);
      await page.locator('.herd-app[data-ready="true"]').waitFor({ state: 'attached', timeout: 60000 });
      const readiness = await page.evaluate(() => ({ ready: globalThis.__firstUse.ready, observed: performance.now() }));
      if (!Number.isFinite(readiness.ready)) throw new Error('Missing in-browser readiness timestamp');
      trial.ready = readiness.ready;
      trial.automationObservedReady = readiness.observed;
      if (profiler) trial.cpuClock = (await profiler.send('Performance.getMetrics')).metrics;
      await page.locator('.herd-size').filter({ hasText: '200' }).click();
      await page.locator('.herd-title-actions > .herd-button--primary').click();
      await page.keyboard.press('Space');
      await page.waitForTimeout(1400);
      await page.keyboard.press('Space');
      await page.waitForTimeout(1100);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(1100);
      await page.keyboard.down('ShiftLeft');
      await page.waitForTimeout(1100);
      await page.keyboard.press('KeyC');
      await page.waitForTimeout(1100);
      await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
      trial.trace = await page.evaluate(() => {
        globalThis.__firstUse.live = false;
        return { ...globalThis.__firstUse, actual: { ...document.querySelector('.herd-app').dataset },
          marks: performance.getEntriesByType('mark').map(e => ({ name: e.name, at: e.startTime })) };
      });
      trial.windows = trial.trace.events.map(event => {
        const frames = trial.trace.frames.filter(f => f.at >= event.at && f.at < event.at + 1000).map(f => f.delta).sort((a, b) => a - b);
        return { ...event, count: frames.length, max: frames.at(-1), p95: frames[Math.ceil(frames.length * .95) - 1], over33: frames.filter(x => x > 33.4).length };
      });
      if (shaderTrace) trial.shaderCompletion = await page.evaluate(() => globalThis.__shaderCompletion);
      const prefix = `${backend}-${quality}-${round}-${variant}`;
      if (profiler) {
        const { profile } = await profiler.send('Profiler.stop');
        writeFileSync(resolve(out, `${prefix}.cpuprofile`), JSON.stringify(profile));
        await profiler.detach();
      }
      const png = await page.screenshot({ path: resolve(out, `${prefix}.png`) });
      trial.visual = await analyzeScreenshot(page, png);
      if (renderChecks) {
        trial.renderChecks = [];
        const sample = async name => {
          await page.waitForTimeout(1500);
          const state = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus(), width: innerWidth, height: innerHeight, data: { ...document.querySelector('.herd-app').dataset } }));
          const capture = await page.screenshot({ path: resolve(out, `${prefix}-${name}.png`) });
          trial.renderChecks.push({ name, state, visual: await analyzeScreenshot(page, capture) });
        };
        await sample('follow');
        await page.keyboard.press('KeyC'); await sample('classic');
        await page.setViewportSize({ width: 1200, height: 800 }); await sample('resize');
        await page.setViewportSize({ width: 1440, height: 900 }); await sample('resize-return');
      }
      report.trials.push(trial); save();
      if (soakSeconds) trial.soak = await runSessionSoak(page, soakSeconds, resolve(out, `${prefix}-soak`), sample => console.log(JSON.stringify({ checkpoint: sample.name, elapsed: sample.elapsed, dom: sample.dom })));
      if (!trial.visual.nonblank || trial.renderChecks?.some(s => !s.visual.nonblank || s.state.visibility !== 'visible' || !s.state.focused)) throw new Error(`Invalid render ${prefix}`);
      if (trial.trace.actual.backend !== backend || trial.errors.length || trial.failedRequests.length) throw new Error(`Invalid trial ${JSON.stringify(trial)}`);
      await browser.close(); browser = null;
      console.log(JSON.stringify({ backend, quality, round, variant, windows: trial.windows }));
    }
  }
} catch (error) { report.failure = String(error.stack ?? error); process.exitCode = 1; }
finally {
  await browser?.close();
  await new Promise(r => server.close(r));
  report.buildsAfter = Object.fromEntries(Object.entries(roots).map(([name, root]) => [name, collectBuiltFiles(root)]));
  report.stable = JSON.stringify(report.builds) === JSON.stringify(report.buildsAfter);
  if (!report.stable || report.trials.length !== expectedTrials) process.exitCode = 1;
  save(); console.log(JSON.stringify({ out, trials: report.trials.length, failure: report.failure }));
}
