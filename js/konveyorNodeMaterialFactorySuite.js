// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import {
  createKonveyorCloudLayerMaterialFactories,
} from './atmosphere/konveyorCloudNodeMaterial.js';
import {
  createKonveyorSkyDomeMaterialFactories,
} from './atmosphere/konveyorSkyNodeMaterial.js';
import { createKonveyorEffectNodeMaterialFactories } from './effects/konveyorEffectNodeMaterialFactories.js';
import { createKonveyorImpostorNodeMaterialFactories } from './konveyorImpostorNodeMaterialFactories.js';
import {
  createKonveyorSheepPartNodeMaterial,
} from './konveyorSheepNodeMaterial.js';
import { createKonveyorSheepNodeMaterialFactories } from './konveyorSheepNodeMaterialFactories.js';
import { createKonveyorGrassNodeMaterialFactories } from './world/konveyorGrassNodeMaterialFactories.js';
import { createKonveyorTerrainNodeMaterialFactories } from './world/konveyorTerrainNodeMaterialFactories.js';
import { createKonveyorTreeRockNodeMaterialFactories } from './world/konveyorTreeRockNodeMaterialFactories.js';
import { createKonveyorWaterNodeMaterialFactories } from './water/konveyorWaterNodeMaterialFactories.js';

const SKY_FOG_PRESET_TUNING = Object.freeze({
  'pastoral-noon': {
    sky: {
      lowTint: [0.50, 0.78, 1.04],
      highTint: [0.32, 0.56, 1.04],
      lowLift: [0.000, 0.012, 0.030],
      highLift: [0.000, 0.000, 0.018],
      verticalStart: 0.02,
      verticalEnd: 0.58,
      skyBaseScale: 0.74,
      aureoleG: 0.90,
      aureoleColor: [0.42, 0.74, 1.02],
      sunGlowStrength: 0.46,
      sunMassPaintColor: [1.0, 0.70, 0.30],
      sunMassPaintStrength: 0.88,
      sunMassColor: [2.30, 2.00, 1.35],
      sunMassStrength: 0.62,
      sunMassStart: 0.992,
      sunMassEnd: 0.9997,
      sunMassPower: 3.00,
      sunDiscStrength: 0.0,
      fogBandStrength: 0.008,
    },
    effects: {
      sun: {
        depthTest: true,
        intensity: 1.24,
        coreRadius: 0.220,
        coreFeather: 0.290,
        hotCoreRadius: 0.128,
        hotCoreFeather: 0.190,
        coreColor: [1.0, 0.98, 0.86],
        bodyColor: [1.0, 0.32, 0.045],
        hotCoreColor: [3.80, 3.52, 2.36],
        hotCoreGain: 3.55,
        bodyGain: 0.74,
        bodyOpacity: 0.88,
        hotCoreOpacity: 1.0,
      },
    },
    terrain: {
      colorScale: 0.98,
      colorTint: [1.0, 0.96, 0.78],
      contrast: 1.10,
      detailStrength: 0.18,
      aoFloor: 0.78,
      aoStrength: 0.16,
      dirtStrength: 0.30,
      fogStrength: 0.20,
      horizonFogStrength: 0.04,
      fogBlendScale: 0.62,
    },
    grassBlade: {
      colorScale: 0.58,
      colorTint: [0.82, 1.00, 0.68],
      tipDampen: 0.54,
      backlightStrength: 0.62,
      rimStrength: 0.18,
      fogStrength: 0.26,
      hueVariation: 0.05,
      viewBacklightStrength: 0.15,
    },
    meadowQuad: {
      colorScale: 0.58,
      colorTint: [0.82, 1.00, 0.68],
      fogStrength: 0.28,
    },
  },
  dusk: {
    sky: {
      lowTint: [0.94, 0.66, 0.52],
      highTint: [0.92, 1.20, 2.10],
      lowLift: [0.34, 0.08, 0.06],
      highLift: [0.04, 0.04, 0.30],
      verticalStart: 0.00,
      verticalEnd: 0.34,
      skyBaseScale: 0.78,
      aureoleG: 0.90,
      aureoleColor: [0.96, 0.54, 0.24],
      sunGlowStrength: 0.62,
      sunMassPaintColor: [1.0, 0.58, 0.20],
      sunMassPaintStrength: 0.90,
      sunMassColor: [2.20, 1.64, 0.86],
      sunMassStrength: 0.58,
      sunMassStart: 0.982,
      sunMassEnd: 0.9992,
      sunMassPower: 2.50,
      sunDiscStrength: 0.0,
      fogBandStrength: 0.008,
    },
    effects: {
      sun: {
        // Cycle 39 Phase D: re-enabled depth test (was `false` for the legacy
        // haloed-disc that needed to always read through foreground). Now
        // that the disc is a small bright thing and bloom paints the glow,
        // proper terrain occlusion matters (sun behind a hill is OCCLUDED).
        depthTest: true,
        intensity: 1.02,
        coreRadius: 0.230,
        coreFeather: 0.305,
        hotCoreRadius: 0.132,
        hotCoreFeather: 0.198,
        coreColor: [1.0, 0.98, 0.84],
        bodyColor: [1.0, 0.26, 0.035],
        hotCoreColor: [3.72, 2.96, 1.66],
        hotCoreGain: 3.48,
        bodyGain: 0.72,
        bodyOpacity: 0.88,
        hotCoreOpacity: 1.0,
      },
    },
    treeLeaf: {
      sourceMapScale: 0.30,
      colorScale: 0.84,
      alphaScale: 1,
      fogColorScale: 0.54,
      fogStrength: 0.54,
      windStrength: 0.34,
    },
    grassBlade: {
      colorScale: 0.42,
      colorTint: [0.68, 0.90, 0.42],
      tipDampen: 0.46,
      backlightStrength: 0.78,
      rimStrength: 0.24,
      fogStrength: 0.30,
      hueVariation: 0.08,
      viewBacklightStrength: 0.12,
    },
    meadowQuad: {
      colorScale: 0.40,
      colorTint: [0.68, 0.90, 0.42],
      fogStrength: 0.32,
    },
    terrain: {
      colorScale: 0.88,
      colorTint: [0.96, 0.90, 0.68],
      contrast: 1.18,
      detailStrength: 0.18,
      aoFloor: 0.72,
      aoStrength: 0.18,
      dirtStrength: 0.34,
      fogStrength: 0.22,
      horizonFogStrength: 0.06,
      fogBlendScale: 0.68,
    },
    water: {
      colorScale: 0.58,
      colorTint: [0.22, 0.40, 1.42],
      foamScale: 0.62,
      sparkleScale: 0.76,
      sunSpecularIntensity: 0.48,
      broadGlintGain: 0.32,
      rippleGlintGain: 0.42,
      rippleLightScale: 0.10,
      fogStrength: 0.025,
    },
    sheep: {
      sheepWool: {
        rimStrength: 0.38,
        edgeDarkening: 0.18,
        fogStrength: 0.52,
      },
    },
    impostor: {
      kilnImpostor: {
        colorScale: 0.94,
        fogStrength: 0.48,
        foliageLightingFloor: [0.38, 0.42, 0.30],
      },
    },
  },
  'golden-hour': {
    sky: {
      lowTint: [0.78, 0.46, 0.20],
      highTint: [0.54, 1.48, 2.10],
      lowLift: [0.32, 0.20, 0.14],
      highLift: [0.02, 0.10, 0.24],
      verticalStart: 0.00,
      verticalEnd: 0.28,
      skyBaseScale: 0.62,
      aureoleG: 0.90,
      aureoleColor: [0.92, 0.58, 0.26],
      sunGlowStrength: 0.58,
      sunMassPaintColor: [1.0, 0.60, 0.22],
      sunMassPaintStrength: 0.90,
      sunMassColor: [2.24, 1.68, 0.90],
      sunMassStrength: 0.60,
      sunMassStart: 0.982,
      sunMassEnd: 0.9992,
      sunMassPower: 2.50,
      sunDiscStrength: 0.0,
      fogBandStrength: 0.008,
    },
    effects: {
      sun: {
        depthTest: true,
        intensity: 1.04,
        coreRadius: 0.230,
        coreFeather: 0.305,
        hotCoreRadius: 0.132,
        hotCoreFeather: 0.198,
        coreColor: [1.0, 0.97, 0.80],
        bodyColor: [1.0, 0.28, 0.04],
        hotCoreColor: [3.74, 3.00, 1.64],
        hotCoreGain: 3.50,
        bodyGain: 0.72,
        bodyOpacity: 0.88,
        hotCoreOpacity: 1.0,
      },
    },
    treeLeaf: {
      sourceMapScale: 0.32,
      colorScale: 0.86,
      alphaScale: 1,
      fogColorScale: 0.50,
      fogStrength: 0.50,
      windStrength: 0.34,
    },
    grassBlade: {
      colorScale: 0.40,
      colorTint: [0.66, 0.90, 0.44],
      tipDampen: 0.44,
      backlightStrength: 0.82,
      rimStrength: 0.25,
      fogStrength: 0.28,
      hueVariation: 0.08,
      viewBacklightStrength: 0.12,
    },
    meadowQuad: {
      colorScale: 0.38,
      colorTint: [0.66, 0.90, 0.44],
      fogStrength: 0.30,
    },
    terrain: {
      colorScale: 0.90,
      colorTint: [0.96, 0.92, 0.72],
      contrast: 1.16,
      detailStrength: 0.18,
      aoFloor: 0.74,
      aoStrength: 0.18,
      dirtStrength: 0.32,
      fogStrength: 0.20,
      horizonFogStrength: 0.05,
      fogBlendScale: 0.64,
    },
    water: {
      colorScale: 0.58,
      colorTint: [0.20, 0.38, 1.46],
      foamScale: 0.64,
      sparkleScale: 0.82,
      sunSpecularIntensity: 0.48,
      broadGlintGain: 0.32,
      rippleGlintGain: 0.44,
      rippleLightScale: 0.10,
      fogStrength: 0.025,
    },
    sheep: {
      sheepWool: {
        rimStrength: 0.40,
        edgeDarkening: 0.17,
        fogStrength: 0.50,
      },
    },
    impostor: {
      kilnImpostor: {
        colorScale: 0.96,
        fogStrength: 0.46,
        foliageLightingFloor: [0.40, 0.43, 0.30],
      },
    },
  },
});

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

export function createKonveyorNodeMaterialFactorySuite(webGpuModules, options = {}) {
  const atmosphereFrame = options.atmosphereFrame ?? options.skyFog;
  const materialOptions = withSkyFogMaterialOptions(options, atmosphereFrame);
  const atmosphere = {
    ...createKonveyorCloudLayerMaterialFactories(webGpuModules),
  };
  if (atmosphereFrame) {
    Object.assign(
      atmosphere,
      createKonveyorSkyDomeMaterialFactories(
        webGpuModules,
        atmosphereFrame,
        materialOptions.sky
      )
    );
  }

  const sheep = {
    ...createKonveyorSheepNodeMaterialFactories(webGpuModules, materialOptions.sheep),
    createSheepPartMaterial: (name, color) =>
      createKonveyorSheepPartNodeMaterial(webGpuModules, name, color),
  };

  return {
    atmosphere,
    effects: createKonveyorEffectNodeMaterialFactories(webGpuModules, materialOptions.effects),
    treeRock: createKonveyorTreeRockNodeMaterialFactories(
      webGpuModules,
      materialOptions.treeRock
    ),
    grass: createKonveyorGrassNodeMaterialFactories(webGpuModules, materialOptions.grass),
    water: createKonveyorWaterNodeMaterialFactories(webGpuModules, materialOptions.water),
    terrain: createKonveyorTerrainNodeMaterialFactories(webGpuModules, materialOptions.terrain),
    sheep,
    impostor: createKonveyorImpostorNodeMaterialFactories(webGpuModules, materialOptions.impostor),
  };
}

export function createKonveyorNodeMaterialFactoryGlobals(factorySuite) {
  return {
    __sdsKonveyorAtmosphereMaterialFactories: factorySuite.atmosphere,
    __sdsKonveyorEffectMaterialFactories: factorySuite.effects,
    __sdsKonveyorMaterialFactories: factorySuite.treeRock,
    __sdsKonveyorGrassMaterialFactories: factorySuite.grass,
    __sdsKonveyorWaterMaterialFactories: factorySuite.water,
    __sdsKonveyorTerrainMaterialFactories: factorySuite.terrain,
    __sdsKonveyorSheepMaterialFactories: factorySuite.sheep,
    __sdsKonveyorImpostorMaterialFactories: factorySuite.impostor,
  };
}

export function summarizeKonveyorNodeMaterialFactorySuite(factorySuite) {
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
    source: 'konveyor-node-material-factory-suite',
    groupCount: Object.keys(groups).length,
    factoryCount,
    groups,
  };
}
