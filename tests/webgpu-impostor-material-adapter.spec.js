// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DoubleSide, MeshBasicNodeMaterial, TSL } from 'three/webgpu';

import { createKilnImpostorMaterial } from '../js/kiln-impostor-material.js';
import { createWebGpuImpostorNodeMaterialFactories } from '../js/webgpuImpostorNodeMaterialFactories.js';
import {
  createWebGpuImpostorMaterial,
  shouldApplyWebGpuImpostors,
} from '../js/webgpuImpostorMaterialAdapter.js';
import {
  selectLatLonHemiYImpostorTiles,
  selectOctahedralImpostorTiles,
} from '../js/impostors/impostorTileSelection.js';
import { createImpostorOrbitLabReport } from '../js/impostors/impostorOrbitLab.js';
import { setImpostorTint } from '../js/world/shaderPatches.js';

function createTexture(name) {
  const texture = new THREE.Texture();
  texture.name = name;
  return texture;
}

function createSidecar() {
  return {
    tilesX: 4,
    tilesY: 4,
    layout: 'latlon',
    axis: 'hemi-y',
    hemi: true,
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

function createOctahedralSidecar() {
  return {
    version: 2,
    angles: 64,
    tilesX: 8,
    tilesY: 8,
    tileSize: 256,
    atlasWidth: 2048,
    atlasHeight: 2048,
    worldSize: 1.4,
    yOffset: 0.65,
    projection: 'orthographic',
    bbox: {
      min: [-0.1, 0, -0.2],
      max: [0.3, 1.2, 0.4],
    },
    source: {
      path: 'tree.glb',
      bytes: 1024,
      tris: 64,
    },
    auxLayers: ['albedo', 'normal', 'depth'],
    bgColor: 'transparent',
    colorLayer: 'baseColor',
    normalSpace: 'capture-view',
    edgeBleedPx: 2,
    textureColorSpace: 'srgb',
    axis: 'octahedral',
    hemi: false,
    layout: 'octahedral',
    directionEncoding: 'octahedral',
    directions: Array.from({ length: 64 }, () => [0, 1, 0]),
  };
}

function createParams(overrides = {}) {
  return {
    albedoAtlas: createTexture('albedo'),
    normalAtlas: createTexture('normal'),
    depthAtlas: createTexture('depth'),
    sidecar: createSidecar(),
    ...overrides,
  };
}

function createMaterial(name) {
  const material = new THREE.MeshBasicMaterial();
  material.name = name;
  return material;
}

describe('webgpu impostor material adapter', () => {
  it('requires the explicit WebGPU impostor flag', () => {
    expect(shouldApplyWebGpuImpostors('?renderer=webgpu&webgpuImpostors=1')).toBe(true);
    expect(shouldApplyWebGpuImpostors('?renderer=webgpu&diagnostic=1')).toBe(false);
    expect(shouldApplyWebGpuImpostors('?renderer=webgl&webgpuImpostors=1')).toBe(false);
    expect(shouldApplyWebGpuImpostors('')).toBe(false);
  });

  it('leaves the default Kiln impostor material untouched without flag and factories', () => {
    const params = createParams();
    const material = createKilnImpostorMaterial(params);

    try {
      expect(material.isShaderMaterial).toBe(true);
      expect(material.side).toBe(THREE.DoubleSide);
      expect(material.fog).toBe(true);
      expect(material.toneMapped).toBe(true);
      expect(material.uniforms.uAtlas.value).toBe(params.albedoAtlas);
      expect(material.uniforms.uNormal.value).toBe(params.normalAtlas);
      expect(material.uniforms.uDepth.value).toBe(params.depthAtlas);
      expect(material.uniforms.uTreeOriginObj.value.x).toBeCloseTo(0.1, 12);
      expect(material.uniforms.uTreeOriginObj.value.y).toBeCloseTo(0.65, 12);
      expect(material.uniforms.uTreeOriginObj.value.z).toBeCloseTo(0.1, 12);
      expect(material.userData.isKilnImpostor).toBe(true);
      expect(material.userData.sidecar).toBe(params.sidecar);
      expect(material.userData.webgpuImpostorMaterialSummary).toMatchObject({
        kind: 'kiln-impostor',
        applied: false,
        reason: 'flag-disabled',
      });
    } finally {
      material.dispose();
    }
  });

  it('routes Kiln impostor material creation through an explicit WebGPU factory', () => {
    const contexts = [];
    const params = createParams({
      search: '?renderer=webgpu&webgpuImpostors=1',
      webgpuImpostorFactories: {
        createKilnImpostorMaterial: (context) => {
          contexts.push(context);
          return createMaterial('webgpu-kiln-impostor');
        },
      },
    });
    const material = createKilnImpostorMaterial(params);

    try {
      expect(material.name).toBe('webgpu-kiln-impostor');
      expect(material.userData.isKilnImpostor).toBe(true);
      expect(material.userData.sidecar).toBe(params.sidecar);
      expect(material.userData.webgpuImpostorMaterialSummary).toMatchObject({
        kind: 'kiln-impostor',
        applied: true,
      });
      expect(contexts).toHaveLength(1);
      expect(contexts[0].albedoAtlas).toBe(params.albedoAtlas);
      expect(contexts[0].normalAtlas).toBe(params.normalAtlas);
      expect(contexts[0].depthAtlas).toBe(params.depthAtlas);
      expect(contexts[0].sidecar).toBe(params.sidecar);
      expect(contexts[0].layout).toMatchObject({
        layout: 'latlon',
        axis: 'hemi-y',
        version: 1,
        tilesX: 4,
        tilesY: 4,
        shaderTilesX: 4,
        shaderTilesY: 4,
        sidecarTilesX: 4,
        sidecarTilesY: 4,
        tileSize: 512,
        atlasSize: [2048, 2048],
      });
      expect(contexts[0].layout.azimuths).toHaveLength(4);
      expect(contexts[0].layout.elevations).toHaveLength(4);
      expect(contexts[0].lighting.sunDirection).toBeInstanceOf(THREE.Vector3);
      expect(contexts[0].lighting.sunColor).toBeInstanceOf(THREE.Color);
      expect(contexts[0].lighting.ambientColor).toBeInstanceOf(THREE.Color);
      expect(contexts[0].lighting.groundBounceColor).toBeInstanceOf(THREE.Color);
      expect(contexts[0].fog.color).toBeInstanceOf(THREE.Color);
      expect(contexts[0].fog.near).toBe(contexts[0].uniforms.fogNear.value);
      expect(contexts[0].fog.far).toBe(contexts[0].uniforms.fogFar.value);
      expect(contexts[0].origin.x).toBeCloseTo(0.1, 12);
      expect(contexts[0].origin.y).toBeCloseTo(0.65, 12);
      expect(contexts[0].origin.z).toBeCloseTo(0.1, 12);
      expect(contexts[0].material).toMatchObject({
        side: THREE.DoubleSide,
        transparent: false,
        depthWrite: true,
        depthTest: true,
        fog: true,
        toneMapped: true,
      });
      expect(contexts[0].tunables).toMatchObject({
        alphaTest: 0.3,
        alphaHashScale: 0.3,
        parallaxScale: 0,
        depthDiscardThreshold: 1,
      });
      expect(contexts[0].shaders.fragmentShader).toContain('kilnAlphaThreshold');
    } finally {
      material.dispose();
    }
  });

  it('can route Kiln impostors through the reusable WebGPU node material candidate', () => {
    const contexts = [];
    const nodeFactories = createWebGpuImpostorNodeMaterialFactories(
      { MeshBasicNodeMaterial, DoubleSide, TSL },
      {
        tileBlendTiles: [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
        tileBlendWeights: [0.45, 0.35, 0.2],
      }
    );
    const params = createParams({
      search: '?renderer=webgpu&webgpuImpostors=1',
      webgpuImpostorFactories: {
        createKilnImpostorMaterial: (context) => {
          contexts.push(context);
          return nodeFactories.createKilnImpostorMaterial(context);
        },
      },
    });

    const material = createKilnImpostorMaterial(params);
    try {
      expect(material.name).toBe('webgpu-node-kiln-impostor');
      expect(material.isNodeMaterial).toBe(true);
      expect(material.isMeshBasicNodeMaterial).toBe(true);
      expect(material.side).toBe(THREE.DoubleSide);
      expect(material.transparent).toBe(false);
      expect(material.depthWrite).toBe(true);
      expect(material.depthTest).toBe(true);
      expect(material.alphaHash).toBe(true);
      expect(material.alphaTest).toBe(0.3);
      expect(material.colorNode).toBeTruthy();
      expect(material.opacityNode).toBeTruthy();
      expect(material.userData.webgpuImpostorTileSelection).toMatchObject({
        mode: 'dynamic-uniform-lab',
        layout: 'latlon-hemi-y',
      });
      expect(material.userData.webgpuImpostorMaterialControlsSummary).toMatchObject({
        colorScale: 1,
        fogStrength: 0.62,
        foliageLightingFloor: [0.42, 0.46, 0.32],
      });
      expect(material.userData.webgpuImpostorMaterialControls?.setTileBlend).toBeTypeOf('function');
      expect(material.userData.isKilnImpostor).toBe(true);
      expect(material.userData.sidecar).toBe(params.sidecar);
      expect(material.userData.webgpuImpostorMaterialSummary).toMatchObject({
        kind: 'kiln-impostor',
        applied: true,
        hasControls: true,
      });
      expect(contexts).toHaveLength(1);
    } finally {
      material.dispose();
    }
  });

  it('can create a production WebGPU impostor material driven by instanced tile attributes', () => {
    const nodeFactories = createWebGpuImpostorNodeMaterialFactories(
      { MeshBasicNodeMaterial, DoubleSide, Vector2: THREE.Vector2, Vector3: THREE.Vector3, TSL },
      {}
    );
    const material = createKilnImpostorMaterial(createParams({
      search: '?renderer=webgpu&webgpuImpostors=1',
      tileSelectionMode: 'production-instanced-attributes',
      webgpuImpostorFactories: {
        createKilnImpostorMaterial: (context) => nodeFactories.createKilnImpostorMaterial(context),
      },
    }));

    try {
      expect(material.name).toBe('webgpu-node-kiln-impostor');
      expect(material.userData.webgpuImpostorTileSelection).toMatchObject({
        mode: 'production-instanced-attributes',
        source: 'instanced-attributes',
        layout: 'latlon-hemi-y',
      });
      const controls = material.userData.webgpuImpostorMaterialControls;
      expect(controls.setTileBlend({
        tiles: [[2, 1], [3, 1], [2, 2]],
        weights: [0.2, 0.3, 0.5],
      })).toBe(false);
      expect(controls.setTint).toBeTypeOf('function');
      expect(controls.nodes.tint.sunDirection.value).toBeInstanceOf(THREE.Vector3);
    } finally {
      material.dispose();
    }
  });

  it('routes v2 octahedral sidecars through the WebGPU node material layout metadata', () => {
    const nodeFactories = createWebGpuImpostorNodeMaterialFactories(
      { MeshBasicNodeMaterial, DoubleSide, Vector2: THREE.Vector2, Vector3: THREE.Vector3, TSL },
      {}
    );
    const sidecar = createOctahedralSidecar();
    const material = createKilnImpostorMaterial(createParams({
      sidecar,
      search: '?renderer=webgpu&webgpuImpostors=1',
      tileSelectionMode: 'production-instanced-attributes',
      webgpuImpostorFactories: {
        createKilnImpostorMaterial: (context) => {
          expect(context.layout).toMatchObject({
            layout: 'octahedral',
            axis: 'octahedral',
            version: 2,
            tilesX: 8,
            tilesY: 8,
            shaderTilesX: 4,
            shaderTilesY: 4,
          });
          return nodeFactories.createKilnImpostorMaterial(context);
        },
      },
    }));

    try {
      expect(material.name).toBe('webgpu-node-kiln-impostor');
      expect(material.userData.webgpuImpostorTileSelection).toMatchObject({
        mode: 'production-instanced-attributes',
        source: 'instanced-attributes',
        layout: 'octahedral',
        sidecarVersion: 2,
        tilesX: 8,
        tilesY: 8,
      });
    } finally {
      material.dispose();
    }
  });

  it('computes view-dependent impostor tile blends for the WebGPU lab path', () => {
    const sidecar = createSidecar();
    const forward = selectLatLonHemiYImpostorTiles({ x: 0, y: 0.2, z: 1 }, sidecar);
    const side = selectLatLonHemiYImpostorTiles({ x: 1, y: 0.2, z: 0 }, sidecar);
    const octa = selectOctahedralImpostorTiles({ x: 0.4, y: 0.8, z: 0.2 }, sidecar);

    expect(forward.layout).toBe('latlon-hemi-y');
    expect(forward.tiles).toHaveLength(3);
    expect(forward.weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 6);
    expect(side.tiles).not.toEqual(forward.tiles);
    expect(octa.layout).toBe('octahedral');
    expect(octa.tiles).toHaveLength(3);
    expect(octa.weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 6);
  });

  it('summarizes a one-tree impostor orbit lab without claiming production readiness', () => {
    const report = createImpostorOrbitLabReport({ sidecar: createSidecar() });

    expect(report.source).toBe('SDS WebGPU impostor orbit lab');
    expect(report.sidecarLayout).toBe('latlon-hemi-y');
    expect(report.productionReady).toBe(false);
    expect(report.productionBlockers).toContain('per-instance camera-driven tile selection');
    expect(report.layouts['latlon-hemi-y'].sampleCount).toBeGreaterThanOrEqual(8);
    expect(report.layouts['latlon-hemi-y'].uniqueDominantTileCount).toBeGreaterThanOrEqual(4);
    expect(report.layouts.octahedral.uniqueDominantTileCount).toBeGreaterThanOrEqual(4);
    expect(Object.values(report.checks).every(Boolean)).toBe(true);
  });

  it('updates WebGPU node impostor tile uniforms from a dynamic selection', () => {
    const nodeFactories = createWebGpuImpostorNodeMaterialFactories(
      { MeshBasicNodeMaterial, DoubleSide, Vector2: THREE.Vector2, TSL },
      {}
    );
    const material = createKilnImpostorMaterial(createParams({
      search: '?renderer=webgpu&webgpuImpostors=1',
      webgpuImpostorFactories: {
        createKilnImpostorMaterial: (context) => nodeFactories.createKilnImpostorMaterial(context),
      },
    }));

    try {
      const controls = material.userData.webgpuImpostorMaterialControls;
      const selection = selectLatLonHemiYImpostorTiles({ x: 1, y: 0.15, z: 0.2 }, createSidecar());
      controls.setTileBlend(selection);
      const nodes = controls.nodes;
      expect(nodes.tileWeights.map((node) => node.value)
        .reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 6);
      expect(nodes.tileOffsets[0].value.toArray()).toEqual([
        selection.tiles[0][0] / 4,
        (4 - 1 - selection.tiles[0][1]) / 4,
      ]);
    } finally {
      material.dispose();
    }
  });

  it('reports node impostor tint probes without assuming WebGL uniforms', () => {
    const nodeFactories = createWebGpuImpostorNodeMaterialFactories(
      { MeshBasicNodeMaterial, DoubleSide, TSL },
      {
        tileBlendTiles: [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
        tileBlendWeights: [0.45, 0.35, 0.2],
      }
    );
    const material = createKilnImpostorMaterial(createParams({
      search: '?renderer=webgpu&webgpuImpostors=1',
      webgpuImpostorFactories: {
        createKilnImpostorMaterial: (context) => nodeFactories.createKilnImpostorMaterial(context),
      },
    }));
    const previousWindow = globalThis.window;
    globalThis.window = {};

    try {
      expect(() => {
        setImpostorTint(
          // Cycle 91 Phase 4: the window debug tap is gated on the builder
          // _probeRender flag (per-frame probe rebuilds were production GC
          // churn); opt in here to exercise the reporting path.
          { _impostorMaterials: [material], _probeRender: true },
          new THREE.Color(1, 0.5, 0.25),
          new THREE.Vector3(0.1, 0.9, 0.2).normalize(),
          new THREE.Color(0.2, 0.3, 0.4),
          2,
          0.5
        );
      }).not.toThrow();
      expect(globalThis.window.__sdsImpostorProbe.live).toMatchObject({
        materialMode: 'node-material',
      });
      expect(globalThis.window.__sdsImpostorProbe.live.uSunColor).toBeUndefined();
    } finally {
      material.dispose();
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previousWindow;
      }
    }
  });

  it('lets factory controls own Kiln tint updates', () => {
    const calls = [];
    const material = createKilnImpostorMaterial(createParams({
      search: '?renderer=webgpu&webgpuImpostors=1',
      webgpuImpostorFactories: {
        createKilnImpostorMaterial: () => ({
          material: createMaterial('webgpu-kiln-controls'),
          controls: {
            setTint: (state) => calls.push(state),
          },
        }),
      },
    }));
    const sunColor = new THREE.Color(1, 0.5, 0.25);
    const sunDirWorld = new THREE.Vector3(0.1, 0.9, 0.2).normalize();
    const ambientColor = new THREE.Color(0.2, 0.3, 0.4);

    try {
      setImpostorTint({ _impostorMaterials: [material] }, sunColor, sunDirWorld, ambientColor, 2, 0.5);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        sunColor,
        sunDirWorld,
        ambientColor,
        sunIntensity: 2,
        ambientIntensity: 0.5,
        material,
      });
      expect(calls[0].groundBounceTilt).toBeInstanceOf(THREE.Color);
      expect(calls[0].groundBounceScale).toBe(0.5);
    } finally {
      material.dispose();
    }
  });

  it('does not assume WebGL tint uniforms on factory impostor materials', () => {
    const material = createKilnImpostorMaterial(createParams({
      search: '?renderer=webgpu&webgpuImpostors=1',
      webgpuImpostorFactories: {
        createKilnImpostorMaterial: () => createMaterial('webgpu-kiln-no-controls'),
      },
    }));

    try {
      expect(() => {
        setImpostorTint(
          { _impostorMaterials: [material] },
          new THREE.Color(1, 0.5, 0.25),
          new THREE.Vector3(0.1, 0.9, 0.2).normalize(),
          new THREE.Color(0.2, 0.3, 0.4),
          2,
          0.5
        );
      }).not.toThrow();
    } finally {
      material.dispose();
    }
  });

  it('preserves default Kiln tint uniform updates', () => {
    const material = createKilnImpostorMaterial(createParams());
    const sunColor = new THREE.Color(1, 0.5, 0.25);
    const sunDirWorld = new THREE.Vector3(0.1, 0.9, 0.2).normalize();
    const ambientColor = new THREE.Color(0.2, 0.3, 0.4);

    try {
      setImpostorTint({ _impostorMaterials: [material] }, sunColor, sunDirWorld, ambientColor, 2, 0.5);
      expect(material.uniforms.uSunColor.value.toArray()).toEqual([2, 1, 0.5]);
      expect(material.uniforms.uSunDirWorld.value.toArray()).toEqual(sunDirWorld.toArray());
      expect(material.uniforms.uAmbientColor.value.toArray()).toEqual([0.1, 0.15, 0.2]);
      const groundBounce = material.uniforms.uGroundBounceColor.value.toArray();
      expect(groundBounce[0]).toBeCloseTo(0.0425, 12);
      expect(groundBounce[1]).toBeCloseTo(0.0525, 12);
      expect(groundBounce[2]).toBeCloseTo(0.055, 12);
    } finally {
      material.dispose();
    }
  });

  it('falls back to the default impostor material when a factory is missing or invalid', () => {
    const missing = createWebGpuImpostorMaterial('kiln-impostor', 'createKilnImpostorMaterial', {
      createDefaultMaterial: () => createMaterial('default-impostor'),
      search: '?renderer=webgpu&webgpuImpostors=1',
      factories: {},
    });
    expect(missing.material.name).toBe('default-impostor');
    expect(missing.summary.reason).toBe('missing-factories');
    missing.material.dispose();

    const invalid = createWebGpuImpostorMaterial('kiln-impostor', 'createKilnImpostorMaterial', {
      createDefaultMaterial: () => createMaterial('default-invalid-impostor'),
      search: '?renderer=webgpu&webgpuImpostors=1',
      factories: {
        createKilnImpostorMaterial: () => null,
      },
    });
    expect(invalid.material.name).toBe('default-invalid-impostor');
    expect(invalid.summary.reason).toBe('invalid-factory-result');
    invalid.material.dispose();
  });
});
