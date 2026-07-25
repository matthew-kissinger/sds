// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';

import {
  Atmosphere,
  SKY_PRESETS,
} from '../atmosphere/Atmosphere.js';
import { fogColorMatchingSky, paintedSkyHorizon } from '../atmosphere/paintedHorizon.js';
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

    const horizonRaw = atmo.sky.getHorizon(new THREE.Color());
    const zenithRaw = atmo.sky.getZenith(new THREE.Color());
    const horizonColor = colorArray(horizonRaw);
    const zenithColor = colorArray(zenithRaw);
    const sunColor = colorArray(atmo.sky.getSun(new THREE.Color()));
    const fog = snapshotFog(scene.fog);
    // Cycle 112 Phase 6: what the sky actually paints at the horizon, which is
    // what fog must match. Not the raw LUT horizon - see paintedHorizon.js.
    const paintedHorizonColor = colorArray(
      paintedSkyHorizon(new THREE.Color(), horizonRaw, zenithRaw, presetName)
    );
    const expectedFogColor = colorArray(
      fogColorMatchingSky(new THREE.Color(), {
        horizon: horizonRaw,
        zenith: zenithRaw,
        presetName,
        toneMapping: atmo.toneMappingMode,
        exposure: atmo.toneMappingExposure,
      })
    );
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
      // Cycle 112 Phase 6: this used to assert fog.color === the raw LUT
      // horizon, which locked in the very mismatch that produced the seam (no
      // sky renderer paints that value). It now asserts fog carries the
      // solved-back colour that DISPLAYS as the sky's painted horizon.
      //
      // This is a wiring check, not proof the seam is gone: it compares two
      // CPU values. The seam itself is only provable by sampling rendered
      // pixels across the horizon line, which
      // tools/validation/horizon-seam.mjs does.
      fogColorMatchesPaintedSky: arraysEqual(fog?.color, expectedFogColor),
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
      paintedHorizonColor,
      expectedFogColor,
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
