// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FOLIAGE_RIG,
  pbrLeafReflectance,
  impostorReflectance,
} from '../js/world/foliageLightingRig.js';

/**
 * Cycle 103 Phase 2 - shared foliage-lighting rig parity.
 *
 * Q1 (Matt's call) is "calibrate the impostor to the LOD0 PBR leaf": the leaf is
 * MeshStandard roughness 1 / metalness 0 (Lambert diffuse + hemispheric ambient,
 * no env map) and is the match reference; the impostor reproduces it. So at the
 * rig defaults the impostor relight must reduce EXACTLY to the PBR-leaf response -
 * the old half-Lambert wrap, Schlick fresnel rim, and flat floor all retire to 0.
 *
 * The gate: sweep (sun direction, surface normal, ambient) and assert the impostor
 * and the PBR leaf agree within a recorded epsilon. They are byte-identical at the
 * defaults, so the recorded bound is float noise (PARITY_EPSILON). A second test
 * proves the one reserved canopy knob (directWrap) does lift the shadow side, so
 * the default of 0 is genuinely the PBR match and not a coincidence. A source guard
 * pins both impostor materials to the shared builder so the two relight paths
 * cannot diverge again.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The recorded parity bound: at FOLIAGE_RIG defaults the impostor reduces to the
// PBR leaf by identical math, so the residual is float noise.
const PARITY_EPSILON = 1e-9;

const LEAF_ALBEDO = [0.18, 0.32, 0.12];

// A deterministic spread of unit normals across the whole sphere (front and back
// facing relative to any sun), plus a few sun directions and ambient colours.
function unitNormals() {
  const out = [];
  for (let a = 0; a < 12; a++) {
    const az = (a / 12) * Math.PI * 2;
    for (const ny of [-0.85, -0.4, 0, 0.4, 0.85]) {
      const r = Math.sqrt(Math.max(0, 1 - ny * ny));
      out.push([Math.cos(az) * r, ny, Math.sin(az) * r]);
    }
  }
  return out;
}

const SUNS = [
  { dir: [0.0, 1.0, 0.0], color: [1.0, 0.97, 0.9] },
  { dir: [0.5, 0.7, 0.3], color: [1.0, 0.9, 0.7] },
  { dir: [-0.6, 0.2, -0.77], color: [0.8, 0.7, 0.6] },
];
const AMBIENTS = [
  { sky: [0.7 * Math.PI, 0.74 * Math.PI, 0.82 * Math.PI], ground: [0.35 * Math.PI, 0.33 * Math.PI, 0.28 * Math.PI] },
  { sky: [0.4 * Math.PI, 0.45 * Math.PI, 0.6 * Math.PI], ground: [0.2 * Math.PI, 0.18 * Math.PI, 0.15 * Math.PI] },
];

const normalize3 = (v) => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('foliage lighting rig parity (Cycle 103 P2)', () => {
  it('ships the calibrated PBR-match defaults (no wrap, fresnel, or subsurface)', () => {
    expect(FOLIAGE_RIG.directWrap).toBe(0);
    expect(FOLIAGE_RIG.fresnelStrength).toBe(0);
    expect(FOLIAGE_RIG.subsurfaceLift).toBe(0);
    expect(FOLIAGE_RIG.pbrRoughness).toBe(1.0);
    expect(FOLIAGE_RIG.pbrMetalness).toBe(0.0);
  });

  it('impostor relight reduces to the PBR leaf within the recorded epsilon', () => {
    const view = normalize3([0.3, 0.5, 1.0]);
    let maxDiff = 0;
    for (const sun of SUNS) {
      const sunDir = normalize3(sun.dir);
      for (const n of unitNormals()) {
        const nDotL = dot3(n, sunDir);
        const nDotV = dot3(n, view);
        for (const amb of AMBIENTS) {
          const inputs = {
            albedo: LEAF_ALBEDO,
            nDotL,
            nY: n[1],
            nDotV,
            sun: sun.color,
            skyIrradiance: amb.sky,
            groundIrradiance: amb.ground,
          };
          const pbr = pbrLeafReflectance(inputs);
          const imp = impostorReflectance(inputs);
          for (let i = 0; i < 3; i++) {
            maxDiff = Math.max(maxDiff, Math.abs(pbr[i] - imp[i]));
          }
        }
      }
    }
    expect(maxDiff).toBeLessThanOrEqual(PARITY_EPSILON);
  });

  it('the directWrap knob lifts the shadow side (so default 0 is the real match)', () => {
    // A back-facing normal: PBR Lambert is fully dark on the direct term; the
    // half-Lambert wrap (directWrap=1) lifts it. This is the reserved P6 canopy
    // knob, and proves the default 0 reproduces PBR rather than coinciding.
    const inputs = {
      albedo: LEAF_ALBEDO,
      nDotL: -0.5,
      nY: 0.0,
      sun: [1, 1, 1],
      skyIrradiance: [0, 0, 0],
      groundIrradiance: [0, 0, 0],
    };
    const pbr = pbrLeafReflectance(inputs);
    const wrapped = impostorReflectance(inputs, { ...FOLIAGE_RIG, directWrap: 1 });
    // With ambient zeroed, only the direct term remains; the wrap must brighten it.
    expect(wrapped[0]).toBeGreaterThan(pbr[0]);
    expect(pbr[0]).toBe(0);
  });

  it('both impostor materials route through the shared rig (no divergent relight)', () => {
    const impostor = readFileSync(resolve(root, 'js/webgpuKilnImpostorNodeMaterial.js'), 'utf-8');
    const leaf = readFileSync(resolve(root, 'js/world/webgpuTreeLeafNodeMaterial.js'), 'utf-8');
    // Both impostor paths call the one shared builder.
    expect(impostor).toContain("from './world/foliageLightingRig.js'");
    expect(impostor).toContain('buildFoliageImpostorColorNode');
    expect(leaf).toContain("from './foliageLightingRig.js'");
    // The retired per-path magic is gone (half-Lambert wrap power, fresnel rim
    // constant, the latlon floor model).
    expect(impostor).not.toContain('wrapPower');
    expect(impostor).not.toContain('wrappedSun');
    expect(impostor).not.toContain('foliageLightingFloor');
  });
});
