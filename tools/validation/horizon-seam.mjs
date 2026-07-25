#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Horizon-seam gate.
 *
 * WHAT THE SEAM IS. Terrain past `scene.fog.far` renders as 100% fog colour.
 * If that colour is not the colour the sky paints at its horizon, the frame
 * carries a hard edge where the two meet. Cycle 112 Phase 6 fixed the colour
 * (js/atmosphere/paintedHorizon.js) and left the automated gate unbuilt.
 *
 * WHY THE CYCLE 112 VERSION COULD NOT GATE. Its detector searched the whole
 * frame for the brightest band relative to its neighbours. With the seam gone
 * it locked onto sunlit mid-distance grass and scored Rolling Hills WORSE
 * after the fix (0.066 -> 0.088). Cycle 112 refused to tune the threshold until
 * it went green, which was right: the score was measuring a scene property, not
 * a defect. Do not undo that refusal.
 *
 * WHAT CHANGED HERE (Cycle 114 Phase 7).
 *
 *   1. THE DETECTOR IS TOLD WHERE TO LOOK. Nothing is searched for. Three
 *      screen-space lines are projected from the live camera pose:
 *        - horizonY:     a horizontal direction at infinity (zero pitch),
 *        - terrainEdgeY: the ground point at the terrain plane's half extent,
 *        - fogFarY:      the ground point at `scene.fog.far`.
 *      Sky is sampled above horizonY. Fully-fogged terrain is sampled between
 *      terrainEdgeY and fogFarY, which is the strip that is 100% fog by
 *      construction. Rows between horizonY and terrainEdgeY are the transition
 *      and are never sampled. A band 200px away cannot be mistaken for a seam
 *      because the detector never looks there.
 *
 *   2. WHAT IS MEASURED IS THE STEP ACROSS THE LINE, not the absolute
 *      brightness of a band. Absolute brightness is a scene property, which is
 *      exactly what defeated Cycle 112. The step is per-channel, not luminance:
 *      pale terrain against blue sky can sit at a similar luminance and still
 *      read as a hard edge. The median across columns is what gets reported, so
 *      a treeline breaking the skyline in a minority of columns cannot carry
 *      the score.
 *
 *   3. THE CAPTURE FRAMES THE HORIZON ON PURPOSE, and refuses to score a frame
 *      whose projected lines do not land where the geometry says they should.
 *
 *   4. THE GATE CARRIES ITS OWN CONTROL. Every run captures the same frame
 *      twice: once with the shipped fog colour and once with the pre-Cycle-112
 *      raw sky-horizon LUT restored, which is the known-bad. Scene content
 *      contributes equally to both and cancels in the difference. If the
 *      control does not score worse than the shipped frame, the run reports the
 *      detector as unproven and exits non-zero. It never passes quietly.
 *
 * THE FIXTURE CHECK FAILS, AND THAT IS THE HONEST ANSWER. Phase 7 required this
 * detector to be validated against Cycle 112's paired captures before being
 * trusted. It was, and it did not pass. `--fixtures` runs that check, prints the
 * numbers, and exits non-zero. The measured reasons, each independently
 * established rather than inferred:
 *
 *   - Three of the four pairs (field, rolling-hills, open-country) have NO SKY
 *     IN FRAME. They were shot on the Classic top-down isometric camera, whose
 *     zero-pitch horizon sits above the top of the picture; on the two islands
 *     the water runs off the top edge. There is no horizon line in them to
 *     stand a detector on.
 *   - Those same three record a fog A/B of (0.0016, 0.0005, 0.0011) against
 *     (0, 0, 0) in cycle112-validation/horizon-seam/horizon-seam.json: a delta
 *     under half an 8-bit code value. Their whole-frame mean |before - after|
 *     measures 0.67 to 1.5 code values with no structure at any row, which is
 *     sim animation between the two shots, not a fog change. They are the same
 *     frame twice, not a before and an after.
 *   - The fourth (newsheepdogland) does have sky, and its pair does differ. But
 *     Cycle 112 recorded no camera pose beside it, so the line has to come from
 *     somewhere. Sweeping the line across every candidate row that carries a
 *     boundary scores the known-bad worse at 0.63 of placements, with the sign
 *     of the difference flipping three times across the sky-to-ground
 *     transition. (0.36 if flat rows are counted too, 0.50 restricted to the
 *     transition band; the conclusion does not depend on which denominator you
 *     pick.) A synthetic pair that genuinely carries the defect scores 1.00 on
 *     the same measure, which is what tests/horizon-seam-detector.spec.js pins.
 *     A ranking this soft in a free parameter has established nothing, and
 *     picking the one row where it separates would be fitting the test to the
 *     answer, which is the thing Cycle 112 refused to do.
 *
 * So the fixture check reports FAILURE. It does not lower a threshold, and it
 * does not quietly reclassify the unusable pairs as "not applicable" and call
 * the remainder a pass. The live run's in-frame A/B control is what actually
 * establishes the detector on the build under test, and it is the reason the
 * live path is worth shipping anyway - but it is not a substitute for the
 * acceptance criterion, and this file does not pretend it is.
 *
 * TWO TRAPS CYCLE 112 RECORDED, BOTH STILL LIVE:
 *   - In-page WebGL canvas readback returns blank without preserveDrawingBuffer,
 *     giving an all-zero profile that reads exactly like a pass. This uses
 *     page.screenshot() and decodes in node with sharp.
 *   - The cinema harness boots with an unlit sky. It becomes lit once
 *     __sdsCinema.startSolo() has run, which is the recipe
 *     tools/validation/screenshot-golden.mjs already proves; waitReady alone is
 *     not enough.
 * A third, added here: any frame the detector cannot place its bands in is a
 * FAILURE, never a pass. A gate that cannot see the thing it guards is broken,
 * not green.
 *
 * Assumes `npm run dev` (or `npm run dev:client`) is serving on :3000, matching
 * the other scripts in this directory.
 *
 * Usage:
 *   node tools/validation/horizon-seam.mjs
 *   node tools/validation/horizon-seam.mjs --scene=rolling-hills
 *   node tools/validation/horizon-seam.mjs --fixtures      (offline, no browser)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

/**
 * The gate's default scenes. Home Field, Rolling Hills and Open Country all run
 * a static sun and land that reaches the fog distance, so a converged horizon is
 * a step of nothing. Newsheepdogland is opt-in (`--scene=newsheepdogland`): its
 * horizon is ocean against sky, a boundary between two different materials that
 * does not converge to zero even when the fog is perfect, so an absolute step
 * there is not evidence of a defect.
 */
const DEFAULT_SCENES = ['field', 'rolling-hills', 'open-country'];

/** Where the paired captures and the score sidecar land. */
const DEFAULT_OUT_DIR = 'cycle114-validation/horizon-seam';

/**
 * Level camera, this far above the ground under the spawn.
 *
 * The altitude is a compromise between two geometries. Too low and the treeline
 * occludes the skyline in most columns; too high and the terrain plane's edge
 * pulls far enough below the horizon that the fogged strip stops being a
 * horizon at all. At 60m over a 4000m terrain plane with fog.far at 800-900m,
 * the terrain edge lands roughly 14px under the horizon and the fully-fogged
 * strip is roughly 17-21px thick at 720p, which the band geometry below fits
 * inside. The capture asserts the actual projected offsets rather than trusting
 * this arithmetic.
 */
const VANTAGE_ALTITUDE_M = 60;

/** Rows left unsampled either side of a projected line, to skip its own ramp. */
const LINE_GAP_PX = 3;

/** Thickness of the sky strip sampled above the horizon line. */
const SKY_STRIP_PX = 22;

/** Minimum usable thickness for the fully-fogged strip before we refuse to score. */
const MIN_GROUND_STRIP_PX = 8;

/** Cap on the fogged strip, so a very high camera does not drag it into mid-field. */
const MAX_GROUND_STRIP_PX = 26;

/**
 * Ground-strip thickness for the offline path, where there is no fog.far line to
 * bound it. Sits inside the live path's min and max so the two measure
 * comparable areas.
 */
const OFFLINE_GROUND_STRIP_PX = 16;

/** Column sampling stride. ~320 columns at 1280 wide: enough for a stable median. */
const COLUMN_STRIDE_PX = 4;

/**
 * Fraction of the frame width ignored at each edge on the offline path. Cycle
 * 112's captures were shot without hideUI, so HUD panels sit in the outer
 * columns of every one of them. The live path calls hideUI and samples full
 * width.
 */
const OFFLINE_COLUMN_INSET = 0.12;

/**
 * The shipped frame must sit at or under this fraction of the known-bad control
 * measured in the same frame. 0.25 is the stated threshold. It is not fitted to
 * a passing build: Cycle 112 measured the pre-fix mismatch at pastoral-noon as
 * fog (0.689, 0.772, 0.813) against a painted sky horizon of (0.148, 0.316,
 * 0.594), a per-channel mean of 0.405, so a quarter of it is a residual of
 * roughly 0.10 - about a tenth of the range, which is the point at which a
 * horizon edge stops reading as an edge.
 */
const SEAM_RESIDUAL_FRACTION = 0.25;

/**
 * Backstop, not the operative gate. Catches the case where the control frame is
 * itself degenerate (an unlit sky, a black frame) and its 25% would wave
 * anything through. Set at 0.12 per-channel mean because that is above the
 * residual the relative gate admits and well under the 0.405 the defect
 * measured.
 */
const SEAM_STEP_ABSOLUTE_MAX = 0.12;

/**
 * The control must be at least this far from zero for the run to have proven
 * anything. Below it, the A/B did not change the frame - which is what happened
 * to three of Cycle 112's four captures, whose recorded fog A/B was
 * (0.0016, 0.0005, 0.0011) against (0, 0, 0), a difference under one 8-bit code
 * value. A run that cannot move the frame has not tested the detector.
 */
const MIN_CONTROL_STEP = 0.02;

/**
 * A fixture pair establishes the detector only if the known-bad scores worse at
 * this fraction of candidate horizon rows or better.
 *
 * The bar exists because Cycle 112 recorded no camera pose beside its captures,
 * so on the offline path the horizon row is a free parameter. A pair that
 * separates at one row and not the next has not ranked the frames; it has
 * rewarded a lucky choice of row. 0.9 is set high on purpose: a genuine colour
 * mismatch between sky and fogged terrain is present at every line placement
 * that straddles the boundary, so a real before/after pair should separate
 * almost everywhere, not marginally more often than not. A synthetic pair
 * carrying the defect measures 1.00, so the bar is clearable rather than rigged
 * to fail. Newsheepdogland, the one Cycle 112 pair with sky in frame, measures
 * 0.63. Do not move this number to make that pass - that is the failure mode
 * Cycle 112 named.
 */
const FIXTURE_SEPARATION_MIN = 0.9;

const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist']
  : ['--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const m = /^--([^=]+)=?(.*)$/.exec(raw);
    if (!m) continue;
    // `--flag=0` and `--flag=false` mean off. Without this a bare string "0" is
    // truthy and an explicit opt-out silently turns the flag on.
    if (m[2] === '') args[m[1]] = true;
    else if (m[2] === '0' || m[2] === 'false') args[m[1]] = false;
    else args[m[1]] = m[2];
  }
  return args;
}

/* ------------------------------------------------------------------ *
 * Band geometry. Where to sample, decided before anything is measured.
 * ------------------------------------------------------------------ */

/**
 * Sky and fully-fogged-ground bands from the three projected camera lines.
 *
 * Ground distance grows as screen y rises toward the horizon, so the terrain
 * plane's edge (the farthest ground there is) projects CLOSER to the horizon
 * than `fog.far` does. The fully-fogged strip is therefore below terrainEdgeY
 * and above fogFarY, and it is 100% fog colour by construction.
 *
 * @returns {{ ok: true, sky: [number, number], ground: [number, number] }
 *           | { ok: false, reason: string }}
 */
export function bandsFromCameraLines({ horizonY, terrainEdgeY, fogFarY, height }) {
  for (const [name, v] of Object.entries({ horizonY, terrainEdgeY, fogFarY, height })) {
    if (!Number.isFinite(v)) return { ok: false, reason: `${name} is not finite` };
  }
  const skyTop = horizonY - LINE_GAP_PX - SKY_STRIP_PX;
  const skyBottom = horizonY - LINE_GAP_PX;
  const groundTop = terrainEdgeY + LINE_GAP_PX;
  const groundBottom = Math.min(fogFarY - LINE_GAP_PX, groundTop + MAX_GROUND_STRIP_PX);

  if (skyTop < 0 || groundBottom > height - 1) {
    return {
      ok: false,
      reason: `bands fall outside the frame (sky ${skyTop.toFixed(1)}..${skyBottom.toFixed(1)}, `
        + `ground ${groundTop.toFixed(1)}..${groundBottom.toFixed(1)}, height ${height}). `
        + 'The camera is not framing the horizon.',
    };
  }
  if (groundBottom - groundTop < MIN_GROUND_STRIP_PX) {
    return {
      ok: false,
      reason: `fully-fogged strip is ${(groundBottom - groundTop).toFixed(1)}px, under the `
        + `${MIN_GROUND_STRIP_PX}px minimum. Terrain edge and fog.far project too close together.`,
    };
  }
  return { ok: true, sky: [skyTop, skyBottom], ground: [groundTop, groundBottom] };
}

/**
 * Sky and ground bands from a horizon row alone, for frames that carry no
 * recorded camera pose. Used only by the offline fixture check.
 *
 * This is strictly weaker than the camera-line form and is not what the gate
 * runs on. Without `fog.far` there is no way to know that the ground band is
 * fully fogged, so the number it produces is "the step across this row", not
 * "the step between sky and 100% fog".
 */
export function bandsFromHorizonRow(horizonY, height) {
  if (!Number.isFinite(horizonY) || !Number.isFinite(height)) {
    return { ok: false, reason: 'horizonY or height is not finite' };
  }
  const skyTop = horizonY - LINE_GAP_PX - SKY_STRIP_PX;
  const groundBottom = horizonY + LINE_GAP_PX + OFFLINE_GROUND_STRIP_PX;
  if (skyTop < 0 || groundBottom > height - 1) {
    return { ok: false, reason: `bands fall outside a ${height}px frame at horizonY ${horizonY}` };
  }
  return {
    ok: true,
    sky: [skyTop, horizonY - LINE_GAP_PX],
    ground: [horizonY + LINE_GAP_PX, groundBottom],
  };
}

/* ------------------------------------------------------------------ *
 * The detector. Pure, synchronous, browser-free.
 * ------------------------------------------------------------------ */

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) >> 1] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
};

/**
 * Mean RGB of one column over an inclusive row range, in 0..1.
 *
 * @param {{ data: Uint8Array|Buffer, width: number, height: number, channels: number }} img
 */
function stripRgb(img, x, yTop, yBottom) {
  let r = 0, g = 0, b = 0, n = 0;
  const top = Math.max(0, Math.round(yTop));
  const bottom = Math.min(img.height - 1, Math.round(yBottom));
  for (let y = top; y <= bottom; y++) {
    const i = (y * img.width + x) * img.channels;
    r += img.data[i];
    g += img.data[i + 1];
    b += img.data[i + 2];
    n++;
  }
  if (!n) return null;
  return [r / n / 255, g / n / 255, b / n / 255];
}

const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

/**
 * Score the colour step across a pair of bands.
 *
 * The per-column statistic is the mean absolute per-channel difference between
 * the sky band and the ground band. The median across columns is what gets
 * reported.
 *
 * @param {{ data: Uint8Array|Buffer, width: number, height: number, channels: number }} img
 * @param {{ ok: boolean, reason?: string, sky?: number[], ground?: number[] }} bands
 * @param {{ inset?: number }} [opts] fraction of frame width skipped at each edge
 * @returns {{ ok: boolean, reason?: string, step: number, lumStep?: number,
 *             columns?: number, sky?: number[], ground?: number[], bands?: object }}
 */
export function scoreHorizonStep(img, bands, opts = {}) {
  if (!bands?.ok) return { ok: false, reason: bands?.reason ?? 'no bands', step: NaN };
  const inset = Number.isFinite(opts.inset) ? opts.inset : 0;
  const x0 = Math.round(img.width * inset);
  const x1 = img.width - x0;

  const steps = [];
  const lumSteps = [];
  const skyAcc = [0, 0, 0];
  const groundAcc = [0, 0, 0];
  let counted = 0;
  for (let x = x0; x < x1; x += COLUMN_STRIDE_PX) {
    const sky = stripRgb(img, x, bands.sky[0], bands.sky[1]);
    const ground = stripRgb(img, x, bands.ground[0], bands.ground[1]);
    if (!sky || !ground) continue;
    steps.push(
      (Math.abs(sky[0] - ground[0]) + Math.abs(sky[1] - ground[1]) + Math.abs(sky[2] - ground[2])) / 3,
    );
    lumSteps.push(Math.abs(luminance(sky) - luminance(ground)));
    for (let c = 0; c < 3; c++) { skyAcc[c] += sky[c]; groundAcc[c] += ground[c]; }
    counted++;
  }
  if (counted < 16) return { ok: false, step: NaN, reason: `only ${counted} sampleable columns` };

  return {
    ok: true,
    step: median(steps),
    lumStep: median(lumSteps),
    columns: counted,
    sky: skyAcc.map((v) => Number((v / counted).toFixed(4))),
    ground: groundAcc.map((v) => Number((v / counted).toFixed(4))),
    bands: {
      sky: bands.sky.map((v) => Math.round(v)),
      ground: bands.ground.map((v) => Math.round(v)),
    },
  };
}

async function decodePng(buffer) {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/* ------------------------------------------------------------------ *
 * Verdicts.
 * ------------------------------------------------------------------ */

/**
 * Turn a shipped score and its known-bad control into a pass or a fail.
 *
 * Four ways to fail and one way to pass, on purpose. Not being able to measure
 * is a failure, not a pass: an unmeasurable frame is exactly what an all-zero
 * luminance profile looked like in the Cycle 112 version.
 */
export function verdict(after, before) {
  if (!after?.ok) return { pass: false, kind: 'unmeasurable', detail: after?.reason ?? 'no score' };
  if (!before?.ok) return { pass: false, kind: 'unmeasurable-control', detail: before?.reason ?? 'no score' };
  if (before.step < MIN_CONTROL_STEP) {
    return {
      pass: false,
      kind: 'unproven',
      detail: `control step ${before.step.toFixed(4)} is under MIN_CONTROL_STEP ${MIN_CONTROL_STEP}. `
        + 'The A/B did not move the frame, so this run proves nothing about the detector.',
    };
  }
  if (before.step <= after.step) {
    return {
      pass: false,
      kind: 'unproven',
      detail: `control ${before.step.toFixed(4)} did not score worse than shipped ${after.step.toFixed(4)}. `
        + 'A detector that cannot separate the known-bad is not a detector.',
    };
  }
  const budget = SEAM_RESIDUAL_FRACTION * before.step;
  if (after.step > budget) {
    return {
      pass: false,
      kind: 'seam',
      detail: `shipped step ${after.step.toFixed(4)} exceeds ${SEAM_RESIDUAL_FRACTION} of the control `
        + `(${budget.toFixed(4)}).`,
    };
  }
  if (after.step > SEAM_STEP_ABSOLUTE_MAX) {
    return {
      pass: false,
      kind: 'seam',
      detail: `shipped step ${after.step.toFixed(4)} exceeds the absolute backstop ${SEAM_STEP_ABSOLUTE_MAX}.`,
    };
  }
  return { pass: true, kind: 'ok', detail: `${after.step.toFixed(4)} <= ${budget.toFixed(4)}` };
}

/* ------------------------------------------------------------------ *
 * Offline fixture check.
 * ------------------------------------------------------------------ */

/**
 * A candidate row counts toward the separation fraction only if at least one of
 * the two frames reads a step of this size across it.
 *
 * Rows deep inside the sky, or deep inside the grass, have no boundary to
 * straddle and score near zero in both frames. Counting them would put a
 * ceiling on the fraction that even a perfect before/after pair could not
 * clear, which would rig the fixture check toward failing - the mirror image of
 * tuning it until it passes, and no more honest. The floor is the same value as
 * MIN_CONTROL_STEP for the same reason: below it, nothing moved.
 */
const SWEEP_INFORMATIVE_STEP = MIN_CONTROL_STEP;

/**
 * How consistently a pair ranks, over every horizon row that carries a boundary.
 *
 * Cycle 112 recorded no camera pose beside its captures, so offline the horizon
 * row is a free parameter. Rather than choose one - which would be choosing the
 * answer - this scores both frames at every candidate row and reports the
 * fraction at which the known-bad scores worse. A genuine pair has the wrong
 * colour on ALL of its distant terrain, so it separates at every line placement
 * that straddles the boundary, not at a lucky few.
 *
 * @returns {{ rows: number, separated: number, fraction: number, skipped: number,
 *             best: { y: number, delta: number }, sample: object[] }}
 */
export function sweepSeparation(afterImg, beforeImg, opts = {}) {
  const inset = Number.isFinite(opts.inset) ? opts.inset : OFFLINE_COLUMN_INSET;
  const stride = opts.stride ?? 4;
  const height = afterImg.height;
  const first = LINE_GAP_PX + SKY_STRIP_PX;
  const last = height - 1 - LINE_GAP_PX - OFFLINE_GROUND_STRIP_PX;

  let rows = 0;
  let separated = 0;
  let skipped = 0;
  let best = { y: NaN, delta: -Infinity };
  const sample = [];
  for (let y = first; y <= last; y += stride) {
    const bands = bandsFromHorizonRow(y, height);
    const a = scoreHorizonStep(afterImg, bands, { inset });
    const b = scoreHorizonStep(beforeImg, bands, { inset });
    if (!a.ok || !b.ok) continue;
    if (Math.max(a.step, b.step) < SWEEP_INFORMATIVE_STEP) { skipped++; continue; }
    const delta = b.step - a.step;
    rows++;
    if (delta > 0) separated++;
    if (delta > best.delta) best = { y, delta };
    sample.push({ y, after: Number(a.step.toFixed(4)), before: Number(b.step.toFixed(4)) });
  }
  return {
    rows,
    separated,
    skipped,
    fraction: rows ? separated / rows : 0,
    best: { y: best.y, delta: Number(best.delta.toFixed(4)) },
    sample,
  };
}

/**
 * Whole-frame mean absolute per-channel difference, in 8-bit code values.
 *
 * This is the cheap structural question the fixture check asks first: did the
 * A/B actually change the picture? Three of Cycle 112's four pairs answer it
 * with about one code value, which is sim animation between two shots, not a
 * fog colour change.
 */
export function frameMeanDiffCodeValues(a, b) {
  if (a.width !== b.width || a.height !== b.height) return NaN;
  const n = a.width * a.height;
  let sum = 0;
  for (let p = 0; p < n; p++) {
    const i = p * a.channels;
    sum += (Math.abs(a.data[i] - b.data[i])
      + Math.abs(a.data[i + 1] - b.data[i + 1])
      + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
  }
  return sum / n;
}

/**
 * Cycle 112's paired captures, and what each one was measured to be.
 *
 * `hasSkyInFrame` is a recorded observation, not a guess: the three Classic
 * captures were opened and looked at. Home Field is ground from edge to edge;
 * Rolling Hills and Open Country run water off the top edge. None of the three
 * contains a sky-meets-anything line.
 */
const CYCLE_112_FIXTURES = [
  {
    scene: 'field',
    hasSkyInFrame: false,
    note: 'Classic top-down camera, ground edge to edge. Recorded fog A/B (0.0016, 0.0005, 0.0011) '
      + 'vs (0, 0, 0), under half a code value.',
  },
  {
    scene: 'rolling-hills',
    hasSkyInFrame: false,
    note: 'Classic top-down camera, water running off the top edge. Same near-black fog A/B.',
  },
  {
    scene: 'open-country',
    hasSkyInFrame: false,
    note: 'Classic top-down camera, water running off the top edge. Same near-black fog A/B.',
  },
  {
    scene: 'newsheepdogland',
    hasSkyInFrame: true,
    note: 'Follow camera, the only one of the four with sky in frame. Ocean against sky behind a '
      + 'treeline, and no recorded camera pose, so the horizon row is a free parameter.',
  },
];

const FIXTURE_DIR = 'cycle112-validation/horizon-seam';

async function runFixtures() {
  const { readFile } = await import('node:fs/promises');
  console.log('[SEAM] offline fixture check against Cycle 112\'s paired captures');
  console.log(`[SEAM] a pair establishes the detector only at >= ${FIXTURE_SEPARATION_MIN} separation `
    + 'across candidate horizon rows');

  const rows = [];
  for (const fx of CYCLE_112_FIXTURES) {
    const beforePath = resolve(ROOT, FIXTURE_DIR, `${fx.scene}-before.png`);
    const afterPath = resolve(ROOT, FIXTURE_DIR, `${fx.scene}-after.png`);
    if (!existsSync(beforePath) || !existsSync(afterPath)) {
      console.log(`[SEAM]   ${fx.scene}: MISSING (captures not on disk)`);
      rows.push({ scene: fx.scene, establishes: false, reason: 'captures not on disk' });
      continue;
    }
    const after = await decodePng(await readFile(afterPath));
    const before = await decodePng(await readFile(beforePath));
    const frameDiff = frameMeanDiffCodeValues(after, before);

    if (!fx.hasSkyInFrame) {
      console.log(`[SEAM]   ${fx.scene}: CANNOT ESTABLISH - no horizon in frame. `
        + `whole-frame mean |diff| ${frameDiff.toFixed(2)} code values.`);
      console.log(`[SEAM]     ${fx.note}`);
      rows.push({
        scene: fx.scene,
        establishes: false,
        reason: 'no horizon in frame',
        frameMeanDiffCodeValues: Number(frameDiff.toFixed(3)),
        note: fx.note,
      });
      continue;
    }

    const sweep = sweepSeparation(after, before);
    const establishes = sweep.fraction >= FIXTURE_SEPARATION_MIN;
    console.log(`[SEAM]   ${fx.scene}: separation ${sweep.separated}/${sweep.rows} `
      + `(${sweep.fraction.toFixed(2)}) across candidate horizon rows carrying a boundary `
      + `(${sweep.skipped} flat rows excluded) -> ${establishes ? 'ESTABLISHES' : 'CANNOT ESTABLISH'}`);
    console.log(`[SEAM]     whole-frame mean |diff| ${frameDiff.toFixed(2)} code values; `
      + `largest before-minus-after ${sweep.best.delta.toFixed(4)} at row ${sweep.best.y}`);
    console.log(`[SEAM]     ${fx.note}`);
    rows.push({
      scene: fx.scene,
      establishes,
      separation: sweep.fraction,
      separatedRows: sweep.separated,
      candidateRows: sweep.rows,
      best: sweep.best,
      frameMeanDiffCodeValues: Number(frameDiff.toFixed(3)),
      note: fx.note,
    });
  }

  const establishing = rows.filter((r) => r.establishes);
  console.log(`[SEAM] ${establishing.length}/${rows.length} Cycle 112 pairs establish this detector`);
  if (!establishing.length) {
    console.error('[SEAM] FIXTURE CHECK FAILED.');
    console.error('[SEAM] Cycle 112\'s captures cannot validate a horizon-line detector: three of the four');
    console.error('[SEAM] have no horizon in frame and a fog A/B under one code value, and the fourth ranks');
    console.error('[SEAM] the pair correctly at 0.63 of candidate rows where a genuine pair scores 1.00.');
    console.error('[SEAM] Phase 7\'s acceptance criterion is NOT met. Do not lower FIXTURE_SEPARATION_MIN');
    console.error('[SEAM] to turn this green - fitting the test to the answer is what Cycle 112 refused.');
    console.error('[SEAM] The fix is a re-shoot: a level, horizon-framing camera with the pose recorded');
    console.error('[SEAM] beside the pixels, which is what the live path below already produces.');
    return 1;
  }
  return 0;
}

/* ------------------------------------------------------------------ *
 * Live capture.
 * ------------------------------------------------------------------ */

/**
 * Pose a level camera over the spawn and project the three lines the detector
 * needs. Runs in the page.
 *
 * The horizon is the projection of a horizontal direction at infinity. It is
 * evaluated by projecting a point one million metres out along that direction
 * rather than by hand-rolling the vanishing-line algebra: the two agree to far
 * better than a pixel at any camera height this game uses, and the point form
 * goes through the camera's own matrices so a projection change cannot silently
 * desync it.
 *
 * The same call projects two horizontal directions offset to either side. On a
 * camera with no roll they land on the same row; if they do not, the horizon is
 * a tilted line and a row-band detector is not valid for the frame, so the
 * spread is returned and the caller refuses.
 */
const POSE_AND_MEASURE = ({ altitude, yawDeg }) => {
  const g = window.gameInstance;
  const cinema = window.__sdsCinema;
  const cam = g?.sceneManager?.getCamera?.();
  const scene = g?.sceneManager?.getScene?.();
  if (!cam || !scene || !cinema) return { error: 'camera, scene or cinema harness missing' };
  if (!scene.fog) return { error: 'scene has no fog, so there is no fogged band to compare' };

  const dog = g.gameState?.getSheepdog?.();
  const originX = dog?.position?.x ?? 0;
  const originZ = dog?.position?.z ?? 0;
  const groundY = cinema.getTerrainY(originX, originZ);
  const yaw = (yawDeg * Math.PI) / 180;
  const dir = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const eyeY = groundY + altitude;

  cinema.setCameraPose(
    { x: originX, y: eyeY, z: originZ },
    { x: originX + dir.x * 1000, y: eyeY, z: originZ + dir.z * 1000 },
  );
  cam.updateMatrixWorld(true);
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  cinema.syncAtmosphereToCamera();
  cinema.renderFrame();

  const height = g.sceneManager.getRenderer().domElement.clientHeight
    || document.documentElement.clientHeight;
  const project = (wx, wy, wz) => {
    const v = new (cam.position.constructor)(wx, wy, wz);
    v.project(cam);
    return (1 - v.y) * 0.5 * height;
  };

  // Ground plane the terrain skirt sits on, and how far the plane reaches.
  const terrainHalfExtent = (g.terrainBuilder?.webgpuTerrainGeometryBudget?.size ?? 4000) / 2;
  const fogFar = scene.fog.far ?? 900;

  // Horizontal directions: straight ahead plus one to each side, all at zero
  // pitch. Same row on an unrolled camera.
  const FAR = 1e6;
  const sideYaws = [-25, 0, 25].map((d) => yaw + (d * Math.PI) / 180);
  const horizonRows = sideYaws.map((a) => project(
    originX + Math.sin(a) * FAR,
    eyeY,
    originZ + Math.cos(a) * FAR,
  ));

  return {
    horizonY: horizonRows[1],
    horizonSpreadPx: Math.max(...horizonRows) - Math.min(...horizonRows),
    terrainEdgeY: project(originX + dir.x * terrainHalfExtent, groundY, originZ + dir.z * terrainHalfExtent),
    fogFarY: project(originX + dir.x * fogFar, groundY, originZ + dir.z * fogFar),
    viewportHeight: height,
    altitude,
    eyeY,
    groundY,
    terrainHalfExtent,
    fogFar,
    fogColor: [scene.fog.color.r, scene.fog.color.g, scene.fog.color.b].map((v) => Number(v.toFixed(4))),
  };
};

/** Restore the pre-Cycle-112 fog colour: the raw sky-horizon LUT, unsolved. */
const RESTORE_PREFIX_FOG = () => {
  const g = window.gameInstance;
  const fog = g.sceneManager.getScene().fog;
  const raw = g.atmosphere.sky.getHorizon(new (fog.color.constructor)());
  fog.color.copy(raw);
  g.atmosphere.applyFogColor = () => {};
  window.__sdsCinema.renderFrame();
  return [raw.r, raw.g, raw.b].map((v) => Number(v.toFixed(4)));
};

async function bootScene(page, scene, { renderer, sun }) {
  const url = new URL('http://localhost:3000/');
  url.searchParams.set('perfMode', '1');
  url.searchParams.set('probeRender', '1');
  url.searchParams.set('cinematic', '1');
  url.searchParams.set('renderer', renderer);
  url.searchParams.set('scene', scene);
  url.searchParams.set('sun', String(sun));
  url.searchParams.set('ui', 'off');

  await page.goto(url.toString(), { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 60_000 });
  await page.evaluate(() => window.__sdsCinema.waitReady(120_000));
  // The lit entry. waitReady alone leaves the sky unlit, which is the trap
  // Cycle 112 recorded; startSolo is what lights it. Same recipe as
  // tools/validation/screenshot-golden.mjs.
  await page.evaluate(() => {
    window.__sdsCinema.startSolo('jep', 'classic');
  });
  await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
  await page.evaluate(({ s }) => {
    window.__sdsCinema.setSun(s);
    window.__sdsCinema.hideUI();
    window.__sdsCinema.pauseSimulation();
  }, { s: sun });
  await page.waitForFunction(() => window.__sdsCinema?.paused === true, null, { timeout: 10_000 });
}

async function shoot(page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return await page.screenshot({ type: 'png' });
}

async function captureScene(browser, scene, opts) {
  const context = await browser.newContext({ viewport: { width: opts.width, height: opts.height } });
  const page = await context.newPage();
  try {
    await bootScene(page, scene, opts);
    const lines = await page.evaluate(POSE_AND_MEASURE, { altitude: opts.altitude, yawDeg: opts.yaw });
    if (lines.error) throw new Error(`${scene}: ${lines.error}`);
    if (lines.horizonSpreadPx > 1.5) {
      throw new Error(
        `${scene}: horizon projects as a tilted line (${lines.horizonSpreadPx.toFixed(2)}px across the `
        + 'frustum). A row-band detector is not valid for a rolled camera.',
      );
    }
    const afterPng = await shoot(page);
    const fogOld = await page.evaluate(RESTORE_PREFIX_FOG);
    const beforePng = await shoot(page);
    return { scene, lines, fogOld, afterPng, beforePng };
  } finally {
    await page.close();
    await context.close();
  }
}

async function runLive(args) {
  const { chromium } = await import('playwright');
  const scenes = args.scene ? String(args.scene).split(',') : DEFAULT_SCENES;
  const outDir = resolve(ROOT, String(args.outDir ?? DEFAULT_OUT_DIR));
  const opts = {
    width: Number(args.width ?? 1280),
    height: Number(args.height ?? 720),
    altitude: Number(args.altitude ?? VANTAGE_ALTITUDE_M),
    yaw: Number(args.yaw ?? 0),
    sun: Number(args.sun ?? 0.5),
    renderer: String(args.renderer ?? 'webgpu'),
  };

  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({
    channel: args.headless ? undefined : 'chrome',
    headless: Boolean(args.headless),
    args: CHROMIUM_GPU_ARGS,
  });

  const results = [];
  try {
    for (const scene of scenes) {
      console.log(`[SEAM] capturing ${scene}`);
      const cap = await captureScene(browser, scene, opts);
      await writeFile(join(outDir, `${scene}-after.png`), cap.afterPng);
      await writeFile(join(outDir, `${scene}-before.png`), cap.beforePng);
      const bands = bandsFromCameraLines({ ...cap.lines, height: cap.lines.viewportHeight });
      const after = scoreHorizonStep(await decodePng(cap.afterPng), bands);
      const before = scoreHorizonStep(await decodePng(cap.beforePng), bands);
      results.push({ scene, lines: cap.lines, fogOld: cap.fogOld, after, before, verdict: verdict(after, before) });
    }
  } finally {
    await browser.close();
  }

  for (const r of results) {
    const l = r.lines;
    console.log(`[SEAM] ${r.scene}`);
    console.log(`         lines  horizon=${l.horizonY.toFixed(1)} terrainEdge=${l.terrainEdgeY.toFixed(1)} `
      + `fogFar=${l.fogFarY.toFixed(1)} (viewport ${l.viewportHeight}px, eye ${l.altitude}m)`);
    console.log(`         fog    shipped ${l.fogColor.join(', ')}   pre-fix ${r.fogOld.join(', ')}`);
    console.log(`         step   shipped=${r.after.ok ? r.after.step.toFixed(4) : 'n/a'} `
      + `control=${r.before.ok ? r.before.step.toFixed(4) : 'n/a'}`);
    console.log(`         ${r.verdict.pass ? 'PASS' : 'FAIL'} (${r.verdict.kind}) ${r.verdict.detail}`);
  }

  await writeFile(
    join(outDir, 'horizon-seam.json'),
    JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2),
  );
  const failures = results.filter((r) => !r.verdict.pass);
  console.log(`[SEAM] wrote ${results.length * 2} captures + horizon-seam.json to ${outDir}`);
  if (failures.length) {
    console.error(`[SEAM] FAIL: ${failures.length}/${results.length} scenes - ${failures.map((f) => f.scene).join(', ')}`);
    return 1;
  }
  console.log(`[SEAM] PASS: ${results.length}/${results.length} scenes`);
  return 0;
}

async function main() {
  const args = parseArgs(process.argv);
  const code = args.fixtures ? await runFixtures() : await runLive(args);
  process.exit(code);
}

// Only run when invoked as a script. The pure exports above are imported by
// tests/horizon-seam-detector.spec.js, which must not trigger a browser launch.
const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((err) => {
    console.error('[SEAM] fatal:', err);
    process.exit(2);
  });
}
