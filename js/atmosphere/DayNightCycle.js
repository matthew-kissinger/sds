// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { SKY_PRESETS } from './skyPresets.js';

/**
 * Day/night controller. Drives time-of-day t in [0, 1) (0 = midnight,
 * 0.25 = sunrise, 0.5 = noon, 0.75 = sunset). When started via `start()`,
 * `update(dt)` advances t by `dt / secondsPerDay` and emits two things:
 *   - sun (elevation, azimuth) angles via the registered callback
 *   - target preset name + a per-frame mix factor in [0, 1] toward the
 *     next keyframe's preset
 *
 * The atmosphere orchestrator translates those into `HosekWilkieSky`
 * uniform updates and `SunSystem` color/intensity targets. Keeping the
 * controller agnostic of the dome means tests can drive it without a
 * real renderer.
 *
 * Five keyframes are enough for a believable cycle without making the
 * interpolation logic complex:
 *   t=0.00 (midnight)  -> 'dusk'  (low warm light, will be tweaked later)
 *   t=0.25 (sunrise)   -> 'dawn'
 *   t=0.50 (noon)      -> 'pastoral-noon'
 *   t=0.75 (sunset)    -> 'golden-hour' followed by 'dusk'
 * The midnight slot reuses 'dusk' deliberately — there's no first-class
 * "night" preset in the SkyDef enum, so the cycle treats nighttime as
 * a darker dusk via low elevation rather than a separate preset.
 */

/**
 * @typedef {Object} DayNightKeyframe
 * @property {number} t                 Time of day in [0, 1).
 * @property {import('./skyPresets.js').SkyPresetName} preset
 * @property {number} elevation         Sun elevation, radians.
 * @property {number} azimuth           Sun azimuth, radians.
 */

const DEG = Math.PI / 180;

/** @type {DayNightKeyframe[]} */
const DEFAULT_KEYFRAMES = [
  // Midnight: sun well below horizon (eastern). The dome formula clamps
  // sun radiance for sub-horizon angles, which gives the cool dim look.
  { t: 0.00, preset: 'dusk',          elevation: -22 * DEG, azimuth: 0.10 * Math.PI },
  // Pre-dawn: still dim but starting to lift.
  { t: 0.20, preset: 'dawn',          elevation: -2 * DEG,  azimuth: 0.10 * Math.PI },
  // Sunrise: dawn preset proper.
  { t: 0.25, preset: 'dawn',          elevation: 7 * DEG,   azimuth: 0.12 * Math.PI },
  // Mid-morning blends toward pastoral noon.
  { t: 0.40, preset: 'pastoral-noon', elevation: 50 * DEG,  azimuth: 0.20 * Math.PI },
  // Noon.
  { t: 0.50, preset: 'pastoral-noon', elevation: 70 * DEG,  azimuth: 0.25 * Math.PI },
  // Late afternoon -> golden hour.
  { t: 0.65, preset: 'golden-hour',   elevation: 30 * DEG,  azimuth: 0.62 * Math.PI },
  // Sunset.
  { t: 0.75, preset: 'golden-hour',   elevation: 8 * DEG,   azimuth: 0.85 * Math.PI },
  // Dusk -> back toward midnight.
  { t: 0.85, preset: 'dusk',          elevation: -2 * DEG,  azimuth: 1.05 * Math.PI },
  { t: 1.00, preset: 'dusk',          elevation: -22 * DEG, azimuth: 1.10 * Math.PI },
];

export class DayNightCycle {
  /**
   * @param {Object} [options]
   * @param {number} [options.secondsPerDay=600]
   * @param {DayNightKeyframe[]} [options.keyframes]
   * @param {number} [options.initialT=0.5]
   */
  constructor(options = {}) {
    /** @private */
    this.secondsPerDay = Math.max(1, options.secondsPerDay ?? 600);
    /** @private */
    this.keyframes = options.keyframes ?? DEFAULT_KEYFRAMES;
    /** @private */
    this.t = wrap01(options.initialT ?? 0.5);
    /** @private */
    this.running = false;

    // Validate that every keyframe references a known preset. Test hook;
    // failing fast here is cheaper than chasing a black-screen later.
    for (const kf of this.keyframes) {
      if (!Object.prototype.hasOwnProperty.call(SKY_PRESETS, kf.preset)) {
        throw new Error(
          `DayNightCycle: keyframe at t=${kf.t} references unknown preset '${kf.preset}'`
        );
      }
    }
  }

  /** @param {number} t */
  setT(t) {
    this.t = wrap01(t);
  }

  /** @returns {number} */
  getT() {
    return this.t;
  }

  /** @param {number} secondsPerDay */
  setSecondsPerDay(secondsPerDay) {
    this.secondsPerDay = Math.max(1, secondsPerDay);
  }

  /** @returns {boolean} */
  isRunning() {
    return this.running;
  }

  /** @param {boolean} v */
  setRunning(v) {
    this.running = v;
  }

  /** @returns {DayNightKeyframe[]} */
  getKeyframes() {
    return this.keyframes;
  }

  /**
   * Advance simulation time when running and return the current
   * interpolated state. Caller drives the orchestrator from this.
   * @param {number} dt seconds
   * @returns {{ t: number, elevation: number, azimuth: number, fromPreset: import('./skyPresets.js').SkyPresetName, toPreset: import('./skyPresets.js').SkyPresetName, mix: number }}
   */
  update(dt) {
    if (this.running && Number.isFinite(dt) && dt > 0) {
      this.t = wrap01(this.t + dt / this.secondsPerDay);
    }
    return this.sampleAt(this.t);
  }

  /**
   * Sample the cycle without advancing time.
   * @param {number} t
   * @returns {{ t: number, elevation: number, azimuth: number, fromPreset: import('./skyPresets.js').SkyPresetName, toPreset: import('./skyPresets.js').SkyPresetName, mix: number }}
   */
  sampleAt(t) {
    const tn = wrap01(t);
    const kfs = this.keyframes;
    // Find the first keyframe with t >= tn; then prev = that-1.
    let next = 0;
    for (let i = 0; i < kfs.length; i++) {
      if (kfs[i].t >= tn) {
        next = i;
        break;
      }
      if (i === kfs.length - 1) next = i;
    }
    const prev = next === 0 ? kfs.length - 1 : next - 1;
    const a = kfs[prev];
    const b = kfs[next];

    // Per-segment mix; wrap-aware so the segment from t=0.85 to t=0.00 (=1.00)
    // interpolates correctly without going backwards.
    let aT = a.t;
    let bT = b.t;
    let cur = tn;
    if (bT < aT) {
      // Only happens when crossing the wrap boundary. Make `bT` strictly > aT
      // and lift `cur` if it is in [0, aT]. (Our default keyframes include a
      // duplicate at t=1.00 to avoid this branch in the common case.)
      bT += 1;
      if (cur < aT) cur += 1;
    }
    const denom = bT - aT;
    const mix = denom <= 1e-6 ? 0 : (cur - aT) / denom;
    const m = Math.max(0, Math.min(1, mix));

    return {
      t: tn,
      elevation: lerp(a.elevation, b.elevation, m),
      azimuth: lerpAngle(a.azimuth, b.azimuth, m),
      fromPreset: a.preset,
      toPreset: b.preset,
      mix: m,
    };
  }
}

/** @param {number} t @returns {number} */
function wrap01(t) {
  if (!Number.isFinite(t)) return 0;
  let v = t % 1;
  if (v < 0) v += 1;
  return v;
}

/** @param {number} a @param {number} b @param {number} m @returns {number} */
function lerp(a, b, m) {
  return a + (b - a) * m;
}

/**
 * Linear interpolate two angles taking the short arc. Important for
 * azimuth so dawn->noon doesn't sweep the long way around.
 * @param {number} a
 * @param {number} b
 * @param {number} m
 * @returns {number}
 */
function lerpAngle(a, b, m) {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * m;
}
