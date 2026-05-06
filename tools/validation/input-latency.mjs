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

function parseArgs(argv) {
  const args = { scene: 'field', keys: 100, out: null };
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
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const url = `http://localhost:3000/?perfMode=1&scene=${args.scene}&autostart=1`;
  console.log(`[INPUT-LAT] booting ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__perfHarness, null, { timeout: 60_000 });
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

  if (result.p99Ms > 33) {
    console.error(`[INPUT-LAT] FAIL: p99=${result.p99Ms.toFixed(2)}ms > 33ms desktop target`);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('[INPUT-LAT] fatal:', e);
  process.exit(2);
});
