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

export function createKonveyorNodeMaterialFactorySuite(webGpuModules, options = {}) {
  const atmosphere = {
    ...createKonveyorCloudLayerMaterialFactories(webGpuModules),
  };
  if (options.skyFog) {
    Object.assign(
      atmosphere,
      createKonveyorSkyDomeMaterialFactories(webGpuModules, options.skyFog)
    );
  }

  const sheep = {
    ...createKonveyorSheepNodeMaterialFactories(webGpuModules, options.sheep),
    createSheepPartMaterial: (name, color) =>
      createKonveyorSheepPartNodeMaterial(webGpuModules, name, color),
  };

  return {
    atmosphere,
    effects: createKonveyorEffectNodeMaterialFactories(webGpuModules, options.effects),
    treeRock: createKonveyorTreeRockNodeMaterialFactories(webGpuModules, options.treeRock),
    grass: createKonveyorGrassNodeMaterialFactories(webGpuModules, options.grass),
    water: createKonveyorWaterNodeMaterialFactories(webGpuModules, options.water),
    terrain: createKonveyorTerrainNodeMaterialFactories(webGpuModules, options.terrain),
    sheep,
    impostor: createKonveyorImpostorNodeMaterialFactories(webGpuModules, options.impostor),
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
