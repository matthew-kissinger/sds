// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The envelope the inverted-hull outline is grown from.
 *
 * It is a PLAIN closed shell of the same masses rather than the real geometry,
 * and closing it is not a nicety: the hull pushes every face out along its normal
 * and draws back faces only, so an open surface shows its back faces from
 * underneath, which reads as a hole punched in the building. Growing the real
 * roof - with its fascias, its barge boards and its ridge cap - would also grow
 * every one of those small steps into its own outline, and the roofline would
 * arrive at a hundred metres as a fringe rather than as a line.
 *
 * The section follows the same bow the slates do (farmhouse/roof.ts), so the
 * drawn line sits on the roof it belongs to instead of cutting a chord across it.
 */

import { NODES, SLAB, FASCIA, eaveDrop, hipCut, ridgeSag, type RoofOptions, type RoofSpec } from './roof';
import { BOW } from './slope';
import type { Local, Shell, Stand } from './shell';

/** Steps across half the section. Three is enough for the bow to read. */
const HALF_STEPS = 2;

/**
 * The roof as a closed envelope, section by section along the ridge. A hipped end
 * collapses the whole section above the fascia toward the eave over the hip's own
 * run, which traces the same silhouette the real hip plane does without repeating
 * its construction.
 */
export function roofHull(
  shell: Shell,
  place: Stand,
  spec: RoofSpec,
  options: RoofOptions = {},
): void {
  const span = spec.length / 2 + spec.endOverhang;
  const eaveZ = spec.width / 2 + spec.eaveOverhang;
  const rise = spec.ridgeHeight - spec.wallHeight;
  const flat = eaveZ - spec.ridgeFlat;
  const chord = Math.hypot(flat, rise);
  const az = flat / chord;
  const ay = rise / chord;
  const eaveZo = eaveZ + SLAB * ay;
  const ridgeZo = spec.ridgeFlat + SLAB * ay;
  const run = eaveZo - ridgeZo;
  const bow = rise * (spec.bow ?? BOW);

  const cutMinus = hipCut(spec, options, -1);
  const cutPlus = hipCut(spec, options, 1);

  // The section across the building, walked so consecutive pairs face outward.
  const ring = (t: number): readonly (readonly [number, number])[] => {
    const eaveY = spec.wallHeight - eaveDrop(spec, t) + SLAB * az;
    const ridgeY = spec.ridgeHeight - ridgeSag(spec, t) + SLAB * az;
    const x = -span + t * span * 2;
    const near = Math.min(
      cutMinus > 0 ? (x + span) / cutMinus : 1,
      cutPlus > 0 ? (span - x) / cutPlus : 1,
    );
    const k = Math.min(1, Math.max(0, near));
    const base = eaveY - (spec.eaveDepth ?? FASCIA);
    const flatten = (v: number): number => base + (v - base) * k;
    const y = (s: number): number =>
      flatten(eaveY + (ridgeY - eaveY) * s - bow * Math.sin(Math.PI * s));
    const points: (readonly [number, number])[] = [[base, eaveZo]];
    for (let i = 0; i <= HALF_STEPS; i++) {
      const s = i / HALF_STEPS;
      points.push([y(s), eaveZo - run * s]);
    }
    for (let i = HALF_STEPS; i >= 0; i--) {
      const s = i / HALF_STEPS;
      points.push([y(s), -(eaveZo - run * s)]);
    }
    points.push([base, -eaveZo]);
    return points;
  };

  for (let n = 0; n < NODES - 1; n++) {
    const t0 = n / (NODES - 1);
    const t1 = (n + 1) / (NODES - 1);
    const x0 = -span + t0 * span * 2;
    const x1 = -span + t1 * span * 2;
    const a = ring(t0);
    const b = ring(t1);
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      shell.quad(
        place,
        [x0, a[i]![0], a[i]![1]],
        [x1, b[i]![0], b[i]![1]],
        [x1, b[j]![0], b[j]![1]],
        [x0, a[j]![0], a[j]![1]],
      );
    }
  }

  // Gable caps, fanned from the first section point. The far one runs the same
  // fan with the winding reversed.
  for (const [t, x, flip] of [
    [0, -span, false],
    [1, span, true],
  ] as const) {
    const r = ring(t);
    for (let i = 1; i < r.length - 1; i++) {
      const a: Local = [x, r[0]![0], r[0]![1]];
      const b: Local = [x, r[i]![0], r[i]![1]];
      const c: Local = [x, r[i + 1]![0], r[i + 1]![1]];
      if (flip) shell.tri(place, a, c, b);
      else shell.tri(place, a, b, c);
    }
  }
}

type Pair = readonly [number, number];

/**
 * The masses of a baked building as its recipe recorded them, in the building's
 * own frame: `outlineEnvelope` in the GLB's root extras, read and checked by the
 * loader (farmhouse/kilnBarn.ts). Version 1.
 */
export interface OutlineEnvelope {
  /**
   * The roof slab, extruded along x between its verges. `top` is its outer
   * surface and `under` its underside, each a section across the ridge from one
   * eave edge to the other as [z, y]; corner i of one faces corner i of the
   * other across the slab.
   */
  readonly slab: {
    readonly x: Pair;
    readonly top: readonly Pair[];
    readonly under: readonly Pair[];
  };
  /** Upright boxes: the walls, and anything boarded that stands on the roof. */
  readonly boxes: readonly { readonly x: Pair; readonly y: Pair; readonly z: Pair }[];
  /** Square pyramids: a cap's eave square and its apex. */
  readonly caps: readonly {
    readonly x: Pair;
    readonly z: Pair;
    readonly y: number;
    readonly apex: readonly [number, number, number];
  }[];
}

/**
 * How far a cap's eave square is drawn in from the cap's own, so the outline
 * pushed down off its underside stays behind the cap's fascia instead of hanging
 * a line below it. A little over half the outline's width (materials.ts).
 */
const CAP_INSET = 0.05;

/** One planar face, its corners put in the order that faces it along `out`. */
function facing(shell: Shell, place: Stand, corners: readonly Local[], out: Local): void {
  const [a, b, c] = corners as [Local, Local, Local];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
  const ordered = n[0]! * out[0] + n[1]! * out[1] + n[2]! * out[2] < 0 ? [...corners].reverse() : corners;
  if (ordered.length === 4) shell.quad(place, ordered[0]!, ordered[1]!, ordered[2]!, ordered[3]!);
  else shell.tri(place, ordered[0]!, ordered[1]!, ordered[2]!);
}

/**
 * The envelope of a baked building, derived from the masses its recipe recorded
 * rather than from a copy of its numbers kept here (KILN_ROOF in plan.ts is that
 * copy for the house, and it drifted).
 *
 * THE ROOF IS THE TOP HALF OF THE SLAB. Its upper face is the slate's own outer
 * surface, so the outline sits on the roofline it draws; its lower face runs
 * halfway down to the slab's underside. The outline pushes every face out along
 * its normal and draws back faces only, so a full-depth envelope would push its
 * underside below the slab's cut edge, where it shows as a dark ledge under every
 * eave - the fault the farmhouse's envelope was measured to have. Half of the
 * barn's 200 mm slab plus the 90 mm push stays inside the slate. The verge ends
 * close it, so the gambrel's profile is outlined where the roof meets the sky.
 */
export function envelopeHull(shell: Shell, place: Stand, envelope: OutlineEnvelope): void {
  const { x: [x0, x1], top, under } = envelope.slab;
  const mid = top.map(([z, y], i): Pair => [(z + under[i]![0]) / 2, (y + under[i]![1]) / 2]);
  const ring = [...top, ...[...mid].reverse()];
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [za, ya] = ring[i]!;
    const [zb, yb] = ring[(i + 1) % ring.length]!;
    area += za * yb - zb * ya;
  }
  for (let i = 0; i < ring.length; i++) {
    const [za, ya] = ring[i]!;
    const [zb, yb] = ring[(i + 1) % ring.length]!;
    // Out of the section is the edge's right-hand side when the ring runs
    // counter-clockwise in (z, y), its left-hand side otherwise.
    const out: Local = area > 0 ? [0, -(zb - za), yb - ya] : [0, zb - za, -(yb - ya)];
    facing(shell, place, [[x0, ya, za], [x1, ya, za], [x1, yb, zb], [x0, yb, zb]], out);
  }
  for (const [x, out] of [[x0, -1], [x1, 1]] as const) {
    for (let i = 0; i + 1 < top.length; i++) {
      facing(
        shell,
        place,
        [
          [x, top[i]![1], top[i]![0]],
          [x, top[i + 1]![1], top[i + 1]![0]],
          [x, mid[i + 1]![1], mid[i + 1]![0]],
          [x, mid[i]![1], mid[i]![0]],
        ],
        [out, 0, 0],
      );
    }
  }

  // Boxes: four sides and a lid. The foot stands on the ground or in the slate,
  // and nothing sees under it.
  for (const { x: [bx0, bx1], y: [y0, y1], z: [bz0, bz1] } of envelope.boxes) {
    facing(shell, place, [[bx0, y0, bz0], [bx0, y1, bz0], [bx0, y1, bz1], [bx0, y0, bz1]], [-1, 0, 0]);
    facing(shell, place, [[bx1, y0, bz0], [bx1, y1, bz0], [bx1, y1, bz1], [bx1, y0, bz1]], [1, 0, 0]);
    facing(shell, place, [[bx0, y0, bz0], [bx1, y0, bz0], [bx1, y1, bz0], [bx0, y1, bz0]], [0, 0, -1]);
    facing(shell, place, [[bx0, y0, bz1], [bx1, y0, bz1], [bx1, y1, bz1], [bx0, y1, bz1]], [0, 0, 1]);
    facing(shell, place, [[bx0, y1, bz0], [bx1, y1, bz0], [bx1, y1, bz1], [bx0, y1, bz1]], [0, 1, 0]);
  }

  // Caps: four sloped faces to the apex and the eave square under them.
  for (const { x: [cx0, cx1], z: [cz0, cz1], y, apex } of envelope.caps) {
    const square: Local[] = [
      [cx0 + CAP_INSET, y, cz0 + CAP_INSET],
      [cx1 - CAP_INSET, y, cz0 + CAP_INSET],
      [cx1 - CAP_INSET, y, cz1 - CAP_INSET],
      [cx0 + CAP_INSET, y, cz1 - CAP_INSET],
    ];
    for (let i = 0; i < 4; i++) {
      const a = square[i]!;
      const b = square[(i + 1) % 4]!;
      const out: Local = [(a[0] + b[0]) / 2 - apex[0], 0.5, (a[2] + b[2]) / 2 - apex[2]];
      facing(shell, place, [a, b, apex], out);
    }
    facing(shell, place, square, [0, -1, 0]);
  }
}
