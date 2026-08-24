// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The homestead is welded, not assembled. Every surface is pushed through this
 * builder into ONE buffer per material, already carrying its world placement, so
 * the cluster costs a draw call per colour rather than a draw call per box.
 *
 * Four deliberate narrownesses:
 *
 *  - FLAT NORMALS BY DEFAULT. Each triangle gets its own geometric normal, which
 *    is what a toon ramp wants: a quantised band across a smoothed edge is a
 *    gradient smeared into a stripe, while a band across a hard edge is the
 *    crease that makes low-poly read as low-poly on purpose (spec/05's chunky,
 *    confident shapes). `smoothQuad` is the one exception and it exists for the
 *    roof slopes, which curve and want a terminator rather than a stair.
 *  - TWO UV CHANNELS THAT ARE NOT TEXTURE COORDINATES. Nothing here samples a
 *    texture. `uv.x` names WHICH surface a triangle is (limewash or masonry,
 *    house slate or barn slate) and `uv.y` measures a distance the material needs
 *    (metres up a roof slope, metres below an eave, height in a window pane).
 *    That pair is what lets one draw call carry two materials and what puts the
 *    slate courses parallel to the eave on every pitch in the cluster.
 *  - `mark` IS THE DEFAULT. Most surfaces want one constant pair, so set it once
 *    and every vertex after it carries it; only the surfaces that vary spell out
 *    a pair per corner.
 *  - WINDING IS THE CONTRACT. `quad(a, b, c, d)` faces the way
 *    cross(b - a, c - a) points. Materials stay single-sided, so a reversed quad
 *    is a hole rather than a slightly wrong shade, which is exactly the kind of
 *    mistake that should be loud.
 *
 * Construction time only. Nothing in this file runs in a frame.
 */

import * as THREE from 'three/webgpu';

/** A point in a building's own frame: +x along the ridge, y up, z across. */
export type Local = readonly [number, number, number];
/** The (surface, distance) pair described above. Never a texture coordinate. */
export type UV = readonly [number, number];

/** Where a building stands: its footprint centre, and its yaw about +Y. */
export interface Stand {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

export function stand(x: number, y: number, z: number, yaw: number): Stand {
  return { x, y, z, yaw };
}

/**
 * A second building placed in the first one's local frame. The cross wing and
 * the porch are positioned this way so their relationship to the main range is
 * a pair of numbers in the range's own axes rather than world coordinates that
 * have to be recomputed by hand whenever the cluster turns.
 */
export function offsetStand(base: Stand, dx: number, dz: number, dyaw: number): Stand {
  const sin = Math.sin(base.yaw);
  const cos = Math.cos(base.yaw);
  return {
    x: base.x + dx * cos + dz * sin,
    y: base.y,
    z: base.z - dx * sin + dz * cos,
    yaw: base.yaw + dyaw,
  };
}

/** One accumulating surface. Build it, then hand `build()` to a mesh. */
export class Shell {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private markU = 0;
  private markV = 0;

  /** Every vertex from here on carries this pair unless its call names one. */
  mark(u: number, v: number): void {
    this.markU = u;
    this.markV = v;
  }

  /** Two triangles, one flat normal, corners in order around the face. */
  quad(place: Stand, a: Local, b: Local, c: Local, d: Local, uv?: readonly UV[]): void {
    if (uv === undefined) {
      this.tri(place, a, b, c);
      this.tri(place, a, c, d);
      return;
    }
    this.tri(place, a, b, c, [uv[0]!, uv[1]!, uv[2]!]);
    this.tri(place, a, c, d, [uv[0]!, uv[2]!, uv[3]!]);
  }

  /** One triangle. Its normal is its own plane's, pointing out of the winding. */
  tri(place: Stand, a: Local, b: Local, c: Local, uv?: readonly UV[]): void {
    const sin = Math.sin(place.yaw);
    const cos = Math.cos(place.yaw);
    const ax = a[0] * cos + a[2] * sin;
    const az = -a[0] * sin + a[2] * cos;
    const bx = b[0] * cos + b[2] * sin;
    const bz = -b[0] * sin + b[2] * cos;
    const cx = c[0] * cos + c[2] * sin;
    const cz = -c[0] * sin + c[2] * cos;

    const ux = bx - ax;
    const uy = b[1] - a[1];
    const uz = bz - az;
    const vx = cx - ax;
    const vy = c[1] - a[1];
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    // A degenerate triangle has no plane to point out of. Drop it rather than
    // writing a NaN normal that would blacken whatever band it lands in.
    if (length < 1e-9) return;
    nx /= length;
    ny /= length;
    nz /= length;

    this.push(place.x + ax, place.y + a[1], place.z + az, nx, ny, nz, uv?.[0]);
    this.push(place.x + bx, place.y + b[1], place.z + bz, nx, ny, nz, uv?.[1]);
    this.push(place.x + cx, place.y + c[1], place.z + cz, nx, ny, nz, uv?.[2]);
  }

  /**
   * A quad with authored per-corner normals in the local frame. The roof slopes
   * are the only user: they curve from eave to ridge, and a curve wants the
   * ramp's own soft terminator running across it rather than one hard crease per
   * facet. Everything else in the cluster keeps its geometric normal.
   */
  smoothQuad(
    place: Stand,
    corners: readonly Local[],
    normals: readonly Local[],
    uv: readonly UV[],
  ): void {
    const sin = Math.sin(place.yaw);
    const cos = Math.cos(place.yaw);
    for (const i of [0, 1, 2, 0, 2, 3] as const) {
      const p = corners[i]!;
      const n = normals[i]!;
      this.push(
        place.x + p[0] * cos + p[2] * sin,
        place.y + p[1],
        place.z - p[0] * sin + p[2] * cos,
        n[0] * cos + n[2] * sin,
        n[1],
        -n[0] * sin + n[2] * cos,
        uv[i]!,
      );
    }
  }

  /**
   * A closed box in the local frame, given its centre and half extents. Five
   * faces: the underside is drawn only when something can see under it.
   */
  box(place: Stand, centre: Local, half: Local, options: { readonly floor?: boolean } = {}): void {
    this.taperedBox(place, centre, half, half, options);
  }

  /**
   * A box whose top half-extents differ from its bottom ones: the chimney, the
   * plinth chamfer, the log stack. A taper is what gives a vertical mass a
   * silhouette at distance, and it also turns four faces that would all read the
   * same into four faces that each sit a little differently against the sun.
   */
  taperedBox(
    place: Stand,
    centre: Local,
    halfLow: Local,
    halfHigh: Local,
    options: { readonly floor?: boolean; readonly lean?: readonly [number, number] } = {},
  ): void {
    const [cx, cy, cz] = centre;
    const y0 = cy - halfLow[1];
    const y1 = cy + halfHigh[1];
    const lx = halfLow[0];
    const lz = halfLow[2];
    const hx = halfHigh[0];
    const hz = halfHigh[2];
    // How far the top ring is pushed off plumb. A chimney that is a few
    // centimetres out of true is the difference between a cottage that settled
    // and a box that was extruded.
    const kx = options.lean === undefined ? 0 : options.lean[0];
    const kz = options.lean === undefined ? 0 : options.lean[1];

    // Bottom ring, then top ring, in the same corner order.
    const b: Local[] = [
      [cx - lx, y0, cz - lz],
      [cx + lx, y0, cz - lz],
      [cx + lx, y0, cz + lz],
      [cx - lx, y0, cz + lz],
    ];
    const t: Local[] = [
      [cx - hx + kx, y1, cz - hz + kz],
      [cx + hx + kx, y1, cz - hz + kz],
      [cx + hx + kx, y1, cz + hz + kz],
      [cx - hx + kx, y1, cz + hz + kz],
    ];

    this.quad(place, b[1]!, b[0]!, t[0]!, t[1]!);
    this.quad(place, b[3]!, b[2]!, t[2]!, t[3]!);
    this.quad(place, b[0]!, b[3]!, t[3]!, t[0]!);
    this.quad(place, b[2]!, b[1]!, t[1]!, t[2]!);
    this.quad(place, t[0]!, t[3]!, t[2]!, t[1]!);
    if (options.floor === true) this.quad(place, b[3]!, b[0]!, b[1]!, b[2]!);
  }

  /**
   * A flat panel standing proud of a wall: door leaves, glass, shutters. `face`
   * names the wall it sits on, `across` runs along that wall and `y` up it. The
   * uv pair, when given, runs bottom-to-top so a pane can carry its own height.
   */
  panel(
    place: Stand,
    face: 'minusX' | 'plusX' | 'minusZ' | 'plusZ',
    wall: number,
    across: readonly [number, number],
    y: readonly [number, number],
    proud: number,
    uv?: readonly [UV, UV],
  ): void {
    const [a0, a1] = across;
    const [y0, y1] = y;
    const corners: readonly UV[] | undefined =
      uv === undefined ? undefined : [uv[0], uv[0], uv[1], uv[1]];
    if (face === 'minusX') {
      const x = wall - proud;
      this.quad(place, [x, y0, a0], [x, y0, a1], [x, y1, a1], [x, y1, a0], corners);
    } else if (face === 'plusX') {
      const x = wall + proud;
      this.quad(place, [x, y0, a1], [x, y0, a0], [x, y1, a0], [x, y1, a1], corners);
    } else if (face === 'minusZ') {
      const z = wall - proud;
      this.quad(place, [a1, y0, z], [a0, y0, z], [a0, y1, z], [a1, y1, z], corners);
    } else {
      const z = wall + proud;
      this.quad(place, [a0, y0, z], [a1, y0, z], [a1, y1, z], [a0, y1, z], corners);
    }
  }

  private push(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    uv: UV | undefined,
  ): void {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.uvs.push(uv === undefined ? this.markU : uv[0], uv === undefined ? this.markV : uv[1]);
  }

  /** The finished buffer, or null if nothing was ever pushed into it. */
  build(): THREE.BufferGeometry | null {
    if (this.positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(this.positions), 3),
    );
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uvs), 2));
    geometry.computeBoundingSphere();
    return geometry;
  }
}
