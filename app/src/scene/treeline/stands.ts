// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Where each stand of the treeline puts its oak: one instance matrix a stand,
 * worked once from the placement manifest. Both oaks are authored to the same
 * unit frame, so the crown and the wood of either one take these matrices
 * (Treeline.tsx), and so does the Kiln oak's materials' own reading of them
 * (treeline/kilnTreeMaterials.ts). A pure function of the manifest, so the
 * tests read the boxes exactly as the treeline draws them.
 */

import * as THREE from 'three/webgpu';
import { TRUNK_SINK, type TreelinePlacement } from './placement';

/** Sink the complete sourced shell just enough that the Round bole enters the
 * grass instead of perching on the sampled terrain plane. */
const SOURCE_TREE_SINK = 0.28;

/**
 * Every stand's instance matrix, sixteen floats each: the unit oak's foot on
 * the leader's ground, a little under the grass, turned by the stand's yaw and
 * scaled to its box.
 */
export function standMatrices(placement: TreelinePlacement): Float32Array {
  const { canopies, trunks } = placement;
  const matrices = new Float32Array(canopies.length * 16);
  const dummy = new THREE.Object3D();
  canopies.forEach((tree, index) => {
    const leader = trunks[tree.treeId]!;
    const ground = leader.y + TRUNK_SINK;
    dummy.position.set(leader.x, ground - SOURCE_TREE_SINK, leader.z);
    dummy.rotation.set(0, tree.yaw, 0);
    dummy.scale.set(tree.width, tree.y + tree.height - ground, tree.depth);
    dummy.updateMatrix();
    dummy.matrix.toArray(matrices, index * 16);
  });
  return matrices;
}
