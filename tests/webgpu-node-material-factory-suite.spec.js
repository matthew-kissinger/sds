// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as WEBGPU from 'three/webgpu';

import { createSkyFogSamplePacket } from '../js/atmosphere/skyFogSamplePacket.js';
import {
  createWebGpuNodeMaterialFactoryGlobals,
  createWebGpuNodeMaterialFactorySuite,
  summarizeWebGpuNodeMaterialFactorySuite,
} from '../js/webgpuNodeMaterialFactorySuite.js';
import { createWebGpuAtmosphereMaterial } from '../js/atmosphere/webgpuAtmosphereMaterialAdapter.js';
import { createWebGpuEffectMaterial } from '../js/effects/webgpuEffectMaterialAdapter.js';
import { createWebGpuImpostorMaterial } from '../js/webgpuImpostorMaterialAdapter.js';
import { createWebGpuSheepMaterial } from '../js/webgpuSheepMaterialAdapter.js';
import { createWebGpuGrassMaterial } from '../js/world/webgpuGrassMaterialAdapter.js';
import { maybeApplyWebGpuTreeRockMaterials } from '../js/world/webgpuMaterialAdapter.js';
import { createWebGpuTerrainMaterial } from '../js/world/webgpuTerrainMaterialAdapter.js';
import { createWebGpuWaterMaterial } from '../js/water/webgpuWaterMaterialAdapter.js';

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

describe('webgpu node material factory suite', () => {
  it('assembles every factory group from an already supplied module object', () => {
    const suite = createWebGpuNodeMaterialFactorySuite({}, { skyFog: {} });

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
    const source = readFileSync(new URL('../js/webgpuNodeMaterialFactorySuite.js', import.meta.url), 'utf8');

    expect(source).not.toContain('three/webgpu');
  });

  it('seeds grass factory fog from the scene sky-fog packet', () => {
    const skyFog = createSkyFogSamplePacket({ fogNear: 350, fogFar: 900 });
    const suite = createWebGpuNodeMaterialFactorySuite(WEBGPU, { skyFog });
    const material = suite.grass.createGrassBladeMaterial();

    try {
      expect(material.userData.webgpuGrassBladeFog).toEqual({
        color: skyFog.fogColor,
        near: 350,
        far: 900,
      });
    } finally {
      material.dispose();
    }
  });

  it('keeps low-sun WebGPU sky glow separate from the SunBillboard disc', () => {
    const skyFog = createSkyFogSamplePacket({ presetName: 'golden-hour' });
    const suite = createWebGpuNodeMaterialFactorySuite(WEBGPU, { skyFog });
    const sky = suite.atmosphere.createSkyDomeMaterial().material;
    const sun = suite.effects.createSunBillboardMaterial().material;

    try {
      expect(sky.userData.webgpuSkyPresetTuning).toMatchObject({
        presetName: 'golden-hour',
        sunGlowStrength: 0.58,
        sunDiscStrength: 0,
        sunDiscOwner: 'SunBillboard',
        aureoleColor: [0.92, 0.58, 0.26],
        sunMassStart: 0.982,
        sunMassEnd: 0.9992,
        sunMassPaintColor: [1.0, 0.60, 0.22],
        sunMassPaintStrength: 0.90,
      });
      expect(sun.userData.webgpuIntensityUniform.value).toBeCloseTo(1.04);
      expect(sun.userData.webgpuSunBillboardOwnership).toMatchObject({
        owns: 'disc-body-only',
        skyOwns: 'painted-sun-body-aureole-and-horizon-glow',
      });
    } finally {
      sky.dispose();
      sun.dispose();
    }
  });

  it('routes material creation through grouped reusable WebGPU factories', () => {
    const skyFog = createSkyFogSamplePacket();
    const heightTexture = createHeightTexture();
    const albedoAtlas = new THREE.Texture();
    const normalAtlas = new THREE.Texture();
    const depthAtlas = new THREE.Texture();
    const suite = createWebGpuNodeMaterialFactorySuite(WEBGPU, {
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
      suite.sheep.createSheepPartMaterial('webgpu-node-sheep-face', [0.22, 0.2, 0.18]),
      suite.impostor.createKilnImpostorMaterial({
        albedoAtlas,
        normalAtlas,
        depthAtlas,
        fogColor: skyFog.fogColor,
      }),
    ];

    try {
      expect(materials.map((material) => material.name)).toEqual([
        'webgpu-node-sky-dome',
        'webgpu-node-cloud-layer',
        'webgpu-node-sun-billboard',
        'webgpu-node-portal-ring',
        'webgpu-node-portal-pad',
        'webgpu-node-portal-particles',
        'webgpu-node-corral-zap-bolt',
        'webgpu-node-corral-zap-particles',
        'webgpu-node-branches',
        'webgpu-node-leaves',
        'webgpu-node-rock-rim',
        'webgpu-node-meadow-quad',
        'webgpu-node-grass-blade',
        'webgpu-node-anime-water',
        'webgpu-node-terrain-heightfield',
        'webgpu-node-sheep-wool',
        'webgpu-node-sheep-face',
        'webgpu-node-kiln-impostor',
      ]);
      expect(materials.every((material) => material.isNodeMaterial)).toBe(true);
      expect(materials[0].side).toBe(WEBGPU.BackSide);
      expect(materials[1].side).toBe(WEBGPU.DoubleSide);
      expect(materials[8].userData.webgpuUsesDistanceFog).toBe(true);
      expect(materials[9].userData.webgpuUsesDistanceFog).toBe(true);
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
    const suite = createWebGpuNodeMaterialFactorySuite({}, { skyFog: {} });
    const globals = createWebGpuNodeMaterialFactoryGlobals(suite);

    expect(globals).toEqual({
      __sdsWebGpuAtmosphereMaterialFactories: suite.atmosphere,
      __sdsWebGpuEffectMaterialFactories: suite.effects,
      __sdsWebGpuMaterialFactories: suite.treeRock,
      __sdsWebGpuGrassMaterialFactories: suite.grass,
      __sdsWebGpuWaterMaterialFactories: suite.water,
      __sdsWebGpuTerrainMaterialFactories: suite.terrain,
      __sdsWebGpuSheepMaterialFactories: suite.sheep,
      __sdsWebGpuImpostorMaterialFactories: suite.impostor,
    });
  });

  it('summarizes grouped factory supply for browser runtime evidence', () => {
    const suite = createWebGpuNodeMaterialFactorySuite({}, { skyFog: {} });

    expect(summarizeWebGpuNodeMaterialFactorySuite(suite)).toEqual({
      source: 'webgpu-node-material-factory-suite',
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
    const suite = createWebGpuNodeMaterialFactorySuite(WEBGPU, {
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
    const search = '?renderer=webgpu&webgpuAtmosphere=1&webgpuEffects=1&webgpuMaterials=1&webgpuGrass=1&webgpuWater=1&webgpuTerrain=1&webgpuSheep=1&webgpuImpostors=1';
    const windowValue = {
      location: { search },
      ...createWebGpuNodeMaterialFactoryGlobals(suite),
    };
    const tree = root(mesh('branches'), mesh('leaves'));
    const rock = root(mesh(''));
    const materials = [];

    try {
      withWindow(windowValue, () => {
        materials.push(createWebGpuAtmosphereMaterial('sky-dome', 'createSkyDomeMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-sky'),
        }).material);
        materials.push(createWebGpuEffectMaterial('sun-billboard', 'createSunBillboardMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-sun'),
        }).material);
        materials.push(createWebGpuGrassMaterial('meadow-quad', 'createMeadowQuadMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-meadow'),
        }).material);
        materials.push(createWebGpuWaterMaterial('anime-water', 'createAnimeWaterMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-water'),
          context: { heightTexture },
        }).material);
        materials.push(createWebGpuTerrainMaterial('terrain-ground', 'createTerrainMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-terrain'),
          context: { heightTexture },
        }).material);
        materials.push(createWebGpuSheepMaterial('sheep-wool', 'createSheepMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-sheep'),
          context: { fogColor: skyFog.fogColor },
        }).material);
        materials.push(createWebGpuImpostorMaterial('kiln-impostor', 'createKilnImpostorMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-impostor'),
          context: {
            albedoAtlas,
            normalAtlas,
            depthAtlas,
            fogColor: skyFog.fogColor,
          },
        }).material);

        const summary = maybeApplyWebGpuTreeRockMaterials({
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
        'webgpu-node-sky-dome',
        'webgpu-node-sun-billboard',
        'webgpu-node-meadow-quad',
        'webgpu-node-anime-water',
        'webgpu-node-terrain-heightfield',
        'webgpu-node-sheep-wool',
        'webgpu-node-kiln-impostor',
      ]);
      expect(materials.every((material) => material.isNodeMaterial)).toBe(true);
      expect(tree.children.map((child) => child.material.name)).toEqual([
        'webgpu-node-branches',
        'webgpu-node-leaves',
      ]);
      expect(rock.children[0].material.name).toBe('webgpu-node-rock-rim');
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
