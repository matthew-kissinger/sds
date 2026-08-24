// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The roof, which is most of what this asset is at a hundred metres.
 *
 * ONE END IS HIPPED, AND THAT IS THE WHOLE ANSWER TO A FLAT ROOF. The previous
 * pass rendered three roof planes at three orientations within three luminance
 * points of each other, and the arithmetic says why. The sun is 8 degrees up on a
 * bearing that runs almost exactly along the main ridge, so BOTH long slopes sit
 * within a fiftieth of nDotL of one another however steeply they are pitched: on
 * this bearing pitch is not a lever at all, only AZIMUTH is. A hipped end is a
 * roof plane whose azimuth is turned ninety degrees from the long slopes - it
 * faces the camera and it faces away from the sun - so it lands in the shadow
 * band at nDotL 0.23 while the long slope beside it sits in the key band at 0.63.
 * That is a seventy-point step across a shared arris, which is the terminator the
 * roof mass never had.
 *
 * It also buys the silhouette: a range that is gabled at one end and hipped at
 * the other cannot read as triangle-on-box from any angle.
 *
 * EVERY SLOPE VERTEX CARRIES `uv.y`, THE METRES FROM ITS EAVE, and `uv.x` names
 * WHICH slate: 0 is the house range, 1 is the barn and the lean-to, which take a
 * browner band a step down. Boards that are not slate carry uv.y = -1, which is
 * how the material knows to leave them plain. The (t, s) arithmetic behind those
 * numbers lives in farmhouse/slope.ts.
 *
 * THE SLOPES ARE ONE UNBROKEN SURFACE. Modelling every course as a real riser
 * broke the verge into a stair of notches against the sky, so the courses are
 * painted and the geometry keeps one edge. THE RIDGE SAGS AND THE EAVE SETTLES,
 * both small, and both the difference between a cottage and a CAD extrusion.
 */

import type { Local, Shell, Stand, UV } from './shell';
import {
  CROSS,
  FASCIA,
  hipCut,
  ridgeSag,
  slopeNormal,
  slopeOf,
  slopePoint,
  slopeY,
  SLAB,
  NODES,
  type RoofOptions,
  type RoofSpec,
  type Slope,
} from './slope';

export { NODES, SLAB, FASCIA, eaveDrop, hipCut, ridgeSag, roofSurfaceLocal } from './slope';
export type { RoofOptions, RoofSpec } from './slope';

/**
 * The whole slab: two slopes clipped back at any hipped end, a fascia under each
 * eave, a raking board at each gable, the hip planes, and a cap along the apex.
 */
export function courseRoof(
  shell: Shell,
  place: Stand,
  spec: RoofSpec,
  options: RoofOptions = {},
): void {
  const span = spec.length / 2 + spec.endOverhang;
  const tag = options.tag ?? 0;
  const cutMinus = hipCut(spec, options, -1);
  const cutPlus = hipCut(spec, options, 1);
  /** Where the slate stops along the ridge at height `s`, per end. */
  const limit = (end: -1 | 1, s: number): number =>
    end * (span - (end < 0 ? cutMinus : cutPlus) * s);
  shell.mark(tag, -1);

  for (const side of [-1, 1] as const) {
    const slope = slopeOf(spec, side);
    const xAt = (t: number, s: number): number =>
      limit(-1, s) + t * (limit(1, s) - limit(-1, s));
    const at = (t: number, s: number): Local => slopePoint(spec, slope, xAt(t, s), t, s);
    const nAt = (t: number, s: number): Local => slopeNormal(spec, slope, t, s);
    const uvAt = (s: number): UV => [tag, s * slope.span];

    for (let n = 0; n < NODES - 1; n++) {
      const t0 = n / (NODES - 1);
      const t1 = (n + 1) / (NODES - 1);

      for (let m = 0; m < CROSS; m++) {
        const s0 = m / CROSS;
        const s1 = (m + 1) / CROSS;
        const corners: Local[] =
          side > 0
            ? [at(t0, s0), at(t1, s0), at(t1, s1), at(t0, s1)]
            : [at(t1, s0), at(t0, s0), at(t0, s1), at(t1, s1)];
        const normals: Local[] =
          side > 0
            ? [nAt(t0, s0), nAt(t1, s0), nAt(t1, s1), nAt(t0, s1)]
            : [nAt(t1, s0), nAt(t0, s0), nAt(t0, s1), nAt(t1, s1)];
        shell.smoothQuad(place, corners, normals, [uvAt(s0), uvAt(s0), uvAt(s1), uvAt(s1)]);
      }

      eave(shell, place, spec, slope, [at(t0, 0), at(t1, 0)]);
    }

    for (const end of [-1, 1] as const) {
      if (options.skipEnd === end || options.hipEnd === end) continue;
      rake(shell, place, spec, slope, end * span);
    }
  }

  for (const end of [-1, 1] as const) {
    if (options.hipEnd !== end) continue;
    hip(shell, place, spec, end, spec.hipRun ?? 0, tag);
  }

  // The cap runs the FULL verge, and the half metre it used to stop short of was
  // a real hole: the gable wall behind it climbs to the ridge, the slate stops
  // 0.22 m either side of the apex, and with nothing over that last stretch the
  // lit gable showed through as a warm spike above the roofline at every gable in
  // the cluster. Where a hip cuts the ridge back the cap still stops exactly
  // where the slate does.
  const capSpan = spec.length / 2 + spec.endOverhang;
  ridgeCap(
    shell,
    place,
    spec,
    cutMinus > 0 ? -span + cutMinus : -capSpan,
    cutPlus > 0 ? span - cutPlus : capSpan,
  );
}

/**
 * The hip: one plane sweeping from the full-width eave line at the end up to the
 * ridge, hung on a single authored normal so the slate's own bow cannot facet it.
 */
function hip(shell: Shell, place: Stand, spec: RoofSpec, end: -1 | 1, run: number, tag: number): void {
  const span = spec.length / 2 + spec.endOverhang;
  const slope = slopeOf(spec, 1);
  const t = end > 0 ? 1 : 0;
  const rise = slopeY(spec, slope, t, 1) - slopeY(spec, slope, t, 0);
  const len = Math.hypot(rise, run) || 1;
  const normal: Local = [(end * rise) / len, run / len, 0];
  const chord = len;

  const level = (s: number): { x: number; y: number; z: number } => ({
    x: end * (span - run * s),
    y: slopeY(spec, slope, t, s),
    z: slope.eaveZo - slope.run * s,
  });

  for (let m = 0; m < CROSS; m++) {
    const a = level(m / CROSS);
    const b = level((m + 1) / CROSS);
    const ua: UV = [tag, (m / CROSS) * chord];
    const ub: UV = [tag, ((m + 1) / CROSS) * chord];
    const corners: Local[] =
      end > 0
        ? [[a.x, a.y, a.z], [a.x, a.y, -a.z], [b.x, b.y, -b.z], [b.x, b.y, b.z]]
        : [[a.x, a.y, -a.z], [a.x, a.y, a.z], [b.x, b.y, b.z], [b.x, b.y, -b.z]];
    shell.smoothQuad(place, corners, [normal, normal, normal, normal], [ua, ua, ub, ub]);
  }

  // The fascia across the hip's own eave, so the end has an edge rather than a
  // line where the slate stops.
  shell.mark(tag, -1);
  const foot = level(0);
  const x = end * span;
  const y = foot.y - FASCIA;
  if (end > 0) {
    shell.quad(place, [x, y, -foot.z], [x, y, foot.z], [x, foot.y, foot.z], [x, foot.y, -foot.z]);
  } else {
    shell.quad(place, [x, y, foot.z], [x, y, -foot.z], [x, foot.y, -foot.z], [x, foot.y, foot.z]);
  }
}

/** The fascia board hanging off the eave and the soffit behind it. */
function eave(
  shell: Shell,
  place: Stand,
  spec: RoofSpec,
  slope: Slope,
  top: readonly [Local, Local],
): void {
  const [t0, t1] = top;
  const f0: Local = [t0[0], t0[1] - FASCIA, t0[2]];
  const f1: Local = [t1[0], t1[1] - FASCIA, t1[2]];
  const wallZ = slope.side * (spec.width / 2);
  const s0: Local = [t0[0], f0[1], wallZ];
  const s1: Local = [t1[0], f1[1], wallZ];

  if (slope.side > 0) {
    shell.quad(place, f0, f1, t1, t0);
    shell.quad(place, s0, s1, f1, f0);
  } else {
    shell.quad(place, f1, f0, t0, t1);
    shell.quad(place, s1, s0, f0, f1);
  }
}

/** The raking barge board at a gable end, following the slope's curve. */
function rake(shell: Shell, place: Stand, spec: RoofSpec, slope: Slope, x: number): void {
  const t = x > 0 ? 1 : 0;
  const outward = x > 0 ? 1 : -1;
  const inner = x - outward * spec.endOverhang;

  for (let m = 0; m < CROSS; m++) {
    const ta = slopePoint(spec, slope, x, t, m / CROSS);
    const tb = slopePoint(spec, slope, x, t, (m + 1) / CROSS);
    const la: Local = [x, ta[1] - FASCIA, ta[2]];
    const lb: Local = [x, tb[1] - FASCIA, tb[2]];
    if (slope.side * outward > 0) shell.quad(place, la, lb, tb, ta);
    else shell.quad(place, lb, la, ta, tb);

    const ia: Local = [inner, la[1], la[2]];
    const ib: Local = [inner, lb[1], lb[2]];
    if (outward === -slope.side) shell.quad(place, la, lb, ib, ia);
    else shell.quad(place, la, ia, ib, lb);
  }
}

/**
 * The cap along the apex, following the sag, stopped short at a hipped end and
 * closed at both. Its top faces straight up, which under this sun is the
 * brightest reading on the building: a lit line along the very top of the
 * silhouette, for free, from the ramp that lights everything else.
 */
function ridgeCap(
  shell: Shell,
  place: Stand,
  spec: RoofSpec,
  xMinus: number,
  xPlus: number,
): void {
  const span = spec.length / 2 + spec.endOverhang;
  const half = spec.ridgeFlat + 0.3;
  const top = half * 0.62;
  const drop = 0.3;
  const tOf = (x: number): number => (x + span) / (2 * span);
  const y = (x: number): number => spec.ridgeHeight - ridgeSag(spec, tOf(x)) + SLAB + 0.12;

  for (let n = 0; n < NODES - 1; n++) {
    const x0 = xMinus + ((xPlus - xMinus) * n) / (NODES - 1);
    const x1 = xMinus + ((xPlus - xMinus) * (n + 1)) / (NODES - 1);
    const y0 = y(x0);
    const y1 = y(x1);
    shell.quad(place, [x0, y0, -top], [x0, y0, top], [x1, y1, top], [x1, y1, -top]);
    shell.quad(place, [x0, y0, top], [x0, y0 - drop, half], [x1, y1 - drop, half], [x1, y1, top]);
    shell.quad(place, [x0, y0, -top], [x1, y1, -top], [x1, y1 - drop, -half], [x0, y0 - drop, -half]);
  }

  for (const [x, out] of [
    [xMinus, -1],
    [xPlus, 1],
  ] as const) {
    const yc = y(x);
    const face: Local[] = [
      [x, yc, -top],
      [x, yc, top],
      [x, yc - drop, half],
      [x, yc - drop, -half],
    ];
    if (out > 0) shell.quad(place, face[0]!, face[1]!, face[2]!, face[3]!);
    else shell.quad(place, face[3]!, face[2]!, face[1]!, face[0]!);
  }
}
