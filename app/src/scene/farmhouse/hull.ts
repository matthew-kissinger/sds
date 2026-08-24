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
  const bow = rise * 0.055;

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
    const base = eaveY - FASCIA;
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
