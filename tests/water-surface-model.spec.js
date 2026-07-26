// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 118 Phase 2. One water-surface model, imported by both render paths.
 *
 * The two acceptance criteria this phase was originally given could not detect
 * its own work, and that is the point these specs exist to fix:
 *
 *   grep -rn "6fd7d2\|103662\|eaf6ff" js/    already returned exactly one file
 *                                            before a line of Phase 2 existed,
 *                                            because it is blind to the byte
 *                                            arrays and the decimal floats the
 *                                            other three sites used
 *   grep -rn "colorTint" js/                 cannot return nothing; 22 of its
 *                                            26 matches are live terrain, grass
 *                                            and meadow knobs
 *
 * So the guards below assert the invariant instead of a string: every consumer
 * resolves to the ONE exported palette, in ONE stated colour space, and no file
 * re-declares the colours in ANY spelling (hex, 0x byte array, decimal byte
 * array, sRGB float, or linear float).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DoubleSide, MeshBasicNodeMaterial, TSL } from 'three/webgpu';

import { createAnimeWaterMaterial } from '../js/water/AnimeWater.js';
import { createWebGpuWaterNodeMaterialFactories } from '../js/water/webgpuWaterNodeMaterialFactories.js';
import { SKY_FOG_PRESET_TUNING } from '../js/atmosphere/skyFogPresetTuning.js';
import { createAnimeWaterDiagnosticState } from '../js/diagnostics/webgpuDiagnostic.js';
import {
  WATER_COLOR_SPACE,
  WATER_PALETTE_LINEAR,
  WATER_PALETTE_SRGB_BYTES,
  WATER_SLOPE_NORMALISE,
  WATER_SLOPE_ROTATIONS,
  WATER_SLOPE_SCALE,
  WATER_SLOPE_WAVES,
  WATER_SURFACE_GLSL,
  waterValueNoise2D,
} from '../js/water/waterSurfaceModel.js';

const JS_ROOT = fileURLToPath(new URL('../js', import.meta.url));
// The ONE file allowed to spell the colours. waterSurfaceModel.js re-exports
// from it; every other consumer goes through the model. The leaf exists only
// because js/diagnostics/glProbe.js rides the `main` chunk - see its header.
const PALETTE_PATH = fileURLToPath(new URL('../js/water/waterPalette.js', import.meta.url));

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

/** Comments necessarily name what they retired; the guards test the code. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

function walkJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkJsFiles(full, out);
    else if (/\.(js|ts|jsx|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function createHeightTexture() {
  const texture = new THREE.DataTexture(
    new Float32Array([0, 0.25, 0.5, 1]),
    2,
    2,
    THREE.RedFormat,
    THREE.FloatType
  );
  texture.needsUpdate = true;
  return texture;
}

function createNodeFactories() {
  return createWebGpuWaterNodeMaterialFactories({ MeshBasicNodeMaterial, DoubleSide, TSL });
}

describe('the water surface model is the single authority', () => {
  it('states one colour space and the palette agrees with what three resolves the hexes to', () => {
    expect(WATER_COLOR_SPACE).toBe('linear-srgb');

    // The authored bytes and the consumed linear floats are the SAME colour,
    // and the transfer between them is three's own. If this drifts, one render
    // path is multiplying sRGB numbers as if they were linear - the exact bug
    // DEFAULT_WATER_COLORS shipped with.
    for (const key of ['shallow', 'deep', 'foam']) {
      const bytes = WATER_PALETTE_SRGB_BYTES[key];
      const viaThree = new THREE.Color(
        `rgb(${bytes[0]}, ${bytes[1]}, ${bytes[2]})`
      ).toArray();
      expect(WATER_PALETTE_LINEAR[key], key).toEqual(viaThree);
    }

    // Not the sRGB floats the factories used to fall back to.
    expect(WATER_PALETTE_LINEAR.shallow[0]).toBeCloseTo(0.27468, 5);
    expect(WATER_PALETTE_LINEAR.shallow[0])
      .not.toBeCloseTo(WATER_PALETTE_SRGB_BYTES.shallow[0] / 255, 3);
  });

  it('resolves both render paths and both fallback paths to that one palette', () => {
    const heightTexture = createHeightTexture();
    const factories = createNodeFactories();

    // (a) the node path with NO colours supplied - the fallback that used to be
    // sRGB floats while every live caller fed linear ones.
    const fallback = factories.createAnimeWaterMaterial({ heightTexture });
    // (b) the node path through the real AnimeWater context.
    const contexts = [];
    const live = createAnimeWaterMaterial({
      boundary: { center: { x: 0, z: 0 }, radius: 180, falloff: 40 },
      search: '?renderer=webgpu&webgpuWater=1',
      webgpuWaterFactories: {
        createAnimeWaterMaterial: (context) => {
          contexts.push(context);
          return factories.createAnimeWaterMaterial({ ...context, heightTexture });
        },
      },
    });
    // (c) the WebGL twin.
    const twin = createAnimeWaterMaterial({ boundary: { center: { x: 0, z: 0 }, radius: 180, falloff: 40 } });

    try {
      for (const [label, material] of [['fallback', fallback], ['live', live]]) {
        expect(material.userData.webgpuWaterColorSpace, label).toBe(WATER_COLOR_SPACE);
        expect(material.userData.webgpuWaterPaletteLinear.shallow, label)
          .toEqual([...WATER_PALETTE_LINEAR.shallow]);
        expect(material.userData.webgpuWaterPaletteLinear.deep, label)
          .toEqual([...WATER_PALETTE_LINEAR.deep]);
        expect(material.userData.webgpuWaterPaletteLinear.foam, label)
          .toEqual([...WATER_PALETTE_LINEAR.foam]);
      }

      expect(twin.uniforms.uShallowColor.value.toArray()).toEqual([...WATER_PALETTE_LINEAR.shallow]);
      expect(twin.uniforms.uDeepColor.value.toArray()).toEqual([...WATER_PALETTE_LINEAR.deep]);
      expect(twin.uniforms.uFoamColor.value.toArray()).toEqual([...WATER_PALETTE_LINEAR.foam]);

      // And the diagnostic, whose copy existed only to be cross-checked.
      const diagnostic = createAnimeWaterDiagnosticState();
      expect(diagnostic.colorSpace).toBe(WATER_COLOR_SPACE);
      expect(diagnostic.shallowColor).toEqual(
        WATER_PALETTE_LINEAR.shallow.map((c) => Number(c.toFixed(4)))
      );
    } finally {
      fallback.dispose();
      live.dispose();
      twin.dispose();
      heightTexture.dispose();
    }
  });

  it('lets no file re-declare the palette in any spelling', () => {
    const spellings = new Set();
    for (const key of ['shallow', 'deep', 'foam']) {
      const bytes = WATER_PALETTE_SRGB_BYTES[key];
      // hex: 6fd7d2
      spellings.add(bytes.map((b) => b.toString(16).padStart(2, '0')).join(''));
      // 0x byte array: 0x6f, 0xd7, 0xd2
      spellings.add(bytes.map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(', '));
      // decimal byte array: 111, 215, 210
      spellings.add(bytes.join(', '));
      // sRGB float: 0.4353, 0.8431, 0.8235  (what the factories used to hold)
      spellings.add(bytes.map((b) => Number((b / 255).toFixed(4))).join(', '));
      // linear float, 4dp: 0.159, 0.6795, 0.6445
      spellings.add(WATER_PALETTE_LINEAR[key].map((c) => Number(c.toFixed(4))).join(', '));
    }

    const offenders = [];
    for (const file of walkJsFiles(JS_ROOT)) {
      if (file === PALETTE_PATH) continue;
      const source = readFileSync(file, 'utf8');
      for (const spelling of spellings) {
        if (source.includes(spelling)) offenders.push(`${file} :: ${spelling}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('retires colorTint from the water without touching the 22 live non-water knobs', () => {
    for (const relative of ['../js/water/AnimeWater.js', '../js/water/webgpuAnimeWaterNodeMaterial.js', '../js/water/webgpuWaterNodeMaterialFactories.js', '../js/water/webgpuWaterMaterialAdapter.js', '../js/water/waterSurfaceModel.js', '../js/water/waterPalette.js']) {
      expect(stripComments(readSource(relative)), relative).not.toContain('colorTint');
    }

    const presets = Object.keys(SKY_FOG_PRESET_TUNING);
    expect(presets.length).toBeGreaterThan(0);
    let survivingNonWaterTints = 0;
    for (const preset of presets) {
      const tuning = SKY_FOG_PRESET_TUNING[preset];
      expect(Object.keys(tuning.water ?? {}), `preset ${preset} water`).not.toContain('colorTint');
      for (const block of ['grassBlade', 'meadowQuad', 'terrain']) {
        if (tuning[block] && 'colorTint' in tuning[block]) survivingNonWaterTints += 1;
      }
    }
    // The terrain, grass-blade and meadow-quad tints are live tuning and must
    // NOT have been swept up by a naive grep-driven deletion.
    expect(survivingNonWaterTints).toBeGreaterThan(0);
  });

  it('carries one noise basis, generated from one set of constants', () => {
    const twin = stripComments(readSource('../js/water/AnimeWater.js'));
    const node = stripComments(readSource('../js/water/webgpuAnimeWaterNodeMaterial.js'));

    // The Ashima simplex the twin used to declare, and the value-noise the node
    // path used to declare, are both gone from their files.
    expect(twin).not.toContain('snoise');
    expect(twin).not.toContain('permute');
    expect(twin).not.toContain('mod289');
    expect(node).not.toMatch(/const\s+valueNoise\s*=/);
    expect(node).not.toMatch(/const\s+hash21\s*=/);

    // Both take it from the model instead.
    expect(twin).toContain('waterSurfaceModel.js');
    expect(node).toContain('waterSurfaceModel.js');
    expect(twin).toContain('WATER_SURFACE_GLSL');
    expect(node).toContain('buildWaterNoiseNodes');

    // The generated GLSL declares the same three entry points the TSL builder
    // returns, with the shared constants interpolated in.
    expect(WATER_SURFACE_GLSL).toContain('float waterValueNoise(vec2 p)');
    expect(WATER_SURFACE_GLSL).toContain('float waterValueNoiseSigned(vec2 p)');
    expect(WATER_SURFACE_GLSL).toContain('vec2(123.34, 456.21)');
    // GLSL ES 1.00 rejects int literals where a float is wanted, and the
    // failure mode is a blank shader at scene load rather than a red test.
    expect(WATER_SURFACE_GLSL).not.toMatch(/vec2\(\s*-?\d+\s*,/);
    expect(WATER_SURFACE_GLSL).not.toMatch(/\*\s*\(-?\d+\)\s*;/);

    // And the basis has pinned numeric behaviour, not just a shared spelling.
    expect(waterValueNoise2D(0, 0)).toBeCloseTo(waterValueNoise2D(0, 0), 12);
    for (const [x, z] of [[0.25, 0.75], [3.7, 1.2], [-8.4, 22.9]]) {
      const v = waterValueNoise2D(x, z);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(waterValueNoise2D(3.7, 1.2)).toBeCloseTo(0.3803011985, 9);
  });

  it('gives both paths the same slope field, at the scale the plan records', () => {
    const twin = readSource('../js/water/AnimeWater.js');
    expect(twin).toContain('waterSlopeNormal(vWorldPos.xz, uTime,');
    // The hardcoded up-vector WATER_BEFORE.md recorded. Exact for this file,
    // false for the node path, and gone from both now.
    expect(stripComments(twin)).not.toContain('vec3 N = vec3(0.0, 1.0, 0.0);');

    const heightTexture = createHeightTexture();
    const material = createNodeFactories().createAnimeWaterMaterial({ heightTexture });
    try {
      expect(material.userData.webgpuWaterSlopeScale).toBe(WATER_SLOPE_SCALE);
    } finally {
      material.dispose();
      heightTexture.dispose();
    }

    // The tilt the scale actually produces. atan(0.055) = 3.1 degrees is the
    // wrong reading: the per-axis sums are three waves each bounded by 1 + w2,
    // not a unit vector. Phase 3 raised the scale and this number with it.
    let maxX = 0;
    let maxZ = 0;
    WATER_SLOPE_ROTATIONS.forEach((rot, index) => {
      const amplitude = 1 + WATER_SLOPE_WAVES[index].w2;
      maxX += amplitude * Math.abs(rot[0]);
      maxZ += amplitude * Math.abs(rot[1]);
    });
    const scale = WATER_SLOPE_NORMALISE * WATER_SLOPE_SCALE;
    const maxTiltDeg = Math.atan(Math.hypot(maxX * scale, maxZ * scale)) * 180 / Math.PI;
    expect(maxTiltDeg).toBeCloseTo(20.01, 1);
  });
});
