import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as WEBGPU from 'three/webgpu';

import { createSkyFogSamplePacket } from '../js/atmosphere/skyFogSamplePacket.js';
import {
  createKonveyorNodeMaterialFactoryGlobals,
  createKonveyorNodeMaterialFactorySuite,
  summarizeKonveyorNodeMaterialFactorySuite,
} from '../js/konveyorNodeMaterialFactorySuite.js';
import { createKonveyorAtmosphereMaterial } from '../js/atmosphere/konveyorAtmosphereMaterialAdapter.js';
import { createKonveyorEffectMaterial } from '../js/effects/konveyorEffectMaterialAdapter.js';
import { createKonveyorImpostorMaterial } from '../js/konveyorImpostorMaterialAdapter.js';
import { createKonveyorSheepMaterial } from '../js/konveyorSheepMaterialAdapter.js';
import { createKonveyorGrassMaterial } from '../js/world/konveyorGrassMaterialAdapter.js';
import { maybeApplyKonveyorTreeRockMaterials } from '../js/world/konveyorMaterialAdapter.js';
import { createKonveyorTerrainMaterial } from '../js/world/konveyorTerrainMaterialAdapter.js';
import { createKonveyorWaterMaterial } from '../js/water/konveyorWaterMaterialAdapter.js';

function createHeightTexture() {
  const texture = new THREE.DataTexture(
    new Float32Array([0, 0.1, 0.2, 0.3]),
    2,
    2,
    THREE.RedFormat,
    THREE.FloatType
  );
  texture.needsUpdate = true;
  return texture;
}

function defaultMaterial(name) {
  const material = new THREE.MeshBasicMaterial();
  material.name = name;
  return material;
}

function root(...children) {
  return { children };
}

function mesh(materialName) {
  return {
    isMesh: true,
    material: defaultMaterial(materialName),
  };
}

function withWindow(windowValue, run) {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const previousWindow = globalThis.window;
  globalThis.window = windowValue;
  try {
    return run();
  } finally {
    if (hadWindow) {
      globalThis.window = previousWindow;
    } else {
      delete globalThis.window;
    }
  }
}

describe('konveyor node material factory suite', () => {
  it('assembles every factory group from an already supplied module object', () => {
    const suite = createKonveyorNodeMaterialFactorySuite({}, { skyFog: {} });

    expect(Object.keys(suite).sort()).toEqual([
      'atmosphere',
      'effects',
      'grass',
      'impostor',
      'sheep',
      'terrain',
      'treeRock',
      'water',
    ]);
    expect(Object.keys(suite.atmosphere).sort()).toEqual([
      'createCloudLayerMaterial',
      'createSkyDomeMaterial',
    ]);
    expect(Object.keys(suite.effects).sort()).toEqual([
      'createCorralZapBoltMaterial',
      'createCorralZapParticleMaterial',
      'createPortalPadMaterial',
      'createPortalParticleMaterial',
      'createPortalRingMaterial',
      'createSunBillboardMaterial',
    ]);
    expect(Object.keys(suite.treeRock).sort()).toEqual([
      'createRockMaterial',
      'createTreeBranchMaterial',
      'createTreeLeafMaterial',
    ]);
    expect(Object.keys(suite.grass).sort()).toEqual([
      'createGrassBladeMaterial',
      'createMeadowQuadMaterial',
    ]);
    expect(Object.keys(suite.water)).toEqual(['createAnimeWaterMaterial']);
    expect(Object.keys(suite.terrain)).toEqual(['createTerrainMaterial']);
    expect(Object.keys(suite.sheep).sort()).toEqual([
      'createSheepMaterial',
      'createSheepPartMaterial',
    ]);
    expect(Object.keys(suite.impostor)).toEqual(['createKilnImpostorMaterial']);
  });

  it('does not statically import the WebGPU renderer module', () => {
    const source = readFileSync(new URL('../js/konveyorNodeMaterialFactorySuite.js', import.meta.url), 'utf8');

    expect(source).not.toContain('three/webgpu');
  });

  it('routes material creation through grouped reusable WebGPU factories', () => {
    const skyFog = createSkyFogSamplePacket();
    const heightTexture = createHeightTexture();
    const albedoAtlas = new THREE.Texture();
    const normalAtlas = new THREE.Texture();
    const depthAtlas = new THREE.Texture();
    const suite = createKonveyorNodeMaterialFactorySuite(WEBGPU, {
      skyFog,
      treeRock: {
        treeLeaf: {
          windStrength: 0.5,
        },
        rockRim: {
          baseColor: [0.32, 0.29, 0.25],
          rimColor: skyFog.sunColor,
        },
      },
      grass: {
        fogColor: skyFog.fogColor,
        fogNear: skyFog.fogNear,
        fogFar: skyFog.fogFar,
      },
      water: {
        fogColor: skyFog.fogColor,
        sunColor: skyFog.sunColor,
      },
      terrain: {
        fogColor: skyFog.fogColor,
      },
    });

    const materials = [
      suite.atmosphere.createSkyDomeMaterial().material,
      suite.atmosphere.createCloudLayerMaterial().material,
      suite.effects.createSunBillboardMaterial().material,
      suite.effects.createPortalRingMaterial().material,
      suite.effects.createPortalPadMaterial().material,
      suite.effects.createPortalParticleMaterial().material,
      suite.effects.createCorralZapBoltMaterial().material,
      suite.effects.createCorralZapParticleMaterial().material,
      suite.treeRock.createTreeBranchMaterial(),
      suite.treeRock.createTreeLeafMaterial(),
      suite.treeRock.createRockMaterial(),
      suite.grass.createMeadowQuadMaterial({
        baseColor: [0.08, 0.28, 0.04],
        midColor: [0.18, 0.48, 0.12],
        tipColor: [0.55, 0.82, 0.3],
      }),
      suite.grass.createGrassBladeMaterial({
        fogColor: skyFog.fogColor,
        fogNear: skyFog.fogNear,
        fogFar: skyFog.fogFar,
      }),
      suite.water.createAnimeWaterMaterial({ heightTexture }),
      suite.terrain.createTerrainMaterial({ heightTexture }),
      suite.sheep.createSheepMaterial({ fogColor: skyFog.fogColor }),
      suite.sheep.createSheepPartMaterial('konveyor-node-sheep-face', [0.22, 0.2, 0.18]),
      suite.impostor.createKilnImpostorMaterial({
        albedoAtlas,
        normalAtlas,
        depthAtlas,
        fogColor: skyFog.fogColor,
      }),
    ];

    try {
      expect(materials.map((material) => material.name)).toEqual([
        'konveyor-node-sky-dome',
        'konveyor-node-cloud-layer',
        'konveyor-node-sun-billboard',
        'konveyor-node-portal-ring',
        'konveyor-node-portal-pad',
        'konveyor-node-portal-particles',
        'konveyor-node-corral-zap-bolt',
        'konveyor-node-corral-zap-particles',
        'konveyor-node-branches',
        'konveyor-node-leaves',
        'konveyor-node-rock-rim',
        'konveyor-node-meadow-quad',
        'konveyor-node-grass-blade',
        'konveyor-node-anime-water',
        'konveyor-node-terrain-heightfield',
        'konveyor-node-sheep-wool',
        'konveyor-node-sheep-face',
        'konveyor-node-kiln-impostor',
      ]);
      expect(materials.every((material) => material.isNodeMaterial)).toBe(true);
      expect(materials[0].side).toBe(WEBGPU.BackSide);
      expect(materials[1].side).toBe(WEBGPU.DoubleSide);
      expect(materials[13].side).toBe(WEBGPU.DoubleSide);
      expect(materials[17].side).toBe(WEBGPU.DoubleSide);
    } finally {
      materials.forEach((material) => material?.dispose?.());
      heightTexture.dispose();
      albedoAtlas.dispose();
      normalAtlas.dispose();
      depthAtlas.dispose();
    }
  });

  it('maps suite groups to the existing fail-closed production global names', () => {
    const suite = createKonveyorNodeMaterialFactorySuite({}, { skyFog: {} });
    const globals = createKonveyorNodeMaterialFactoryGlobals(suite);

    expect(globals).toEqual({
      __sdsKonveyorAtmosphereMaterialFactories: suite.atmosphere,
      __sdsKonveyorEffectMaterialFactories: suite.effects,
      __sdsKonveyorMaterialFactories: suite.treeRock,
      __sdsKonveyorGrassMaterialFactories: suite.grass,
      __sdsKonveyorWaterMaterialFactories: suite.water,
      __sdsKonveyorTerrainMaterialFactories: suite.terrain,
      __sdsKonveyorSheepMaterialFactories: suite.sheep,
      __sdsKonveyorImpostorMaterialFactories: suite.impostor,
    });
  });

  it('summarizes grouped factory supply for browser runtime evidence', () => {
    const suite = createKonveyorNodeMaterialFactorySuite({}, { skyFog: {} });

    expect(summarizeKonveyorNodeMaterialFactorySuite(suite)).toEqual({
      source: 'konveyor-node-material-factory-suite',
      groupCount: 8,
      factoryCount: 18,
      groups: {
        atmosphere: [
          'createCloudLayerMaterial',
          'createSkyDomeMaterial',
        ],
        effects: [
          'createCorralZapBoltMaterial',
          'createCorralZapParticleMaterial',
          'createPortalPadMaterial',
          'createPortalParticleMaterial',
          'createPortalRingMaterial',
          'createSunBillboardMaterial',
        ],
        treeRock: [
          'createRockMaterial',
          'createTreeBranchMaterial',
          'createTreeLeafMaterial',
        ],
        grass: [
          'createGrassBladeMaterial',
          'createMeadowQuadMaterial',
        ],
        water: ['createAnimeWaterMaterial'],
        terrain: ['createTerrainMaterial'],
        sheep: [
          'createSheepMaterial',
          'createSheepPartMaterial',
        ],
        impostor: ['createKilnImpostorMaterial'],
      },
    });
  });

  it('lets production adapters consume the suite through those globals under explicit flags', () => {
    const skyFog = createSkyFogSamplePacket();
    const heightTexture = createHeightTexture();
    const albedoAtlas = new THREE.Texture();
    const normalAtlas = new THREE.Texture();
    const depthAtlas = new THREE.Texture();
    const suite = createKonveyorNodeMaterialFactorySuite(WEBGPU, {
      skyFog,
      grass: {
        fogColor: skyFog.fogColor,
        fogNear: skyFog.fogNear,
        fogFar: skyFog.fogFar,
      },
      water: {
        fogColor: skyFog.fogColor,
        sunColor: skyFog.sunColor,
      },
      terrain: {
        fogColor: skyFog.fogColor,
      },
    });
    const search = '?renderer=webgpu&konveyorAtmosphere=1&konveyorEffects=1&konveyorMaterials=1&konveyorGrass=1&konveyorWater=1&konveyorTerrain=1&konveyorSheep=1&konveyorImpostors=1';
    const windowValue = {
      location: { search },
      ...createKonveyorNodeMaterialFactoryGlobals(suite),
    };
    const tree = root(mesh('branches'), mesh('leaves'));
    const rock = root(mesh(''));
    const materials = [];

    try {
      withWindow(windowValue, () => {
        materials.push(createKonveyorAtmosphereMaterial('sky-dome', 'createSkyDomeMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-sky'),
        }).material);
        materials.push(createKonveyorEffectMaterial('sun-billboard', 'createSunBillboardMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-sun'),
        }).material);
        materials.push(createKonveyorGrassMaterial('meadow-quad', 'createMeadowQuadMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-meadow'),
        }).material);
        materials.push(createKonveyorWaterMaterial('anime-water', 'createAnimeWaterMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-water'),
          context: { heightTexture },
        }).material);
        materials.push(createKonveyorTerrainMaterial('terrain-ground', 'createTerrainMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-terrain'),
          context: { heightTexture },
        }).material);
        materials.push(createKonveyorSheepMaterial('sheep-wool', 'createSheepMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-sheep'),
          context: { fogColor: skyFog.fogColor },
        }).material);
        materials.push(createKonveyorImpostorMaterial('kiln-impostor', 'createKilnImpostorMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-impostor'),
          context: {
            albedoAtlas,
            normalAtlas,
            depthAtlas,
            fogColor: skyFog.fogColor,
          },
        }).material);

        const summary = maybeApplyKonveyorTreeRockMaterials({
          models: {
            trees: { tree1: tree },
            treesLod1: {},
            rocks: { rock1: rock },
          },
        });
        expect(summary).toMatchObject({
          applied: true,
          ok: true,
          treeReplacedMaterials: 2,
          rockReplacedMaterials: 1,
        });
      });

      expect(materials.map((material) => material.name)).toEqual([
        'konveyor-node-sky-dome',
        'konveyor-node-sun-billboard',
        'konveyor-node-meadow-quad',
        'konveyor-node-anime-water',
        'konveyor-node-terrain-heightfield',
        'konveyor-node-sheep-wool',
        'konveyor-node-kiln-impostor',
      ]);
      expect(materials.every((material) => material.isNodeMaterial)).toBe(true);
      expect(tree.children.map((child) => child.material.name)).toEqual([
        'konveyor-node-branches',
        'konveyor-node-leaves',
      ]);
      expect(rock.children[0].material.name).toBe('konveyor-node-rock-rim');
    } finally {
      materials.forEach((material) => material?.dispose?.());
      tree.children.forEach((child) => child.material?.dispose?.());
      rock.children.forEach((child) => child.material?.dispose?.());
      heightTexture.dispose();
      albedoAtlas.dispose();
      normalAtlas.dispose();
      depthAtlas.dispose();
    }
  });
});
