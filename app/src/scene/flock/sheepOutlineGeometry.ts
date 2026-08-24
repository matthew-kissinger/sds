// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The outline-only sheep recipe.
 *
 * The shaded fleece deliberately remains a cluster of authored puffs, but an
 * inverted hull cannot outline that cluster directly: every closed puff also
 * contributes back faces inside the body, producing dark crescents between
 * clumps. The outline therefore uses one fitted outer fleece mass plus the
 * original head, ears and legs. Those dark parts retain their baked exposure
 * weights at the wool joins; the fleece proxy has no internal wool surfaces at
 * all.
 *
 * This remains one indexed geometry and one instanced outline draw. It carries
 * the same five attributes as the body, so the packed CPU flock stays at the
 * WebGPU eight-vertex-buffer floor.
 */

import * as THREE from 'three/webgpu';

const FLEECE_RINGS = 11;
const FLEECE_SIDES = 14;
// Keep the proxy just under the puff envelope. The expanded hull then reveals a
// stable one-to-two-pixel wool contour without bridging the deeper scallops.
const FLEECE_INSET = 0.99;

interface OutlineBuffers {
  readonly positions: number[];
  readonly normals: number[];
  readonly maskA: number[];
  readonly maskB: number[];
  readonly maskC: number[];
  readonly indices: number[];
}

function pushVertex(
  into: OutlineBuffers,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
  maskA: readonly [number, number],
  maskB: readonly [number, number],
  maskC: readonly [number, number],
  appendIndex = true,
): void {
  into.positions.push(position.getX(index), position.getY(index), position.getZ(index));
  into.normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
  into.maskA.push(...maskA);
  into.maskB.push(...maskB);
  into.maskC.push(...maskC);
  if (appendIndex) into.indices.push(into.positions.length / 3 - 1);
}

/**
 * Fit one low-poly tube to the current wool vertices. Each longitudinal station
 * samples the nearby puff union, then turns its X/Y extrema into one slightly
 * inset irregular ellipse. This preserves the approved recipe's overall
 * shoulder, belly, rump and poll envelope without copying any puff surface.
 */
function buildFleeceProxy(body: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = body.getAttribute('position');
  const masks = body.getAttribute('uv');
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < position.count; i++) {
    if (masks.getX(i) <= 0.5) continue;
    zMin = Math.min(zMin, position.getZ(i));
    zMax = Math.max(zMax, position.getZ(i));
  }

  const step = (zMax - zMin) / (FLEECE_RINGS - 1);
  const window = step * 1.35;
  const points: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring < FLEECE_RINGS; ring++) {
    const z = zMin + step * ring;
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i < position.count; i++) {
      if (masks.getX(i) <= 0.5 || Math.abs(position.getZ(i) - z) > window) continue;
      xMin = Math.min(xMin, position.getX(i));
      xMax = Math.max(xMax, position.getX(i));
      yMin = Math.min(yMin, position.getY(i));
      yMax = Math.max(yMax, position.getY(i));
    }
    const centreX = (xMin + xMax) * 0.5;
    const centreY = (yMin + yMax) * 0.5;
    const end = ring === 0 || ring === FLEECE_RINGS - 1;
    const radiusX = end ? 0.025 : (xMax - xMin) * 0.5 * FLEECE_INSET;
    const radiusY = end ? 0.025 : (yMax - yMin) * 0.5 * FLEECE_INSET;
    for (let side = 0; side < FLEECE_SIDES; side++) {
      const angle = side / FLEECE_SIDES * Math.PI * 2;
      const ripple = 1 + Math.sin(angle * 3 + ring * 0.71) * 0.018;
      points.push(
        centreX + Math.cos(angle) * radiusX * ripple,
        centreY + Math.sin(angle) * radiusY * ripple,
        z,
      );
    }
  }
  for (let ring = 0; ring < FLEECE_RINGS - 1; ring++) {
    for (let side = 0; side < FLEECE_SIDES; side++) {
      const next = (side + 1) % FLEECE_SIDES;
      const a = ring * FLEECE_SIDES + side;
      const b = ring * FLEECE_SIDES + next;
      const c = (ring + 1) * FLEECE_SIDES + side;
      const d = (ring + 1) * FLEECE_SIDES + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** One exterior fleece shell plus the original non-wool silhouette parts. */
export function buildSheepOutlineGeometry(body: THREE.BufferGeometry): THREE.BufferGeometry {
  const bodyPosition = body.getAttribute('position');
  const bodyNormal = body.getAttribute('normal');
  const bodyMaskA = body.getAttribute('uv');
  const bodyMaskB = body.getAttribute('uv1');
  const bodyMaskC = body.getAttribute('uv2');
  const bodyIndex = body.getIndex();
  if (bodyIndex === null) throw new Error('Sheep body geometry must remain indexed');

  const fleece = buildFleeceProxy(body);
  const fleecePosition = fleece.getAttribute('position');
  const fleeceNormal = fleece.getAttribute('normal');
  const fleeceIndex = fleece.getIndex();
  if (fleeceIndex === null) throw new Error('Sheep fleece proxy must remain indexed');
  const buffers: OutlineBuffers = {
    positions: [], normals: [], maskA: [], maskB: [], maskC: [], indices: [],
  };

  // The proxy is one closed indexed polyhedron. The frontmost part of
  // the proxy follows half of the authored poll nod so its outline remains
  // welded to the grazing face without reintroducing a separate poll hull.
  for (let i = 0; i < fleecePosition.count; i++) {
    const z = fleecePosition.getZ(i);
    const graze = Math.max(0, Math.min(0.5, (z - 0.36) / 0.36));
    pushVertex(buffers, fleecePosition, fleeceNormal, i, [1, graze], [0, 0], [1, 0], false);
  }
  for (let i = 0; i < fleeceIndex.count; i++) buffers.indices.push(fleeceIndex.getX(i));
  fleece.dispose();

  // Retain whole non-wool triangles. Masks are constant per authored part, so
  // a triangle can never straddle the fleece split.
  for (let i = 0; i < bodyIndex.count; i += 3) {
    const a = bodyIndex.getX(i);
    const b = bodyIndex.getX(i + 1);
    const c = bodyIndex.getX(i + 2);
    if (bodyMaskA.getX(a) > 0.5 || bodyMaskA.getX(b) > 0.5 || bodyMaskA.getX(c) > 0.5) continue;
    for (const vertex of [a, b, c]) {
      pushVertex(
        buffers,
        bodyPosition,
        bodyNormal,
        vertex,
        [bodyMaskA.getX(vertex), bodyMaskA.getY(vertex)],
        [bodyMaskB.getX(vertex), bodyMaskB.getY(vertex)],
        [bodyMaskC.getX(vertex), bodyMaskC.getY(vertex)],
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.maskA, 2));
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(buffers.maskB, 2));
  geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(buffers.maskC, 2));
  geometry.setIndex(buffers.indices);
  geometry.computeBoundingSphere();
  return geometry;
}
