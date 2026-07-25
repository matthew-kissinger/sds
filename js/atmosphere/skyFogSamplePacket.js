// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';

import { HosekWilkieSky } from './HosekWilkieSky.js';
import { fogColorMatchingSky } from './paintedHorizon.js';
import { SKY_PRESETS, isKnownPreset } from './skyPresets.js';

export const DEFAULT_SKY_FOG_SAMPLE_PRESET = 'dusk';
export const ATMOSPHERE_FRAME_CONTRACT = 'AtmosphereFrame.v1';
const DEFAULT_WEBGPU_SUN_BILLBOARD_SIZE = 620;
const DEFAULT_WEBGPU_SUN_BILLBOARD_INTENSITY = 1.58;

function colorArray(color) {
  return color.toArray().map((value) => Number(value.toFixed(4)));
}

function vectorArray(vector) {
  return vector.toArray().map((value) => Number(value.toFixed(4)));
}

function normalizedVectorArray(value, fallback = [0, 1, 0]) {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  const [x, y, z] = value.map(Number);
  const len = Math.hypot(x, y, z);
  if (!Number.isFinite(len) || len <= 1e-6) return fallback;
  return [x / len, y / len, z / len].map((n) => Number(n.toFixed(4)));
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : fallback;
}

export function sampleSkyFogPacketFromSky({
  sky,
  presetName = DEFAULT_SKY_FOG_SAMPLE_PRESET,
  fogDarkenMultiplier = 0.82,
  fogNear = 18,
  fogFar = 74,
  sunPositionUv = [0.32, 0.72],
  cloudCoverage = 0,
  sunPhysicalDirection = null,
  sunVisualDirection = null,
  sunBillboard = null,
  skyMaterialMode = 'webgpu-node',
  cloudAlpha = null,
  cloudHorizonFade = null,
  atmosphereDrawCount = null,
} = {}) {
  if (!sky) {
    throw new Error('sampleSkyFogPacketFromSky: sky is required');
  }

  const horizon = sky.getHorizon(new THREE.Color());
  const zenith = sky.getZenith(new THREE.Color());
  const sun = sky.getSun(new THREE.Color());
  const sunDirection = vectorArray(sky.getSunDirection());
  const horizonColor = colorArray(horizon);
  const zenithColor = colorArray(zenith);
  const sunColor = colorArray(sun);
  // Cycle 112 Phase 6: this packet's fogColor feeds every WebGPU material that
  // shades its own distance fog (grass blade, meadow quad, water, sheep wool,
  // tree branch and leaf, kiln impostor), each mixing toward it inside the
  // material and independently of scene.fog. It used to be
  // `horizonColor * 0.82` - the raw LUT horizon, the same near-white value that
  // produced the seam, just 18% darker.
  //
  // It now carries the identical value Atmosphere assigns to scene.fog.color:
  // both are PRE-tone-map inputs to tone-mapped materials, so both must be
  // solved back through the curve to land on the sky's painted horizon. Using
  // one function for both is what keeps the two fogs from pulling the far band
  // in different directions, and webgpuDiagnostic's `fogColorMatchesPacket`
  // check exists to catch them diverging again.
  //
  // Cycle 114 Phase 6 dropped one consumer: the terrain node material used to
  // take this colour too, and froze it at material creation. It now reads
  // scene.fog through Three's node fog like the WebGL terrain always has, so
  // nothing has to hand it a snapshot.
  //
  // The tone curve is assumed to be the non-Apple default here because the
  // packet is baked before a renderer exists; Atmosphere gets the real operator
  // at construction and is the authority for the live scene fog.
  const fogColor = colorArray(fogColorMatchingSky(new THREE.Color(), {
    horizon,
    zenith,
    presetName,
    toneMapping: 'aces',
    darken: fogDarkenMultiplier,
  }));
  const physicalDirection = normalizedVectorArray(sunPhysicalDirection ?? sunDirection, sunDirection);
  const visualDirection = normalizedVectorArray(sunVisualDirection ?? physicalDirection, physicalDirection);
  const billboard = {
    size: finiteNumber(sunBillboard?.size, DEFAULT_WEBGPU_SUN_BILLBOARD_SIZE),
    distance: finiteNumber(sunBillboard?.distance, 3000),
    intensity: finiteNumber(sunBillboard?.intensity, DEFAULT_WEBGPU_SUN_BILLBOARD_INTENSITY),
    disc: sunBillboard?.disc ?? null,
    materialName: sunBillboard?.materialName ?? null,
    applied: sunBillboard?.applied ?? null,
  };
  const cloud = {
    coverage: Number(cloudCoverage.toFixed(4)),
    alpha: finiteNumber(cloudAlpha, 0.72),
    horizonFade: finiteNumber(cloudHorizonFade, 0.72),
  };
  const skyFrame = {
    materialMode: skyMaterialMode,
    horizonColor,
    zenithColor,
    sunGlowStrength: null,
    sunDiscStrength: null,
  };

  return {
    contract: ATMOSPHERE_FRAME_CONTRACT,
    source: 'HosekWilkieSky.cpu-lut',
    presetName,
    horizonColor,
    zenithColor,
    sunColor,
    sunDirection: physicalDirection,
    sunPhysicalDirection: physicalDirection,
    sunVisualDirection: visualDirection,
    fogDarkenMultiplier,
    fogColor,
    fogNear,
    fogFar,
    sunPositionUv,
    cloudCoverage: cloud.coverage,
    sunBillboard: billboard,
    sky: skyFrame,
    cloud,
    atmosphereDrawCount,
    cpuVisible: true,
  };
}

export function createAtmosphereFrame({
  presetName = DEFAULT_SKY_FOG_SAMPLE_PRESET,
  fogDarkenMultiplier = 0.82,
  fogNear = 18,
  fogFar = 74,
  sunPositionUv = [0.32, 0.72],
  sunBillboard = null,
  skyMaterialMode = 'webgpu-node',
} = {}) {
  if (!isKnownPreset(presetName)) {
    throw new Error(`Unknown sky preset "${presetName}"`);
  }

  const preset = SKY_PRESETS[presetName];
  const cloudCoverage = preset.cloudCoverageDefault ?? 0;
  const sky = new HosekWilkieSky({ createRenderable: false });

  try {
    sky.applyPreset(preset);
    sky.setCloudCoverage(cloudCoverage);
    if (preset.cloudScaleMetersPerFeature !== undefined) {
      sky.setCloudFeatureScaleMeters(preset.cloudScaleMetersPerFeature);
    }
    sky.update(0, sky.getSunDirection());
    return sampleSkyFogPacketFromSky({
      sky,
      presetName,
      fogDarkenMultiplier,
      fogNear,
      fogFar,
      sunPositionUv,
      cloudCoverage,
      sunBillboard,
      skyMaterialMode,
    });
  } finally {
    sky.dispose();
  }
}

export function createSkyFogSamplePacket(options = {}) {
  return createAtmosphereFrame(options);
}
