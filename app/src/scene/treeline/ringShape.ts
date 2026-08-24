// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The shape of the ring, as pure functions of a bearing: how many trees a
 * direction wants, where the bays open, where the three authored sky gaps are,
 * how far due north the band has to move to clear the farmyard, and which
 * ground is spoken for.
 *
 * Everything here is deterministic integer-and-float arithmetic over an index.
 * No Math.random, no clock, no state: the treeline that comes up on the second
 * reload is the treeline that came up on the first, on every machine.
 */

import { TERRAIN_PADS } from '@app/world/terrainLayout';

export const TAU = Math.PI * 2;

/** A stable unit float from an index and a stream id. Integer ops only. */
export function hashUnit(index: number, stream: number): number {
  let h = Math.imul(index ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(stream + 0x165667b1, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Wrapped value noise over a perimeter fraction, so the ring has no seam. */
export function ringNoise(u: number, cells: number, stream: number): number {
  const scaled = u * cells;
  const cell = Math.floor(scaled);
  const f = scaled - cell;
  const a = hashUnit(((cell % cells) + cells) % cells, stream);
  const b = hashUnit((((cell + 1) % cells) + cells) % cells, stream);
  return a + (b - a) * (f * f * (3 - 2 * f));
}

const FARMHOUSE_PAD = TERRAIN_PADS.find((pad) => pad.id === 'farmhouse');
/** Bearing from the origin to the farmhouse, radians east of north. Derived,
 *  never typed in: the pad is the authority for where the house stands. */
const FARMHOUSE_BEARING =
  FARMHOUSE_PAD === undefined
    ? 0.45
    : Math.atan2(
        (FARMHOUSE_PAD.minX + FARMHOUSE_PAD.maxX) / 2,
        (FARMHOUSE_PAD.minZ + FARMHOUSE_PAD.maxZ) / 2,
      );

/** Signed angular difference, wrapped to [-pi, pi]. */
function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/**
 * How many trees this bearing wants, before the noise. Densest behind the
 * farmhouse, as the brief asks, and thinned - not emptied - due south, which is
 * behind both gameplay cameras but is the whole background of the beauty orbit
 * for a third of its circuit.
 */
export function bearingWeight(theta: number): number {
  const north = Math.max(0, Math.cos(theta));
  const south = Math.max(0, -Math.cos(theta));
  return Math.min(
    1.2,
    Math.max(0.68, 0.9 + 0.14 * north - 0.04 * south + 0.18 * farmhouseness(theta)),
  );
}

/**
 * How much this bearing is "behind the farmhouse", 0 to 1. Two things read it:
 * the density weight above, and the second rank of stands (treePlacement.ts),
 * because the brief asks for the band to be both DENSER and DEEPER there.
 */
export function farmhouseness(theta: number): number {
  return 1 - smoothstep(0, 0.6, Math.abs(angleDelta(theta, FARMHOUSE_BEARING)));
}

/**
 * THE THREE SKY GAPS, authored rather than noised.
 *
 * The brief asks for gaps so the horizon still breathes, and two passes of
 * noise never delivered one: a density dip leaves a THIN stand, which reads as
 * a wood with a bald patch rather than as a break in the trees. These are real
 * openings, and they are placed by where the cameras look. At the near belt's
 * radius the half-widths below are 11 to 15 m of arc, so each gap is 22 to 30 m
 * of open horizon.
 *
 *   -0.62   up-field and west, the left third of the Follow frame
 *    1.30   east, past the farmyard, where the beauty orbit crosses
 *    3.55   south-west, the deep background of the second half of the orbit
 *
 * The far belt keeps a residue through them (`FAR_GAP_FLOOR`) so a gap shows
 * haze and a faint ridge rather than a hard hole in the world.
 */
const SKY_GAPS = [
  { bearing: -0.62, halfWidth: 0.1 },
  { bearing: 1.3, halfWidth: 0.085 },
  { bearing: 3.55, halfWidth: 0.1 },
] as const;

/**
 * How much of a gap the deepest belt fills in.
 *
 * NOTHING AT ALL NOW. At 0.55 a gap was a thinner wood rather than an opening;
 * at 0.12 it showed one or two distant trees standing alone in it, and the
 * critique read exactly one of those as an orphan crown floating below the belt
 * line in the beauty frame - which is a fair reading, because a single hazed
 * crown with no neighbours and no ground under it has nothing to say it is a
 * tree. A gap now carries no belt timber or tree-rooted bramble: it opens onto
 * the sampled pasture itself, so there is no orphan foliage in the opening.
 */
export const FAR_GAP_FLOOR = 0;

/** 0 in the middle of a gap, 1 clear of every one of them. */
export function skyGap(theta: number): number {
  let open = 1;
  for (const gap of SKY_GAPS) {
    const away = Math.abs(angleDelta(theta, gap.bearing));
    open = Math.min(open, smoothstep(gap.halfWidth * 0.55, gap.halfWidth * 1.6, away));
  }
  return open;
}

/**
 * Two octaves of bays and breaks, in roughly [0.38, 1]. The three authored sky
 * gaps already provide the field's deliberate openings. Letting this noise fall
 * to 0.12 made accidental 127-196 m holes between otherwise dense stands, so
 * the horizon alternated between isolated lollipops and nothing. The higher
 * floor retains long density waves while keeping non-gap bearings wooded.
 */
export function ringDensity(u: number, stream: number): number {
  const bays = ringNoise(u, 7, stream);
  const breaks = ringNoise(u, 23, stream + 7);
  return 0.38 + 0.62 * Math.min(1, Math.max(0, 0.62 * bays + 0.5 * breaks));
}

/** How far due north this bearing is, smoothly, for the push-out. */
export function northness(theta: number): number {
  return smoothstep(0.35, 0.95, Math.cos(theta));
}

/**
 * The land under the ring, as a smooth field in metres above the sampled
 * ground.
 *
 * The baked terrain carries 4.7 m of relief across 400 m, which is 1.2 percent,
 * so every tree base would otherwise land on the same horizontal line and the
 * woods would read as props standing on a plate. This is the missing rise: two
 * long wavelengths and one short one, in world space rather than in bearing, so
 * a stand of trees shares its ground with its neighbours and the bases climb
 * and fall along the horizon.
 *
 * It is a VISUAL lift on tree bases only. Nothing walks on it and nothing
 * samples it for a Y; the understory is planted at the same lift as the trees
 * above it so the two never separate.
 */
export function groundRoll(x: number, z: number, amplitude: number): number {
  const long = Math.sin(x * 0.0121 + 0.7) * Math.cos(z * 0.0104 - 0.4);
  const cross = Math.sin((x + z) * 0.0233 + 2.1);
  return (0.62 * long + 0.38 * cross + 1) * 0.5 * amplitude;
}

/**
 * How far the far belt's ground has risen at this bearing, 0 to 1. Slower than
 * `ringDensity` on purpose: hills are longer than stands of trees.
 */
export function farRidge(u: number, stream: number): number {
  return 0.25 + 0.75 * ringNoise(u, 3, stream);
}

/** Keep-out margin around a flattened terrain pad, metres. */
const PAD_MARGIN = 6;

/**
 * Is this ground spoken for? The flattened pads in the terrain manifest are
 * declared scatter keep-outs (spec/04), and the pen, the gate corridor and the
 * farmyard are all of them. One list, so the treeline and the terrain cannot
 * disagree about where the buildings are.
 */
export function insidePad(x: number, z: number): boolean {
  for (const pad of TERRAIN_PADS) {
    if (
      x > pad.minX - PAD_MARGIN &&
      x < pad.maxX + PAD_MARGIN &&
      z > pad.minZ - PAD_MARGIN &&
      z < pad.maxZ + PAD_MARGIN
    ) {
      return true;
    }
  }
  return false;
}
