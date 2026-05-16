/**
 * Cycle 25 Phase A — screenshot golden harness.
 *
 * Captures a matrix of (scene × ToD × cameraMode × zoom) screenshots and
 * either:
 *   --capture           write to cycle25-validation/phaseA/screenshots/
 *   --diff              SSIM-diff vs tools/validation/golden/, fail < 0.95 mean
 *   --baseline          rewrite tools/validation/golden/ from current run
 *
 * The full plan calls for 108 cells (3 × 3 × 4 × 3). For Phase A we
 * capture a 12-cell smoke matrix (3 scenes × 2 ToD × 2 camera × 1 zoom)
 * to keep run time under ~5 minutes. The matrix is parameterised so a
 * future cycle can scale it up without rewriting the harness.
 *
 * SSIM is computed via a vendored single-window single-channel impl
 * (luma only). Adequate for "did this regress" — not perceptually-tuned.
 *
 * Usage:
 *   node tools/validation/screenshot-golden.mjs --capture
 *   node tools/validation/screenshot-golden.mjs --diff
 *   node tools/validation/screenshot-golden.mjs --baseline
 */

import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const GOLDEN_DIR = resolve(__dirname, 'golden');
const CAPTURE_DIR = resolve(ROOT, 'cycle25-validation', 'phaseA', 'screenshots');
const BASE_URL = 'http://localhost:3000/';
const VIEWPORT = { width: 1280, height: 720 };
const COMPARE_VIEWPORT = { width: 320, height: 180 };
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

// 12-cell smoke matrix. Expand by adding entries; cells are independent.
const MATRIX = [
  { scene: 'field', sun: 0.5, camera: 'follow', zoom: 25 },
  { scene: 'field', sun: 0.85, camera: 'classic', zoom: 60 },
  { scene: 'field', sun: 0.5, camera: 'classic', zoom: 60 },
  { scene: 'field', sun: 0.85, camera: 'follow', zoom: 25 },
  { scene: 'rolling-hills', sun: 0.5, camera: 'follow', zoom: 25 },
  { scene: 'rolling-hills', sun: 0.85, camera: 'classic', zoom: 60 },
  { scene: 'rolling-hills', sun: 0.5, camera: 'classic', zoom: 60 },
  { scene: 'rolling-hills', sun: 0.85, camera: 'follow', zoom: 25 },
  { scene: 'open-country', sun: 0.5, camera: 'follow', zoom: 25 },
  { scene: 'open-country', sun: 0.85, camera: 'classic', zoom: 60 },
  { scene: 'open-country', sun: 0.5, camera: 'classic', zoom: 60 },
  { scene: 'open-country', sun: 0.85, camera: 'follow', zoom: 25 },
];

function cellId(c) {
  return `${c.scene}__sun${String(c.sun).replace('.', '')}__${c.camera}__zoom${c.zoom}`;
}

function cellSeed(id) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

async function newCellPage(browser, id) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(({ seed }) => {
    let state = seed >>> 0;
    const setSeed = (nextSeed) => {
      state = nextSeed >>> 0;
    };
    const random = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    Math.random = random;
    window.__sdsSetVisualGoldenSeed = setSeed;
    try {
      localStorage.clear();
      localStorage.setItem('playerIdentity', JSON.stringify({
        persistentId: 'visual_golden',
        displayName: 'VisualGolden',
        fullName: 'VisualGolden#0001',
        discriminator: '0001',
        nameType: 'custom',
        createdAt: 1778862051000,
        isRegistered: false,
      }));
    } catch {}
  }, { seed: cellSeed(id) });
  const page = await context.newPage();
  return { context, page };
}

async function canvasShot(page) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.querySelector('#canvas-container canvas') ?? document.querySelector('canvas');
    if (!canvas) throw new Error('game canvas not found');
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
}

function parseArgs(argv) {
  const args = { mode: 'capture' };
  for (const a of argv.slice(2)) {
    if (a === '--capture') args.mode = 'capture';
    else if (a === '--diff') args.mode = 'diff';
    else if (a === '--baseline') args.mode = 'baseline';
  }
  return args;
}

// Single-window SSIM on normalized luma. Inputs are flat Buffers in RGBA order.
// Returns a value in [-1, 1] where 1 = identical.
function ssimLuma(a, b, width, height) {
  if (a.length !== b.length) return -1;
  const n = (a.length / 4) | 0;
  // BT.709 luma per pixel.
  const lumaA = new Float64Array(n);
  const lumaB = new Float64Array(n);
  let muA = 0, muB = 0;
  for (let i = 0, j = 0; i < a.length; i += 4, j++) {
    const la = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
    const lb = 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
    lumaA[j] = la;
    lumaB[j] = lb;
    muA += la;
    muB += lb;
  }
  muA /= n;
  muB /= n;
  let sigA2 = 0, sigB2 = 0, sigAB = 0;
  for (let j = 0; j < n; j++) {
    const da = lumaA[j] - muA;
    const db = lumaB[j] - muB;
    sigA2 += da * da;
    sigB2 += db * db;
    sigAB += da * db;
  }
  sigA2 /= n;
  sigB2 /= n;
  sigAB /= n;
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  return ((2 * muA * muB + C1) * (2 * sigAB + C2)) /
    ((muA * muA + muB * muB + C1) * (sigA2 + sigB2 + C2));
}

async function captureCell(page, cell) {
  const id = cellId(cell);
  const url = new URL(BASE_URL);
  url.searchParams.set('perfMode', '1');
  url.searchParams.set('probeRender', '1');
  url.searchParams.set('cinematic', '1');
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('konveyorRocks', '1');
  url.searchParams.set('visualGolden', '1');
  url.searchParams.set('scene', cell.scene);
  url.searchParams.set('sun', String(cell.sun));
  url.searchParams.set('ui', 'off');

  await page.goto(url.toString(), { waitUntil: 'load', timeout: 90_000 });
  await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 30_000 });
  await page.evaluate(() => window.__sdsCinema.waitReady(90_000));
  await page.evaluate(({ seed }) => {
    window.__sdsSetVisualGoldenSeed?.(seed);
    window.__sdsCinema.pauseSimulation();
    window.__sdsCinema.startSolo('jep', 'classic');
  }, { seed: cellSeed(`${id}__gameplay`) });
  await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 90_000 });

  await page.evaluate(({ camera, zoom, sun }) => {
    const cinema = window.__sdsCinema;
    const dog = cinema?.gameState?.getSheepdog?.();
    cinema?.setSun?.(sun);
    cinema?.setCameraMode?.(camera);
    cinema?.setCameraZoom?.(zoom);
    for (let i = 0; i < 120; i++) {
      window.__sds?.sceneManager?.updateCamera?.(dog, 1 / 60);
    }
    cinema?.pauseSimulation?.();
  }, cell);
  await page.waitForFunction(() => window.__sdsCinema?.paused === true, null, { timeout: 5_000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return await canvasShot(page);
}

async function decodePngFromBuffer(buf) {
  // Use sharp if available (vite already pulls it in via deps); fall back
  // to a tiny inline decoder for a-channel-stripped PNG isn't worth it —
  // assume sharp is on the path.
  const sharp = (await import('sharp')).default;
  const image = sharp(buf);
  const meta = await image.metadata();
  const pixels = await image
    .resize(COMPARE_VIEWPORT.width, COMPARE_VIEWPORT.height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  return {
    width: meta.width,
    height: meta.height,
    compareWidth: COMPARE_VIEWPORT.width,
    compareHeight: COMPARE_VIEWPORT.height,
    pixels,
  };
}

async function modeCapture(targetDir) {
  await mkdir(targetDir, { recursive: true });
  const browser = await chromium.launch({ args: CHROMIUM_GPU_ARGS });

  const captured = [];
  for (const cell of MATRIX) {
    const id = cellId(cell);
    console.log(`[GOLDEN] capturing ${id}`);
    const { context, page } = await newCellPage(browser, id);
    try {
      const png = await captureCell(page, cell);
      const fp = resolve(targetDir, `${id}.png`);
      await writeFile(fp, png);
      captured.push({ id, file: fp });
    } finally {
      await context.close();
    }
  }
  await browser.close();
  console.log(`[GOLDEN] wrote ${captured.length} captures to ${targetDir}`);
}

async function modeDiff() {
  if (!existsSync(GOLDEN_DIR)) {
    console.error(`[GOLDEN] golden dir missing: ${GOLDEN_DIR}. Run --baseline first.`);
    process.exit(1);
  }
  await mkdir(CAPTURE_DIR, { recursive: true });
  const browser = await chromium.launch({ args: CHROMIUM_GPU_ARGS });

  const results = [];
  const missing = [];
  for (const cell of MATRIX) {
    const id = cellId(cell);
    const goldenPath = resolve(GOLDEN_DIR, `${id}.png`);
    if (!existsSync(goldenPath)) {
      console.warn(`[GOLDEN] no golden for ${id}, skipping`);
      missing.push(id);
      continue;
    }
    const { context, page } = await newCellPage(browser, id);
    try {
      const png = await captureCell(page, cell);
      const capturePath = resolve(CAPTURE_DIR, `${id}.png`);
      await writeFile(capturePath, png);
      const goldenBuf = await readFile(goldenPath);
      const a = await decodePngFromBuffer(goldenBuf);
      const b = await decodePngFromBuffer(png);
      if (a.width !== b.width || a.height !== b.height) {
        results.push({ id, ssim: 0, error: `dim mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}` });
        continue;
      }
      const score = ssimLuma(a.pixels, b.pixels, a.compareWidth, a.compareHeight);
      results.push({ id, ssim: score });
    } finally {
      await context.close();
    }
  }
  await browser.close();

  const summary = {
    cells: results.length,
    expectedCells: MATRIX.length,
    mean: results.reduce((s, r) => s + (r.ssim || 0), 0) / Math.max(1, results.length),
    fails: results.filter((r) => (r.ssim || 0) < 0.95).map((r) => r.id),
    missing,
    results,
    capturedAt: new Date().toISOString(),
  };
  console.log('[GOLDEN] summary:', JSON.stringify(summary, null, 2));
  await writeFile(resolve(CAPTURE_DIR, 'diff-summary.json'), JSON.stringify(summary, null, 2));

  if (summary.missing.length > 0 || summary.cells !== summary.expectedCells) {
    console.error(`[GOLDEN] FAIL: ${summary.missing.length}/${summary.expectedCells} goldens missing`);
    process.exit(1);
  }

  if (summary.fails.length > 0) {
    console.error(`[GOLDEN] FAIL: ${summary.fails.length}/${summary.cells} cells below 0.95 SSIM`);
    process.exit(1);
  }
}

async function modeBaseline() {
  console.log(`[GOLDEN] baselining → ${GOLDEN_DIR}`);
  await modeCapture(GOLDEN_DIR);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.mode === 'capture') await modeCapture(CAPTURE_DIR);
  else if (args.mode === 'diff') await modeDiff();
  else if (args.mode === 'baseline') await modeBaseline();
  else { console.error(`unknown mode: ${args.mode}`); process.exit(2); }
}

main().catch((e) => { console.error('[GOLDEN] fatal:', e); process.exit(2); });
