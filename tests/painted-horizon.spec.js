// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 112 Phase 6: the painted-horizon authority.
 *
 * These are unit tests for the maths. They do NOT prove the seam is gone - only
 * sampling rendered pixels does that (tools/validation/horizon-seam.mjs). The
 * distinction matters: the assertion this phase replaced was a CPU-value
 * comparison that passed for the entire life of the defect.
 *
 * What is pinned here is the part that can silently rot:
 *   - the CPU model still reproduces what the sky shader paints,
 *   - the inverse tone map is a true inverse of the forward curve,
 *   - the three.js tone-mapping enum still means what this module assumes.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  paintedSkyHorizon,
  fogColorMatchingSky,
  toneMap,
  inverseToneMap,
  toneMappingFromRenderer,
  TONE_MAPPING_BY_VALUE,
  SKY_DOME_FOG_DARKEN,
} from '../js/atmosphere/paintedHorizon.js';
import { HosekWilkieSky } from '../js/atmosphere/HosekWilkieSky.js';
import { SKY_PRESETS } from '../js/atmosphere/skyPresets.js';

const PRESETS = ['pastoral-noon', 'dusk', 'golden-hour'];

function skyColors(presetName) {
  const sky = new HosekWilkieSky({ createRenderable: false });
  try {
    sky.applyPreset(SKY_PRESETS[presetName]);
    sky.update(0, sky.getSunDirection());
    return {
      horizon: sky.getHorizon(new THREE.Color()),
      zenith: sky.getZenith(new THREE.Color()),
    };
  } finally {
    sky.dispose();
  }
}

describe('tone mapping mirrors', () => {
  it('assumes the three.js enum values that three.js actually uses', () => {
    // If three renumbers these, the module would silently pick the wrong curve
    // and the fog would be subtly wrong everywhere. Fail loudly instead.
    expect(TONE_MAPPING_BY_VALUE[THREE.NoToneMapping]).toBe('none');
    expect(TONE_MAPPING_BY_VALUE[THREE.LinearToneMapping]).toBe('none');
    expect(TONE_MAPPING_BY_VALUE[THREE.ACESFilmicToneMapping]).toBe('aces');
    expect(TONE_MAPPING_BY_VALUE[THREE.NeutralToneMapping]).toBe('neutral');
  });

  it('reads mode and exposure off a renderer-shaped object', () => {
    expect(toneMappingFromRenderer({ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1 }))
      .toEqual({ mode: 'aces', exposure: 1 });
    expect(toneMappingFromRenderer({ toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.2 }))
      .toEqual({ mode: 'neutral', exposure: 1.2 });
    // Unknown operator and a missing renderer both fall back to the non-Apple default.
    expect(toneMappingFromRenderer({ toneMapping: 999 }).mode).toBe('aces');
    expect(toneMappingFromRenderer(null).mode).toBe('aces');
  });

  it('is monotone and bounded to 0..1', () => {
    let prev = -1;
    for (let v = 0; v <= 2; v += 0.05) {
      const [r] = toneMap(v, v, v, 'aces');
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = r;
    }
  });

  it('inverts itself across the range fog colours occupy', () => {
    const targets = [
      [0.148, 0.316, 0.594], // pastoral-noon painted horizon
      [0.401, 0.122, 0.097], // dusk
      [0.282, 0.157, 0.103], // golden-hour
      [0.02, 0.02, 0.02],
      [0.5, 0.5, 0.5],
    ];
    for (const mode of ['aces', 'neutral']) {
      for (const t of targets) {
        const pre = inverseToneMap(t, mode);
        const back = toneMap(pre[0], pre[1], pre[2], mode);
        for (let c = 0; c < 3; c++) expect(back[c]).toBeCloseTo(t[c], 4);
      }
    }
  });

  it('is a no-op when the renderer does not tone map', () => {
    expect(inverseToneMap([0.3, 0.4, 0.5], 'none')).toEqual([0.3, 0.4, 0.5]);
  });
});

describe('paintedSkyHorizon', () => {
  it('reproduces what the WebGPU sky shader paints at the horizon line', () => {
    // Independently measured from the shader graph during the Cycle 112
    // diagnosis. If the CPU model drifts from the shader, the seam comes back.
    const expected = {
      'pastoral-noon': [0.148, 0.316, 0.594],
      dusk: [0.401, 0.122, 0.097],
    };
    for (const [preset, want] of Object.entries(expected)) {
      const { horizon, zenith } = skyColors(preset);
      const got = paintedSkyHorizon(new THREE.Color(), horizon, zenith, preset);
      expect(got.r).toBeCloseTo(want[0], 1);
      expect(got.g).toBeCloseTo(want[1], 1);
      expect(got.b).toBeCloseTo(want[2], 1);
    }
  });

  it('differs sharply from the raw LUT horizon, which is the whole defect', () => {
    const { horizon, zenith } = skyColors('pastoral-noon');
    const painted = paintedSkyHorizon(new THREE.Color(), horizon, zenith, 'pastoral-noon');
    // The old fog colour was the raw horizon: near-white against a blue sky.
    expect(horizon.r).toBeGreaterThan(0.6);
    expect(painted.r).toBeLessThan(0.3);
    expect(horizon.r - painted.r).toBeGreaterThan(0.4);
  });

  it('mirrors the dome fog constant that HosekWilkieSky applies', () => {
    const src = readFileSync(fileURLToPath(new URL('../js/atmosphere/HosekWilkieSky.js', import.meta.url)), 'utf8');
    expect(src).toContain('multiplyScalar(SKY_DOME_FOG_DARKEN)');
    expect(SKY_DOME_FOG_DARKEN).toBeCloseTo(0.82, 6);
  });

  it('stays in gamut for every shipped preset', () => {
    for (const preset of PRESETS) {
      const { horizon, zenith } = skyColors(preset);
      const p = paintedSkyHorizon(new THREE.Color(), horizon, zenith, preset);
      for (const c of [p.r, p.g, p.b]) {
        expect(Number.isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('fogColorMatchingSky', () => {
  it('lands on the painted horizon after the renderer tone maps it', () => {
    for (const preset of PRESETS) {
      const { horizon, zenith } = skyColors(preset);
      const painted = paintedSkyHorizon(new THREE.Color(), horizon, zenith, preset);
      const fog = fogColorMatchingSky(new THREE.Color(), { horizon, zenith, presetName: preset, toneMapping: 'aces' });
      const displayed = toneMap(fog.r, fog.g, fog.b, 'aces');
      expect(displayed[0]).toBeCloseTo(painted.r, 3);
      expect(displayed[1]).toBeCloseTo(painted.g, 3);
      expect(displayed[2]).toBeCloseTo(painted.b, 3);
    }
  });

  it('keeps the weather darken hook working', () => {
    const { horizon, zenith } = skyColors('dusk');
    const base = fogColorMatchingSky(new THREE.Color(), { horizon, zenith, presetName: 'dusk' });
    const dark = fogColorMatchingSky(new THREE.Color(), { horizon, zenith, presetName: 'dusk', darken: 0.5 });
    expect(dark.r).toBeLessThan(base.r);
    expect(dark.g).toBeLessThan(base.g);
    expect(dark.b).toBeLessThan(base.b);
  });

  it('produces a different fog value per tone curve, since the curves differ', () => {
    const { horizon, zenith } = skyColors('pastoral-noon');
    const aces = fogColorMatchingSky(new THREE.Color(), { horizon, zenith, presetName: 'pastoral-noon', toneMapping: 'aces' });
    const none = fogColorMatchingSky(new THREE.Color(), { horizon, zenith, presetName: 'pastoral-noon', toneMapping: 'none' });
    expect(aces.b).not.toBeCloseTo(none.b, 3);
  });
});
