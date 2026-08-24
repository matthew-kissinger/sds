// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The sourced Fox Round + Spreading treeline and its rooted wood.
 *
 * Geometry is authored in the adjacent TypeScript recipes. The committed
 * placement manifest supplies deterministic transforms, so runtime performs no
 * scattering, asset fetches or opaque-model decoding. One shared geometry and
 * material per role keeps the complete horizon to three draws: crowns, wood
 * and pooled ground shadows.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three/webgpu';
import { useHeightfield } from '@app/world/heightfield';
import { useGameStore } from '@app/state/store';
import { debugFlags } from './glFactory';
import { CANOPY_ATTRIBUTE_SIZE, makeCanopyMaterial } from './treeline/canopyMaterial';
import {
  ACTIVE_SOURCED_CROWN,
  buildCrownGeometry,
  buildSourcedWoodGeometry,
  sourcedCrownReceipt,
} from './treeline/crownShape';
import { measureTreeline } from './treeline/diagnostics';
import { useTreelineManifest } from './treeline/manifest';
import { buildTreeShadows } from './treeline/shadowPools';
import { TRUNK_ATTRIBUTE_SIZE, makeTrunkMaterial } from './treeline/trunkMaterial';
import { TRUNK_SINK } from './treeline/placement';

const REPORT_TREELINE = import.meta.env.DEV && typeof window !== 'undefined'
  && (debugFlags().has('readout') || debugFlags().has('driver'));
const PROCEDURAL_TREELINE_DRAWS = 3;
/** Sink the complete sourced shell just enough that the Round bole enters the
 * grass instead of perching on the sampled terrain plane. */
const SOURCE_TREE_SINK = 0.28;

function triangleCount(geometry: THREE.BufferGeometry): number {
  const positions = geometry.getAttribute('position');
  return (geometry.index?.count ?? positions.count) / 3;
}

function buildMesh<T>(
  name: string,
  items: readonly T[],
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  write: (item: T, dummy: THREE.Object3D, index: number) => void,
): THREE.InstancedMesh {
  const matrices = new Float32Array(items.length * 16);
  const dummy = new THREE.Object3D();

  for (let index = 0; index < items.length; index++) {
    write(items[index]!, dummy, index);
    dummy.updateMatrix();
    dummy.matrix.toArray(matrices, index * 16);
  }

  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = name;
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(matrices, 16);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return mesh;
}

export function Treeline() {
  const field = useHeightfield();
  const placement = useTreelineManifest();
  const diagnostics = useMemo(
    () => (REPORT_TREELINE ? measureTreeline(placement, field) : null),
    [field, placement],
  );

  const scene = useMemo(() => {
    const { canopies, shrubs, trunks } = placement;
    const canopyAttribute = new Float32Array(canopies.length * CANOPY_ATTRIBUTE_SIZE);
    const trunkAttribute = new Float32Array(canopies.length * TRUNK_ATTRIBUTE_SIZE);

    const crownGeometry = buildCrownGeometry();
    const trunkGeometry = buildSourcedWoodGeometry();
    const placeWholeTree = (
      tree: (typeof canopies)[number],
      dummy: THREE.Object3D,
    ): void => {
      const leader = trunks[tree.treeId]!;
      const ground = leader.y + TRUNK_SINK;
      dummy.position.set(leader.x, ground - SOURCE_TREE_SINK, leader.z);
      dummy.rotation.set(0, tree.yaw, 0);
      dummy.scale.set(tree.width, tree.y + tree.height - ground, tree.depth);
    };
    const canopyMesh = buildMesh(
      'sourced-broadleaf-crowns',
      canopies,
      crownGeometry,
      makeCanopyMaterial({
        instances: new THREE.InstancedBufferAttribute(
          canopyAttribute,
          CANOPY_ATTRIBUTE_SIZE,
        ),
      }),
      (tree, dummy, index) => {
        placeWholeTree(tree, dummy);
        const offset = index * CANOPY_ATTRIBUTE_SIZE;
        canopyAttribute[offset] = tree.tint;
        canopyAttribute[offset + 1] = tree.turn;
        canopyAttribute[offset + 2] = tree.family;
      },
    );
    const trunkMesh = buildMesh(
      'sourced-rooted-wood',
      canopies,
      trunkGeometry,
      makeTrunkMaterial({
        instances: new THREE.InstancedBufferAttribute(
          trunkAttribute,
          TRUNK_ATTRIBUTE_SIZE,
        ),
      }),
      (tree, dummy, index) => {
        placeWholeTree(tree, dummy);
        const offset = index * TRUNK_ATTRIBUTE_SIZE;
        trunkAttribute[offset] = tree.tint;
        trunkAttribute[offset + 1] = 0;
      },
    );
    const shadows = buildTreeShadows(canopies, trunks, field);
    shadows.name = 'original-treeline-shadows';

    const crownTriangles = triangleCount(crownGeometry);
    const trunkTriangles = triangleCount(trunkGeometry);
    const familyCounts = [0, 1, 2, 3].map(
      (family) => canopies.filter((tree) => tree.family === family).length,
    );

    return {
      objects: [canopyMesh, trunkMesh, shadows] as const,
      instanced: [canopyMesh, trunkMesh] as const,
      shadows,
      receipt: {
        source: ACTIVE_SOURCED_CROWN,
        sourceAsset: sourcedCrownReceipt(),
        treeInstances: canopies.length,
        shrubInstances: shrubs.length,
        woodInstances: canopies.length,
        treeFamilyCounts: familyCounts,
        shrubFamilyCounts: [Math.ceil(shrubs.length / 2), Math.floor(shrubs.length / 2)],
        draws: PROCEDURAL_TREELINE_DRAWS,
        sourceTriangles: crownTriangles + trunkTriangles,
        submittedTriangles: crownTriangles * canopies.length
          + trunkTriangles * canopies.length,
        textures: 0,
        opaque: true,
        externalModels: 0,
      },
    };
  }, [field, placement]);

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
