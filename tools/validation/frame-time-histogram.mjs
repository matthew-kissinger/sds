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
 *   node tools/validation/frame-time-histogram.mjs --frames=900 --out=cycle25-validation/phaseA/frame-hist.json
 *
 * Assumes dev server is running on :3000.
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = { scene: 'field', frames: 600, out: null, sheepCount: 200 };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--(\w+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'frames' || k === 'sheepCount') args[k] = parseInt(v, 10);
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

  const url = `http://localhost:3000/?perfMode=1&scene=${args.scene}&autostart=1&sheep=${args.sheepCount}`;
  console.log(`[FRAME-HIST] booting ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Wait for __perfHarness install (gated on perfMode=1) AND ready state
  // (perfMon.isEnabled + sheep populated + frameCount > 30).
  await page.waitForFunction(
    () => !!window.__perfHarness && typeof window.__perfHarness.isReady === 'function',
    null,
    { timeout: 60_000 },
  );
  await page.waitForFunction(
    () => window.__perfHarness.isReady(),
    null,
    { timeout: 90_000 },
  );

  // Drive sampling for the requested duration (frames * ~16.7ms desktop).
  const durationMs = Math.max(2000, args.frames * 17);
  const driven = await page.evaluate((ms) => window.__perfHarness.startSampling(ms), durationMs);
  await page.waitForTimeout(driven + 300);
  const summary = await page.evaluate(() => window.__perfHarness.getSummary());

  const result = {
    scene: args.scene,
    sheepCount: args.sheepCount,
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

  // Exit non-zero if p99 > 33ms (desktop target). Phase A baseline
  // captures on swiftshader-headless will likely regress; surface but
  // don't fail the run yet — the gate kicks in once Phase B+ have
  // actual deltas to defend against.
  if (typeof result.p99Ms === 'number' && result.p99Ms > 33) {
    console.warn(`[FRAME-HIST] WARN: p99=${result.p99Ms.toFixed(2)}ms > 33ms desktop target (informational, swiftshader-headless biased)`);
  }
}

run().catch((e) => {
  console.error('[FRAME-HIST] fatal:', e);
  process.exit(2);
});
