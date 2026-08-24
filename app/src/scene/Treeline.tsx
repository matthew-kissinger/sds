// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The original procedural treeline: three broadleaf families, the field oak,
 * two hedgerow colour families and their rooted wood.
 *
 * Geometry is authored in the adjacent TypeScript recipes. The committed
 * placement manifest supplies deterministic transforms, so runtime performs no
 * scattering, asset fetches or opaque-model decoding. One shared geometry and
 * material per role keeps the complete horizon to four draws: crowns, shrubs,
 * wood and pooled ground shadows.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three/webgpu';
import { useHeightfield } from '@app/world/heightfield';
import { useGameStore } from '@app/state/store';
import { debugFlags } from './glFactory';
import { CANOPY_ATTRIBUTE_SIZE, makeCanopyMaterial } from './treeline/canopyMaterial';
import { buildCrownGeometry } from './treeline/crownShape';
import { measureTreeline } from './treeline/diagnostics';
import { useTreelineManifest } from './treeline/manifest';
import { buildTreeShadows } from './treeline/shadowPools';
import { SHRUB_ATTRIBUTE_SIZE, makeShrubMaterial } from './treeline/shrubMaterial';
import { buildShrubGeometry } from './treeline/shrubShape';
import { TRUNK_ATTRIBUTE_SIZE, makeTrunkMaterial } from './treeline/trunkMaterial';
import { buildTrunkGeometry } from './treeline/trunkShape';

const REPORT_TREELINE = import.meta.env.DEV && typeof window !== 'undefined'
  && (debugFlags().has('readout') || debugFlags().has('driver'));
const PROCEDURAL_TREELINE_DRAWS = 4;

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
    const shrubAttribute = new Float32Array(shrubs.length * SHRUB_ATTRIBUTE_SIZE);
    const trunkAttribute = new Float32Array(trunks.length * TRUNK_ATTRIBUTE_SIZE);

    const crownGeometry = buildCrownGeometry();
    const shrubGeometry = buildShrubGeometry();
    const trunkGeometry = buildTrunkGeometry();
    const canopyMesh = buildMesh(
      'original-broadleaf-crowns',
      canopies,
      crownGeometry,
      makeCanopyMaterial({
        instances: new THREE.InstancedBufferAttribute(
          canopyAttribute,
          CANOPY_ATTRIBUTE_SIZE,
        ),
      }),
      (tree, dummy, index) => {
        dummy.position.set(tree.x, tree.y, tree.z);
        dummy.rotation.set(tree.tiltX, tree.yaw, tree.tiltZ);
        dummy.scale.set(tree.width, tree.height, tree.depth);
        const offset = index * CANOPY_ATTRIBUTE_SIZE;
        canopyAttribute[offset] = tree.tint;
        canopyAttribute[offset + 1] = tree.turn;
        canopyAttribute[offset + 2] = tree.family;
      },
    );
    const shrubMesh = buildMesh(
      'original-hedgerow-shrubs',
      shrubs,
      shrubGeometry,
      makeShrubMaterial({
        instances: new THREE.InstancedBufferAttribute(
          shrubAttribute,
          SHRUB_ATTRIBUTE_SIZE,
        ),
      }),
      (shrub, dummy, index) => {
        dummy.position.set(shrub.x, shrub.y, shrub.z);
        dummy.rotation.set(0, shrub.yaw, 0);
        dummy.scale.set(shrub.width, shrub.height, shrub.depth);
        const offset = index * SHRUB_ATTRIBUTE_SIZE;
        shrubAttribute[offset] = shrub.tint;
        shrubAttribute[offset + 1] = index % 2;
      },
    );
    const trunkMesh = buildMesh(
      'original-rooted-wood',
      trunks,
      trunkGeometry,
      makeTrunkMaterial({
        instances: new THREE.InstancedBufferAttribute(
          trunkAttribute,
          TRUNK_ATTRIBUTE_SIZE,
        ),
      }),
      (bole, dummy, index) => {
        dummy.position.set(bole.x, bole.y, bole.z);
        dummy.rotation.set(bole.tiltX, bole.yaw, bole.tiltZ);
        dummy.scale.set(bole.diameter, bole.length, bole.diameter);
        const offset = index * TRUNK_ATTRIBUTE_SIZE;
        trunkAttribute[offset] = bole.tint;
        trunkAttribute[offset + 1] = bole.shade;
      },
    );
    const shadows = buildTreeShadows(canopies, trunks, field);
    shadows.name = 'original-treeline-shadows';

    const crownTriangles = triangleCount(crownGeometry);
    const shrubTriangles = triangleCount(shrubGeometry);
    const trunkTriangles = triangleCount(trunkGeometry);
    const familyCounts = [0, 1, 2, 3].map(
      (family) => canopies.filter((tree) => tree.family === family).length,
    );

    return {
      objects: [canopyMesh, shrubMesh, trunkMesh, shadows] as const,
      instanced: [canopyMesh, shrubMesh, trunkMesh] as const,
      shadows,
      receipt: {
        source: 'original-procedural-v3',
        treeInstances: canopies.length,
        shrubInstances: shrubs.length,
        woodInstances: trunks.length,
        treeFamilyCounts: familyCounts,
        shrubFamilyCounts: [Math.ceil(shrubs.length / 2), Math.floor(shrubs.length / 2)],
        draws: PROCEDURAL_TREELINE_DRAWS,
        sourceTriangles: crownTriangles + shrubTriangles + trunkTriangles,
        submittedTriangles: crownTriangles * canopies.length
          + shrubTriangles * shrubs.length
          + trunkTriangles * trunks.length,
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
