import * as THREE from 'three';

import { HosekWilkieSky } from './HosekWilkieSky.js';
import { SKY_PRESETS, isKnownPreset } from './skyPresets.js';

export const DEFAULT_SKY_FOG_SAMPLE_PRESET = 'dusk';

function colorArray(color) {
  return color.toArray().map((value) => Number(value.toFixed(4)));
}

function vectorArray(vector) {
  return vector.toArray().map((value) => Number(value.toFixed(4)));
}

export function sampleSkyFogPacketFromSky({
  sky,
  presetName = DEFAULT_SKY_FOG_SAMPLE_PRESET,
  fogDarkenMultiplier = 0.82,
  fogNear = 18,
  fogFar = 74,
  sunPositionUv = [0.32, 0.72],
  cloudCoverage = 0,
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
  const fogColor = horizonColor.map((value) => Number((value * fogDarkenMultiplier).toFixed(4)));

  return {
    source: 'HosekWilkieSky.cpu-lut',
    presetName,
    horizonColor,
    zenithColor,
    sunColor,
    sunDirection,
    fogDarkenMultiplier,
    fogColor,
    fogNear,
    fogFar,
    sunPositionUv,
    cloudCoverage: Number(cloudCoverage.toFixed(4)),
    cpuVisible: true,
  };
}

export function createSkyFogSamplePacket({
  presetName = DEFAULT_SKY_FOG_SAMPLE_PRESET,
  fogDarkenMultiplier = 0.82,
  fogNear = 18,
  fogFar = 74,
  sunPositionUv = [0.32, 0.72],
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
    });
  } finally {
    sky.dispose();
  }
}
