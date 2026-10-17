// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The treeline: one oak, instanced into every stand of the placement manifest.
 *
 * Which oak is `TREE_SOURCE` (treeline/source.ts): the sculpted oak authored in
 * the adjacent TypeScript recipes, or the oak authored in Kiln
 * (treeline/kilnTree.ts). The manifest is the same for both: the same 139
 * stands with the same box, yaw and foot, the same sky gaps and the same pooled
 * shadows, so runtime performs no scattering. One shared geometry and material
 * per role keeps the whole horizon to three draws whichever oak stands in it:
 * crowns, wood and pooled ground shadows.
 */

import { use, useEffect, useMemo } from 'react';
import * as THREE from 'three/webgpu';
import { useHeightfield, type Heightfield } from '@app/world/heightfield';
import { useGameStore } from '@app/state/store';
import { debugFlags } from './glFactory';
import { CANOPY_ATTRIBUTE_SIZE, makeCanopyMaterial } from './treeline/canopyMaterial';
import {
  ACTIVE_TREE_FAMILY,
  buildCrownGeometry,
  buildTreeWoodGeometry,
  treeGeometryReceipt,
} from './treeline/crownShape';
import { measureTreeline } from './treeline/diagnostics';
import { kilnOak } from './treeline/kilnOak';
import { loadKilnTree } from './treeline/kilnTree';
import { useTreelineManifest } from './treeline/manifest';
import type { OakBuilder, OakRoles, OakStands } from './treeline/oakRoles';
import type { TreelinePlacement } from './treeline/placement';
import { TRUNK_SINK } from './treeline/placement';
import { buildTreeShadows } from './treeline/shadowPools';
import { TREE_SOURCE } from './treeline/source';
import { TRUNK_ATTRIBUTE_SIZE, makeTrunkMaterial } from './treeline/trunkMaterial';

const REPORT_TREELINE = import.meta.env.DEV && typeof window !== 'undefined'
  && (debugFlags().has('readout') || debugFlags().has('driver'));
const TREELINE_DRAWS = 3;
/** Sink the complete sourced shell just enough that the Round bole enters the
 * grass instead of perching on the sampled terrain plane. */
const SOURCE_TREE_SINK = 0.28;

/**
 * Start the Kiln oak's download with the other cold field assets
 * (FieldScene.preloadFieldSceneAssets), so the one outer Suspense boundary does
 * not wait on a request that began only when this component mounted. With the
 * procedural oak there is nothing to fetch.
 */
export function preloadTreeline(): void {
  if (TREE_SOURCE === 'kiln') void loadKilnTree();
}

export function Treeline() {
  // A build constant: with 'procedural' the bundler drops the branch below,
  // and with it the Kiln oak's loader, its materials and its asset.
  if (TREE_SOURCE !== 'kiln') return <TreelineMeshes oak={null} />;
  return <KilnTreeline />;
}

/**
 * The Kiln oak in every stand, whatever `TREE_SOURCE` says: the game's when
 * the constant is 'kiln', and the asset lab's `Tree (Kiln)` subject's always
 * (lab/src/KilnTreeline.tsx). Suspends until the bake is parsed; a null result
 * is a failed load, already logged, and draws the procedural oak.
 */
export function KilnTreeline() {
  const kiln = use(loadKilnTree());
  const oak = useMemo(() => (kiln === null ? null : kilnOak(kiln)), [kiln]);
  return <TreelineMeshes oak={oak} />;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const positions = geometry.getAttribute('position');
  return (geometry.index?.count ?? positions.count) / 3;
}

/**
 * Every stand's instance matrix, sixteen floats each, worked once: the unit
 * oak's foot on the leader's ground, a little under the grass, turned by the
 * stand's yaw and scaled to its box. Both oaks are authored to that unit frame,
 * so the crown and the wood of either one take the same matrices.
 */
function standMatrices(placement: TreelinePlacement): Float32Array {
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

function instancedMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: Float32Array,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length / 16);
  mesh.name = name;
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(matrices.slice(), 16);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return mesh;
}

/** The sculpted oak: geometry from its committed bake, the shipped materials. */
function proceduralOak({ crownInstances, woodInstances }: OakStands): OakRoles {
  return {
    name: 'sculpted-oak',
    crown: [buildCrownGeometry(), makeCanopyMaterial({ instances: crownInstances })],
    wood: [buildTreeWoodGeometry(), makeTrunkMaterial({ instances: woodInstances })],
    receipt: { source: ACTIVE_TREE_FAMILY, sourceAsset: treeGeometryReceipt() },
  };
}

function buildTreeline(placement: TreelinePlacement, field: Heightfield, builder: OakBuilder | null) {
  const { canopies, shrubs, trunks } = placement;
  const matrices = standMatrices(placement);
  const crownAttribute = new Float32Array(canopies.length * CANOPY_ATTRIBUTE_SIZE);
  const woodAttribute = new Float32Array(canopies.length * TRUNK_ATTRIBUTE_SIZE);
  canopies.forEach((tree, index) => {
    crownAttribute[index * CANOPY_ATTRIBUTE_SIZE] = tree.tint;
    crownAttribute[index * CANOPY_ATTRIBUTE_SIZE + 1] = tree.turn;
    crownAttribute[index * CANOPY_ATTRIBUTE_SIZE + 2] = tree.family;
    woodAttribute[index * TRUNK_ATTRIBUTE_SIZE] = tree.tint;
    woodAttribute[index * TRUNK_ATTRIBUTE_SIZE + 1] = 0;
  });
  const crownInstances = new THREE.InstancedBufferAttribute(crownAttribute, CANOPY_ATTRIBUTE_SIZE);
  const woodInstances = new THREE.InstancedBufferAttribute(woodAttribute, TRUNK_ATTRIBUTE_SIZE);
  const stands = { matrices, crownInstances, woodInstances };
  const oak = builder === null ? proceduralOak(stands) : builder(stands);

  const crowns = instancedMesh(`${oak.name}-crowns`, ...oak.crown, matrices);
  const wood = instancedMesh(`${oak.name}-wood`, ...oak.wood, matrices);
  const shadows = buildTreeShadows(canopies, trunks, field);
  shadows.name = 'original-treeline-shadows';

  const crownTriangles = triangleCount(oak.crown[0]);
  const woodTriangles = triangleCount(oak.wood[0]);
  const familyCounts = [0, 1, 2, 3].map(
    (family) => canopies.filter((tree) => tree.family === family).length,
  );

  return {
    objects: [crowns, wood, shadows] as const,
    instanced: [crowns, wood] as const,
    shadows,
    receipt: {
      ...oak.receipt,
      treeInstances: canopies.length,
      shrubInstances: shrubs.length,
      woodInstances: canopies.length,
      treeFamilyCounts: familyCounts,
      shrubFamilyCounts: [Math.ceil(shrubs.length / 2), Math.floor(shrubs.length / 2)],
      draws: TREELINE_DRAWS,
      sourceTriangles: crownTriangles + woodTriangles,
      submittedTriangles: (crownTriangles + woodTriangles) * canopies.length,
      textures: 0,
      opaque: true,
      externalModels: builder === null ? 0 : 1,
    },
  };
}

/**
 * The built treeline, as meshes: `oak` in every stand, or the procedural oak
 * when it is null. Split from `Treeline` so that the Kiln oak stands in the
 * same stands with the same shadows whichever way it is mounted (`KilnTreeline`).
 * `oak` must keep its identity across renders: the meshes are rebuilt when it
 * changes.
 */
export function TreelineMeshes({ oak }: { readonly oak: OakBuilder | null }) {
  const field = useHeightfield();
  const placement = useTreelineManifest();
  const diagnostics = useMemo(
    () => (REPORT_TREELINE ? measureTreeline(placement, field) : null),
    [field, placement],
  );

  const scene = useMemo(() => buildTreeline(placement, field, oak), [field, placement, oak]);

  useEffect(
    () => () => {
      for (const mesh of scene.instanced) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
      scene.shadows.geometry.dispose();
      (scene.shadows.material as THREE.Material).dispose();
    },
    [scene],
  );

  useEffect(() => {
    if (diagnostics !== null) useGameStore.getState().reportRuntimeDiagnostics(diagnostics);
  }, [diagnostics]);

  useEffect(() => {
    if (!REPORT_TREELINE) return;
    document.body.dataset.treelineAssets = JSON.stringify(scene.receipt);
    return () => {
      delete document.body.dataset.treelineAssets;
    };
  }, [scene.receipt]);

  return (
    <>
      {scene.objects.map((object) => (
        <primitive key={object.uuid} object={object} />
      ))}
    </>
  );
}
