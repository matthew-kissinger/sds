// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** CC0 source geometry adapted offline into Herd's crown contract. */

import * as THREE from 'three/webgpu';
import fox from '../../../../assets/treeline/fox-broad-spreading.json';
import round from '../../../../assets/treeline/fox-natural-round.json';

export type SourcedCrownId = 'fox-broad-spreading' | 'fox-natural-round';
export const ACTIVE_SOURCED_CROWN: SourcedCrownId = 'fox-broad-spreading';
const CANDIDATES = { 'fox-broad-spreading': fox, 'fox-natural-round': round } as const;

export function sourcedCrownReceipt(id: SourcedCrownId = ACTIVE_SOURCED_CROWN) {
  const candidate = CANDIDATES[id];
  return {
    id: candidate.id,
    foliageTriangles: candidate.geometry.foliage.triangles,
    woodTriangles: candidate.geometry.wood.triangles,
    source: candidate.provenance.source,
    sha256: candidate.provenance.sha256,
  } as const;
}

export function crownEnvelopeAt(localY: number, _theta: number): {
  readonly centreX: number; readonly centreZ: number; readonly radius: number;
} {
  const y = Math.min(1, Math.max(0, localY));
  const round = Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.5) / 0.58, 2)));
  return { centreX: 0, centreZ: 0, radius: 0.18 + round * 0.38 };
}

export function buildCrownGeometry(
  id: SourcedCrownId = ACTIVE_SOURCED_CROWN,
): THREE.BufferGeometry {
  const source = CANDIDATES[id].geometry.foliage;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(source.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(source.normals, 3));
  geometry.setAttribute(
    'crownPart',
    new THREE.Float32BufferAttribute(new Float32Array(source.positions.length / 3), 1),
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildSourcedWoodGeometry(
  id: SourcedCrownId = ACTIVE_SOURCED_CROWN,
): THREE.BufferGeometry {
  const source = CANDIDATES[id].geometry.wood;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(source.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(source.normals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
