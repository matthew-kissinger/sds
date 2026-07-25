// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import {
  createWebGpuCloudLayerMaterialFactories,
} from './atmosphere/webgpuCloudNodeMaterial.js';
import {
  createWebGpuSkyDomeMaterialFactories,
} from './atmosphere/webgpuSkyNodeMaterial.js';
import { createWebGpuEffectNodeMaterialFactories } from './effects/webgpuEffectNodeMaterialFactories.js';
import { createWebGpuImpostorNodeMaterialFactories } from './webgpuImpostorNodeMaterialFactories.js';
import {
  createWebGpuSheepPartNodeMaterial,
} from './webgpuSheepNodeMaterial.js';
import { createWebGpuSheepNodeMaterialFactories } from './webgpuSheepNodeMaterialFactories.js';
import { createWebGpuGrassNodeMaterialFactories } from './world/webgpuGrassNodeMaterialFactories.js';
import { createWebGpuTerrainNodeMaterialFactories } from './world/webgpuTerrainNodeMaterialFactories.js';
import { createWebGpuTreeRockNodeMaterialFactories } from './world/webgpuTreeRockNodeMaterialFactories.js';
import { createWebGpuWaterNodeMaterialFactories } from './water/webgpuWaterNodeMaterialFactories.js';
import { SKY_FOG_PRESET_TUNING } from './atmosphere/skyFogPresetTuning.js';


function presetTuning(skyFog) {
  return SKY_FOG_PRESET_TUNING[skyFog?.presetName] ?? {};
}

function withSkyFogMaterialOptions(options = {}, skyFog = null) {
  if (!skyFog) return options;
  const tuning = presetTuning(skyFog);
  const treeRockOptions = options.treeRock ?? {};
  const grassOptions = options.grass ?? {};
  const waterOptions = options.water ?? {};
  const terrainOptions = options.terrain ?? {};
  const sheepOptions = options.sheep ?? {};
  const impostorOptions = options.impostor ?? {};
  const effectsOptions = options.effects ?? {};
  return {
    ...options,
    sky: {
      ...(tuning.sky ?? {}),
      ...(options.sky ?? {}),
    },
    treeRock: {
      ...treeRockOptions,
      treeBranch: {
        fogColor: skyFog.fogColor,
        fogNear: skyFog.fogNear,
        fogFar: skyFog.fogFar,
        ...(treeRockOptions.treeBranch ?? {}),
      },
      treeLeaf: {
        fogColor: skyFog.fogColor,
        fogNear: skyFog.fogNear,
        fogFar: skyFog.fogFar,
        ...(tuning.treeLeaf ?? {}),
        ...(treeRockOptions.treeLeaf ?? {}),
      },
    },
    grass: {
      fogColor: skyFog.fogColor,
      fogNear: skyFog.fogNear,
      fogFar: skyFog.fogFar,
      ...grassOptions,
      grassBlade: {
        ...(tuning.grassBlade ?? {}),
        ...(grassOptions.grassBlade ?? {}),
      },
      meadowQuad: {
        ...(tuning.meadowQuad ?? {}),
        ...(grassOptions.meadowQuad ?? {}),
      },
    },
    water: {
      fogColor: skyFog.fogColor,
      sunColor: skyFog.sunColor,
      sunDirection: skyFog.sunDirection,
      ...(tuning.water ?? {}),
      ...waterOptions,
    },
    terrain: {
      fogColor: skyFog.fogColor,
      fogNear: skyFog.fogNear,
      fogFar: skyFog.fogFar,
      ...(tuning.terrain ?? {}),
      ...terrainOptions,
    },
    sheep: {
      ...(tuning.sheep ?? {}),
      ...sheepOptions,
      sheepWool: {
        fogColor: skyFog.fogColor,
        fogNear: skyFog.fogNear,
        fogFar: skyFog.fogFar,
        ...(tuning.sheep?.sheepWool ?? {}),
        ...(sheepOptions.sheepWool ?? {}),
      },
    },
    impostor: {
      fogColor: skyFog.fogColor,
      fogNear: skyFog.fogNear,
      fogFar: skyFog.fogFar,
      ...(tuning.impostor ?? {}),
      ...impostorOptions,
      kilnImpostor: {
        fogColor: skyFog.fogColor,
        fogNear: skyFog.fogNear,
        fogFar: skyFog.fogFar,
        ...(tuning.impostor?.kilnImpostor ?? {}),
        ...(impostorOptions.kilnImpostor ?? {}),
      },
    },
    effects: {
      ...effectsOptions,
      sun: {
        ...(tuning.effects?.sun ?? {}),
        ...(effectsOptions.sun ?? {}),
      },
    },
  };
}

export function createWebGpuNodeMaterialFactorySuite(webGpuModules, options = {}) {
  const atmosphereFrame = options.atmosphereFrame ?? options.skyFog;
  const materialOptions = withSkyFogMaterialOptions(options, atmosphereFrame);
  const atmosphere = {
    ...createWebGpuCloudLayerMaterialFactories(webGpuModules),
  };
  if (atmosphereFrame) {
    Object.assign(
      atmosphere,
      createWebGpuSkyDomeMaterialFactories(
        webGpuModules,
        atmosphereFrame,
        materialOptions.sky
      )
    );
  }

  const sheep = {
    ...createWebGpuSheepNodeMaterialFactories(webGpuModules, materialOptions.sheep),
    createSheepPartMaterial: (name, color) =>
      createWebGpuSheepPartNodeMaterial(webGpuModules, name, color),
  };

  return {
    atmosphere,
    effects: createWebGpuEffectNodeMaterialFactories(webGpuModules, materialOptions.effects),
    treeRock: createWebGpuTreeRockNodeMaterialFactories(
      webGpuModules,
      materialOptions.treeRock
    ),
    grass: createWebGpuGrassNodeMaterialFactories(webGpuModules, materialOptions.grass),
    water: createWebGpuWaterNodeMaterialFactories(webGpuModules, materialOptions.water),
    terrain: createWebGpuTerrainNodeMaterialFactories(webGpuModules, materialOptions.terrain),
    sheep,
    impostor: createWebGpuImpostorNodeMaterialFactories(webGpuModules, materialOptions.impostor),
  };
}

export function createWebGpuNodeMaterialFactoryGlobals(factorySuite) {
  return {
    __sdsWebGpuAtmosphereMaterialFactories: factorySuite.atmosphere,
    __sdsWebGpuEffectMaterialFactories: factorySuite.effects,
    __sdsWebGpuMaterialFactories: factorySuite.treeRock,
    __sdsWebGpuGrassMaterialFactories: factorySuite.grass,
    __sdsWebGpuWaterMaterialFactories: factorySuite.water,
    __sdsWebGpuTerrainMaterialFactories: factorySuite.terrain,
    __sdsWebGpuSheepMaterialFactories: factorySuite.sheep,
    __sdsWebGpuImpostorMaterialFactories: factorySuite.impostor,
  };
}

export function summarizeWebGpuNodeMaterialFactorySuite(factorySuite) {
  const groups = {};
  let factoryCount = 0;

  for (const [groupName, group] of Object.entries(factorySuite)) {
    const factories = Object.entries(group ?? {})
      .filter(([, value]) => typeof value === 'function')
      .map(([factoryName]) => factoryName)
      .sort();
    groups[groupName] = factories;
    factoryCount += factories.length;
  }

  return {
    source: 'webgpu-node-material-factory-suite',
    groupCount: Object.keys(groups).length,
    factoryCount,
    groups,
  };
}
