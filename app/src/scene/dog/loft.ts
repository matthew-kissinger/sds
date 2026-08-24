// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * A lofting builder: rings of cross-sections in, one indexed BufferGeometry out.
 *
 * This is the authoring tool for the dog (AGENTS.md rule 11: every asset has an
 * in-repo recipe, no opaque binaries). A quadruped is a stack of ellipses that
 * change width down its length - deep at the ribs, tucked at the loin, wide at
 * the haunch - so the shape is described as a table of numbers that can be read
 * and re-tuned, rather than as a mesh file nobody can open.
 *
 * Everything runs once, at geometry build time. Nothing here is on a frame path,
 * so the scratch vectors are convenience rather than a budget.
 *
 * Winding: rings are ordered along +z and the cross-section angle runs counter-
 * clockwise, which makes tangent x axial point outward on every quad. Callers
 * that want a part pointing some other way pass a matrix instead of reversing
 * the ring order, because reversed rings would face the surface inward.
 */

import * as THREE from 'three/webgpu';

/** One cross-section. `x` and `y` move the section's centre off the loft axis,
 *  which is how a tail droops and an ear tip flops without extra parts. */
export interface LoftRing {
  readonly z: number;
  readonly x?: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

const _vertex = new THREE.Vector3();
const _rotX = new THREE.Matrix4();
const _rotY = new THREE.Matrix4();
const _rotZ = new THREE.Matrix4();

/**
 * A placement matrix for one lofted part: rotate about x, then y, then z, then
 * translate. The loft axis is local +z, so `rotX = PI / 2` points a part at the
 * ground and `rotX = -PI / 2` points it at the sky.
 */
export function place(
  x: number,
  y: number,
  z: number,
  rotX = 0,
  rotY = 0,
  rotZ = 0,
): THREE.Matrix4 {
  const matrix = new THREE.Matrix4().makeTranslation(x, y, z);
  _rotZ.makeRotationZ(rotZ);
  _rotY.makeRotationY(rotY);
  _rotX.makeRotationX(rotX);
  return matrix.multiply(_rotZ).multiply(_rotY).multiply(_rotX);
}

export class LoftBuilder {
  private readonly positions: number[] = [];
  private readonly indices: number[] = [];
  /**
   * GIRTH, in metres: the smaller half-axis of the ring a vertex came from.
   * Written into the uv attribute's x, because it is the one per-vertex channel
   * the TSL shim already exposes and this mesh has no texture to unwrap.
   *
   * The rim light needs it. A fresnel rim covers a strip whose width scales with
   * the radius of the surface it is on, so on a 0.30 m barrel it is the 3 px band
   * it is supposed to be and on a 0.05 m ear it is the entire ear. Without this
   * the dog's legs, tail and head all wash out to rim colour while the body gets
   * a correct edge - which is exactly what the first version of this pass did.
   */
  private readonly girth: number[] = [];

  /**
   * Add one lofted part. `sides` is the cross-section polygon count: 8 reads as
   * a body, 6 is chunky enough for a leg and a tail at gameplay distance.
   */
  add(rings: readonly LoftRing[], sides: number, transform?: THREE.Matrix4): void {
    const base = this.positions.length / 3;

    for (const ring of rings) {
      for (let s = 0; s < sides; s++) {
        const angle = (s / sides) * Math.PI * 2;
        _vertex.set(
          (ring.x ?? 0) + Math.cos(angle) * ring.halfWidth,
          ring.y + Math.sin(angle) * ring.halfHeight,
          ring.z,
        );
        if (transform !== undefined) _vertex.applyMatrix4(transform);
        this.positions.push(_vertex.x, _vertex.y, _vertex.z);
        this.girth.push(Math.min(ring.halfWidth, ring.halfHeight), 0);
      }
    }

    for (let r = 0; r + 1 < rings.length; r++) {
      for (let s = 0; s < sides; s++) {
        const next = (s + 1) % sides;
        const a0 = base + r * sides + s;
        const a1 = base + r * sides + next;
        const b0 = base + (r + 1) * sides + s;
        const b1 = base + (r + 1) * sides + next;
        this.indices.push(a0, a1, b0, a1, b1, b0);
      }
    }

    const last = rings.length - 1;
    this.cap(rings[0]!, base, sides, false, transform);
    this.cap(rings[last]!, base + last * sides, sides, true, transform);
  }

  /** Fan the terminal ring to its own centre so the part is closed. */
  private cap(
    ring: LoftRing,
    ringStart: number,
    sides: number,
    forward: boolean,
    transform?: THREE.Matrix4,
  ): void {
    _vertex.set(ring.x ?? 0, ring.y, ring.z);
    if (transform !== undefined) _vertex.applyMatrix4(transform);
    const centre = this.positions.length / 3;
    this.positions.push(_vertex.x, _vertex.y, _vertex.z);
    this.girth.push(Math.min(ring.halfWidth, ring.halfHeight), 0);

    for (let s = 0; s < sides; s++) {
      const next = (s + 1) % sides;
      if (forward) this.indices.push(centre, ringStart + s, ringStart + next);
      else this.indices.push(centre, ringStart + next, ringStart + s);
    }
  }

  /**
   * Smooth (averaged) normals. Parts that do not share vertices keep their own
   * shading, so a leg pushed into the ribcage does not smear its normals across
   * the body; the toon ramp then sweeps a soft terminator over each volume
   * instead of faceting it.
   */
  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.girth, 2));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}
