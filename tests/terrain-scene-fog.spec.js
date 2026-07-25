// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 114 Phase 6. The terrain's fog is scene.fog, on both render paths.
 *
 * The WebGPU terrain node material used to composite a second fog on top of
 * the scene's, mixed toward a colour resolved once at material creation and
 * never updated. `.claude/rules/scene-and-render.md` forbids per-material fog
 * for exactly this reason ("Custom fog drifts from the sky"), and the frozen
 * colour was the drift: `Atmosphere.applyFogColor()` repaints scene.fog.color
 * from the horizon LUT every frame, so a moving sun left the terrain's far
 * band holding its boot-time colour.
 *
 * These specs pin the three things that make the fix stick: the node material
 * opts into Three's scene fog and declares no colour of its own, the source
 * cannot quietly grow one back, and the scene fog object the material reads is
 * mutated in place as the sun moves rather than snapshotted.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DoubleSide, MeshLambertNodeMaterial, TSL } from 'three/webgpu';

import { Atmosphere } from '../js/atmosphere/Atmosphere.js';
import { SKY_FOG_PRESET_TUNING } from '../js/atmosphere/skyFogPresetTuning.js';
import { TerrainBuilder } from '../js/TerrainBuilder.js';
import { createWebGpuTerrainNodeMaterialFactories } from '../js/world/webgpuTerrainNodeMaterialFactories.js';

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

/**
 * Drop comments so the guards below test the CODE, not the long explanatory
 * note in webgpuTerrainNodeMaterial.js that necessarily names the terms it
 * removed. Neither file under test has `//` or block-comment sequences inside
 * string literals, so the naive strip is exact here.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
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

describe('terrain fog comes from scene.fog', () => {
  it('opts the WebGPU terrain node material into Three fog and declares the source', () => {
    const factories = createWebGpuTerrainNodeMaterialFactories({
      MeshLambertNodeMaterial,
      DoubleSide,
      TSL,
    });
    const heightTexture = createHeightTexture();
    const material = factories.createTerrainMaterial({
      heightTexture,
      heightfield: { worldSize: 400, peakHeight: 0 },
    });

    try {
      // NodeMaterial.setupOutput only wires the scene's fog node in when this
      // reads true, and the renderer builds that node from scene.fog with
      // reference() uniforms for colour/near/far. So this flag IS the fix.
      expect(material.fog).toBe(true);
      expect(material.userData.webgpuTerrainFogSource).toBe('scene-fog');
      // The removed knobs must not come back through the controls block, which
      // is what a tuning UI would reach for first.
      expect(Object.keys(material.userData.webgpuTerrainMaterialControls))
        .not.toContain('fogStrength');
      expect(Object.keys(material.userData.webgpuTerrainMaterialControls))
        .not.toContain('horizonFogStrength');
      expect(Object.keys(material.userData.webgpuTerrainMaterialControls))
        .not.toContain('fogBlendScale');
    } finally {
      material.dispose();
      heightTexture.dispose();
    }
  });

  it('keeps a frozen fog colour out of the WebGPU terrain source', () => {
    const nodeMaterial = stripComments(readSource('../js/world/webgpuTerrainNodeMaterial.js'));
    const factories = stripComments(readSource('../js/world/webgpuTerrainNodeMaterialFactories.js'));

    for (const source of [nodeMaterial, factories]) {
      expect(source).not.toContain('fogColor');
      expect(source).not.toContain('fogNear');
      expect(source).not.toContain('fogFar');
      expect(source).not.toContain('fogStrength');
      expect(source).not.toContain('fogBlendScale');
    }
    // The one fog statement the material is allowed to carry.
    expect(nodeMaterial).toContain('material.fog = true;');
  });

  it('leaves no terrain fog knobs in the per-preset tuning table', () => {
    const presets = Object.keys(SKY_FOG_PRESET_TUNING);
    expect(presets.length).toBeGreaterThan(0);

    for (const preset of presets) {
      const terrain = SKY_FOG_PRESET_TUNING[preset].terrain ?? {};
      const fogKeys = Object.keys(terrain).filter((key) => key.toLowerCase().includes('fog'));
      expect(fogKeys, `preset ${preset}`).toEqual([]);
    }
  });

  it('keeps the WebGL terrain twin on the same standard fog chunk', () => {
    const scene = new THREE.Scene();
    const builder = new TerrainBuilder(scene);
    const terrain = builder.createTerrain();

    try {
      // Dual path: the WebGL terrain has always read scene.fog through the
      // standard chunk. Phase 6 is a WebGPU-only edit precisely because this
      // side was already correct. It does carry fog uniforms, but exactly the
      // THREE.UniformsLib.fog block that WebGLRenderer refreshes from scene.fog
      // every frame, and not one knob more. An extra key here would be a
      // hand-rolled fog sneaking onto the second path.
      expect(terrain.material.fog).toBe(true);
      expect(terrain.material.fragmentShader).toContain('#include <fog_fragment>');
      const fogUniforms = Object.keys(terrain.material.uniforms)
        .filter((key) => key.toLowerCase().includes('fog'))
        .sort();
      expect(fogUniforms).toEqual(Object.keys(THREE.UniformsLib.fog).sort());
    } finally {
      if (terrain.parent) terrain.parent.remove(terrain);
      terrain.geometry?.dispose?.();
      terrain.material?.dispose?.();
      builder.terrainMesh = null;
    }
  });

  it('repaints the same scene fog instance as the sun moves', () => {
    const scene = new THREE.Scene();
    const atmosphere = new Atmosphere(scene, {
      initialPreset: 'dusk',
      enableDayNight: true,
      enableClouds: false,
      // Newsheepdogland's numbers: the only shipping scene with a moving sun,
      // and therefore the only place the frozen colour was observable.
      sceneFog: { color: '#b9a98c', near: 600, far: 2600 },
    });

    try {
      const fog = scene.fog;
      expect(fog.isFog).toBe(true);
      const before = fog.color.clone();

      atmosphere.setTimeOfDay(0.5);
      const noon = fog.color.clone();
      atmosphere.setTimeOfDay(0.78);
      const dusk = fog.color.clone();

      // Same object across the whole day. Three's fog node binds reference()
      // uniforms to this instance, so mutating it in place is what lets the
      // terrain track the sky without any per-material plumbing.
      expect(scene.fog).toBe(fog);
      expect(noon.equals(dusk)).toBe(false);
      expect(before.equals(dusk) && before.equals(noon)).toBe(false);
    } finally {
      atmosphere.dispose();
    }
  });
});
