/**
 * Cycle 25 Phase A — input latency tool.
 *
 * Synthesises N keypresses, timestamps each, captures the next paint via
 * requestAnimationFrame's high-resolution timestamp, and reports the
 * input-to-frame-paint p99 in ms.
 *
 * Targets: < 33ms desktop, < 50ms phone (per cycle-25-plan Phase A).
 *
 * Usage:
 *   node tools/validation/input-latency.mjs
 *   node tools/validation/input-latency.mjs --keys=200 --out=cycle25-validation/phaseA/input-latency.json
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

const PROFILES = {
  desktop: {
    viewport: { width: 1280, height: 720 },
    targetMs: 33,
  },
  mobile: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    targetMs: 50,
  },
};

function parseArgs(argv) {
  const args = { scene: 'field', keys: 100, out: null, profile: 'desktop' };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--(\w+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'keys') args[k] = parseInt(v, 10);
    else args[k] = v;
  }
  return args;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function run() {
  const args = parseArgs(process.argv);
  const profile = PROFILES[args.profile] ?? PROFILES.desktop;
  const browser = await chromium.launch({ args: CHROMIUM_GPU_ARGS });
  const context = await browser.newContext(profile);
  const page = await context.newPage();

  const url = `http://localhost:3000/?perfMode=1&scene=${args.scene}&autostart=1&mode=classic`;
  console.log(`[INPUT-LAT] booting ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 90_000 });
  await page.waitForTimeout(2000);

  // Install a per-key latency probe. Timestamp on keydown (performance.now)
  // and resolve on the next rAF.
  await page.evaluate(() => {
    window.__sdsInputProbe = { samples: [] };
    let pendingT0 = null;
    window.addEventListener(
      'keydown',
      () => {
        if (pendingT0 !== null) return;
        pendingT0 = performance.now();
        requestAnimationFrame(() => {
          const dt = performance.now() - pendingT0;
          window.__sdsInputProbe.samples.push(dt);
          pendingT0 = null;
        });
      },
      { capture: true },
    );
  });

  for (let i = 0; i < args.keys; i++) {
    await page.keyboard.press('w');
    await page.waitForTimeout(40);
  }

  const samples = await page.evaluate(() => window.__sdsInputProbe?.samples ?? []);
  const sorted = [...samples].sort((a, b) => a - b);
  const result = {
    scene: args.scene,
    profile: args.profile,
    keys: args.keys,
    sampleCount: sorted.length,
    avgMs: sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length),
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    capturedAt: new Date().toISOString(),
  };

  console.log('[INPUT-LAT] result:', result);

  if (args.out) {
    const outPath = resolve(ROOT, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(result, null, 2));
    console.log(`[INPUT-LAT] wrote ${outPath}`);
  }

  await browser.close();

  if (result.p99Ms > profile.targetMs) {
    console.error(`[INPUT-LAT] FAIL: p99=${result.p99Ms.toFixed(2)}ms > ${profile.targetMs}ms ${args.profile} target`);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('[INPUT-LAT] fatal:', e);
  process.exit(2);
});
