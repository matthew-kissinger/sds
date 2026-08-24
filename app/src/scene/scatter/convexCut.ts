// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Half-space cutting: a block, a list of knives, a convex solid with flat faces.
 *
 * It is the only shape tool the stones use. A boulder is a broken thing, and a
 * broken thing is planes, so authoring one is choosing where the knives go
 * rather than displacing a sphere and hoping. Every face comes out flat and
 * carries its own normal, which is what makes the stones facet under the toon
 * ramp the way the canopies and the timber do.
 *
 * A single cut solid is convex by construction. A shape that is not convex, like
 * the split boulder with its cleft, is authored as two lobes cut separately and
 * placed against each other (scatter/rockGeometry.ts).
 *
 * Split out of rockGeometry.ts so the shapes file holds only shape decisions.
 */

export type Vector = [number, number, number];

export interface Facet {
  /** The plane's outward normal. Every vertex of the face carries it, so the
   *  facet is flat by construction rather than by `computeVertexNormals`. */
  readonly normal: Vector;
  readonly points: Vector[];
}

export interface Knife {
  readonly normal: Vector;
  /**
   * Support distance from the origin, in units of the starting block's radius.
   * SMALLER cuts deeper and leaves a LARGER face; larger leaves a smaller one.
   * May be negative, which puts the whole face on the far side of the origin -
   * that is how the second lobe of a cleft is held off to one side.
   */
  readonly distance: number;
}

/** Tolerance for "on the plane", in the same units as the distances. */
const EPSILON = 1e-5;
/** How close two cut points have to be to count as the same corner. */
const WELD = 1e-4;

export function normalise(v: Vector): Vector {
  const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

export function dot(a: Vector, b: Vector): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vector, b: Vector): Vector {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** The starting block: a cube big enough that every knife cuts it. */
function startingBlock(size: number): Facet[] {
  const axes: Vector[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  return axes.map((normal) => {
    const reference: Vector = Math.abs(normal[1]) > 0.5 ? [0, 0, 1] : [0, 1, 0];
    const u = normalise(cross(reference, normal));
    const v = cross(normal, u);
    const centre: Vector = [normal[0] * size, normal[1] * size, normal[2] * size];
    const points: Vector[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([a, b]) => [
      centre[0] + u[0] * a! * size + v[0] * b! * size,
      centre[1] + u[1] * a! * size + v[1] * b! * size,
      centre[2] + u[2] * a! * size + v[2] * b! * size,
    ]);
    return { normal, points };
  });
}

/** Order a ring of coplanar points counter-clockwise as seen from +normal. */
function orderRing(points: Vector[], normal: Vector): Vector[] {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of points) {
    cx += p[0];
    cy += p[1];
    cz += p[2];
  }
  const centre: Vector = [cx / points.length, cy / points.length, cz / points.length];
  const reference: Vector = Math.abs(normal[1]) > 0.5 ? [0, 0, 1] : [0, 1, 0];
  const u = normalise(cross(reference, normal));
  const v = cross(normal, u);
  return points
    .map((p) => {
      const d: Vector = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
      return { p, angle: Math.atan2(dot(d, v), dot(d, u)) };
    })
    .sort((a, b) => a.angle - b.angle)
    .map((entry) => entry.p);
}

/** Cut every face by one half-space and close the opening with a new face. */
function cut(faces: Facet[], knife: Knife): Facet[] {
  const normal = normalise(knife.normal);
  const out: Facet[] = [];
  const opening: Vector[] = [];

  const remember = (point: Vector): void => {
    for (const existing of opening) {
      if (
        Math.abs(existing[0] - point[0]) < WELD &&
        Math.abs(existing[1] - point[1]) < WELD &&
        Math.abs(existing[2] - point[2]) < WELD
      ) {
        return;
      }
    }
    opening.push(point);
  };

  for (const face of faces) {
    const kept: Vector[] = [];
    for (let i = 0; i < face.points.length; i++) {
      const a = face.points[i]!;
      const b = face.points[(i + 1) % face.points.length]!;
      const da = dot(a, normal) - knife.distance;
      const db = dot(b, normal) - knife.distance;
      if (da <= EPSILON) kept.push(a);
      // A corner already sitting on the knife is a corner of the opening, and
      // no crossing will be generated for it. Without this the new face loses
      // vertices wherever two knives happen to meet at an existing corner.
      if (da >= -EPSILON && da <= EPSILON) remember(a);
      const crosses = (da < -EPSILON && db > EPSILON) || (da > EPSILON && db < -EPSILON);
      if (!crosses) continue;
      const t = da / (da - db);
      const point: Vector = [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ];
      kept.push(point);
      remember(point);
    }
    if (kept.length >= 3) out.push({ normal: face.normal, points: kept });
  }

  if (opening.length >= 3) out.push({ normal, points: orderRing(opening, normal) });
  return out;
}

/** Cut a block by every knife in order. */
export function carve(knives: readonly Knife[]): Facet[] {
  let faces = startingBlock(2);
  for (const knife of knives) faces = cut(faces, knife);
  return faces;
}
