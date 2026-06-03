// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 39 — sun-chromaticity and Mie-aureole helpers.
 *
 * The RUNTIME source of truth for the sun's RGB chromaticity is
 * `HosekWilkieSky.getSun()`, which computes color from the analytic
 * atmospheric model (turbidity + path length at elevation). The disc
 * material, sky materials, and any consumer of `skyFog.sunColor` all
 * trace back to that one function — see
 * [`Atmosphere.applyPreset`](Atmosphere.js).
 *
 * The functions in this module are the STANDALONE CPU helpers:
 *  - `sunColorAtElevation(elevation)` — a simple 3-stop curve usable in
 *    tests, cold-boot fallback paths, or future consumers that don't
 *    have a HosekWilkieSky handy (e.g. the water glint chroma carry
 *    deferred to cycle 40). It approximates the broad shape of the
 *    Hosek-Wilkie output without being byte-identical; the tests in
 *    `tests/sun-chromaticity.spec.js` pin the agreement contract.
 *  - `mieAureolePhaseHG(cosTheta, g)` — Henyey-Greenstein phase
 *    function. The CPU mirror of the GPU-side HG in the konveyor sky
 *    node material and the WebGL Hosek-Wilkie sky shader; used in
 *    Cycle 39 Phase B for the Mie aureole.
 */

/**
 * Approximate sun RGB chromaticity at a given altitude.
 *
 * @param {number} elevation  sin(altitude). 0 = horizon (deep warm
 *   amber), 1 = zenith (near-white). Values outside [0, 1] are clamped.
 * @returns {{r: number, g: number, b: number}} linear RGB, R-anchored
 *   at 1.0 so the function only describes a chromaticity ratio (the
 *   absolute intensity is handled separately by the disc's `intensity`
 *   uniform and the sky shader's exposure).
 */
export function sunColorAtElevation(elevation) {
  const e = Math.max(0, Math.min(1, elevation));
  // Smoothstep so the gradient is derivative-continuous, avoiding a
  // perceptible "step" between low-sun and mid-sun palettes.
  const s = e * e * (3 - 2 * e);
  // Anchor points:
  //   e=0  (horizon)   → (1.00, 0.60, 0.33)  warm amber, matches the
  //                                          golden-hour / dusk feel.
  //   e=1  (zenith)    → (1.00, 1.00, 1.00)  white. The atmospheric
  //                                          contribution to sun chromaticity
  //                                          vanishes when the path
  //                                          length is shortest.
  return {
    r: 1.0,
    g: 0.60 + s * (1.0 - 0.60),
    b: 0.33 + s * (1.0 - 0.33),
  };
}

/**
 * Henyey-Greenstein phase function. Used for the Mie aureole in
 * Cycle 39 Phase B. Forward-peaked at `g ≈ 0.76-0.85`.
 *
 * @param {number} cosTheta  cos(angle between view dir and sun dir).
 * @param {number} g         Asymmetry parameter.
 * @returns {number}
 */
export function mieAureolePhaseHG(cosTheta, g) {
  const g2 = g * g;
  const denom = Math.pow(Math.max(0.0001, 1 + g2 - 2 * g * cosTheta), 1.5);
  return (1 - g2) / denom;
}
