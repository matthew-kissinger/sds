/**
 * Cycle 39 Phase C — single-source-of-truth contract for sun chromaticity.
 *
 * The runtime source is `HosekWilkieSky.getSun()`, which derives RGB from
 * the analytic atmospheric model. The standalone helper
 * `sunColorAtElevation` in js/atmosphere/sunChromaticity.js exists for
 * tests, cold-boot, and consumers that don't have a HosekWilkieSky.
 *
 * This spec pins:
 *   1. The standalone helper produces sensible monotonic chromaticity
 *      (warmer at horizon, whiter at zenith).
 *   2. Atmosphere.applyPreset() always uses `sky.getSun()` — there is no
 *      `preset.sunColor` short-circuit.
 *   3. At each preset's elevation, the sun light color matches what
 *      `sky.getSun()` returns (i.e. they cannot diverge by construction).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { Atmosphere } from '../js/atmosphere/Atmosphere.js';
import { HosekWilkieSky } from '../js/atmosphere/HosekWilkieSky.js';
import { SKY_PRESETS } from '../js/atmosphere/skyPresets.js';
import {
  mieAureolePhaseHG,
  sunColorAtElevation,
} from '../js/atmosphere/sunChromaticity.js';

describe('sunColorAtElevation — standalone helper', () => {
  it('returns a warm amber at the horizon', () => {
    const c = sunColorAtElevation(0);
    expect(c.r).toBeCloseTo(1.0, 3);
    expect(c.g).toBeCloseTo(0.60, 2);
    expect(c.b).toBeCloseTo(0.33, 2);
  });

  it('returns white at zenith', () => {
    const c = sunColorAtElevation(1);
    expect(c.r).toBeCloseTo(1.0, 3);
    expect(c.g).toBeCloseTo(1.0, 3);
    expect(c.b).toBeCloseTo(1.0, 3);
  });

  it('is monotonically whiter as elevation increases', () => {
    const a = sunColorAtElevation(0.1);
    const b = sunColorAtElevation(0.4);
    const c = sunColorAtElevation(0.7);
    expect(b.g).toBeGreaterThan(a.g);
    expect(c.g).toBeGreaterThan(b.g);
    expect(b.b).toBeGreaterThan(a.b);
    expect(c.b).toBeGreaterThan(b.b);
  });

  it('clamps elevation to [0, 1]', () => {
    expect(sunColorAtElevation(-0.5)).toEqual(sunColorAtElevation(0));
    expect(sunColorAtElevation(1.5)).toEqual(sunColorAtElevation(1));
  });
});

describe('mieAureolePhaseHG — standalone helper', () => {
  it('peaks at the sun direction (cosTheta = 1)', () => {
    const peak = mieAureolePhaseHG(1.0, 0.80);
    const off = mieAureolePhaseHG(0.0, 0.80);
    expect(peak).toBeGreaterThan(off);
  });

  it('is monotonically smaller as we move away from the sun direction', () => {
    const at1 = mieAureolePhaseHG(1.0, 0.80);
    const at05 = mieAureolePhaseHG(0.5, 0.80);
    const at0 = mieAureolePhaseHG(0.0, 0.80);
    expect(at1).toBeGreaterThan(at05);
    expect(at05).toBeGreaterThan(at0);
  });
});

describe('Atmosphere.applyPreset — single chromaticity source', () => {
  it('sets the sun light color from sky.getSun() (no preset.sunColor short-circuit)', () => {
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene, { initialPreset: 'dusk' });

    try {
      // For each preset, after applyPreset() the sun light color must
      // equal what sky.getSun() returns. If a preset.sunColor short-
      // circuit reappeared, this would fail because the SunSystem light
      // would diverge from the sky's physical value.
      for (const name of Object.keys(SKY_PRESETS)) {
        atmo.applyPreset(name);
        const physicalSun = new THREE.Color();
        atmo.sky.getSun(physicalSun);
        const lightColor = atmo.sun.light.color;
        expect(lightColor.r).toBeCloseTo(physicalSun.r, 4);
        expect(lightColor.g).toBeCloseTo(physicalSun.g, 4);
        expect(lightColor.b).toBeCloseTo(physicalSun.b, 4);
      }
    } finally {
      atmo.dispose();
    }
  });

  it('no preset declares a hardcoded sunColor field', () => {
    for (const [name, preset] of Object.entries(SKY_PRESETS)) {
      expect(preset.sunColor, `preset ${name} still has sunColor`).toBeUndefined();
    }
  });
});
