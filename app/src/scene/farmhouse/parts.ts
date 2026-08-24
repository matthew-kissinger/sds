// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Everything that is not roof or chimney: the wall solid, the openings, the
 * lean-to and the log stack.
 *
 * NO WALL FACE IS AN UNTOUCHED FILL. Every wall vertex carries, in `uv.y`, how
 * far below a roof edge it sits, and the wall materials draw a hard shadow band
 * in the first half metre of that. Under a long eave the band is level; under a
 * gable it follows the rake, because the gable triangle is built as an inner
 * triangle inside two raking strips rather than as one flat sheet.
 * `uv.y = 9` means no roof edge above, which is how the material knows to leave a
 * surface alone.
 *
 * AN OPENING IS A DARK NOTE AND NOTHING ELSE. The previous pass modelled five
 * small solids per window - two jambs, a lintel, a projecting sill and a mullion -
 * and the resulting joinery rendered at sRGB 194 against a wall at 133: at a
 * hundred metres the trim was brighter, busier and more detailed than the sheep
 * the player is meant to be looking at. Scenery must never out-detail the hero
 * asset. What is left is one panel per opening, standing six centimetres proud so
 * it takes its own band, in the one warm-dark tone the palette allows.
 *
 * THE LEAN-TO IS BOARDS, NOT LIMEWASH, AND IT REACHES THE GROUND. Both are
 * corrections. Limewashed, its end wall took the key almost square on and was the
 * brightest object in the frame; and its roof carried a 0.3 m overhang on three
 * sides, which from the Classic camera showed pasture underneath a plane that was
 * supposed to be sitting on a wall.
 *
 * THE WALLS FOLLOW THE RIDGE DOWN. The roof sags between its gables, so the wall
 * solid's own closing slopes sag with it and sit a further 0.16 m under the slate.
 */

import { hipCut, ridgeSag, type RoofOptions, type RoofSpec } from './roof';
import type { Local, Shell, Stand, UV } from './shell';

/** Which wall an opening sits on, in the building's own frame. */
export type Face = 'minusX' | 'plusX' | 'minusZ' | 'plusZ';

/** How far the wall's closing slopes hide under the slate. */
const TUCK = 0.16;
/** Nodes along the closing slopes. Matches the roof closely enough to hide. */
const NODES = 9;
/** uv.y for a surface with no roof edge over it. Well past the band. */
const OPEN_SKY = 9;
/** How far in from the verge the raking shadow strip reaches, as a fraction. */
const RAKE_INSET = 0.78;

export type WallOptions = RoofOptions;

/**
 * The wall solid: four walls, a gable triangle at each end that is not hipped or
 * buried, and the two roof-line slopes that close the volume under the overhang.
 * Origin at the centre of the footprint, on the ground.
 */
export function gableWalls(
  shell: Shell,
  place: Stand,
  spec: RoofSpec,
  options: WallOptions = {},
): void {
  const l = spec.length / 2;
  const w = spec.width / 2;
  const wall = spec.wallHeight;
  const ridge = spec.ridgeHeight;
  shell.mark(0, OPEN_SKY);

  // The long walls, which have an eave over them: 0 at the wall head, the full
  // wall height at the footing.
  const foot: UV = [0, wall];
  const head: UV = [0, 0];
  const run: readonly UV[] = [foot, foot, head, head];
  shell.quad(place, [l, 0, -w], [-l, 0, -w], [-l, wall, -w], [l, wall, -w], run);
  shell.quad(place, [-l, 0, w], [l, 0, w], [l, wall, w], [-l, wall, w], run);

  // The end walls. The rectangle below the springing takes no band; the gable
  // triangle over it carries its own, and a hipped end has no triangle at all.
  if (options.skipEnd !== -1) {
    shell.quad(place, [-l, 0, -w], [-l, 0, w], [-l, wall, w], [-l, wall, -w]);
    if (options.hipEnd !== -1) {
      gableFace(shell, place, [-l, wall, -w], [-l, wall, w], [-l, ridge, 0]);
    }
  }
  if (options.skipEnd !== 1) {
    shell.quad(place, [l, 0, w], [l, 0, -w], [l, wall, -w], [l, wall, w]);
    if (options.hipEnd !== 1) {
      gableFace(shell, place, [l, wall, w], [l, wall, -w], [l, ridge, 0]);
    }
  }

  // The closing slopes, sagging with the ridge above them and stopping where a
  // hip cuts the ridge back.
  const xMinus = -l + Math.max(0, hipCut(spec, options, -1) - spec.endOverhang);
  const xPlus = l - Math.max(0, hipCut(spec, options, 1) - spec.endOverhang);
  for (let n = 0; n < NODES - 1; n++) {
    const x0 = xMinus + ((xPlus - xMinus) * n) / (NODES - 1);
    const x1 = xMinus + ((xPlus - xMinus) * (n + 1)) / (NODES - 1);
    const t0 = (x0 + l) / (2 * l);
    const t1 = (x1 + l) / (2 * l);
    const y0 = ridge - ridgeSag(spec, t0) - (n === 0 ? 0 : TUCK);
    const y1 = ridge - ridgeSag(spec, t1) - (n === NODES - 2 ? 0 : TUCK);
    shell.quad(place, [x1, wall, -w], [x0, wall, -w], [x0, y0, 0], [x1, y1, 0]);
    shell.quad(place, [x0, wall, w], [x1, wall, w], [x1, y1, 0], [x0, y0, 0]);
  }
}

/**
 * One gable triangle, built as an inner field inside two raking strips. The
 * strips sit under the barge board and carry the band uv, so the shadow the
 * verge throws runs parallel to the rake instead of level across the wall.
 */
function gableFace(shell: Shell, place: Stand, a: Local, b: Local, c: Local): void {
  const gx = a[0];
  const gy = (a[1] + b[1] + c[1]) / 3;
  const gz = (a[2] + b[2] + c[2]) / 3;
  const pull = (p: Local): Local => [
    gx,
    gy + (p[1] - gy) * RAKE_INSET,
    gz + (p[2] - gz) * RAKE_INSET,
  ];
  const ai = pull(a);
  const bi = pull(b);
  const ci = pull(c);

  shell.tri(place, ai, bi, ci);
  shell.quad(place, a, b, bi, ai);
  const verge: UV = [0, 0];
  const inner: UV = [0, 0.42];
  const strip: readonly UV[] = [verge, verge, inner, inner];
  shell.quad(place, b, c, ci, bi, strip);
  shell.quad(place, c, a, ai, ci, strip);
}

export interface Opening {
  readonly face: Face;
  /** Wall plane in the building's frame. */
  readonly wall: number;
  /** Centre of the opening along that wall. */
  readonly across: number;
  /** Height of the sill above the footing. */
  readonly sill: number;
  readonly width: number;
  readonly height: number;
  /** A lamp is burning behind this one. */
  readonly lit?: boolean;
}

/** How far an opening stands proud of the render. Enough to take its own band. */
const OPENING_OUT = 0.06;

/**
 * One opening, window or door: a single panel in the shell it is handed. Windows
 * and doors are the same object at this distance and there is no reason for them
 * to be two.
 */
export function openingPanel(shell: Shell, place: Stand, o: Opening): void {
  shell.mark(0, 0);
  shell.panel(
    place,
    o.face,
    o.wall,
    [o.across - o.width / 2, o.across + o.width / 2],
    [o.sill, o.sill + o.height],
    OPENING_OUT,
  );
}

/**
 * A lean-to against a long wall: a boarded mono-pitch shed sloping down toward
 * the approach, seated on the pad, with its roof trimmed to its own walls.
 *
 * Its pitch is chosen, not styled. Sloping down toward the camera at 22 degrees
 * puts the shed roof at nDotL 0.61 - the key band - so a small warm-lit plane
 * lands low on a facade that is otherwise one tall wall. `at` is along the wall,
 * in the building's own frame.
 */
export function leanTo(
  roof: Shell,
  timber: Shell,
  place: Stand,
  spec: RoofSpec,
  at: number,
  half: number,
): void {
  const back = -spec.width / 2;
  const depth = 2.8;
  const high = 3.6;
  const low = 2.35;
  const front = back - depth;
  const xa = at - half;
  const xb = at + half;
  const foot: UV = [0, low];
  const head: UV = [0, 0];

  timber.mark(0, OPEN_SKY);
  // Front wall and the two ends, all reaching the pad and all under the main
  // eave. The ends take the band as well: their heads run under the shed's own
  // raking verge.
  timber.quad(place, [xb, 0, front], [xa, 0, front], [xa, low, front], [xb, low, front], [
    foot,
    foot,
    head,
    head,
  ]);
  const rakeB: readonly UV[] = [[0, high], [0, low], head, head];
  const rakeA: readonly UV[] = [[0, low], [0, high], head, head];
  timber.quad(place, [xb, 0, back], [xb, 0, front], [xb, low, front], [xb, high, back], rakeB);
  timber.quad(place, [xa, 0, front], [xa, 0, back], [xa, high, back], [xa, low, front], rakeA);

  // The slope, flush with the front wall and reaching a hand's breadth past the
  // ends only. Nothing on this shed overhangs into air.
  const over = 0.16;
  const oa = xa - over;
  const ob = xb + over;
  roof.mark(1, -1);
  roof.quad(place, [oa, low, front], [oa, high, back], [ob, high, back], [ob, low, front]);
  roof.quad(place, [ob, low - 0.2, front], [oa, low - 0.2, front], [oa, low, front], [ob, low, front]);
}

/**
 * The log stack, and the only yard clutter left: one mass with a clear
 * silhouette, four rows deep, each row shorter than the one under it, so it reads
 * as a pile rather than as a box.
 */
export function logStack(shell: Shell, place: Stand, at: readonly [number, number]): void {
  shell.mark(0, OPEN_SKY);
  for (let row = 0; row < 4; row++) {
    const half = 1.55 - row * 0.3;
    const lean = row * 0.06;
    shell.taperedBox(
      place,
      [at[0] + lean, 0.24 + row * 0.46, at[1]],
      [half, 0.23, 0.55],
      [half - 0.08, 0.23, 0.5],
    );
  }
}
