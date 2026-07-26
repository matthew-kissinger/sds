// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 118 Phase 4. The water's fog is scene.fog, on the production path.
 *
 * Mirrors tests/terrain-scene-fog.spec.js, because it is the same defect one
 * material later. The WebGPU water node material composited a SECOND fog
 * underneath Three's own - a depthT ramp mixed toward a `water.fogColor`
 * resolved ONCE by js/boot/productionWebGpuBoot.js's resolveSceneSkyFog, at
 * boot, before a renderer exists. `Atmosphere.applyFogColor()` repaints
 * scene.fog.color from the horizon LUT every frame, so a moving sun left the
 * water's horizon holding its boot-time colour.
 *
 * `material.toneMapped = false` went with it. WebGPURenderer never reads that
 * flag (`grep -c toneMapped three/build/three.webgpu.js` is 0 in the
 * un-minified build production loads) because tone mapping there is one
 * full-screen pass over the finished frame, not an inline step like
 * WebGLRenderer's - so the water was tone mapped all along and the flag was a
 * WebGL-shaped assumption with no effect.
 *
 * SCOPE, recorded deliberately: the WebGL twin is NOT changed here. It writes
 * gl_FragColor raw with no tonemapping or colorspace chunk while `fog: true`
 * blends toward the same pre-tone-map scene.fog.color, so its horizon carries
 * the mismatch in the opposite direction. That is a tone-curve mismatch on the
 * non-production fallback, not the frozen-colour defect this phase exists to
 * fix, and correcting it changes the twin's look - which belongs to Phase 3,
 * with pixels in front of it. The fifth spec pins that the twin at least still
 * reads scene.fog through the standard chunk, so it tracks the sky.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DoubleSide, MeshBasicNodeMaterial, TSL } from 'three/webgpu';

import { Atmosphere } from '../js/atmosphere/Atmosphere.js';
import { SKY_FOG_PRESET_TUNING } from '../js/atmosphere/skyFogPresetTuning.js';
import { createAnimeWaterMaterial } from '../js/water/AnimeWater.js';
import { createWebGpuWaterNodeMaterialFactories } from '../js/water/webgpuWaterNodeMaterialFactories.js';

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

/**
 * Drop comments so the guards test the CODE, not the explanatory note in
 * webgpuAnimeWaterNodeMaterial.js that necessarily names the terms it removed.
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

describe('water fog comes from scene.fog', () => {
  it('opts the WebGPU water node material into Three fog and declares the source', () => {
    const factories = createWebGpuWaterNodeMaterialFactories({
      MeshBasicNodeMaterial,
      DoubleSide,
      TSL,
    });
    const heightTexture = createHeightTexture();
    const material = factories.createAnimeWaterMaterial({
      heightTexture,
      heightfield: { worldSize: 400, peakHeight: 0 },
      // The tuning the dusk preset used to feed in. Both keys are gone from the
      // table; passing them anyway proves the material ignores them rather than
      // quietly resurrecting a second fog when some caller still supplies one.
      fogColor: [0.29, 0.16, 0.13],
      fogStrength: 0.025,
    });

    try {
      // Material.fog already defaults to true, so this assertion alone would
      // have passed before Phase 4 - which is exactly why it is not the one
      // carrying the weight. The declared source and the absent knob are.
      expect(material.fog).toBe(true);
      expect(material.userData.webgpuWaterFogSource).toBe('scene-fog');
      expect(Object.keys(material.userData)).not.toContain('webgpuWaterFogStrength');
      // Never sampled at boot and held: no colour of its own survives anywhere
      // on the material.
      const carriesFogColour = Object.entries(material.userData).some(
        ([key, value]) => /fog/i.test(key) && (Array.isArray(value) || value?.isColor)
      );
      expect(carriesFogColour).toBe(false);
    } finally {
      material.dispose();
      heightTexture.dispose();
    }
  });

  it('keeps a frozen fog colour out of the WebGPU water source', () => {
    const nodeMaterial = stripComments(readSource('../js/water/webgpuAnimeWaterNodeMaterial.js'));
    const factories = stripComments(readSource('../js/water/webgpuWaterNodeMaterialFactories.js'));

    for (const source of [nodeMaterial, factories]) {
      expect(source).not.toContain('fogColor');
      expect(source).not.toContain('fogNear');
      expect(source).not.toContain('fogFar');
      expect(source).not.toContain('fogStrength');
    }
    // The one fog statement the material is allowed to carry.
    expect(nodeMaterial).toContain('material.fog = true;');
    // And the dead flag stays dead. WebGPURenderer does not read it; leaving it
    // asserts an output space this material does not actually live in.
    expect(nodeMaterial).not.toContain('toneMapped');
  });

  it('leaves no water fog knobs in the per-preset tuning table', () => {
    const presets = Object.keys(SKY_FOG_PRESET_TUNING);
    expect(presets.length).toBeGreaterThan(0);

    for (const preset of presets) {
      const water = SKY_FOG_PRESET_TUNING[preset].water ?? {};
      const fogKeys = Object.keys(water).filter((key) => key.toLowerCase().includes('fog'));
      expect(fogKeys, `preset ${preset}`).toEqual([]);
    }
  });

  it('keeps the WebGL water twin on the same standard fog chunk', () => {
    const material = createAnimeWaterMaterial({
      boundary: { center: { x: 0, z: 0 }, radius: 180, falloff: 40 },
    });

    try {
      // Dual path. The twin has always read scene.fog through the standard
      // chunk, which is why Phase 4 is a WebGPU-only edit. It carries fog
      // uniforms, but exactly THREE.UniformsLib.fog - the block WebGLRenderer
      // refreshes from scene.fog every frame - and not one knob more. An extra
      // key here would be a hand-rolled fog sneaking onto the second path.
      expect(material.fog).toBe(true);
      expect(material.fragmentShader).toContain('#include <fog_fragment>');
      const fogUniforms = Object.keys(material.uniforms)
        .filter((key) => key.toLowerCase().includes('fog'))
        .sort();
      expect(fogUniforms).toEqual(Object.keys(THREE.UniformsLib.fog).sort());
    } finally {
      material.dispose();
    }
  });

  it('repaints the same scene fog instance as the sun moves', () => {
    const scene = new THREE.Scene();
    const atmosphere = new Atmosphere(scene, {
      initialPreset: 'dusk',
      enableDayNight: true,
      enableClouds: false,
      // Newsheepdogland's numbers: the only shipping water scene with a moving
      // sun, and therefore the only place the frozen colour was observable.
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
      // water track the sky with no per-material plumbing at all.
      expect(scene.fog).toBe(fog);
      expect(noon.equals(dusk)).toBe(false);
      expect(before.equals(dusk) && before.equals(noon)).toBe(false);
    } finally {
      atmosphere.dispose();
    }
  });
});
