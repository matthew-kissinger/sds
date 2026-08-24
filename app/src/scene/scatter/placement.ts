// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Where the stones and the log stand: the authored composition. The flower
 * drifts are the same kind of table and live next door, in
 * scatter/flowerPlacement.ts.
 *
 * IT IS CLUSTERS NOW, NOT A CADENCE, and that is the composition note this pass
 * answers. The version before it placed seven stones at a near-even spacing
 * beside the lane, and every capture showed the same fault: a diagonal chain of
 * evenly weighted lumps marching across the frame, with one lone chip stranded
 * in open grass. Objects of equal weight at equal spacing read as debris, not as
 * geology.
 *
 * So the field carries FIVE GROUPS and long empty stretches between them, and
 * every group is built the same way a painter builds one:
 *
 *   ONE DOMINANT stone, about a metre across;
 *   TWO MID stones at half to two thirds of it, set close enough to OVERLAP its
 *     silhouette, so the group reads as one interlocking mass;
 *   ONE OR TWO CHIPS at a quarter of it, half buried at the base.
 *
 * No two stones in a group share a kind at the same size, and the sizes step by
 * a third or more, so nothing reads as one asset repeated.
 *
 * THE STONES CAME DOWN TO A THIRD OF THEIR SIZE. The dog measures 1.8 m nose to
 * rump and the boulders it stood beside were 3.3 m across: at that scale a stone
 * is collision geometry and it steals the frame from the flock. The dominant
 * stone in a group is now 1.2 m across and 0.4 m tall.
 *
 * THE GROUPS ARE AIMED AT MEASURED FRAMES. Both gameplay cameras are pinned to
 * the dog, so a composition is only real if it is composed against where the dog
 * actually is. At the capture tick the driver has the dog near (-29.2, 64.1)
 * facing up-field, which puts the Follow rig around (-38.8, 46.6) looking along
 * (0.481, 0.876). The HOME group lands 11 m out just right of centre and the LOG
 * crosses the right third at 18 m - two masses at two depths on two different
 * bearings, rather than a line. The beauty orbit stands the other way about,
 * down-sun and looking down-field, and its right two thirds were empty pasture;
 * the two EAST groups exist for that frame and land at 85 m and 100 m, where a
 * stone is a small grey note in the vista rather than a prop in the foreground.
 *
 * EVERY ANCHOR IS AUTHORED BESIDE THE LANE (`beside(along, offset)` in
 * keepOut.ts), never as a raw world position, because `offset` IS the clearance
 * from the corridor and is therefore the number a reader needs to see.
 *
 * The draws come from scatter/hash.ts (pure functions of an index, no stream, no
 * Math.random). Nothing here touches the terrain: Y and tilt are the mesh
 * builders' business, because they are the ones holding the heightfield.
 */

import { SALT, hash01, range } from './hash';
import { LOG_KEEP_OUT, ROCK_KEEP_OUT, beside, isClear, type Spot } from './keepOut';
import { rockKind, type RockKindName } from './rockGeometry';
import type { Heightfield } from '@app/world/heightfieldSampler';

interface Anchor {
  /** Fraction along the spawn-to-gate line. */
  readonly along: number;
  /** Metres east of the lane; negative is west, and screen right in both
   *  gameplay cameras. This number IS the corridor clearance. */
  readonly offset: number;
}

// --- rocks ------------------------------------------------------------------

export interface RockTransform {
  readonly kind: RockKindName;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
  readonly groundY: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
  readonly collisionRadius: number;
}

interface RockPlacement extends Anchor {
  readonly kind: RockKindName;
  /** Overall multiplier on the kind's own metre dimensions. */
  readonly size: number;
}

/**
 * Sixteen stones in five groups. An `along` step of 0.004 is half a metre down
 * the lane and an `offset` step of one is a metre across it, so the entries
 * inside a group are deliberately within a stone's own width of each other:
 * they are meant to touch.
 */
const ROCKS: readonly RockPlacement[] = [
  // HOME. The group both gameplay cameras see: 16 m out and a third of the way
  // left of centre in Follow, 20 m out in Classic. The Follow frame's near
  // ground begins at 10.8 m, which is why this sits at 16 and not at 11 - the
  // previous anchor put the whole group under the bottom edge.
  { kind: 'boulder', along: 0.63, offset: -21, size: 1.25 },
  { kind: 'slab', along: 0.6272, offset: -20.25, size: 0.77 },
  { kind: 'boulder', along: 0.6338, offset: -21.85, size: 0.7 },
  { kind: 'nub', along: 0.6266, offset: -21.5, size: 0.62 },
  { kind: 'nub', along: 0.6326, offset: -20.55, size: 0.5 },
  // UP-FIELD. Near where the flock is being pushed: the Classic frame's upper
  // half at 42 m, and the beauty orbit's left foreground at 26 m.
  { kind: 'slab', along: 0.83, offset: -22.5, size: 1.05 },
  { kind: 'boulder', along: 0.8275, offset: -21.8, size: 0.72 },
  { kind: 'nub', along: 0.8325, offset: -23.2, size: 0.52 },
  // EAST NEAR. Three quarters of the way right in the beauty frame, at 95 m.
  // The `along` is held at 0.2 rather than lower because the spawn clearance is
  // 24 m and the lane's own start is only 20 m west of this line.
  { kind: 'boulder', along: 0.2, offset: 18, size: 1.3 },
  { kind: 'slab', along: 0.1968, offset: 17.25, size: 0.8 },
  { kind: 'nub', along: 0.2032, offset: 18.8, size: 0.6 },
  // EAST FAR. Nearer the same frame's right edge, and nearer the camera.
  { kind: 'slab', along: 0.31, offset: 20, size: 1.1 },
  { kind: 'boulder', along: 0.3072, offset: 19.25, size: 0.72 },
  { kind: 'nub', along: 0.3128, offset: 20.75, size: 0.48 },
  // DOWN-FIELD WEST. A hundred metres out, in nobody's foreground. A meadow
  // that only has stones where the camera looks is a set.
  { kind: 'boulder', along: 0.18, offset: -34, size: 0.95 },
  { kind: 'nub', along: 0.1768, offset: -33.25, size: 0.55 },
];

export function rockTransforms(field: Heightfield): RockTransform[] {
  const placed: RockTransform[] = [];
  for (let i = 0; i < ROCKS.length; i++) {
    const rock = ROCKS[i]!;
    const at = beside(rock.along, rock.offset);
    if (!isClear(at.x, at.z, ROCK_KEEP_OUT)) continue;
    // The stretch stays inside a fifth: the three masses are authored
    // proportions and a stone squashed harder than that stops being the shape it
    // was drawn as.
    const normal = { x: 0, y: 1, z: 0 };
    field.normal(at.x, at.z, normal);
    const kind = rockKind(rock.kind);
    const scaleX = rock.size * range(i + 1, SALT.wide, 0.9, 1.16);
    const scaleY = rock.size * range(i + 1, SALT.tall, 0.88, 1.1);
    const scaleZ = rock.size * range(i + 1, SALT.tilt, 0.9, 1.16);
    placed.push({
      kind: rock.kind,
      x: at.x,
      z: at.z,
      yaw: hash01(i + 1, SALT.yaw) * Math.PI * 2,
      scaleX,
      scaleY,
      scaleZ,
      groundY: field.groundY(at.x, at.z),
      normalX: normal.x,
      normalY: normal.y,
      normalZ: normal.z,
      collisionRadius: kind.footprint * Math.max(scaleX, scaleZ),
    });
  }
  return placed;
}

// --- the fallen log ---------------------------------------------------------

/** Length of the trunk, metres. Lives here rather than with the geometry so the
 *  contact shading below can lay its blobs along the log without importing the
 *  mesh builder that imports this file. */
export const LOG_LENGTH = 4.8;

/**
 * One log crossing the right third of the Follow frame. The boundary tree moved
 * beyond the fence, so this remains an independent inside-field dressing
 * landmark rather than following it through the rails.
 *
 * ITS BEARING IS MEASURED AGAINST THE CAMERA, NOT AGAINST THE FIELD. A trunk
 * lying along the view direction foreshortens to a stub, and 4.8 m of horizontal
 * mass is the one silhouette of its kind in the scene. The Follow rig looks
 * along (0.481, 0.876), so a log square across it runs on yaw 0.502; this
 * carries a 16 degree rake off that, because a prop exactly perpendicular to the
 * camera reads as placed by a tool.
 *
 * THE THICK END IS THE ONE ON THE RIGHT. The mesh's origin is the butt cut
 * (scatter/logGeometry.ts), so the 0.92 m butt with its growth rings is the end
 * nearest the camera's right edge, and the trunk tapers away across frame to the
 * splintered break.
 *
 * The lane offset remains -33.2 so the branch stub does not merge into the dog
 * or the fence in either gameplay camera.
 */
export const FALLEN_LOG = { ...beside(0.674, -33.2), yaw: 0.222 } as const;

export interface LogTransform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly length: number;
  readonly collisionRadius: number;
}

/**
 * Whether the authored log still clears everything. Read by the mesh builder,
 * which drops the log rather than drawing it in the corridor if a later change
 * to HOME_FIELD moves the lane under it. Both ends and the middle, not just the
 * anchor: a bearing change can swing the far end across a clearance the tail is
 * well inside of.
 */
export function logIsClear(): boolean {
  for (const t of [0, 0.5, 1]) {
    const x = FALLEN_LOG.x + Math.cos(FALLEN_LOG.yaw) * LOG_LENGTH * t;
    const z = FALLEN_LOG.z - Math.sin(FALLEN_LOG.yaw) * LOG_LENGTH * t;
    if (!isClear(x, z, LOG_KEEP_OUT)) return false;
  }
  return true;
}

export function fallenLogTransform(field: Heightfield): LogTransform | null {
  if (!logIsClear()) return null;
  const headX = FALLEN_LOG.x + Math.cos(FALLEN_LOG.yaw) * LOG_LENGTH;
  const headZ = FALLEN_LOG.z - Math.sin(FALLEN_LOG.yaw) * LOG_LENGTH;
  const tailY = field.groundY(FALLEN_LOG.x, FALLEN_LOG.z);
  const headY = field.groundY(headX, headZ);
  return {
    x: FALLEN_LOG.x,
    y: tailY,
    z: FALLEN_LOG.z,
    yaw: FALLEN_LOG.yaw,
    pitch: Math.atan2(headY - tailY, LOG_LENGTH),
    length: LOG_LENGTH,
    collisionRadius: 0.46,
  };
}

// --- contact shading --------------------------------------------------------

export interface ContactSpot extends Spot {
  /** Radius of the darkened ground, metres. */
  readonly radius: number;
  /** Metres of grass collar height at this spot. It scales with the solid it
   *  grows around: blades that suited a metre-tall boulder would bury a 0.4 m
   *  one, and blades that suited the chip would not reach the boulder. */
  readonly blade: number;
}

/** Bounds on a collar's blade height, metres, whatever the solid asks for. */
const BLADE_MIN = 0.2;
const BLADE_MAX = 0.46;

/**
 * Where the ground goes dark and where the grass collar grows. One spot under
 * every stone and a short chain of them along the log.
 *
 * The scene has no shadow pass at all: the toon ramp is a function of a surface
 * normal, so a solid resting on grass casts nothing and the grass under it is
 * lit exactly as brightly as the grass beside it. That straight line of lit
 * grass at the foot of every object is the loudest "pasted decal" tell there is.
 * Two things answer it and they are both driven off this list: a darkened disc
 * (contactShade.ts) and a stand of short dark blades growing up over the
 * object's base from the camera side (baseGrass.ts). The stones themselves sink
 * a third of their height into the field (scatter/rocks.ts), so what those two
 * are dressing is a buried edge rather than a resting one.
 */
export function contactSpots(
  rocks: readonly RockTransform[],
  log: LogTransform | null,
): ContactSpot[] {
  const spots: ContactSpot[] = [];
  for (const rock of rocks) {
    const kind = rockKind(rock.kind);
    const reach = kind.footprint * (rock.scaleX + rock.scaleZ) * 0.5;
    // A shade has to be visible BESIDE the object, not only below it.
    spots.push({
      x: rock.x,
      z: rock.z,
      radius: reach * 1.6,
      blade: Math.min(BLADE_MAX, Math.max(BLADE_MIN, kind.height * rock.scaleY * 0.85)),
    });
  }
  if (log !== null) {
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      spots.push({
        x: log.x + Math.cos(log.yaw) * log.length * t,
        z: log.z - Math.sin(log.yaw) * log.length * t,
        radius: 0.86,
        blade: 0.3,
      });
    }
  }
  return spots;
}
