// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The fallen log, as triangles. Every shape decision lives next door in
 * scatter/logProfile.ts; this file only lays tubes through rings and caps them.
 *
 * A RING IS FOURTEEN RADII, NOT ONE. That is the change that let the silhouette
 * be rebuilt: the bites out of the top edge, the lengthwise crack and the
 * splinter crown at the far end are all per-side radii and per-side reaches
 * authored into the profile, so the tube builder stays a tube builder and the
 * shape stays readable as a list of decisions.
 *
 * WHAT THE SHADER READS OFF A VERTEX:
 *
 *   position  log-local metres, the butt break at the origin, length along +x
 *   normal    the facet's own, flat, and near-radial on the barrel - which is
 *             what lets `normalLocal.y` stand in for the angle around the trunk
 *   uv        (shell, heart) - `shell` is 0 on the surface and -1 on the contour
 *             hull; `heart` is how much pale sapwood shows
 *   uv1       (disc, turn) - `disc` is the radius across a SAWN cut face, 0 at
 *             its centre and 1 at its rim, and -1 everywhere else, so it drives
 *             the growth rings and gates them off the rest of the log; `turn` is
 *             the bearing around that face, 0 to 1, which the radial checks read
 *
 * THE CONTOUR IS IN THE SAME BUFFER as the solid, swollen by OUTLINE_WIDTH with
 * its winding reversed, so front-face culling keeps exactly the triangles a
 * `side: BackSide` pass would have kept. One draw call for the log and its line.
 */

import * as THREE from 'three/webgpu';
import { OUTLINE_WIDTH } from './outline';
import { BREAK_CENTRE, SIDES, stubRings, trunkRings, type Ring } from './logProfile';

type Vector = readonly [number, number, number];

interface Builder {
  readonly positions: number[];
  readonly uvs: number[];
  readonly discs: number[];
  readonly indices: number[];
}

interface TubeOptions {
  readonly rings: readonly Ring[];
  readonly side: Vector;
  readonly about: Vector;
  /** The tube's own axis, used to push the caps out on the contour shell. */
  readonly axis: Vector;
  /** Metres the surface is swollen by. Zero for the solid; OUTLINE_WIDTH for
   *  the contour, which is also what flips the winding. */
  readonly swell: number;
}

function normalise(v: Vector): Vector {
  const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a: Vector, b: Vector): Vector {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** True when a ring's sides run out past it, which is what a break looks like
 *  and what a sawn end does not. */
function isBreak(ring: Ring): boolean {
  return ring.reach.some((reach) => reach !== 0);
}

/** One side of one ring, in world-of-the-log metres. */
function ringPoint(ring: Ring, options: TubeOptions, s: number, push: number): Vector {
  const { side, about, axis, swell } = options;
  const angle = (s / SIDES) * Math.PI * 2;
  const radius = ring.radii[s]! + swell;
  const along = ring.reach[s]! + push;
  const across = Math.cos(angle) * radius;
  const up = Math.sin(angle) * radius;
  return [
    ring.x + side[0] * across + about[0] * up + axis[0] * along,
    ring.y + side[1] * across + about[1] * up + axis[1] * along,
    ring.z + side[2] * across + about[2] * up + axis[2] * along,
  ];
}

/** Cap one end: a fan from a centre point out to the ring's own sides. A sawn
 *  end carries the disc coordinate the growth rings read; a splintered one does
 *  not, and shows plain pale wood instead. */
function appendCap(builder: Builder, options: TubeOptions, at: number, push: number): void {
  const { rings, axis, swell } = options;
  const ring = rings[at]!;
  const start = at === 0;
  const shell = swell > 0;
  const broken = isBreak(ring);
  const flag = shell ? -1 : 0;
  const disc = shell || broken ? -1 : 0;
  const centreAlong = push + (broken ? (start ? -BREAK_CENTRE : BREAK_CENTRE) : 0);

  const centre = builder.positions.length / 3;
  builder.positions.push(
    ring.x + axis[0] * centreAlong,
    ring.y + axis[1] * centreAlong,
    ring.z + axis[2] * centreAlong,
  );
  builder.uvs.push(flag, shell ? 0 : 1);
  builder.discs.push(disc, 0);

  for (let s = 0; s < SIDES; s++) {
    const p = ringPoint(ring, options, s, push);
    builder.positions.push(p[0], p[1], p[2]);
    // Not zero at the rim: the pale wood has to meet the collar behind it at
    // roughly the same value, or the cut reads as a disc glued on the end.
    builder.uvs.push(flag, shell ? 0 : 0.55);
    builder.discs.push(shell || broken ? -1 : 1, s / SIDES);
  }

  for (let s = 0; s < SIDES; s++) {
    const rim = centre + 1 + s;
    const next = centre + 1 + ((s + 1) % SIDES);
    const forward = start ? [centre, rim, next] : [centre, next, rim];
    if (shell) builder.indices.push(forward[0]!, forward[2]!, forward[1]!);
    else builder.indices.push(forward[0]!, forward[1]!, forward[2]!);
  }
}

/**
 * Lay a tube through a list of rings and cap both ends.
 *
 * The winding is reversed on the swollen shell, which is what makes front-face
 * culling keep exactly the triangles a back-face pass would keep - the outline,
 * in the same buffer as the surface (scatter/outline.ts).
 */
function appendTube(builder: Builder, options: TubeOptions): void {
  const { rings, swell } = options;
  const shell = swell > 0;
  const base = builder.positions.length / 3;
  const last = rings.length - 1;

  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]!;
    // The shell's end rings step out along the axis as well as outward, so the
    // contour closes round the cut faces instead of stopping at their rim.
    const push = shell ? (r === 0 ? -swell : r === last ? swell : 0) : 0;
    for (let s = 0; s < SIDES; s++) {
      const p = ringPoint(ring, options, s, push);
      builder.positions.push(p[0], p[1], p[2]);
      builder.uvs.push(shell ? -1 : 0, shell ? 0 : ring.heart);
      builder.discs.push(-1, 0);
    }
  }

  for (let r = 0; r + 1 < rings.length; r++) {
    for (let s = 0; s < SIDES; s++) {
      const next = (s + 1) % SIDES;
      const a = base + r * SIDES + s;
      const b = base + r * SIDES + next;
      const c = base + (r + 1) * SIDES + next;
      const d = base + (r + 1) * SIDES + s;
      if (shell) builder.indices.push(a, b, c, a, c, d);
      else builder.indices.push(a, c, b, a, d, c);
    }
  }

  // Caps get their own vertices, so a cut face keeps its own coordinates and
  // its own flat normal rather than borrowing the barrel's.
  appendCap(builder, options, 0, shell ? -swell : 0);
  appendCap(builder, options, last, shell ? swell : 0);
}

/** An orthonormal frame across `axis`. The reference is swapped when the axis is
 *  nearly parallel to it, which is the only case that would degenerate. */
function frameFor(axis: Vector): { side: Vector; about: Vector } {
  const reference: Vector = Math.abs(axis[0]) < 0.85 ? [1, 0, 0] : [0, 1, 0];
  const side = normalise(cross(reference, axis));
  return { side, about: normalise(cross(axis, side)) };
}

export function buildLogGeometry(): THREE.BufferGeometry {
  const builder: Builder = { positions: [], uvs: [], discs: [], indices: [] };
  const trunk = trunkRings();
  // The stub hangs off the barrel proper, not off the collar or the splinters.
  const core = trunk.slice(1, -1);
  const stub = stubRings(core);
  const stubAxis = normalise([
    stub[1]!.x - stub[0]!.x,
    stub[1]!.y - stub[0]!.y,
    stub[1]!.z - stub[0]!.z,
  ]);
  const stubFrame = frameFor(stubAxis);
  const trunkAxis: Vector = [1, 0, 0];

  for (const swell of [0, OUTLINE_WIDTH]) {
    appendTube(builder, { rings: trunk, side: [0, 0, 1], about: [0, 1, 0], axis: trunkAxis, swell });
    appendTube(builder, {
      rings: stub,
      side: stubFrame.side,
      about: stubFrame.about,
      axis: stubAxis,
      swell,
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(builder.positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(builder.uvs, 2));
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(builder.discs, 2));
  geometry.setIndex(builder.indices);
  // Flat facets, the same way the stones get theirs: split the shared vertices,
  // then let each triangle own its normal. Nothing is jittered afterwards.
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.computeVertexNormals();
  faceted.computeBoundingSphere();
  return faceted;
}
