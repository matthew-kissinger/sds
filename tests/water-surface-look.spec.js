// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 118 Phase 3 - the surface reads as water.
 *
 * Phase 2 gave the two render paths one model; this phase changed what that
 * model says. Four things it must keep saying:
 *
 *   1. the slope carries real amplitude, and the tilt it produces is MEASURED
 *      rather than asserted (0.055 shipped for two cycles described as a
 *      3.1-degree tilt when the true bound was 8.26, because nothing could
 *      evaluate the field off a GPU);
 *   2. the normal SHADES - before this phase its only two consumers were
 *      specular lobes, so a wave face turned away from the sun was exactly as
 *      bright as one turned into it;
 *   3. no cel quantisation and no sparkle pass survives on either path (D-W);
 *   4. the depth ramp reaches the deep colour on the seabeds the game actually
 *      has, which is what the 0.82 floor was faking.
 *
 * Every spec here fails against the pre-Phase-3 tree. Recorded in the plan.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  WATER_DEPTH_FROM_HEIGHTFIELD,
  WATER_GLINT_GAIN_DEFAULTS,
  WATER_GLINT_SHORE_FADE,
  WATER_PALETTE_LINEAR,
  WATER_SLOPE_SCALE,
  WATER_SURFACE_GLSL,
  WATER_SWELL_DEPTH_SWING,
  WATER_WAVE_SHADE_GAIN,
  waterSlopeNormalAt,
  waterSlopeTiltDegrees,
} from '../js/water/waterSurfaceModel.js';

/** The scale Phase 3 inherited, kept here so "greater than" has a referent. */
const SHIPPED_SLOPE_SCALE_BEFORE_PHASE_3 = 0.055;

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Tilt statistics over a 1200 m x 1200 m patch across 24 s. The domain is wide
 * on purpose: the fastest wave term has a 121 m period, so a patch smaller than
 * a few wavelengths under-samples the field and flatters the RMS.
 */
function tiltStats(slopeScale) {
  let max = 0;
  let sumSquares = 0;
  let count = 0;
  for (let t = 0; t < 24; t += 1) {
    for (let x = -600; x <= 600; x += 10) {
      for (let z = -600; z <= 600; z += 10) {
        const degrees = waterSlopeTiltDegrees(x, z, t, slopeScale);
        if (degrees > max) max = degrees;
        sumSquares += degrees * degrees;
        count += 1;
      }
    }
  }
  return { max, rms: Math.sqrt(sumSquares / count) };
}

describe('the water surface has amplitude', () => {
  it('raises the slope scale and lands on the tilt the plan records', () => {
    expect(WATER_SLOPE_SCALE).toBeGreaterThan(SHIPPED_SLOPE_SCALE_BEFORE_PHASE_3);
    expect(WATER_SLOPE_SCALE).toBe(0.138);

    // Measured, not claimed. Both numbers are in the cycle plan.
    const after = tiltStats(WATER_SLOPE_SCALE);
    expect(after.max).toBeCloseTo(15.38, 1);
    expect(after.rms).toBeCloseTo(7.12, 1);

    // And the same measurement of what it replaced, so the ratio is on record
    // rather than inferred from the scales (the field is not linear in tilt).
    const before = tiltStats(SHIPPED_SLOPE_SCALE_BEFORE_PHASE_3);
    expect(before.rms).toBeCloseTo(2.86, 1);
    expect(after.rms / before.rms).toBeGreaterThan(2.4);
  });

  it('shades off the normal instead of only glinting off it', () => {
    expect(WATER_WAVE_SHADE_GAIN).toBeGreaterThan(0);

    // A mid-height sun, and the swing of dot(N, sun) against the flat reference
    // across the field. Before Phase 3 this quantity existed nowhere: the only
    // consumers of the normal were pow(dot(N, H), 64) and a lobe that read the
    // flat up-vector, so a trough and a crest shaded identically off-specular.
    const sun = [0.4, 0.6, 0.7];
    const sunLength = Math.hypot(...sun);
    const unitSun = sun.map((component) => component / sunLength);
    let min = Infinity;
    let max = -Infinity;
    for (let x = -600; x <= 600; x += 10) {
      for (let z = -600; z <= 600; z += 10) {
        const normal = waterSlopeNormalAt(x, z, 12, WATER_SLOPE_SCALE);
        const shade = (normal[0] * unitSun[0] + normal[1] * unitSun[1] + normal[2] * unitSun[2])
          - unitSun[1];
        if (shade < min) min = shade;
        if (shade > max) max = shade;
      }
    }
    // Signed both ways: troughs darken as much as crests lift.
    expect(min).toBeLessThan(-0.1);
    expect(max).toBeGreaterThan(0.1);
    // And the gain turns that into a visible fraction of the sun colour.
    expect((max - min) * WATER_WAVE_SHADE_GAIN).toBeGreaterThan(0.1);
  });

  it('makes the slope-normal lobe lead and the flat sun path follow', () => {
    // The broad lobe reads vec3(0, 1, 0); it cannot see the waves at all, and
    // it carried the picture at the shipped weights (0.70/0.22 in the material
    // defaults, 0.32/0.42 in the presets). Raising the slope amplitude does
    // nothing while that is true.
    expect(WATER_GLINT_GAIN_DEFAULTS.ripple)
      .toBeGreaterThan(WATER_GLINT_GAIN_DEFAULTS.broad * 2);

    const node = stripComments(readSource('../js/water/webgpuAnimeWaterNodeMaterial.js'));
    expect(node).toContain('WATER_GLINT_GAIN_DEFAULTS.broad');
    expect(node).toContain('WATER_GLINT_GAIN_DEFAULTS.ripple');
    // The 0.22 round-trip: multiply the ripple lobe by 0.22 and then divide the
    // gain by 0.22 again. Gone, so the preset numbers mean what they read as.
    expect(node).not.toContain('rippleGlintGain / 0.22');
  });
});

describe('no cel quantisation and no sparkle pass survives', () => {
  it('leaves no bare step() in the WebGL twin', () => {
    const twin = stripComments(readSource('../js/water/AnimeWater.js'));

    // `step(0.15, ripple) * 0.5 + step(0.55, ripple) * 0.5` (painted ripples,
    // three flat bands) and `step(0.85, spec) * step(0.55, sparkleMask)` (cel
    // sparkles, a binary speck) are the two lines of the anime stack D-W named.
    // The foam edge was a third step(). All three are bands now.
    const bareStep = /(^|[^a-zA-Z_])step\s*\(/;
    expect(bareStep.test(twin), 'a bare step() survives in AnimeWater.js').toBe(false);
    expect(twin).not.toContain('rippleBanded');
    expect(twin).not.toContain('sparkles');
    expect(twin).not.toContain('sparkleMask');

    // The generated GLSL the twin includes must not smuggle one back in.
    expect(bareStep.test(WATER_SURFACE_GLSL)).toBe(false);
  });

  it('leaves no quantising window on the node path either', () => {
    const node = stripComments(readSource('../js/water/webgpuAnimeWaterNodeMaterial.js'));

    // The node path's cel band: smoothstep(0.56, 0.66, ...) is a 0.1-wide
    // window on a [0, 1] noise field, so ~90% of the surface sat on one of the
    // two rails. Signed and continuous now - it darkens as well as lifts.
    expect(node).not.toContain('smoothstep(0.56');
    expect(node).toContain('.sub(0.5).mul(2.0)');

    // No smoothstep anywhere on this path is narrower than 0.15 of its range,
    // which is the shape a quantisation takes when it comes back.
    const windows = [...node.matchAll(/smoothstep\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,/g)];
    expect(windows.length).toBeGreaterThan(0);
    for (const [text, low, high] of windows) {
      expect(Number(high) - Number(low), `narrow smoothstep window: ${text}`)
        .toBeGreaterThan(0.15);
    }
  });

  it('keeps the heightfield foam branch intact while softening its edge', () => {
    const twin = stripComments(readSource('../js/water/AnimeWater.js'));
    const node = stripComments(readSource('../js/water/webgpuAnimeWaterNodeMaterial.js'));

    // Hard stop 3. In production uHasHeight is 1, and Newsheepdogland's
    // synthesised bbox-disc radius is meaningless, so if the interface branch
    // goes so does that scene's foam entirely.
    expect(twin).toContain('mix(distanceFromShore, abs(sampleTerrainY(vWorldPos.xz) - uWaterY), uHasHeight)');
    expect(node).toContain('heightInterfaceFoam.mul(hasHeightfield)');
  });
});

describe('the depth ramp is a depth ramp', () => {
  const depthT = (metres) => {
    const { start, full } = WATER_DEPTH_FROM_HEIGHTFIELD;
    const t = Math.min(1, Math.max(0, (metres - start) / (full - start)));
    return t * t * (3 - 2 * t);
  };

  it('spends its range on the seabeds the game actually has', () => {
    // Measured seabeds: -12 m Rolling Hills, -10 m Open Country, -3 m
    // Newsheepdogland. The retired range asked for 18 m / 31.5 m / 13.5 m,
    // derived from a horizontal shoreline falloff rather than from any depth,
    // which is why depthT never left its first few percent and a 0.82 floor had
    // to be nailed under it to get the deep colour at all.
    expect(WATER_DEPTH_FROM_HEIGHTFIELD.full).toBeLessThan(12);
    expect(depthT(12)).toBeGreaterThan(0.99);
    expect(depthT(10)).toBeGreaterThan(0.99);

    // Newsheepdogland's 3 m shelf lands within two hundredths of the 0.45 floor
    // that scene was hand-tuned to in Cycle 90, so re-ranging preserves its tone
    // instead of re-grading it as a side effect.
    expect(depthT(3)).toBeCloseTo(0.45, 1);

    // And a real near-shore gradient exists, which is the whole point: on
    // Rolling Hills every one of these used to resolve to the same 0.82.
    const nearShore = [0.5, 1, 2, 3, 4].map(depthT);
    for (let i = 1; i < nearShore.length; i += 1) {
      expect(nearShore[i]).toBeGreaterThan(nearShore[i - 1]);
    }
    expect(depthT(4) - depthT(1)).toBeGreaterThan(0.4);
  });

  it('floors only the heightfield-less branch', () => {
    const node = stripComments(readSource('../js/water/webgpuAnimeWaterNodeMaterial.js'));
    // Was max(mix(boundary, heightfield, hasHeightfield), minDepthT) - the
    // floor over BOTH branches, including the one every shipped scene takes.
    expect(node).toContain('mix(max(depthFromBoundary, minDepthT), depthFromHeightfield, hasHeightfield)');
    expect(node).not.toMatch(/max\(\s*mix\(depthFromBoundary/);
  });

  it('carries the shore glint fade as a live term with authored constants', () => {
    const node = stripComments(readSource('../js/water/webgpuAnimeWaterNodeMaterial.js'));

    // Phase 4 left smoothstep(0.08, 0.55, depthT) in place with a warning that
    // un-flooring depthT would reactivate constants authored blind. Phase 3
    // un-floored it and replaced them rather than inheriting them.
    expect(node).not.toContain('smoothstep(0.08, 0.55');
    expect(node).not.toContain('horizonSuppression');
    expect(WATER_GLINT_SHORE_FADE.floor).toBeGreaterThan(0);
    expect(WATER_GLINT_SHORE_FADE.floor).toBeLessThan(1);
    expect(WATER_GLINT_SHORE_FADE.end).toBeLessThan(0.55);
  });
});

describe('the pastoral palette', () => {
  it('is desaturated rather than a saturated blue at every depth', () => {
    // "Is it still cobalt" as a number. Saturation of the linear ramp, and the
    // blue-over-red ratio that the retired colorTint pushed to 1.42/0.22 = 6.5.
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const colour = WATER_PALETTE_LINEAR.shallow.map((channel, index) => (
        channel + (WATER_PALETTE_LINEAR.deep[index] - channel) * t
      ));
      const [r, g, b] = colour;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = (max - min) / max;
      expect(saturation, `saturation at depthT=${t}`).toBeLessThan(0.75);
      // Green leads or ties blue everywhere: a teal ramp, not a blue one. The
      // retired palette went to 0.0097 red / 0.0343 green / 0.1329 blue at the
      // deep end, which is a navy by construction.
      expect(g, `green vs blue at depthT=${t}`).toBeGreaterThan(b * 0.7);
    }
  });

  it('spells the swell as depth rather than as a fourth colour', () => {
    const node = stripComments(readSource('../js/water/webgpuAnimeWaterNodeMaterial.js'));
    // vec3(0.02, 0.08, 0.10) was a colour outside the palette that the
    // single-declaration guard could not see, and it could only add blue.
    expect(node).not.toContain('vec3(0.02, 0.08, 0.10)');
    expect(node).toContain('swellDepthT');
    expect(WATER_SWELL_DEPTH_SWING).toBeGreaterThan(0);
  });
});
