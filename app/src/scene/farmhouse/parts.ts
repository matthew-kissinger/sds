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
import { LEANTO_DEPTH, PORCH } from './plan';
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
  const depth = LEANTO_DEPTH;
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

/**
 * The porch over the front door, and the one piece of this cluster built for a
 * distance it is not yet seen from.
 *
 * WHAT IT IS FOR AT NINETY METRES. The range's minusZ front is its longest plane
 * and the one both gameplay cameras approach; until this pass the only thing on
 * it that broke the eave line was the lean-to, four metres off at one end. A
 * gabled porch is a second roof pitch crossing the first at the exact point the
 * eye already goes - the door - and it costs fourteen triangles. It is also what
 * stops the front door reading as a dark rectangle the same shape as the windows
 * beside it: a door is a thing you walk through, and what says so at a distance
 * is the roof somebody built over it.
 *
 * WHAT IT IS FOR LATER. The farmer is meant to walk in here eventually, and a
 * threshold is the one part of that which cannot be retrofitted cheaply: the
 * porch fixes where the door is in world space, gives it a floor at a known
 * height, and puts a lit volume between the yard and the opening. The case round
 * the door is the other half of it. Every other opening in this cluster is one
 * dark panel and stays that way (farmhouse/openings.ts says why), but this one
 * gets jambs and a head in bare board, because it is the only opening the player
 * will ever stand in front of, and because board is DARKER than the limewash it
 * sits in - it reads as the shadow in a reveal, not as the bright joinery that
 * cost an earlier pass its silhouette.
 *
 * `at` is along the wall in the range's own frame; the porch stands on the
 * minusZ side of it, like the lean-to.
 */
export function porch(
  roof: Shell,
  timber: Shell,
  dress: Shell,
  place: Stand,
  spec: RoofSpec,
  at: number,
  door: { readonly width: number; readonly height: number },
): void {
  const back = -spec.width / 2;
  const { half, depth } = PORCH;
  const over = 0.2;
  const nose = 0.26;
  const eaves = 2.72;
  const apex = 3.74;
  const front = back - depth;
  const verge = front - nose;
  const wide = half + over;

  // The two slopes, from the wall out. No courses on a plane this small: uv.y
  // of -1 is what turns the slate's course and sky ramps off (slope-free
  // surfaces in the roof buffer all take it, including the lean-to).
  roof.mark(0, -1);
  roof.quad(
    place,
    [at - wide, eaves, verge],
    [at - wide, eaves, back],
    [at, apex, back],
    [at, apex, verge],
  );
  roof.quad(
    place,
    [at + wide, eaves, back],
    [at + wide, eaves, verge],
    [at, apex, verge],
    [at, apex, back],
  );

  timber.mark(0, OPEN_SKY);
  // The tympanum, filling the triangle the two slopes leave at the front.
  timber.tri(place, [at + wide, eaves, front], [at - wide, eaves, front], [at, apex, front]);
  // Two posts, inboard of the verge and standing a little past the eave so the
  // slope lands on timber rather than on air.
  for (const side of [-1, 1] as const) {
    timber.box(
      place,
      [at + side * (half - 0.12), (eaves + 0.22) / 2, front + 0.16],
      [0.13, (eaves + 0.22) / 2, 0.13],
    );
  }

  // The case round the door: two jambs and a head, each standing proud of the
  // render by the same six centimetres the dark panel does.
  const jamb = 0.17;
  const reveal = door.width / 2 + jamb / 2;
  const head = door.height + jamb / 2;
  const wall = back + OPENING_OUT;
  timber.quad(
    place,
    [at + reveal + jamb / 2, 0, wall],
    [at - reveal - jamb / 2, 0, wall],
    [at - reveal - jamb / 2, head + jamb / 2, wall],
    [at + reveal + jamb / 2, head + jamb / 2, wall],
  );

  // The step. Stone, like the plinth it sits on, and the floor the farmer will
  // one day stand on to open the door.
  dress.mark(0, OPEN_SKY);
  dress.taperedBox(
    place,
    [at, 0.09, back - 0.42],
    [door.width / 2 + 0.45, 0.09, 0.46],
    [door.width / 2 + 0.36, 0.09, 0.4],
  );
}

/**
 * A mono-pitch hood over an opening, on two brackets: the cart door's.
 *
 * A five-metre doorway in a flat board wall is a hole, and a hole has no front.
 * What turns it into the front of a building is the one horizontal line above it
 * that is not the eave - a hood throws its own shadow on the boards under it,
 * which is the only thing in this asset that puts a hard edge across a barn wall
 * where no roof edge is. `at` and `half` are along the wall, `head` is the top of
 * the opening it covers.
 */
export function hood(
  timber: Shell,
  place: Stand,
  spec: RoofSpec,
  at: number,
  half: number,
  head: number,
): void {
  const back = -spec.width / 2;
  const out = 1.15;
  const front = back - out;
  const high = head + 0.42;
  const low = head + 0.02;
  const fascia = 0.22;

  timber.mark(0, OPEN_SKY);
  timber.quad(
    place,
    [at + half, low, front],
    [at - half, low, front],
    [at - half, high, back],
    [at + half, high, back],
  );
  timber.quad(
    place,
    [at + half, low - fascia, front],
    [at - half, low - fascia, front],
    [at - half, low, front],
    [at + half, low, front],
  );
  // The brackets. Square posts raked back to the wall would be two more solids
  // each; a flat board on edge reads the same at this distance for a quarter of
  // the triangles, and it is what a barn bracket actually is.
  for (const side of [-1, 1] as const) {
    const x = at + side * (half - 0.26);
    timber.quad(
      place,
      [x, low - fascia, front],
      [x, high - 0.3, back],
      [x, high - 1.25, back],
      [x, low - fascia, front - 0.001],
    );
  }
}

/**
 * The cupola on the barn ridge: a boarded collar, a dark louvre and a capped
 * pyramid over it.
 *
 * IT IS A SILHOUETTE PART AND NOTHING ELSE. The barn is a rectangle with a
 * triangle on it, which is exactly what a hundred-metre read reduces a barn to,
 * and at that size the only thing separating it from a shed is what stands on the
 * ridge. Two metres over a ten-and-a-half-metre ridge, off centre, and it is the
 * one piece of this cluster that breaks a straight line against the sky other
 * than the chimney - which is why it is off centre, so the two never align.
 *
 * It is sunk a metre into the slate, measured against the sagging ridge rather
 * than the nominal one, so no angle shows daylight under it.
 */
export function cupola(
  roof: Shell,
  timber: Shell,
  opening: Shell,
  place: Stand,
  spec: RoofSpec,
  at: number,
): void {
  const seat = spec.ridgeHeight - ridgeSag(spec, (at + spec.length / 2) / spec.length);

  timber.mark(0, OPEN_SKY);
  timber.taperedBox(
    place,
    [at, seat - 0.3, 0],
    [0.82, 0.66, 0.82],
    [0.74, 0.66, 0.74],
  );

  opening.mark(0, 0);
  opening.taperedBox(place, [at, seat + 0.92, 0], [0.62, 0.56, 0.62], [0.62, 0.56, 0.62]);

  roof.mark(0, -1);
  roof.taperedBox(
    place,
    [at, seat + 1.62, 0],
    [0.94, 0.14, 0.94],
    [0.86, 0.14, 0.86],
  );
  roof.taperedBox(
    place,
    [at, seat + 2.07, 0],
    [0.86, 0.31, 0.86],
    [0.12, 0.31, 0.12],
  );
}
