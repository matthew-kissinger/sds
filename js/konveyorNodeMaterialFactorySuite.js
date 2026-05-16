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
      lowTint: [0.11, 0.17, 0.39],
      highTint: [0.12, 0.16, 0.37],
      sunGlowStrength: 0.045,
      sunDiscStrength: 0.12,
      fogBandStrength: 0.10,
    },
    treeLeaf: {
      sourceMapScale: 0.14,
      alphaScale: 1,
      fogColorScale: 0.72,
      fogStrength: 0.84,
    },
    grassBlade: {
      colorScale: 0.24,
    },
    meadowQuad: {
      colorScale: 0.30,
    },
    terrain: {
      colorScale: 0.36,
    },
    water: {
      colorScale: 0.22,
      foamScale: 0.24,
      sparkleScale: 0.25,
    },
  },
  'golden-hour': {
    sky: {
      lowTint: [0.20, 0.56, 0.92],
      highTint: [0.24, 0.85, 1.22],
      sunGlowStrength: 0.055,
      sunDiscStrength: 0.12,
      fogBandStrength: 0.07,
    },
    treeLeaf: {
      sourceMapScale: 0.20,
      alphaScale: 1,
      fogColorScale: 0.60,
      fogStrength: 0.78,
    },
    grassBlade: {
      colorScale: 0.32,
    },
    meadowQuad: {
      colorScale: 0.34,
    },
    terrain: {
      colorScale: 0.44,
    },
    water: {
      colorScale: 0.68,
      foamScale: 0.70,
      sparkleScale: 0.55,
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
      ...(tuning.terrain ?? {}),
      ...terrainOptions,
    },
  };
}

export function createKonveyorNodeMaterialFactorySuite(webGpuModules, options = {}) {
  const materialOptions = withSkyFogMaterialOptions(options, options.skyFog);
  const atmosphere = {
    ...createKonveyorCloudLayerMaterialFactories(webGpuModules),
  };
  if (materialOptions.skyFog) {
    Object.assign(
      atmosphere,
      createKonveyorSkyDomeMaterialFactories(
        webGpuModules,
        materialOptions.skyFog,
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
