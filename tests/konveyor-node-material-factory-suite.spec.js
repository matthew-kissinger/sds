import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as WEBGPU from 'three/webgpu';

import { createSkyFogSamplePacket } from '../js/atmosphere/skyFogSamplePacket.js';
import { createKonveyorNodeMaterialFactorySuite } from '../js/konveyorNodeMaterialFactorySuite.js';

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
      suite.effects.createSunBillboardMaterial(),
      suite.effects.createPortalRingMaterial(),
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
      expect(materials[9].side).toBe(WEBGPU.DoubleSide);
      expect(materials[13].side).toBe(WEBGPU.DoubleSide);
    } finally {
      materials.forEach((material) => material?.dispose?.());
      heightTexture.dispose();
      albedoAtlas.dispose();
      normalAtlas.dispose();
      depthAtlas.dispose();
    }
  });
});
