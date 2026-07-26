// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FencePresets, GATE_FALLBACK_THRESHOLD_NAME } from '../js/FencePresets.js';

function makeModule(name, meshName, geometry, meshY = 0) {
  const group = new THREE.Group();
  group.name = name;
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = meshName;
  mesh.position.y = meshY;
  group.add(mesh);
  return group;
}

/**
 * The fallback gate's ground threshold, located by the name the builder writes
 * rather than by its geometry type.
 *
 * Both call sites below used to search for `geometry.type === 'PlaneGeometry'`,
 * which is not an identity: it matches any plane that ever lands in a gate
 * group, and it silently matches NOTHING once the effect restyles. One site
 * asserts the mesh is absent and one asserts where it sits, so a change that
 * removed the threshold outright would have made the first pass while the
 * second threw on `undefined.position`. Importing the name from the module
 * means a removal takes both out at once, at import, with the module's own
 * symbol as the failure.
 */
function findFallbackThreshold(gate) {
  return gate.children.find(child => child.name === GATE_FALLBACK_THRESHOLD_NAME);
}

function bboxFor(node) {
  node.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(node);
}

describe('FencePresets GLB gate assembly', () => {
  it('uses the authored gate assembly without adding the fallback threshold', () => {
    const presets = new FencePresets();
    presets.useGLBModels = true;
    presets.models.gateAssembly = makeModule(
      'Gate_Assembly',
      'Gate_Wood',
      new THREE.BoxGeometry(8.48, 2.2, 3.5),
      1.1,
    );
    presets.models.gateAssembly.userData.authoredWidth = 8;

    const gate = presets.createGateStructure(8, 'horizontal');
    gate.updateWorldMatrix(true, true);

    const assembly = gate.children.find(child => child.name === 'Gate_Assembly');
    const threshold = findFallbackThreshold(gate);

    // Positive control, built from the same presets in the same test. Asserting
    // an absence on its own is a hole: a change that deleted the fallback
    // threshold outright would leave `toBeUndefined()` passing for the wrong
    // reason. The control proves the locator still finds the thing when the
    // thing is there, so the absence below means "the authored branch skipped
    // it" rather than "there is nothing left to skip".
    const control = new FencePresets();
    control.useGLBModels = false;
    expect(findFallbackThreshold(control.createGateStructure(8, 'horizontal'))).toBeDefined();

    expect(assembly).toBeDefined();
    expect(threshold).toBeUndefined();
    expect(bboxFor(assembly).min.y).toBeCloseTo(0, 6);
    expect(assembly.scale.x).toBeCloseTo(1, 6);
    expect(assembly.scale.y).toBeCloseTo(1, 6);
    expect(assembly.scale.z).toBeCloseTo(1, 6);
  });

  it('rotates the authored gate assembly for vertical openings', () => {
    const presets = new FencePresets();
    presets.useGLBModels = true;
    presets.models.gateAssembly = makeModule(
      'Gate_Assembly',
      'Gate_Wood',
      new THREE.BoxGeometry(8.48, 2.2, 3.5),
      1.1,
    );
    presets.models.gateAssembly.userData.authoredWidth = 8;

    const gate = presets.createGateStructure(10, 'vertical');
    const assembly = gate.children.find(child => child.name === 'Gate_Assembly');

    expect(assembly.rotation.y).toBeCloseTo(Math.PI / 2, 6);
    expect(assembly.scale.x).toBeCloseTo(1.25, 6);
    expect(assembly.scale.y).toBeCloseTo(1.25, 6);
    expect(assembly.scale.z).toBeCloseTo(1.25, 6);
  });

  it('falls back to grounded side posts without stretching a header span', () => {
    const presets = new FencePresets();
    presets.useGLBModels = true;
    presets.models.fencePost = makeModule(
      'Fence_Post',
      'Mesh_Fence_Post_Runtime',
      new THREE.BoxGeometry(0.42, 2.18, 0.4),
      1.09,
    );
    presets.models.fenceRail = makeModule(
      'Fence_Rail',
      'Mesh_Fence_Rail_Runtime',
      new THREE.BoxGeometry(1, 0.1, 0.12),
    );
    presets.models.gatePost = makeModule(
      'Gate_Post',
      'Mesh_Gate_Post_Runtime',
      new THREE.BoxGeometry(0.4, 1.43, 0.4),
      0.715,
    );
    presets.models.gateArch = makeModule(
      'Gate_Arch',
      'Mesh_Gate_Arch_Runtime',
      new THREE.BoxGeometry(1.32, 2.2, 0.3),
      1.1,
    );

    const gate = presets.createGateStructure(8, 'horizontal');
    gate.updateWorldMatrix(true, true);

    const posts = gate.children.filter(child => child.name === 'Fence_Post');
    const header = gate.children.find(child => child.name === 'Fence_Rail');
    const arch = gate.children.find(child => child.name === 'Gate_Arch');
    const threshold = findFallbackThreshold(gate);

    expect(posts.length).toBe(2);
    expect(header).toBeUndefined();
    expect(arch).toBeUndefined();
    for (const post of posts) {
      expect(bboxFor(post).min.y).toBeCloseTo(0, 6);
      expect(post.scale.x).toBeCloseTo(1.2, 6);
      expect(post.scale.z).toBeCloseTo(1.2, 6);
    }
    expect(threshold.position.y).toBeCloseTo(0.01, 6);
  });
});
