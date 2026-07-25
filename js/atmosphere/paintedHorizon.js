// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The painted-horizon authority (Cycle 112 Phase 6).
 *
 * THE DEFECT. Every scene showed a bright band where the terrain met the sky.
 * `Atmosphere.applyFogColor` set `scene.fog.color` to the raw sky-horizon LUT
 * value, but no sky renderer paints that value: the WebGPU dome paints
 * `mix(zenith, horizon, 0.5) * lowTint * skyBaseScale`, which at pastoral-noon
 * is roughly a quarter of it. Measured at the horizon line, the terrain settled
 * on (0.689, 0.772, 0.813) while the sky one pixel above was (0.148, 0.316,
 * 0.594). Near-white against blue. Every scene ships linear fog with far at
 * 800-900m while the terrain plane runs to 2000m, so that mismatch occupied a
 * wide solid band sitting exactly on the horizon.
 *
 * Two things had to be reconciled, not one:
 *
 *   1. SHAPING. What the dome paints at the horizon is a shaped function of the
 *      LUT horizon and zenith, not the LUT horizon itself. `paintedSkyHorizon`
 *      reproduces that shading on the CPU from the same per-preset tuning the
 *      shader reads (js/atmosphere/skyFogPresetTuning.js), so the two cannot
 *      drift.
 *
 *   2. TRANSFER. The sky dome sets `toneMapped = false`; the terrain is tone
 *      mapped. Feeding the sky's painted colour straight into `scene.fog.color`
 *      would still miss, because the terrain's copy goes through ACES and the
 *      sky's does not. `fogColorMatchingSky` therefore returns the PRE-tone-map
 *      value that lands on the sky's painted colour after the renderer's curve.
 *
 * This is why the fix is a module rather than a one-line multiplier: matching
 * numbers is not the same as matching pixels, and the previous 0.82 constant in
 * HosekWilkieSky.syncWebGpuMaterial was an attempt at the first problem that
 * ignored the second.
 *
 * VERIFY BY SAMPLING PIXELS, NOT BY ASSERTING FLOATS. A unit test that compares
 * `scene.fog.color` to a horizon value can pass while the seam is still on
 * screen; that is exactly what the old
 * `webgpuSceneFogHorizonProof.fogColorTracksHorizon` assertion did.
 */
import { SKY_FOG_PRESET_TUNING } from './skyFogPresetTuning.js';

/** Shader defaults from js/atmosphere/webgpuSkyNodeMaterial.js. */
const SKY_DEFAULTS = {
  lowTint: [0.40, 0.66, 0.80],
  lowLift: [0.0, 0.0, 0.0],
  skyBaseScale: 0.62,
  fogBandStrength: 0.08,
  verticalStart: 0.03,
};

/** The multiplier HosekWilkieSky applies when it supplies the dome's own fogColor uniform. */
export const SKY_DOME_FOG_DARKEN = 0.82;

/**
 * The colour the WebGPU sky dome actually paints at the horizon line.
 *
 * Mirrors webgpuSkyNodeMaterial's graph evaluated at `skyY = 0`, where
 * `vertical` collapses to 0 (verticalStart is above zero in every preset) so
 * the high-sky term drops out, and `fogBand` collapses to 1:
 *
 *   lowSky  = mix(zenith, horizon, 0.5) * lowTint + lowLift
 *   base    = lowSky * skyBaseScale
 *   painted = mix(base, horizon * 0.82, fogBandStrength)
 *
 * The sun aureole and sun mass are deliberately excluded: both are functions of
 * the angle to the sun, so they brighten one azimuth rather than the horizon
 * ring. Fog is omnidirectional, so the ring-average base is the honest target.
 *
 * @param {{r:number,g:number,b:number}} out mutated and returned
 * @param {{r:number,g:number,b:number}} horizon LUT horizon (sky.getHorizon)
 * @param {{r:number,g:number,b:number}} zenith LUT zenith (sky.getZenith)
 * @param {string|null} presetName key into SKY_FOG_PRESET_TUNING
 */
export function paintedSkyHorizon(out, horizon, zenith, presetName = null) {
  const t = { ...SKY_DEFAULTS, ...(SKY_FOG_PRESET_TUNING[presetName]?.sky ?? {}) };
  const [tr, tg, tb] = t.lowTint;
  const [lr, lg, lb] = t.lowLift;
  const s = t.skyBaseScale;
  const band = t.fogBandStrength;

  const lowR = (zenith.r * 0.5 + horizon.r * 0.5) * tr + lr;
  const lowG = (zenith.g * 0.5 + horizon.g * 0.5) * tg + lg;
  const lowB = (zenith.b * 0.5 + horizon.b * 0.5) * tb + lb;

  const mixBand = (base, domeFog) => base * (1 - band) + domeFog * band;

  out.r = mixBand(lowR * s, horizon.r * SKY_DOME_FOG_DARKEN);
  out.g = mixBand(lowG * s, horizon.g * SKY_DOME_FOG_DARKEN);
  out.b = mixBand(lowB * s, horizon.b * SKY_DOME_FOG_DARKEN);
  return out;
}

// ---------------------------------------------------------------------------
// Tone-mapping mirrors.
//
// CPU copies of the three.js shader chunks (tonemapping_pars_fragment.glsl.js).
// GLSL mat3 takes COLUMNS, so `ACESInputMat * c` sums column-by-channel; the
// expanded forms below preserve that.
// ---------------------------------------------------------------------------

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function acesFilmic(r, g, b, exposure = 1) {
  const k = exposure / 0.6;
  let x = r * k, y = g * k, z = b * k;

  let ir = 0.59719 * x + 0.35458 * y + 0.04823 * z;
  let ig = 0.07600 * x + 0.90834 * y + 0.01566 * z;
  let ib = 0.02840 * x + 0.13383 * y + 0.83777 * z;

  const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
  ir = fit(ir); ig = fit(ig); ib = fit(ib);

  return [
    clamp01(1.60475 * ir - 0.53108 * ig - 0.07367 * ib),
    clamp01(-0.10208 * ir + 1.10813 * ig - 0.00605 * ib),
    clamp01(-0.00327 * ir - 0.07276 * ig + 1.07602 * ib),
  ];
}

function neutral(r, g, b, exposure = 1) {
  // three.js NeutralToneMapping (Khronos PBR neutral).
  const StartCompression = 0.8 - 0.04;
  const Desaturation = 0.15;
  let x = r * exposure, y = g * exposure, z = b * exposure;
  const peak = Math.max(x, y, z);
  if (peak < StartCompression) return [clamp01(x), clamp01(y), clamp01(z)];
  const d = 1 - StartCompression;
  const newPeak = 1 - (d * d) / (peak + d - StartCompression);
  const scale = newPeak / peak;
  x *= scale; y *= scale; z *= scale;
  const gComp = 1 - 1 / (Desaturation * (peak - newPeak) + 1);
  return [
    clamp01(x * (1 - gComp) + newPeak * gComp),
    clamp01(y * (1 - gComp) + newPeak * gComp),
    clamp01(z * (1 - gComp) + newPeak * gComp),
  ];
}

const OPERATORS = { aces: acesFilmic, neutral, none: (r, g, b) => [clamp01(r), clamp01(g), clamp01(b)] };

/** Forward tone map, for tests and for the inverse solve below. */
export function toneMap(r, g, b, mode = 'aces', exposure = 1) {
  return (OPERATORS[mode] ?? OPERATORS.none)(r, g, b, exposure);
}

/**
 * three.js tone-mapping enum, by value, so this module needs no three import
 * (it is otherwise pure math and is unit-tested in isolation). Verified against
 * the installed three build; tests/painted-horizon.spec.js pins these against
 * the real THREE constants so a renumbering upstream fails loudly rather than
 * silently selecting the wrong curve.
 */
export const TONE_MAPPING_BY_VALUE = Object.freeze({
  0: 'none',      // NoToneMapping
  1: 'none',      // LinearToneMapping (exposure only, handled by the caller)
  4: 'aces',      // ACESFilmicToneMapping - the non-Apple default
  7: 'neutral',   // NeutralToneMapping - the Apple default
});

/**
 * Read the operator and exposure off a live three.js renderer.
 * Unmapped operators fall back to 'aces', the non-Apple default.
 */
export function toneMappingFromRenderer(renderer) {
  return {
    mode: TONE_MAPPING_BY_VALUE[renderer?.toneMapping] ?? 'aces',
    exposure: Number.isFinite(renderer?.toneMappingExposure) ? renderer.toneMappingExposure : 1.0,
  };
}

/**
 * The pre-tone-map colour that lands on `target` after the renderer's curve.
 *
 * Solved numerically rather than algebraically. ACES mixes channels through two
 * matrices around a rational fit, so there is no clean per-channel inverse; a
 * per-channel approximation would leave a residual tint exactly where we are
 * trying to remove one. The multiplicative fixed point below runs the REAL
 * three-channel forward function each step, so it converges on the true
 * pre-image regardless of the cross-channel terms.
 *
 * Monotone in each channel over the range fog colours occupy, so this converges
 * in well under the iteration cap; the cap only guards a pathological input.
 */
export function inverseToneMap(target, mode = 'aces', exposure = 1, iterations = 24) {
  if (mode === 'none') return [target[0], target[1], target[2]];
  // A fully clipped target has no unique pre-image. Back off just under 1 so
  // the solve stays in the invertible region instead of running away.
  const t = target.map((v) => Math.min(Math.max(v, 0), 0.999));
  let x = [...t];
  for (let i = 0; i < iterations; i++) {
    const got = toneMap(x[0], x[1], x[2], mode, exposure);
    let moved = 0;
    for (let c = 0; c < 3; c++) {
      if (t[c] <= 1e-6) { x[c] = 0; continue; }
      if (got[c] <= 1e-6) { x[c] = Math.max(x[c] * 2, 1e-4); moved = 1; continue; }
      const ratio = t[c] / got[c];
      const next = Math.min(x[c] * ratio, 64);
      moved = Math.max(moved, Math.abs(next - x[c]));
      x[c] = next;
    }
    if (moved < 1e-6) break;
  }
  return x;
}

/**
 * The value `scene.fog.color` should hold so the terrain's fogged far band
 * displays as the same colour the sky paints at the horizon.
 *
 * @param {{r:number,g:number,b:number}} out mutated and returned
 * @param {object} opts
 * @param {{r:number,g:number,b:number}} opts.horizon LUT horizon
 * @param {{r:number,g:number,b:number}} opts.zenith LUT zenith
 * @param {string|null} opts.presetName
 * @param {'aces'|'neutral'|'none'} opts.toneMapping renderer's operator
 * @param {number} opts.exposure renderer's toneMappingExposure
 * @param {number} opts.darken weather fogDarkenMultiplier, applied to the
 *   DISPLAYED target so overcast still darkens the horizon believably.
 */
export function fogColorMatchingSky(out, {
  horizon,
  zenith,
  presetName = null,
  toneMapping = 'aces',
  exposure = 1,
  darken = 1,
} = {}) {
  const painted = paintedSkyHorizon({ r: 0, g: 0, b: 0 }, horizon, zenith, presetName);
  const target = [painted.r * darken, painted.g * darken, painted.b * darken];
  const [r, g, b] = inverseToneMap(target, toneMapping, exposure);
  out.r = r; out.g = g; out.b = b;
  return out;
}
