// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';

import {
  Atmosphere,
  SKY_PRESETS,
} from '../atmosphere/Atmosphere.js';
import { listScenes } from '../../shared/scenes/index.js';

const DEFAULT_SCENE_PRESET = 'pastoral-noon';

function round4(value) {
  return Number(value.toFixed(4));
}

function colorArray(color) {
  return color.toArray().map(round4);
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function snapshotFog(fog) {
  if (!fog) return null;
  if (fog.isFog) {
    return {
      type: 'Fog',
      color: colorArray(fog.color),
      near: fog.near,
      far: fog.far,
    };
  }
  if (fog.isFogExp2) {
    return {
      type: 'FogExp2',
      color: colorArray(fog.color),
      density: fog.density,
    };
  }
  return {
    type: 'unknown',
    color: fog.color ? colorArray(fog.color) : null,
  };
}

function roundSceneFog(fog) {
  if (!fog) return null;
  return {
    color: fog.color ?? null,
    near: fog.near ?? null,
    far: fog.far ?? null,
  };
}

function createSceneFogHorizonRecord(sceneDef) {
  const scene = new THREE.Scene();
  const presetName = sceneDef.sky?.preset ?? DEFAULT_SCENE_PRESET;
  const preset = SKY_PRESETS[presetName];
  const atmo = new Atmosphere(scene, {
    initialPreset: presetName,
    sceneFog: sceneDef.fog ?? null,
  });

  try {
    atmo.update(0);

    const horizonColor = colorArray(atmo.sky.getHorizon(new THREE.Color()));
    const zenithColor = colorArray(atmo.sky.getZenith(new THREE.Color()));
    const sunColor = colorArray(atmo.sky.getSun(new THREE.Color()));
    const fog = snapshotFog(scene.fog);
    const cloudCoverage = round4(atmo.sky.getCloudCoverage());
    const cloudLayerCoverage = atmo.cloudLayer
      ? round4(atmo.cloudLayer.getCoverage())
      : null;
    const expectedCoverage = round4(preset?.cloudCoverageDefault ?? 0);
    const sceneFog = sceneDef.fog ?? null;
    const checks = {
      presetResolved: atmo.getCurrentPresetName() === presetName,
      sceneFogType: sceneFog ? fog?.type === 'Fog' : fog?.type === 'FogExp2',
      sceneFogNearMatches: !sceneFog || fog?.near === sceneFog.near,
      sceneFogFarMatches: !sceneFog || fog?.far === sceneFog.far,
      fogColorTracksHorizon: arraysEqual(fog?.color, horizonColor),
      skyCloudCoverageMatchesPreset: cloudCoverage === expectedCoverage,
      cloudLayerCoverageMatchesPreset: cloudLayerCoverage === expectedCoverage,
    };

    return {
      sceneId: sceneDef.id,
      presetName,
      source: 'shared/scenes + Atmosphere',
      sceneFog: roundSceneFog(sceneFog),
      fog,
      horizonColor,
      zenithColor,
      sunColor,
      cloudCoverage,
      cloudLayerCoverage,
      expectedCoverage,
      checks,
      ok: Object.values(checks).every(Boolean),
    };
  } finally {
    atmo.dispose();
  }
}

export function createSceneFogHorizonProof(options = {}) {
  const scenes = options.scenes ?? listScenes();
  const records = scenes.map(createSceneFogHorizonRecord);

  return {
    source: 'Atmosphere scene fog/horizon proof',
    sceneCount: records.length,
    ok: records.every((record) => record.ok),
    scenes: records,
  };
}
