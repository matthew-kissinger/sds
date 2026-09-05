// SPDX-License-Identifier: AGPL-3.0-or-later
import * as THREE from 'three/webgpu';
import oak from '../../../../assets/treeline/sculpted-oak-family.json';

export const ACTIVE_TREE_FAMILY = 'sculpted-oak-family';

export function treeGeometryReceipt() {
  return {
    id: oak.id,
    foliageTriangles: oak.geometry.foliage.triangles,
    woodTriangles: oak.geometry.wood.triangles,
    recipe: oak.provenance.source,
    recipeSha256: oak.provenance.sha256,
    license: oak.provenance.license,
  } as const;
}

/** Conservative support envelope used by retained placement diagnostics. */
export function crownEnvelopeAt(localY: number, _theta: number) {
  const y = Math.min(1, Math.max(0, localY));
  const round = Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.5) / 0.58, 2)));
  return { centreX: 0, centreZ: 0, radius: 0.18 + round * 0.38 };
}

function buildGeometry(source: { positions: number[]; normals: number[] }): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(source.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(source.normals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildCrownGeometry(): THREE.BufferGeometry {
  const geometry = buildGeometry(oak.geometry.foliage);
  geometry.setAttribute('crownPart', new THREE.Float32BufferAttribute(oak.geometry.foliage.parts, 1));
  return geometry;
}

export function buildTreeWoodGeometry(): THREE.BufferGeometry {
  return buildGeometry(oak.geometry.wood);
}
