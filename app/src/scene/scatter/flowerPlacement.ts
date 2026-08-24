// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Where the wildflowers stand: the drift table and the per-bloom draw.
 *
 * A DRIFT IS ONE SHAPE, NOT A SCATTER OF DOTS, and that is the whole correction
 * this pass makes. The note was measured at Classic camera height: if you can
 * count the individual heads, it is still confetti. The last table attempted
 * thirty to fifty blooms in a two-metre ellipse and kept about two thirds of
 * them, which is one head every 20 cm - far enough apart that the eye resolves
 * each one and reads litter. These attempt a hundred to a hundred and fifty in
 * the same ellipse, which lands roughly forty blooms per square metre: heads
 * 19 cm across at 16 cm spacing OVERLAP, so the heart of a drift is a continuous
 * pale mass and only its rim frays into countable flowers.
 *
 * THE RIM STILL FRAYS, and that is deliberate. `keep` drops blooms as the cube
 * of the distance from the centre, so a drift has a solid heart and a feathered
 * edge rather than an even density out to a hard boundary. At this count the
 * fraying reads as softness; at the old count it read as strays.
 *
 * EVERY BLOOM LEANS ITS OWN WAY. `tilt` is a hashed 25 degrees off vertical
 * baked into the instance matrix, on top of the yaw, so a drift is a crowd of
 * plants at slightly different attitudes rather than a rank of identical ones.
 * The scale draw runs 0.68 to 1.32, which is a head-size spread near two to one:
 * the note asked for forty per cent and this is more, because a drift's texture
 * comes from size variation more than from anything else.
 *
 * THE DRIFTS ARE PLACED WHERE A CAMERA CAN READ THEM, because a flower nobody
 * photographs has not been built. HOME sits 14 to 27 m out in the Follow frame,
 * some of it threaded between the stones of the home group. WEST is behind the
 * Follow rig and exists for the Classic and phone frames. UP-FIELD stands near
 * the flock. VISTA and FAR are the six that dress the beauty orbit.
 *
 * THE BEAUTY ORBIT'S GEOMETRY IS THE REASON THAT FRAME KEPT COMING BACK EMPTY,
 * and it is worth writing down because it is not obvious. At the capture tick the
 * orbit stands north-east of the flock looking back down-field, and its
 * screen-right axis works out at (0.940, -0.336) against the lane's own east
 * normal of (0.986, -0.164) - a dot product of 0.98. SCREEN RIGHT IS THE LANE.
 * Moving a drift toward the right edge of that picture is the same operation as
 * walking it into the corridor, so the whole middle of the frame is ground the
 * keep-out reserves. That is why the previous pair, authored at a guessed camera
 * pose, landed at screen x 0.31 and 13 pixels per metre: two specks. These are
 * solved against the real pose in beautyOrbit.ts and take the frame as far right
 * as an eight-metre corridor allows.
 *
 * Everything here is authored BESIDE THE LANE - `beside(along, offset)` in
 * keepOut.ts - with at least a drift radius of margin on the corridor clearance,
 * so no drift is ever sliced along a straight line by the keep-out test. The
 * draws come from scatter/hash.ts: pure functions of a bloom's own index, no
 * stream, no Math.random, no clock.
 */

import { GOLDEN_ANGLE, SALT, hash01, range } from './hash';
import { FLOWER_KEEP_OUT, beside, isClear } from './keepOut';
import type { Heightfield } from '@app/world/heightfieldSampler';

interface FlowerDrift {
  /** Fraction along the spawn-to-gate line. */
  readonly along: number;
  /** Metres east of the lane; negative is west, and screen right in both
   *  gameplay cameras. */
  readonly offset: number;
  /** Half the drift's long axis, metres. The short axis is 55 per cent of it. */
  readonly radius: number;
  /** Blooms attempted. Rim thinning drops roughly a fifth. */
  readonly count: number;
  /** Bearing of the long axis, radians. */
  readonly axis: number;
  /** 0 warm cream, 1 butter yellow. A drift is mostly one species. */
  readonly species: number;
}

const FLOWER_DRIFTS: readonly FlowerDrift[] = [
  // HOME: the Follow frame's readable ground, 14 to 27 m out. Its near edge
  // begins at 10.8 m, so nothing here is authored closer than 13.
  { along: 0.618, offset: -24.4, radius: 1.2, count: 135, axis: 1.9, species: 1 },
  { along: 0.645, offset: -27.5, radius: 1.15, count: 130, axis: 0.6, species: 0 },
  { along: 0.66, offset: -22, radius: 1, count: 110, axis: 2.4, species: 1 },
  { along: 0.7, offset: -12.5, radius: 1.15, count: 130, axis: 1.35, species: 0 },
  // WEST: behind the Follow rig; the Classic and phone frames' lower right.
  { along: 0.545, offset: -26, radius: 1.2, count: 130, axis: 1.7, species: 1 },
  { along: 0.565, offset: -29.5, radius: 1, count: 105, axis: 0.9, species: 0 },
  // UP-FIELD: near where the flock is being pushed, beside the up-field stones.
  { along: 0.83, offset: -19, radius: 1.1, count: 120, axis: 1.5, species: 0 },
  { along: 0.845, offset: -24.5, radius: 0.9, count: 95, axis: 0.4, species: 1 },
  // VISTA: the beauty orbit's right half, which the last capture left as bare
  // pasture. These four are SOLVED against that camera rather than guessed at,
  // and the solution is in the header above: at 22 m the frame gives 56 px per
  // metre, so the near pair are the two drifts in the field that read as painted
  // masses rather than as notes. Screen x runs 0.59, 0.45, 0.41, 0.36 and depth
  // 22, 30, 51, 66 m, which walks the eye from the right foreground back to the
  // treeline instead of parking one clump on the edge.
  { along: 0.86, offset: -9.5, radius: 1.45, count: 165, axis: 1.15, species: 1 },
  { along: 0.79, offset: -10.5, radius: 1.3, count: 145, axis: 2.35, species: 0 },
  { along: 0.61, offset: -9.5, radius: 1.2, count: 135, axis: 0.55, species: 1 },
  { along: 0.49, offset: -10, radius: 1.15, count: 130, axis: 1.85, species: 0 },
  // FAR: the same frame's right edge at 71 m and 77 m, and east of the lane, so
  // the vista has flowers on BOTH sides of the corridor rather than a dressed
  // near bank and an empty far one. At 16 px per metre a drift here is forty
  // pixels of pale cream: a note, which is all a plant should be at that range.
  { along: 0.41, offset: 13, radius: 1.6, count: 175, axis: 2.2, species: 1 },
  { along: 0.37, offset: 10, radius: 1.45, count: 160, axis: 0.8, species: 0 },
  // DOWN-FIELD: out of every capture.
  { along: 0.3, offset: -22, radius: 1.2, count: 130, axis: 1.4, species: 0 },
];

export interface FlowerBloom {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** Radians the whole plant leans off vertical, about its own local x. */
  readonly tilt: number;
  readonly scale: number;
  /** Per-bloom value in [0, 1): drives the tint, the flutter phase and whether
   *  the head is open or still a bud. */
  readonly seed: number;
  /** 0 warm cream, 1 butter yellow. */
  readonly species: number;
  readonly groundY: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
  readonly collisionRadius: number;
}

/** How far a plant may lean off vertical, radians. */
const TILT = 0.44;
/** Head-size spread. Near two to one, which is what gives a drift its texture. */
const SCALE_MIN = 0.68;
const SCALE_MAX = 1.32;
/** How hard the rim thins, as the cube of the reach. */
const RIM_THINNING = 0.5;
/** One bloom in seven takes the other species. A drift of one colour is a
 *  planted bed; a drift of one colour with strays is a meadow. */
const STRAY_SPECIES = 0.14;

export function flowerBlooms(field: Heightfield): FlowerBloom[] {
  const placed: FlowerBloom[] = [];
  let index = 0;
  for (const drift of FLOWER_DRIFTS) {
    const centre = beside(drift.along, drift.offset);
    const axisCos = Math.cos(drift.axis);
    const axisSin = Math.sin(drift.axis);
    for (let k = 0; k < drift.count; k++) {
      index++;
      const around = k * GOLDEN_ANGLE + hash01(index, SALT.around) * 0.9;
      const reach = Math.sqrt(hash01(index, SALT.radius));
      if (hash01(index, SALT.keep) > 1 - RIM_THINNING * reach * reach * reach) continue;

      const localX = Math.cos(around) * reach * drift.radius;
      const localZ = Math.sin(around) * reach * drift.radius * 0.55;
      const x = centre.x + localX * axisCos - localZ * axisSin;
      const z = centre.z + localX * axisSin + localZ * axisCos;
      if (!isClear(x, z, FLOWER_KEEP_OUT)) continue;

      const normal = { x: 0, y: 1, z: 0 };
      field.normal(x, z, normal);
      placed.push({
        x,
        z,
        yaw: hash01(index, SALT.yaw) * Math.PI * 2,
        tilt: range(index, SALT.droop, -TILT, TILT),
        scale: range(index, SALT.scale, SCALE_MIN, SCALE_MAX),
        seed: hash01(index, SALT.seed),
        species: hash01(index, SALT.species) < STRAY_SPECIES ? 1 - drift.species : drift.species,
        groundY: field.groundY(x, z),
        normalX: normal.x,
        normalY: normal.y,
        normalZ: normal.z,
        collisionRadius: 0,
      });
    }
  }
  return placed;
}
