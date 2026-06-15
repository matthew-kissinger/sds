// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DoubleSide, MeshBasicNodeMaterial, StorageInstancedBufferAttribute, TSL } from 'three/webgpu';
import { createWebGpuConsolidatedTreeImpostorMaterial } from '../js/webgpuKilnImpostorNodeMaterial.js';

/**
 * Cycle 101 Phase 3: the in-shader consolidated octahedral impostor material.
 * These build the real three/webgpu TSL node graph (no renderer) - so a wrong
 * node name or shape throws at construction. Visual correctness is the Phase 6/7
 * gate; this pins that the graph compiles and the tint controls are wired.
 */

function octahedralSidecar() {
  return {
    version: 2,
    layout: 'octahedral',
    axis: 'octahedral',
    tilesX: 8,
    tilesY: 8,
    tileSize: 128,
    atlasWidth: 1024,
    atlasHeight: 1024,
    yOffset: 0.5,
    bbox: { min: [-0.24, 0, -0.28], max: [0.26, 1, 0.21] },
    directions: Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      return [Math.cos(a), 0.1, Math.sin(a)];
    }),
  };
}

function directionsTexture(sidecar) {
  const n = sidecar.tilesX * sidecar.tilesY;
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const d = sidecar.directions[i];
    data[i * 4] = d[0]; data[i * 4 + 1] = d[1]; data[i * 4 + 2] = d[2]; data[i * 4 + 3] = 1;
  }
  const tex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function buildMaterial(overrides = {}) {
  const sidecar = octahedralSidecar();
  const capacity = 8;
  return createWebGpuConsolidatedTreeImpostorMaterial(
    { MeshBasicNodeMaterial, DoubleSide, Vector3: THREE.Vector3, TSL },
    {
      instanceMatricesAttr: new StorageInstancedBufferAttribute(new Float32Array(capacity * 16), 16),
      capacity,
      sidecar,
      albedoAtlas: new THREE.Texture(),
      normalAtlas: new THREE.Texture(),
      directionsTexture: directionsTexture(sidecar),
      lighting: { sunDirection: [0.4, 0.7, 0.3], sunColor: [1, 0.95, 0.85], ambientColor: [0.5, 0.55, 0.6] },
      fog: { color: [0.7, 0.75, 0.8], near: 80, far: 420, strength: 0.5 },
      tunables: { alphaTest: 0.3, wrapPower: 1.2, fresnelStrength: 0.04 },
      ...overrides,
    },
  );
}

describe('webgpu consolidated tree impostor material (Cycle 101)', () => {
  it('builds the in-shader octahedral node graph without throwing', () => {
    const material = buildMaterial();
    try {
      expect(material.isNodeMaterial).toBe(true);
      expect(material.name).toBe('webgpu-consolidated-tree-impostor');
      expect(material.vertexNode).toBeTruthy(); // bypasses InstanceNode
      expect(material.colorNode).toBeTruthy();
      expect(material.opacityNode).toBeTruthy();
      expect(material.alphaHash).toBe(true);
      expect(material.alphaTest).toBe(0.3);
      expect(material.side).toBe(THREE.DoubleSide);
      expect(material.userData.isKilnImpostor).toBe(true);
      expect(material.userData.webgpuConsolidatedImpostor).toMatchObject({
        layout: 'octahedral',
        tilesX: 8,
        tilesY: 8,
        selection: 'in-shader-octahedral-from-compacted-matrix',
      });
    } finally {
      material.dispose();
    }
  });

  it('exposes setTint controls that update sun/ambient/ground-bounce without throwing', () => {
    const material = buildMaterial();
    const controls = material.userData.webgpuImpostorMaterialControls;
    try {
      expect(controls.setTileBlend()).toBe(false); // in-shader selection, no CPU push
      expect(() => controls.setTint({
        sunDirWorld: new THREE.Vector3(0.2, 0.9, 0.3).normalize(),
        sunColor: new THREE.Color(1, 0.9, 0.8),
        sunIntensity: 2,
        ambientColor: new THREE.Color(0.3, 0.35, 0.4),
        ambientIntensity: 1,
        groundBounceTilt: new THREE.Color(0.9, 0.85, 0.7),
        groundBounceScale: 0.5,
      })).not.toThrow();
      // sun color picked up the intensity multiply
      expect(controls.nodes.sunColor.value.r).toBeCloseTo(2, 5);
      expect(controls.nodes.groundBounceColor.value.r).toBeGreaterThan(0);
    } finally {
      material.dispose();
    }
  });
});
