// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as WEBGPU from 'three/webgpu';

import { CloudLayer } from '../js/atmosphere/CloudLayer.js';
import { HosekWilkieSky } from '../js/atmosphere/HosekWilkieSky.js';
import { createSkyFogSamplePacket } from '../js/atmosphere/skyFogSamplePacket.js';
import { CorralZapEffectPool } from '../js/effects/CorralZapEffect.js';
import { PortalEffect } from '../js/effects/PortalEffect.js';
import { SunBillboard } from '../js/effects/SunBillboard.js';
import { GrassSystem } from '../js/GrassSystem.js';
import { createKilnImpostorMaterial } from '../js/kiln-impostor-material.js';
import { createKonveyorNodeMaterialFactoryGlobals, createKonveyorNodeMaterialFactorySuite } from '../js/konveyorNodeMaterialFactorySuite.js';
import { OptimizedSheepSystem } from '../js/OptimizedSheep.js';
import { TerrainBuilder } from '../js/TerrainBuilder.js';
import { createAnimeWater } from '../js/water/AnimeWater.js';

const ALL_KONVEYOR_FLAGS = [
  'konveyorAtmosphere',
  'konveyorEffects',
  'konveyorMaterials',
  'konveyorGrass',
  'konveyorWater',
  'konveyorTerrain',
  'konveyorSheep',
  'konveyorImpostors',
];

function createHeightfield() {
  const width = 17;
  const height = 17;
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (i % width) / width;
  }
  return {
    width,
    height,
    worldSize: 400,
    peakHeight: 6,
    getRawArray: () => data,
    bakeMeshGrid: ({ segments }) => new Float32Array((segments + 1) * (segments + 1)),
  };
}

function createTexture(name) {
  const texture = new THREE.Texture();
  texture.name = name;
  return texture;
}

function createSidecar() {
  return {
    tilesX: 4,
    tilesY: 4,
    azimuths: [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5],
    elevations: [Math.PI * 0.35, Math.PI * 0.2, Math.PI * 0.05, -Math.PI * 0.1],
    tileSize: 512,
    atlasWidth: 2048,
    atlasHeight: 2048,
    bbox: {
      min: [-0.1, 0, -0.2],
      max: [0.3, 1.2, 0.4],
    },
    yOffset: 0.65,
  };
}

function createSearch() {
  const params = new URLSearchParams({ renderer: 'webgpu' });
  ALL_KONVEYOR_FLAGS.forEach((flag) => params.set(flag, '1'));
  return `?${params.toString()}`;
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

describe('konveyor factory suite production smoke', () => {
  it('routes production constructors through suite-backed globals only under explicit flags', () => {
    const skyFog = createSkyFogSamplePacket();
    const scene = new THREE.Scene();
    const heightfield = createHeightfield();
    const albedoAtlas = createTexture('albedo');
    const normalAtlas = createTexture('normal');
    const depthAtlas = createTexture('depth');
    const suite = createKonveyorNodeMaterialFactorySuite(WEBGPU, {
      skyFog,
      treeRock: {
        rockRim: {
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
    const windowValue = {
      location: { search: createSearch() },
      ...createKonveyorNodeMaterialFactoryGlobals(suite),
    };
    const created = {};

    try {
      withWindow(windowValue, () => {
        created.sky = new HosekWilkieSky();
        created.cloud = new CloudLayer();
        created.sun = new SunBillboard(scene);
        created.portal = new PortalEffect(scene, { x: 0, z: 0 }, 0);
        created.zap = new CorralZapEffectPool(scene);

        created.grass = new GrassSystem(scene);
        created.grassBladeMaterial = created.grass.createGrassMaterial();
        created.meadowMaterial = created.grass.createMeadowQuadMaterial();

        created.terrain = new TerrainBuilder(scene);
        created.terrain.setHeightfield(heightfield);
        created.terrainMesh = created.terrain.createTerrain();

        created.water = createAnimeWater({
          boundary: {
            center: { x: 0, z: 0 },
            radius: 180,
            falloff: 40,
          },
          heightfield,
          segments: 1,
        });

        created.sheep = new OptimizedSheepSystem(scene, 1, {
          centerX: 0,
          centerZ: 0,
          spreadRadius: 1,
        });

        created.impostorMaterial = createKilnImpostorMaterial({
          albedoAtlas,
          normalAtlas,
          depthAtlas,
          sidecar: createSidecar(),
        });
      });

      expect(created.sky.material.name).toBe('konveyor-node-sky-dome');
      expect(created.cloud.material.name).toBe('konveyor-node-cloud-layer');
      expect(created.sun.material.name).toBe('konveyor-node-sun-billboard');
      expect(created.portal.ringMaterial.name).toBe('konveyor-node-portal-ring');
      expect(created.portal.pad.material.name).toBe('konveyor-node-portal-pad');
      expect(created.portal.particles.material.name).toBe('konveyor-node-portal-particles');
      expect(created.zap.effects[0].bolt.material.name).toBe('konveyor-node-corral-zap-bolt');
      expect(created.zap.effects[0].particles.material.name).toBe('konveyor-node-corral-zap-particles');
      expect(created.grassBladeMaterial.name).toBe('konveyor-node-grass-blade');
      expect(created.meadowMaterial.name).toBe('konveyor-node-meadow-quad');
      expect(created.terrainMesh.material.name).toBe('konveyor-node-terrain-heightfield');
      expect(created.water.material.name).toBe('konveyor-node-anime-water');
      expect(created.sheep.material.name).toBe('konveyor-node-sheep-wool');
      expect(created.impostorMaterial.name).toBe('konveyor-node-kiln-impostor');
      expect(created.cloud.konveyorMaterialSummary).toMatchObject({ applied: true });
      expect(created.sun.konveyorMaterialSummary).toMatchObject({ applied: true });
      expect(created.portal.konveyorRingMaterialSummary).toMatchObject({ applied: true });
      expect(created.portal.konveyorPadMaterialSummary).toMatchObject({ applied: true });
      expect(created.portal.konveyorParticleMaterialSummary).toMatchObject({ applied: true });
      expect(created.zap.effects[0].konveyorBoltMaterialSummary).toMatchObject({ applied: true });
      expect(created.zap.effects[0].konveyorParticleMaterialSummary).toMatchObject({ applied: true });
      expect(created.grass.konveyorGrassBladeMaterialSummary).toMatchObject({ applied: true });
      expect(created.grass.konveyorMeadowQuadMaterialSummary).toMatchObject({ applied: true });
      expect(created.terrain.konveyorTerrainMaterialSummary).toMatchObject({ applied: true });
      expect(created.water.konveyorWaterMaterialSummary).toMatchObject({ applied: true });
      expect(created.sheep.konveyorSheepMaterialSummary).toMatchObject({ applied: true });
      expect(created.impostorMaterial.userData.konveyorImpostorMaterialSummary).toMatchObject({ applied: true });
    } finally {
      created.sky?.dispose?.();
      created.cloud?.dispose?.();
      created.sun?.dispose?.();
      created.portal?.dispose?.();
      created.zap?.dispose?.();
      created.grassBladeMaterial?.dispose?.();
      created.meadowMaterial?.dispose?.();
      created.terrain?.dispose?.();
      created.water?.dispose?.();
      created.sheep?.dispose?.();
      created.impostorMaterial?.dispose?.();
      albedoAtlas.dispose();
      normalAtlas.dispose();
      depthAtlas.dispose();
    }
  });
});
