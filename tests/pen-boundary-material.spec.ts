// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { HOME_FIELD } from '@sim/field';
import { positionGeometry, positionLocal } from '@app/tsl/nodes';
import { buildBoundaryDressing } from '@app/scene/pen/boundaryDressing';
import terrain from '../assets/terrain/manifest.json';

describe('pen boundary grass material coordinates', () => {
  it('keeps the blade paint attached to geometry when actual pen instances stand below zero', () => {
    const pad = terrain.pads.find((entry) => entry.id === 'pen-and-gate')!;
    const meshes = buildBoundaryDressing({ ...HOME_FIELD.pen,
      mouthX: HOME_FIELD.gate.position.x, mouthWidth: HOME_FIELD.gate.width,
      corridorMinZ: HOME_FIELD.bounds.maxZ }, () => pad.level);
    try {
      const tufts = meshes[0]!;
      const positions = tufts.geometry.getAttribute('position');
      const matrix = new THREE.Matrix4();
      const vertex = new THREE.Vector3();
      let fullyBelowZero = 0;
      for (let i = 0; i < tufts.count; i++) {
        tufts.getMatrixAt(i, matrix);
        let tip = -Infinity;
        for (let v = 0; v < positions.count; v++) {
          vertex.fromBufferAttribute(positions, v).applyMatrix4(matrix);
          tip = Math.max(tip, vertex.y);
        }
        if (tip < 0) fullyBelowZero++;
      }
      // Establish the real regression context rather than assuming placement:
      // translated local heights put many entire tufts inside the root shadow.
      expect(pad.level).toBeLessThan(0);
      expect(fullyBelowZero).toBeGreaterThan(tufts.count / 2);
      expect(positions.getY(2)).toBeGreaterThan(0.7);
      const graphNodes = new Set<unknown>();
      const material = tufts.material as THREE.MeshBasicNodeMaterial;
      material.colorNode!.traverse((node) => graphNodes.add(node));
      // Three instancing mutates positionLocal before interpolating it. Paint
      // must read immutable blade height; world elevation is not root depth.
      expect(graphNodes.has(positionGeometry)).toBe(true);
      expect(graphNodes.has(positionLocal)).toBe(false);
      expect(material.side).toBe(THREE.DoubleSide);
    } finally {
      for (const mesh of meshes) {
        mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose();
      }
    }
  });
});
