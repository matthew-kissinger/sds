/**
 * Cycle 39 — single source of truth for sun chromaticity. Phase A stubs the
 * exports. Phase B fleshes mieAureolePhaseHG. Phase C fleshes
 * sunColorAtElevation and routes it through both renderer paths.
 *
 * Keeping these as plain functions (no module-level state) so the disc
 * shader (CPU side), the konveyor sky node material (CPU build of a TSL
 * graph), and the WebGL sky shader (string concatenation) can all read
 * the same numbers without sharing a uniform.
 */

/**
 * @param {number} elevation  sin(altitude). 0 = horizon, 1 = zenith.
 * @returns {{r: number, g: number, b: number}}
 */
export function sunColorAtElevation(elevation) {
  const e = Math.max(0, Math.min(1, elevation));
  // Phase A stub: simple linear ramp from warm amber at horizon to near-white
  // at zenith. Phase C replaces with a tuned 3-stop interpolation.
  return {
    r: 1.0,
    g: 0.72 + 0.25 * e,
    b: 0.52 + 0.42 * e,
  };
}

/**
 * Henyey-Greenstein phase function. Used in Phase B for the Mie aureole.
 *
 * @param {number} cosTheta  cos(angle between view dir and sun dir).
 * @param {number} g         Asymmetry parameter. ~0.76-0.85 for forward Mie.
 * @returns {number}
 */
export function mieAureolePhaseHG(cosTheta, g) {
  const g2 = g * g;
  const denom = Math.pow(Math.max(0.0001, 1 + g2 - 2 * g * cosTheta), 1.5);
  return (1 - g2) / denom;
}
