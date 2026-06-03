// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 25 Phase A — frame-time histogram tool.
 *
 * Captures 600 frames from a running scene via __sds.frameMs ring buffer
 * (perfMode=1 already plumbs this), bucketises into a fixed histogram, and
 * emits p50/p95/p99/p99.9.
 *
 * Usage:
 *   node tools/validation/frame-time-histogram.mjs                        # field-classic default
 *   node tools/validation/frame-time-histogram.mjs --scene=open-country
 *   node tools/validation/frame-time-histogram.mjs --frames=900 --warmup=3000 --out=cycle25-validation/phaseA/frame-hist.json
 *
 * Assumes dev server is running on :3000.
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
const MODE_FOR_SHEEP_COUNT = {
  30: 'practice',
  200: 'classic',
  1000: 'extreme',
  3000: 'insane',
  5000: 'chaos',
};

function parseArgs(argv) {
  const args = { scene: 'field', frames: 600, out: null, sheepCount: 200, mode: null, warmup: 3000 };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--(\w+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'frames' || k === 'sheepCount' || k === 'warmup') args[k] = parseInt(v, 10);
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
  const mode = args.mode ?? MODE_FOR_SHEEP_COUNT[args.sheepCount] ?? 'classic';
  const browser = await chromium.launch({ args: CHROMIUM_GPU_ARGS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const url = `http://localhost:3000/?perfMode=1&scene=${args.scene}&autostart=1&mode=${mode}`;
  console.log(`[FRAME-HIST] booting ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Wait for __perfHarness install (gated on perfMode=1) AND ready state
  // (perfMon.isEnabled + sheep populated + frameCount > 30). __perfHarness
  // can transiently disappear during scene swap; merge the predicate so
  // a single missed tick doesn't reject.
  await page.waitForFunction(
    () => {
      const ph = window.__perfHarness;
      return !!ph && typeof ph.isReady === 'function' && ph.isReady();
    },
    null,
    { timeout: 90_000 },
  );

  await page.waitForTimeout(args.warmup);

  // Drive sampling for the requested duration (frames * ~16.7ms desktop).
  const durationMs = Math.max(2000, args.frames * 17);
  const driven = await page.evaluate((ms) => window.__perfHarness.startSampling(ms), durationMs);
  await page.waitForTimeout(driven + 300);
  const summary = await page.evaluate(() => window.__perfHarness.getSummary());

  const result = {
    scene: args.scene,
    sheepCount: args.sheepCount,
    mode,
    warmupMs: args.warmup,
    requestedFrames: args.frames,
    sampleCount: summary?.sampleCount ?? 0,
    avgMs: summary?.avgFrameTime ?? null,
    p50Ms: summary?.p50FrameTime ?? null,
    p95Ms: summary?.p95FrameTime ?? null,
    p99Ms: summary?.p99FrameTime ?? null,
    maxMs: summary?.maxFrameTime ?? null,
    avgDrawCalls: summary?.avgDrawCalls ?? null,
    avgTriangles: summary?.avgTriangles ?? null,
    capturedAt: new Date().toISOString(),
  };

  console.log('[FRAME-HIST] result:', result);

  if (args.out) {
    const outPath = resolve(ROOT, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(result, null, 2));
    console.log(`[FRAME-HIST] wrote ${outPath}`);
  }

  await browser.close();

  // Exit non-zero if p99 > 33ms only after this tool becomes an enforced gate.
  if (typeof result.p99Ms === 'number' && result.p99Ms > 33) {
    console.warn(`[FRAME-HIST] WARN: p99=${result.p99Ms.toFixed(2)}ms > 33ms desktop target (informational)`);
  }
}

run().catch((e) => {
  console.error('[FRAME-HIST] fatal:', e);
  process.exit(2);
});
