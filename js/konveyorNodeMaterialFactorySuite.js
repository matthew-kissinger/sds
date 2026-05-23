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
  dusk: {
    sky: {
      lowTint: [1.00, 0.80, 0.80],
      highTint: [1.20, 1.60, 2.60],
      lowLift: [0.45, 0.12, 0.18],
      highLift: [0.08, 0.08, 0.48],
      verticalStart: 0.00,
      verticalEnd: 0.34,
      sunGlowStrength: 0.34,
      sunDiscStrength: 0.0,
      fogBandStrength: 0.012,
    },
    effects: {
      sun: {
        // Cycle 39 Phase D: re-enabled depth test (was `false` for the legacy
        // haloed-disc that needed to always read through foreground). Now
        // that the disc is a small bright thing and bloom paints the glow,
        // proper terrain occlusion matters (sun behind a hill is OCCLUDED).
        depthTest: true,
        intensity: 0.98,
        coreRadius: 0.065,
        coreFeather: 0.13,
        coreColor: [1.0, 0.88, 0.54],
      },
    },
    treeLeaf: {
      sourceMapScale: 0.32,
      alphaScale: 1,
      fogColorScale: 0.58,
      fogStrength: 0.62,
      windStrength: 0.34,
    },
    grassBlade: {
      colorScale: 0.62,
      tipDampen: 0.50,
    },
    meadowQuad: {
      colorScale: 0.66,
    },
    terrain: {
      colorScale: 1.05,
      horizonFogStrength: 0.12,
    },
    water: {
      colorScale: 0.66,
      foamScale: 0.74,
      sparkleScale: 0.72,
    },
  },
  'golden-hour': {
    sky: {
      lowTint: [0.85, 0.55, 0.25],
      highTint: [0.70, 1.95, 2.25],
      lowLift: [0.43, 0.28, 0.20],
      highLift: [0.04, 0.18, 0.40],
      verticalStart: 0.00,
      verticalEnd: 0.28,
      sunGlowStrength: 0.38,
      sunDiscStrength: 0.0,
      fogBandStrength: 0.010,
    },
    effects: {
      sun: {
        depthTest: true,
        intensity: 1.0,
        coreRadius: 0.065,
        coreFeather: 0.13,
        coreColor: [1.0, 0.86, 0.50],
      },
    },
    treeLeaf: {
      sourceMapScale: 0.36,
      alphaScale: 1,
      fogColorScale: 0.52,
      fogStrength: 0.58,
      windStrength: 0.34,
    },
    grassBlade: {
      colorScale: 0.64,
      tipDampen: 0.48,
    },
    meadowQuad: {
      colorScale: 0.68,
    },
    terrain: {
      colorScale: 1.08,
      horizonFogStrength: 0.10,
    },
    water: {
      colorScale: 0.92,
      foamScale: 0.88,
      sparkleScale: 0.85,
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
