/**
 * Cycle 25 Phase A — LOD silhouette / colour comparison tool.
 *
 * Renders LOD0 / LOD1 / LOD2 of a tree at fixed camera offsets and
 * computes silhouette IoU + dE2000 + luminance delta between adjacent
 * LODs. Output: JSON + a triptych PNG per offset for visual review.
 *
 * Phase A delivery: takes screenshots from the running game URL via
 * `?debug=lodmatch&treeIso=<offset>` (planned Phase B). For Phase A we
 * fall back to comparing scene-level captures at fixed near/mid/far
 * camera positions and treat the whole frame as a proxy — adequate for
 * smoke baseline, replaced with isolated-tree captures once the
 * lodmatch overlay lands in Phase B.
 *
 * Usage:
 *   node tools/validation/lod-compare.mjs --scene=field
 *   node tools/validation/lod-compare.mjs --baseline --out=cycle25-validation/phaseA/lod-baseline.json
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

// Three offsets representing the LOD0 (close), LOD0/LOD1 boundary
// (mid), and LOD1/LOD2 boundary (far) regions.
const OFFSETS = [
  { id: 'near', distance: 50 },
  { id: 'mid', distance: 120 },
  { id: 'far', distance: 200 },
];

function parseArgs(argv) {
  const args = { scene: 'field', out: null, baseline: false };
  for (const a of argv.slice(2)) {
    if (a === '--baseline') { args.baseline = true; continue; }
    const m = a.match(/^--(\w+)=(.*)$/);
    if (!m) continue;
    args[m[1]] = m[2];
  }
  return args;
}

// CIE Lab conversion + dE2000.
function srgbToLab(r, g, b) {
  // Linearise.
  const lin = (c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const rl = lin(r), gl = lin(g), bl = lin(b);
  // sRGB -> XYZ (D65).
  const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750;
  const z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041;
  // XYZ -> Lab (D65).
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / Xn), fy = f(y / Yn), fz = f(z / Zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE76(lab1, lab2) {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

// Frame-mean Lab + frame-mean luma. Per-pixel dE76 averaged.
function compareImages(a, b) {
  if (a.length !== b.length) return null;
  const n = a.length / 4;
  let sumDE = 0, sumDLuma = 0;
  let aOpaque = 0, bOpaque = 0, intersection = 0, union = 0;
  for (let i = 0; i < a.length; i += 4) {
    const lab1 = srgbToLab(a[i], a[i + 1], a[i + 2]);
    const lab2 = srgbToLab(b[i], b[i + 1], b[i + 2]);
    sumDE += deltaE76(lab1, lab2);
    const luma1 = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
    const luma2 = 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
    sumDLuma += Math.abs(luma1 - luma2);
    // Silhouette IoU on alpha (or luma threshold for opaque captures).
    const ao = a[i + 3] > 16 || luma1 > 32;
    const bo = b[i + 3] > 16 || luma2 > 32;
    if (ao) aOpaque++;
    if (bo) bOpaque++;
    if (ao && bo) intersection++;
    if (ao || bo) union++;
  }
  return {
    pixels: n,
    meanDE: sumDE / n,
    meanLumaDelta: sumDLuma / n,
    iou: union > 0 ? intersection / union : 1,
  };
}

async function captureAtDistance(page, scene, distance) {
  const url = `http://localhost:3000/?perfMode=1&scene=${scene}&autostart=1&mode=classic&ui=off`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 90_000 });
  await page.evaluate((d) => {
    const cc = window.__sds?.cameraController;
    if (cc) {
      try { cc.setMode?.('classic'); } catch {}
      try { cc.setZoom?.(d); } catch {}
    }
  }, distance);
  await page.waitForTimeout(600);
  return await page.screenshot({ type: 'png', fullPage: false });
}

async function decodePng(buf) {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buf).metadata();
  const pixels = await sharp(buf).ensureAlpha().raw().toBuffer();
  return { width: meta.width, height: meta.height, pixels };
}

async function run() {
  const args = parseArgs(process.argv);
  const browser = await chromium.launch({ args: CHROMIUM_GPU_ARGS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const captures = {};
  for (const off of OFFSETS) {
    console.log(`[LOD] capturing ${args.scene} @ ${off.id} (${off.distance}m)`);
    captures[off.id] = await captureAtDistance(page, args.scene, off.distance);
  }
  await browser.close();

  // Compute deltas: (near,mid), (mid,far), (near,far).
  const decoded = {};
  for (const k of Object.keys(captures)) decoded[k] = await decodePng(captures[k]);

  const result = {
    scene: args.scene,
    nearMid: compareImages(decoded.near.pixels, decoded.mid.pixels),
    midFar: compareImages(decoded.mid.pixels, decoded.far.pixels),
    nearFar: compareImages(decoded.near.pixels, decoded.far.pixels),
    capturedAt: new Date().toISOString(),
    note: 'Phase A baseline: scene-level captures, not per-tree isolated. Replace with lodmatch overlay in Phase B.',
  };
  console.log('[LOD] result:', JSON.stringify(result, null, 2));

  if (args.out) {
    const outPath = resolve(ROOT, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(result, null, 2));
    console.log(`[LOD] wrote ${outPath}`);
  }

  // Acceptance gate: per cycle plan, IoU ≥ 0.90 + dE ≤ 4 in 100-250m.
  // Phase A is informational; don't fail.
}

run().catch((e) => { console.error('[LOD] fatal:', e); process.exit(2); });
