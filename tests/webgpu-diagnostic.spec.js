import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as WEBGPU from 'three/webgpu';

import {
  computeKilnDiagnosticTileBlend,
  createAnimeWaterDiagnosticState,
  createGrassBladeDiagnosticState,
  createKilnImpostorDiagnosticState,
  createMeadowQuadDiagnosticState,
  createProductionAtmosphereAdapterDiagnosticProof,
  createRockRimDiagnosticState,
  createSceneBoundSkyFogDiagnosticState,
  createSheepWoolDiagnosticState,
  createSkyFogDiagnosticState,
  createTerrainHeightfieldDiagnosticState,
  createTreeLeafDiagnosticState,
  resolveDiagnosticScene,
  resolveDiagnosticSkyPreset,
} from '../js/diagnostics/webgpuDiagnostic.js';
import {
  replaceRockMaterialsByTraversal,
  replaceTreeMaterialsByName,
} from '../js/diagnostics/webgpuMaterialReplacement.js';
import {
  createGlbMaterialReplacementProof,
  createRuntimeGlbMaterialReplacementProof,
  parseGlbJson,
  RUNTIME_GLB_MATERIAL_PROOF_ASSETS,
} from '../js/diagnostics/webgpuGlbMaterialProof.js';
import { RUNTIME_GLB_RENDER_PREVIEW_ASSETS } from '../js/diagnostics/webgpuRuntimeGlbPreview.js';
import { createSkyFogSamplePacket } from '../js/atmosphere/skyFogSamplePacket.js';
import { WATER_PALETTE_RGB, mixWaterBaseColor } from '../js/water/AnimeWater.js';
import { createProductionTreePlacementPlan } from '../js/diagnostics/webgpuProductionPlacementPlan.js';
import { createDiagnosticRockPlacementPlan } from '../js/diagnostics/webgpuRockPlacementPlan.js';
import { HosekWilkieSky } from '../js/atmosphere/HosekWilkieSky.js';
import { SKY_PRESETS, getRequiredPresetNames } from '../js/atmosphere/skyPresets.js';
import { createKonveyorNodeMaterialFactorySuite } from '../js/konveyorNodeMaterialFactorySuite.js';

function createGlbBuffer(gltf) {
  const json = JSON.stringify(gltf);
  const jsonBytes = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, ' '));
  const buffer = new ArrayBuffer(12 + 8 + jsonBytes.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20).set(jsonBytes);
  return buffer;
}

describe('webgpu diagnostic sky fog state', () => {
  it('keeps fog color derived from the CPU horizon sample', () => {
    const state = createSkyFogDiagnosticState();
    expect(state.source).toBe('HosekWilkieSky.cpu-lut');
    expect(state.presetName).toBe('dusk');
    expect(state.cpuVisible).toBe(true);
    expect(state.horizonColor).toHaveLength(3);
    expect(state.sunColor).toHaveLength(3);
    expect(state.sunDirection).toHaveLength(3);
    expect(state.fogColor).toEqual(
      state.horizonColor.map((v) => Number((v * state.fogDarkenMultiplier).toFixed(4)))
    );
    expect(state.fogNear).toBeLessThan(state.fogFar);
  });

  it('samples diagnostic sky colors from the production Hosek-Wilkie LUT', () => {
    const state = createSkyFogSamplePacket();
    const sky = new HosekWilkieSky({ createRenderable: false });
    try {
      sky.applyPreset(SKY_PRESETS[state.presetName]);
      sky.setCloudCoverage(SKY_PRESETS[state.presetName].cloudCoverageDefault ?? 0);
      if (SKY_PRESETS[state.presetName].cloudScaleMetersPerFeature !== undefined) {
        sky.setCloudFeatureScaleMeters(SKY_PRESETS[state.presetName].cloudScaleMetersPerFeature);
      }
      sky.update(0, sky.getSunDirection());
      expect(state.horizonColor).toEqual(
        sky.getHorizon(new THREE.Color()).toArray().map((value) => Number(value.toFixed(4)))
      );
      expect(state.zenithColor).toEqual(
        sky.getZenith(new THREE.Color()).toArray().map((value) => Number(value.toFixed(4)))
      );
      expect(state.sunColor).toEqual(
        sky.getSun(new THREE.Color()).toArray().map((value) => Number(value.toFixed(4)))
      );
    } finally {
      sky.dispose();
    }
  });

  it('resolves every shipped preset for the WebGPU diagnostic sky matrix', () => {
    for (const presetName of getRequiredPresetNames()) {
      const resolved = resolveDiagnosticSkyPreset(`?renderer=webgpu&diagnostic=1&konveyorSkyPreset=${presetName}`);
      const state = createSkyFogDiagnosticState({ presetName: resolved.presetName });

      expect(resolved).toEqual({
        requestedPresetName: presetName,
        presetName,
        fallbackReason: null,
      });
      expect(state.presetName).toBe(presetName);
      expect(state.source).toBe('HosekWilkieSky.cpu-lut');
      expect(state.fogNear).toBeLessThan(state.fogFar);
    }
  });

  it('falls back to dusk for unknown diagnostic sky presets', () => {
    const resolved = resolveDiagnosticSkyPreset('?renderer=webgpu&diagnostic=1&konveyorSkyPreset=not-a-sky');
    const state = createSkyFogDiagnosticState({ presetName: resolved.presetName });

    expect(resolved).toEqual({
      requestedPresetName: 'not-a-sky',
      presetName: 'dusk',
      fallbackReason: 'unknown-preset',
    });
    expect(state.presetName).toBe('dusk');
  });

  it('binds diagnostic sky fog to shipped scene definitions when requested', () => {
    const scene = resolveDiagnosticScene('?renderer=webgpu&diagnostic=1&konveyorScene=open-country');
    const resolved = resolveDiagnosticSkyPreset('?renderer=webgpu&diagnostic=1&konveyorScene=open-country', scene.skyPresetName);
    const state = createSceneBoundSkyFogDiagnosticState({
      ...scene,
      skyPresetName: resolved.presetName,
    });

    expect(scene).toMatchObject({
      active: true,
      requestedSceneId: 'open-country',
      sceneId: 'open-country',
      skyPresetName: 'golden-hour',
      fallbackReason: null,
    });
    expect(resolved).toEqual({
      requestedPresetName: 'golden-hour',
      presetName: 'golden-hour',
      fallbackReason: null,
    });
    expect(state.presetName).toBe('golden-hour');
    expect(state.fogDarkenMultiplier).toBe(1.0);
    expect(state.fogNear).toBe(350);
    expect(state.fogFar).toBe(900);
    expect(state.fogColor).toEqual(state.horizonColor);
  });

  it('routes production Atmosphere constructors through WebGPU node factories in the diagnostic proof', () => {
    const sceneBinding = resolveDiagnosticScene('?renderer=webgpu&diagnostic=1&konveyorScene=field');
    const skyFog = createSceneBoundSkyFogDiagnosticState(sceneBinding);
    const webGpuModules = {
      MeshBasicNodeMaterial: WEBGPU.MeshBasicNodeMaterial,
      MeshLambertNodeMaterial: WEBGPU.MeshLambertNodeMaterial,
      MeshStandardNodeMaterial: WEBGPU.MeshStandardNodeMaterial,
      AdditiveBlending: WEBGPU.AdditiveBlending,
      BackSide: WEBGPU.BackSide,
      DoubleSide: WEBGPU.DoubleSide,
      TSL: WEBGPU.TSL,
    };
    const suite = createKonveyorNodeMaterialFactorySuite(webGpuModules, { skyFog });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0.2, 3);
    const { atmosphere, proof } = createProductionAtmosphereAdapterDiagnosticProof({
      scene,
      camera,
      sceneBinding,
      skyFog,
      atmosphereFactories: suite.atmosphere,
      webGpuModules,
    });

    try {
      expect(proof.ok).toBe(true);
      expect(proof.sky.materialName).toBe('konveyor-node-sky-dome');
      expect(proof.cloud.materialName).toBe('konveyor-node-cloud-layer');
      expect(proof.sky.summary).toMatchObject({ kind: 'sky-dome', applied: true });
      expect(proof.cloud.summary).toMatchObject({ kind: 'cloud-layer', applied: true });
      expect(proof.fog).toMatchObject({ kind: 'Fog', near: 350, far: 900 });
      expect(proof.fog.color).toEqual(skyFog.fogColor);
      expect(scene.children).toContain(atmosphere.sky.getMesh());
      expect(scene.children).toContain(atmosphere.cloudLayer.getMesh());
    } finally {
      atmosphere.dispose();
    }
  });

  it('falls back to the default scene for unknown diagnostic scene bindings', () => {
    const scene = resolveDiagnosticScene('?renderer=webgpu&diagnostic=1&konveyorScene=missing');

    expect(scene).toMatchObject({
      active: true,
      requestedSceneId: 'missing',
      sceneId: 'rolling-hills',
      skyPresetName: 'dusk',
      fallbackReason: 'unknown-scene',
    });
  });

  it('drives the diagnostic rock rim from the CPU sun color packet', () => {
    const skyFog = createSkyFogDiagnosticState();
    const rockRim = createRockRimDiagnosticState(skyFog);
    expect(rockRim.rimColor).toBe(skyFog.sunColor);
    expect(rockRim.sunColorSource).toBe('skyFog.sunColor');
    expect(rockRim.rimStrength).toBeGreaterThan(0);
    expect(rockRim.rimPower).toBeGreaterThan(1);
  });

  it('keeps the meadow quad diagnostic tied to production far-ring color and fog inputs', () => {
    const skyFog = createSkyFogDiagnosticState();
    const meadowQuad = createMeadowQuadDiagnosticState(skyFog);

    expect(meadowQuad.source).toBe('GrassSystem.createMeadowQuadMaterial');
    expect(meadowQuad.baseColor).toEqual([0.08, 0.28, 0.04]);
    expect(meadowQuad.midColor).toEqual([0.18, 0.48, 0.12]);
    expect(meadowQuad.tipColor).toEqual([0.55, 0.82, 0.30]);
    expect(meadowQuad.uvCellsPerChunk).toBe(5.0);
    expect(meadowQuad.noiseHashVector).toEqual([127.1, 311.7]);
    expect(meadowQuad.noiseOctaves).toEqual([1, 2]);
    expect(meadowQuad.fogColor).toBe(skyFog.fogColor);
    expect(meadowQuad.fogNear).toBe(skyFog.fogNear);
    expect(meadowQuad.fogFar).toBe(skyFog.fogFar);
    expect(meadowQuad.farRingLod).toBe('meadow-quad');
  });

  it('keeps anime water diagnostic inputs tied to production palette and atmosphere packet', () => {
    const skyFog = createSkyFogDiagnosticState();
    const water = createAnimeWaterDiagnosticState(skyFog);
    const normalize = (rgb) => rgb.map((channel) => Number((channel / 255).toFixed(4)));

    expect(water.shallowColor).toEqual(normalize(WATER_PALETTE_RGB.shallow));
    expect(water.deepColor).toEqual(normalize(WATER_PALETTE_RGB.deep));
    expect(water.foamColor).toEqual(normalize(WATER_PALETTE_RGB.foam));
    expect(water.nearShoreColor).toEqual(normalize(mixWaterBaseColor(0)));
    expect(water.farWaterColor).toEqual(normalize(mixWaterBaseColor(1)));
    expect(water.fogColor).toBe(skyFog.fogColor);
    expect(water.sunColor).toBe(skyFog.sunColor);
    expect(water.sunDirection).toBe(skyFog.sunDirection);
    expect(water.heightfieldSampling).toBe('diagnostic-data-texture');
    expect(water.heightfieldTexture).toEqual({
      sceneId: 'rolling-hills',
      source: '/terrain/rolling-hills.bin',
      format: 'RedFormat/FloatType',
      size: [1024, 1024],
      sampler: 'nearest-clamp',
      worldSize: 500,
      peakHeight: 6,
      waterY: -0.05,
    });
  });

  it('keeps terrain heightfield diagnostic inputs tied to the real island heightfield packet', () => {
    const skyFog = createSkyFogDiagnosticState();
    const terrain = createTerrainHeightfieldDiagnosticState(skyFog);

    expect(terrain).toMatchObject({
      source: '/terrain/rolling-hills.bin',
      sceneId: 'rolling-hills',
      size: [1024, 1024],
      worldSize: 500,
      peakHeight: 6,
      heightfieldSampling: 'diagnostic-data-texture',
    });
    expect(terrain.fogColor).toBe(skyFog.fogColor);
  });

  it('keeps the tree leaf diagnostic scoped to wind and occluder inputs', () => {
    const treeLeaf = createTreeLeafDiagnosticState();
    expect(treeLeaf.windDirection).toHaveLength(2);
    expect(treeLeaf.windStrength).toBeGreaterThan(0);
    expect(treeLeaf.treeBaseY).toBeLessThan(treeLeaf.treeTopY);
    expect(treeLeaf.alphaHash).toBe(true);
    expect(treeLeaf.occluderStrength).toBeGreaterThan(0);
    expect(treeLeaf.occluderPeak).toBeGreaterThan(0);
  });

  it('keeps the grass blade diagnostic tied to production grass defaults and sky fog', () => {
    const skyFog = createSkyFogDiagnosticState();
    const grassBlade = createGrassBladeDiagnosticState(skyFog);

    expect(grassBlade.source).toBe('GrassSystem.shader-contract');
    expect(grassBlade.baseColor).toEqual([0.08, 0.28, 0.04]);
    expect(grassBlade.midColor).toEqual([0.18, 0.48, 0.12]);
    expect(grassBlade.tipColor).toEqual([0.55, 0.82, 0.30]);
    expect(grassBlade.windDirection).toEqual([0.7, 0.7]);
    expect(grassBlade.windStrength).toBe(0.12);
    expect(grassBlade.windSpeed).toBe(0.6);
    expect(grassBlade.gustStrength).toBe(0.05);
    expect(grassBlade.grassFadeStart).toBe(70);
    expect(grassBlade.grassFadeEnd).toBe(260);
    expect(grassBlade.grassFadeStart).toBeLessThan(grassBlade.grassFadeEnd);
    expect(grassBlade.sunColor).toBe(skyFog.sunColor);
    expect(grassBlade.sunDirection).toBe(skyFog.sunDirection);
    expect(grassBlade.fogColor).toBe(skyFog.fogColor);
    expect(grassBlade.fogNear).toBe(skyFog.fogNear);
    expect(grassBlade.fogFar).toBe(skyFog.fogFar);
    expect(grassBlade.alphaHash).toBe(true);
    expect(grassBlade.interaction).toBe('deferred');
    expect(grassBlade.distanceFade).toBe('diagnostic-smooth-opacity-proxy');
    expect(grassBlade.productionDistanceFade).toBe('GrassSystem stochastic blade dither');
  });

  it('keeps the sheep wool diagnostic tied to production sheep shader inputs', () => {
    const skyFog = createSkyFogDiagnosticState();
    const sheepWool = createSheepWoolDiagnosticState(skyFog);

    expect(sheepWool.source).toBe('OptimizedSheep.shader-contract');
    expect(sheepWool.bodyColor).toEqual([1.0, 1.0, 1.0]);
    expect(sheepWool.faceColor).toEqual([0.22, 0.20, 0.18]);
    expect(sheepWool.hoofColor).toEqual([0.16, 0.16, 0.16]);
    expect(sheepWool.lightDirection).toEqual([0.3, 1.0, 0.5]);
    expect(sheepWool.woolNoiseScale).toBe(6.0);
    expect(sheepWool.woolDisplacementStrength).toBeGreaterThan(0);
    expect(sheepWool.breathingStrength).toBeGreaterThan(0);
    expect(sheepWool.fogColor).toBe(skyFog.fogColor);
    expect(sheepWool.fogNear).toBe(skyFog.fogNear);
    expect(sheepWool.fogFar).toBe(skyFog.fogFar);
    expect(sheepWool.instancing).toBe('deferred');
    expect(sheepWool.animationAttributes).toEqual(['instanceData', 'instanceAnimation', 'vertexId']);
  });

  it('keeps the kiln impostor diagnostic tied to the sidecar atlas contract', () => {
    const skyFog = createSkyFogDiagnosticState();
    const sidecar = {
      tilesX: 4,
      tilesY: 4,
      tileSize: 512,
      atlasWidth: 2048,
      atlasHeight: 2048,
      worldSize: 1,
      yOffset: 0.5,
      colorLayer: 'baseColor',
      normalSpace: 'capture-view',
      auxLayers: ['albedo', 'normal', 'depth'],
      edgeBleedPx: 2,
      azimuths: [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5],
      elevations: [85 * Math.PI / 180, 60 * Math.PI / 180, 30 * Math.PI / 180, 5 * Math.PI / 180],
    };
    const kiln = createKilnImpostorDiagnosticState(skyFog, sidecar);
    const expectedBlend = computeKilnDiagnosticTileBlend(sidecar);

    expect(kiln.source).toBe('Kiln.impostor-sidecar-contract');
    expect(kiln.treeType).toBe('tree1');
    expect(kiln.tilesX).toBe(4);
    expect(kiln.tilesY).toBe(4);
    expect(kiln.tileSize).toBe(512);
    expect(kiln.atlasSize).toEqual([2048, 2048]);
    expect(kiln.colorLayer).toBe('baseColor');
    expect(kiln.normalSpace).toBe('capture-view');
    expect(kiln.auxLayers).toEqual(['albedo', 'normal', 'depth']);
    expect(kiln.edgeBleedPx).toBe(2);
    expect(kiln.sunColor).toBe(skyFog.sunColor);
    expect(kiln.sunDirection).toBe(skyFog.sunDirection);
    expect(kiln.ambientColor).toHaveLength(3);
    expect(kiln.tileBlendTiles).toEqual(expectedBlend.tiles);
    expect(kiln.tileBlendWeights).toEqual(expectedBlend.weights);
    expect(kiln.fogColor).toBe(skyFog.fogColor);
    expect(kiln.atlasSampling).toBe('three-tile-albedo-normal');
    expect(kiln.tileBlend).toBe('view-derived-three-tile-premultiplied');
    expect(kiln.viewDrivenTileSelection).toBe('cpu-diagnostic-sample');
    expect(kiln.relighting).toBe('single-tile-normal-aux');
    expect(kiln.depthAuxUse).toBe('rgba-depth-sample-shading-proxy');
    expect(kiln.depthAuxPacking).toBe('RGBADepthPacking');
    expect(kiln.parallax).toBe('deferred');
    expect(kiln.depthDiscard).toBe('deferred');
    expect(kiln.productionLod).toBe('deferred');
  });

  it('derives the diagnostic kiln tile triad from sidecar azimuth and elevation rows', () => {
    const blend = computeKilnDiagnosticTileBlend({
      tilesX: 4,
      elevations: [85 * Math.PI / 180, 60 * Math.PI / 180, 30 * Math.PI / 180, 5 * Math.PI / 180],
    }, [1, 0.3, 1]);

    expect(blend.tiles).toEqual([[1, 2], [1, 3], [0, 3]]);
    expect(blend.weights[0]).toBeCloseTo(0.2791, 4);
    expect(blend.weights[1]).toBeCloseTo(0.2209, 4);
    expect(blend.weights[2]).toBe(0.5);
    expect(blend.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 4);
  });
});

describe('webgpu diagnostic material replacement strategy', () => {
  it('replaces tree materials by stable GLB material names', () => {
    const meshes = [
      { isMesh: true, material: { name: 'branches' } },
      { isMesh: true, material: { name: 'leaves' } },
      { isMesh: true, material: { name: 'bystander' } },
    ];
    const root = {
      traverse(visitor) {
        meshes.forEach(visitor);
      },
    };

    const result = replaceTreeMaterialsByName(root, {
      branches: () => ({ name: 'node-branches' }),
      leaves: () => ({ name: 'node-leaves' }),
    });

    expect(meshes[0].material.name).toBe('node-branches');
    expect(meshes[1].material.name).toBe('node-leaves');
    expect(meshes[2].material.name).toBe('bystander');
    expect(result).toMatchObject({
      strategy: 'material-name',
      targetNames: ['branches', 'leaves'],
      seenNames: ['branches', 'bystander', 'leaves'],
      missingTargets: [],
      visitedMeshes: 3,
      replacedMaterials: 2,
    });
  });

  it('replaces unnamed rock materials by mesh traversal', () => {
    const rock = {
      isMesh: true,
      material: { name: '' },
    };

    const result = replaceRockMaterialsByTraversal(rock, () => ({ name: 'node-rock-rim' }));

    expect(rock.material.name).toBe('node-rock-rim');
    expect(result).toEqual({
      strategy: 'asset-class-traversal',
      visitedMeshes: 1,
      replacedMaterials: 1,
      previousMaterialNames: ['(runtime-default)'],
    });
  });
});

describe('webgpu runtime glb material proof', () => {
  it('parses the JSON chunk from a GLB payload', () => {
    const buffer = createGlbBuffer({ asset: { version: '2.0' }, materials: [{ name: 'leaves' }] });

    expect(parseGlbJson(buffer)).toEqual({
      asset: { version: '2.0' },
      materials: [{ name: 'leaves' }],
    });
  });

  it('applies tree replacement to gltf primitive material names', () => {
    const proof = createGlbMaterialReplacementProof(
      { group: 'tree-lod0', role: 'tree', path: 'tree.glb' },
      {
        materials: [{ name: 'branches' }, { name: 'leaves' }],
        meshes: [{ primitives: [{ material: 0 }, { material: 1 }] }],
      }
    );

    expect(proof.replacement.missingTargets).toEqual([]);
    expect(proof.afterMaterialNames).toEqual(['konveyor-node-branches', 'konveyor-node-leaves']);
    expect(proof.nodeMaterialCount).toBe(2);
  });

  it('applies rock replacement when primitives have no material index', () => {
    const proof = createGlbMaterialReplacementProof(
      { group: 'rock-lod0', role: 'rock', path: 'rock.glb' },
      { meshes: [{ primitives: [{}] }] }
    );

    expect(proof.beforeMaterialNames).toEqual(['(runtime-default)']);
    expect(proof.afterMaterialNames).toEqual(['konveyor-node-rock-rim']);
    expect(proof.nodeMaterialCount).toBe(1);
  });

  it('summarizes fetched runtime GLB material replacement contracts', async () => {
    const payloads = new Map(RUNTIME_GLB_MATERIAL_PROOF_ASSETS.map((asset) => {
      const gltf = asset.role === 'tree'
        ? {
          materials: [{ name: 'branches' }, { name: 'leaves' }],
          meshes: [{ primitives: [{ material: 0 }, { material: 1 }] }],
        }
        : { meshes: [{ primitives: [{}] }] };
      return [asset.path, createGlbBuffer(gltf)];
    }));

    const proof = await createRuntimeGlbMaterialReplacementProof(async (path) => ({
      ok: payloads.has(path),
      status: payloads.has(path) ? 200 : 404,
      arrayBuffer: async () => payloads.get(path),
    }));

    expect(proof.assets).toBe(7);
    expect(proof.summary).toMatchObject({
      ok: true,
      treeTargetsResolved: true,
      treeReplacedMaterials: 8,
      rockReplacedMaterials: 3,
      treeReplacementStrategy: 'material-name',
      rockReplacementStrategy: 'asset-class-traversal',
    });
  });

  it('renders only production GLBs covered by the runtime material proof', () => {
    const proofPaths = new Set(RUNTIME_GLB_MATERIAL_PROOF_ASSETS.map((asset) => asset.path));

    expect(RUNTIME_GLB_RENDER_PREVIEW_ASSETS).toHaveLength(RUNTIME_GLB_MATERIAL_PROOF_ASSETS.length);
    expect([...new Set(RUNTIME_GLB_RENDER_PREVIEW_ASSETS.map((asset) => asset.role).sort())]).toEqual(['rock', 'tree']);
    expect([...new Set(RUNTIME_GLB_RENDER_PREVIEW_ASSETS.map((asset) => asset.group).sort())]).toEqual(['rock-lod0', 'tree-lod0', 'tree-lod1']);
    expect(RUNTIME_GLB_RENDER_PREVIEW_ASSETS.every((asset) => proofPaths.has(asset.path))).toBe(true);
  });

  it('samples real scene tree placement data for the production placement preview', () => {
    const plan = createProductionTreePlacementPlan();

    expect(plan).toMatchObject({
      ok: true,
      sceneId: 'rolling-hills',
      source: 'shared/TreePlacement.generateTrees',
      rockExclusionMode: 'empty-rock-list',
    });
    expect(plan.generatedTrees).toBeGreaterThan(plan.sampledTrees);
    expect(plan.sampledTrees).toBe(8);
    expect(plan.types).toEqual(['tree1', 'tree2']);
    const counts = plan.samples.reduce((acc, sample) => ({
      ...acc,
      [sample.type]: (acc[sample.type] ?? 0) + 1,
    }), {});
    expect(counts).toEqual({ tree1: 4, tree2: 4 });
    expect(plan.samples.every((sample) => Number.isFinite(sample.production.x))).toBe(true);
    expect(plan.samples.every((sample) => Number.isFinite(sample.production.z))).toBe(true);
    expect(plan.samples.every((sample) => sample.production.scale > 0)).toBe(true);
  });

  it('records deterministic diagnostic rock placement transforms for native instancing', () => {
    const plan = createDiagnosticRockPlacementPlan();

    expect(plan).toMatchObject({
      ok: true,
      sceneId: 'field',
      source: 'diagnostic-rock-placement-generated-from-scene-zones',
      rng: 'mulberry32(sceneSeed + Rock)',
      productionReference: 'js/world/RockPlacement.js rockInstances transform contract',
      obstacleContract: 'recorded-only-not-wired-to-shared/SceneObstacles',
      sampledRocks: 6,
      types: ['rock1', 'rock2', 'rock3'],
    });
    expect(plan.generatedRocks).toBeGreaterThan(plan.sampledRocks);
    const counts = plan.samples.reduce((acc, sample) => ({
      ...acc,
      [sample.type]: (acc[sample.type] ?? 0) + 1,
    }), {});
    expect(counts).toEqual({ rock1: 2, rock2: 2, rock3: 2 });
    expect(plan.samples.every((sample) => Number.isFinite(sample.production.rotationY))).toBe(true);
    expect(plan.samples.every((sample) => sample.production.scale > 0)).toBe(true);
    expect(plan.samples.every((sample) => sample.production.scaleY === 0.7)).toBe(true);
    expect(plan.samples.every((sample) => sample.production.scaleZ === 1.2)).toBe(true);
  });
});
