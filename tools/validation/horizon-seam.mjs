#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Horizon-seam A/B reporter (Cycle 112 Phase 6).
 *
 * REPORTING TOOL, NOT A GATE. It always exits 0 unless it crashes. Read on for
 * why, because the reason is worth knowing before anyone tries to promote it.
 *
 * WHAT IT DOES. For each scene it captures the same frame twice - once with the
 * shipped fog colour and once with the pre-Cycle-112 colour restored - and
 * writes both PNGs plus a luminance profile across the horizon. That paired
 * capture is the useful artifact: the seam is obvious when you flip between two
 * otherwise identical frames.
 *
 * WHY THERE IS NO PASS/FAIL THRESHOLD. The defect is a horizon band brighter
 * than both the sky above and the terrain below it, and that is easy to state
 * but hard to score. A luminance-ridge detector finds whatever ridge is
 * brightest, and in these scenes that is often something legitimate: sunlit
 * mid-distance grass sitting between a dark treeline and a shadowed foreground.
 * Measured across the three scenes, the ridge score moved 0.144 -> 0.093 on
 * Home Field and 0.101 -> 0.069 on Open Country, but 0.066 -> 0.088 on Rolling
 * Hills, whose brightest ridge is not the horizon at all. A threshold that
 * turned those numbers green would have been fitted to the answer rather than
 * measuring the defect, so the scoring is reported and not enforced.
 *
 * WHAT GUARDS THE FIX INSTEAD:
 *   - tests/painted-horizon.spec.js pins the CPU model against the shader's
 *     measured output and the inverse tone map against its forward curve,
 *   - tests/webgpu-scene-fog-horizon-proof.spec.js pins the wiring,
 *   - tools/validation/screenshot-golden.mjs carries the rendered frames,
 *   - and the paired captures from this script are the human check.
 *
 * WHY PIXELS AT ALL. The defect survived for the whole life of a PASSING unit
 * assertion (`fogColorTracksHorizon`) that compared two CPU values while the
 * sky and terrain rendered through different transfer chains. Numbers agreeing
 * is not the same as a frame having no seam, so the captures matter even when
 * the scoring cannot be automated.
 *
 * FRAMING CAVEAT, and the reason the scoring above is soft. This boots the lit
 * gameplay entry, which leaves the camera in Follow. On Home Field that frames
 * the horizon well and the A/B is unmistakable; on Rolling Hills the camera can
 * end up looking down a slope with no horizon in frame at all, which makes both
 * the score and the eyeball check meaningless for that scene. The obvious fix
 * is the cinema harness's classic camera, but that entry boots with an unlit
 * sky (fog samples back as ~0,0,0), so it needs a lighting setup this script
 * does not do yet. Wiring a lit, horizon-facing capture for all four scenes is
 * the carryover that would let this become a real gate.
 *
 * Assumes `npm run dev` is already serving on :3000, matching the other
 * scripts in this directory.
 *
 * Usage:
 *   node tools/validation/horizon-seam.mjs
 *   node tools/validation/horizon-seam.mjs --scene=rolling-hills --outDir=seam/
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : ['--enable-gpu'];

/** Every scene that renders a horizon. */
const DEFAULT_SCENES = ['field', 'rolling-hills', 'open-country', 'newsheepdogland'];

/** Where the paired captures land. */
const DEFAULT_OUT_DIR = 'cycle112-validation/horizon-seam';

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const m = /^--([^=]+)=?(.*)$/.exec(raw);
    if (m) args[m[1]] = m[2] === '' ? true : m[2];
  }
  return args;
}

async function run() {
  const args = parseArgs(process.argv);
  const scenes = args.scene ? String(args.scene).split(',') : DEFAULT_SCENES;
  const outDir = String(args.outDir ?? DEFAULT_OUT_DIR);
  const width = Number(args.width ?? 1280);
  const height = Number(args.height ?? 720);

  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ args: CHROMIUM_GPU_ARGS });
  const results = [];
  try {
    for (const scene of scenes) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      try {
        // The lit gameplay entry. The cinema harness (?cinematic=1, the one
        // screenshot-golden.mjs uses) gives a horizon-facing classic camera but
        // boots with an unlit sky - fog samples back as ~0,0,0 there - so it is
        // not usable for a colour comparison without further setup. See the
        // FRAMING CAVEAT in the header.
        await page.goto(
          `http://localhost:3000/?scene=${scene}&autostart=1&mode=classic`,
          { waitUntil: 'domcontentloaded' },
        );
        await page.waitForFunction(
          () => window.gameInstance?.gameState?.isGameActive?.() === true,
          null,
          { timeout: 120_000 },
        );
        // Let the atmosphere settle and the reveal ramp finish before sampling.
        await page.waitForTimeout(4000);

        const fogNow = await page.evaluate(() => {
          const c = window.gameInstance.sceneManager.getScene().fog.color;
          return [c.r, c.g, c.b].map((v) => Number(v.toFixed(4)));
        });
        const afterShot = await page.screenshot({ type: 'png' });
        await writeFile(join(outDir, `${scene}-after.png`), afterShot);
        const after = await analyze(page, afterShot, width, height);

        // Same camera, same frame, only the fog colour differs: restore the
        // pre-Cycle-112 value (the raw sky-horizon LUT) and shoot again.
        const fogOld = await page.evaluate(() => {
          const g = window.gameInstance;
          const fog = g.sceneManager.getScene().fog;
          const raw = g.atmosphere.sky.getHorizon(new (fog.color.constructor)());
          fog.color.copy(raw);
          g.atmosphere.applyFogColor = () => {};
          return [raw.r, raw.g, raw.b].map((v) => Number(v.toFixed(4)));
        });
        await page.waitForTimeout(700);
        const beforeShot = await page.screenshot({ type: 'png' });
        await writeFile(join(outDir, `${scene}-before.png`), beforeShot);
        const before = await analyze(page, beforeShot, width, height);

        results.push({ scene, fogNow, fogOld, after, before });
      } finally {
        await page.close();
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  for (const r of results) {
    console.log(`[SEAM] ${r.scene}`);
    console.log(`         shipped fog ${r.fogNow.join(', ')}   pre-fix fog ${r.fogOld.join(', ')}`);
    console.log(`         ridge score  before=${r.before.seamExcess.toFixed(4)} (y=${r.before.seamY})  after=${r.after.seamExcess.toFixed(4)} (y=${r.after.seamY})`);
    console.log('         (ridge score is reported, not enforced - see the header comment)');
  }

  await writeFile(join(outDir, 'horizon-seam.json'), JSON.stringify({ results }, null, 2));
  console.log(`[SEAM] wrote ${results.length * 2} captures + horizon-seam.json to ${outDir}`);
  console.log('[SEAM] compare each scene\'s before/after pair by eye; the seam is a pale band across the horizon.');
}

/**
 * Find the brightest-relative-to-its-neighbours band near the horizon.
 *
 * Decoding happens in the page rather than in node so this script needs no
 * image dependency: the PNG goes back in as a data URI and a 2D canvas reads
 * it. Note this must be the SCREENSHOT, not the live WebGL/WebGPU canvas -
 * that one has no preserveDrawingBuffer and reads back blank, which silently
 * yields an all-zero profile that looks like a pass.
 */
async function analyze(page, pngBuffer, width, height) {
  const dataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
  return page.evaluate(async ({ dataUri, width, height }) => {
    const img = new Image();
    img.src = dataUri;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, width, height).data;

    // Average several columns so one tree or fence post cannot masquerade as a
    // band, and skip the far edges where HUD panels sit.
    const cols = [0.18, 0.32, 0.46, 0.6, 0.74, 0.88].map((f) => Math.round(width * f));
    const rowLum = (y) => {
      let s = 0;
      for (const x of cols) {
        const i = (y * width + x) * 4;
        s += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      }
      return s / cols.length;
    };

    const top = Math.round(height * 0.10);
    const bottom = Math.round(height * 0.55);
    const prof = [];
    for (let y = top; y <= bottom; y++) prof.push({ y, l: rowLum(y) });

    // A seam is a row brighter than the brightest row a short distance either
    // side of it. The 4px inner gap skips the transition itself; the 14px outer
    // window stays inside sky above and terrain below at these framings.
    let worst = { y: top, excess: 0, l: 0, above: 0, below: 0 };
    for (let i = 14; i < prof.length - 14; i++) {
      const above = Math.max(...prof.slice(i - 14, i - 4).map((p) => p.l));
      const below = Math.max(...prof.slice(i + 4, i + 14).map((p) => p.l));
      const excess = prof[i].l - Math.max(above, below);
      if (excess > worst.excess) worst = { y: prof[i].y, excess, l: prof[i].l, above, below };
    }

    return {
      seamY: worst.y,
      seamExcess: worst.excess,
      bandLum: worst.l,
      aboveLum: worst.above,
      belowLum: worst.below,
    };
  }, { dataUri, width, height });
}

run().catch((err) => {
  console.error('[SEAM] fatal:', err);
  process.exit(2);
});
