// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Where every tree stands. Pure arithmetic over a hash of the candidate index
 * (ringShape.ts): the same numbers on every reload, every backend and every
 * machine, with no Math.random anywhere.
 *
 * THE UNIT OF PLACEMENT IS A STAND, NOT A TREE, and that is this pass's answer
 * to "re-author the treeline as stands, not a hedge". The pass before this
 * walked the perimeter dropping one tree per slot and gave three in ten of them
 * a single companion. Trees placed one at a time are evenly spaced by
 * construction however much noise is thrown at the density, and evenly spaced
 * trees of similar height are a hedge - which is what came back.
 *
 * A stand is two or three trees packed around one anchor. Neighbouring stands
 * overlap into the larger three-to-six-tree copses the camera reads, without
 * concentrating the whole belt into a handful of oversized rosettes.
 * decided for the stand rather than for the tree:
 *
 *  - HEIGHT, WITH A GUARANTEED 1.9 SPREAD INSIDE IT. The stand draws its
 *    tallest tree from the belt's range; its first member IS that tree and its
 *    second is 1/1.9 of it, so the ratio is arithmetic
 *    rather than luck. The rest fall between.
 *  - DEPTH. Behind the farmhouse a stand is planted again 24 m further back,
 *    so the band there is two to three ranks deep instead of one.
 *
 * GAPS ARE COMPOSITION. Three authored sky gaps (ringShape.ts) open real breaks
 * 22 to 30 m wide, and the far belt now keeps almost nothing in them, so sky
 * reads down to the ground line rather than to a haze-coloured ridge.
 */

import type { Heightfield } from '@app/world/heightfield';
import { HOME_FIELD } from '@sim/field';
import { BELTS, NEAR_LIMIT, type BeltSpec } from './belts';
import { WIND_X, WIND_Z } from './foliage';
import { plantHeroOak } from './heroOak';
import {
  TAU,
  bearingWeight,
  farmhouseness,
  hashUnit,
  insidePad,
  northness,
  ringDensity,
  ringNoise,
  skyGap,
} from './ringShape';
import {
  emitTree,
  type CanopyPlacement,
  type ShrubPlacement,
  type TreelinePlacement,
  type TrunkPlacement,
} from './placement';

export type { CanopyPlacement, ShrubPlacement, TrunkPlacement, TreelinePlacement };

/** Clear timber from both visible fenced rectangles by more than a trunk
 * radius. The oriented crown box is conservative for the rounded source shell. */
export const TREE_FENCE_SAFETY_MARGIN = 1.5;
export const TREE_FENCED_RECTS = [
  HOME_FIELD.bounds,
  { ...HOME_FIELD.pen, minZ: HOME_FIELD.bounds.maxZ },
] as const;

export function crownOutsideFenceRect(
  crown: Pick<CanopyPlacement, 'x' | 'z' | 'width' | 'depth' | 'yaw'>,
  rect: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number },
  margin: number = TREE_FENCE_SAFETY_MARGIN,
): boolean {
  const cosine = Math.abs(Math.cos(crown.yaw));
  const sine = Math.abs(Math.sin(crown.yaw));
  const halfX = cosine * crown.width * 0.5 + sine * crown.depth * 0.5;
  const halfZ = sine * crown.width * 0.5 + cosine * crown.depth * 0.5;
  return crown.x + halfX + margin <= rect.minX
    || crown.x - halfX - margin >= rect.maxX
    || crown.z + halfZ + margin <= rect.minZ
    || crown.z - halfZ - margin >= rect.maxZ;
}

function assertTreesOutsideFences(canopies: readonly CanopyPlacement[]): void {
  for (const crown of canopies) {
    for (const rect of TREE_FENCED_RECTS) {
      if (!crownOutsideFenceRect(crown, rect)) {
        throw new Error(
          `tree ${crown.treeId} belt ${crown.belt} overlaps fenced pasture: `
          + `${JSON.stringify({ x: crown.x, z: crown.z, width: crown.width, depth: crown.depth })}`,
        );
      }
    }
  }
}

/**
 * How far due north the near belt opens up, metres, to clear the pen and the
 * farmhouse. The pen pad ends at z = 135 with a 6 m keep-out, so 141 m is the
 * closest a tree can legally stand behind it, and 114 + 28 is 142.
 */
const NORTH_PUSH_INNER = 28;
const NORTH_PUSH_OUTER = 40;

/**
 * FOUR FOX-HYBRID PROFILES. They keep the selected Round + Spreading language
 * while preventing the belt from becoming a row of scaled copies.
 *
 * The pass before varied only the proportions of one ellipsoid. These entries
 * select authored single-surface proportions and limb architecture:
 *
 *   broad     the dominant spreading profile
 *   compact   the Round parent's higher, contained profile without a spire
 *   balanced  the midpoint between the two sources
 *   leaning   a low asymmetric spreading profile
 */
interface Archetype {
  /** Crown width as a fraction of tree height. */
  readonly width: readonly [number, number];
  /** Scale on the stand's own height draw. */
  readonly height: number;
  /** Authored single-surface silhouette family consumed by emitTree. */
  readonly family: number;
}

const BROAD = 0;
const COMPACT = 1;
const BALANCED = 2;
const LEANING = 3;

const ARCHETYPES: readonly Archetype[] = [
  { width: [0.92, 1.12], height: 1, family: 0 },
  { width: [0.84, 1.02], height: 0.9, family: 1 },
  { width: [0.9, 1.08], height: 0.96, family: 2 },
  { width: [1.02, 1.22], height: 0.88, family: 3 },
];

/** Share of a stand's members drawn from the three secondary hybrid profiles. */
const BALANCED_SHARE = 0.25;
const LEANING_SHARE = 0.22;
const COMPACT_SHARE = 0.12;

/** Bole diameter as a fraction of tree height. */
const SLENDERNESS = [0.098, 0.13] as const;

/** Nothing shorter than this is planted as a tree. Below it a crown with a bole
 *  under it stops reading as a small tree and starts reading as a mushroom; the
 *  understory is what fills that height band. */
const MIN_HEIGHT = 5.4;

/** Share of trees already turning, and how far. One value per TREE, so a mass
 *  can never turn while the mass beside it on the same tree stays green. */
const TURNING_SHARE = 0.12;

/** How many trees a stand holds, and how far its members sit from its centre.
 * The previous 16 m value was a radius despite its comment calling the whole
 * stand sixteen metres across. It produced 32 m sprays of isolated trees.
 * Members now sit in a 3-9 m annulus: close enough for crowns to interlock as a
 * grove, far enough that trunks never collapse into one post. */
const THIRD_MEMBER_SHARE = [0.28, 0.24, 0.26] as const;
const STAND_SPREAD_MIN = 3;
const STAND_SPREAD_MAX = 5.5;
/** Pull each pair of near-belt stand anchors toward one shared bearing. Two
 * seeded stands then read as one irregular four-to-six-tree copse, while the
 * distance between pairs preserves deliberate pasture windows. */
const NEAR_PAIR_PULL = 0.42;
/** Hard centre-to-centre floor for rooted leaders, including neighbouring
 * groves whose independent offsets happen to converge. */
const MIN_TREE_SPACING = 2.6;
/**
 * The ratio between a stand's tallest and shortest tree. Not a target: the
 * second member is placed at exactly this fraction of the first, so the spread
 * is arithmetic rather than luck.
 *
 * The lower orchard and windswept family scales widen the actual stand spread
 * beyond this base ratio without producing tree-sized trunkless masses.
 */
const STAND_RANGE = 1 / 1.9;
/**
 * A slow wave over the bearing that runs the mean size of the timber up and
 * down, so one stretch of wood is big and the next is scrub.
 *
 * FIVE CELLS ROUND THE RING, NOT ELEVEN, and half again as deep. That is the
 * "cluster the tall masses" note. Eleven cells is a wavelength of about a
 * hundred metres at the near belt, which is four or five stands - short enough
 * that a tall stand always had a short one beside it and the skyline averaged
 * back to one line. Five cells is a couple of hundred metres a wave, so three
 * or four stands in a row are big together and the next three or four are
 * small, and the horizon gets three or four real peaks with troughs between
 * them.
 */
const STAND_BASE = 0.94;
const STAND_SWING = 0.24;
const STAND_CELLS = 5;
/**
 * One stand in nine grows an emergent clear of its neighbours, and only ever a
 * stand that is standing well back in its belt. The Follow rig is 7.5 m up and
 * looks down 16 degrees with a 45 degree vertical fov, so the top of its frame
 * is 6.1 degrees above horizontal - which at 114 m is a tree top at 19.7 m. An
 * emergent on the front rank would crop through the top of the screen; the same
 * tree thirty metres further back reads as a big tree.
 */
const EMERGENT_SHARE = 1 / 9;
const EMERGENT_DEPTH = 0.62;
const EMERGENT_GAIN = 1.03;

/**
 * How tall this belt's timber is at the front of its band against the back of
 * it. Big timber stands deep and scrub stands at the edge, which is true of
 * real woods and is also what keeps the Follow frame breathing: the front rank
 * is the rank that would otherwise crop through the top of the screen, and this
 * is what holds the treeline in the top fifth of that frame with a clear band
 * of sky above it.
 */
const RANK_BASE = 0.8;
const RANK_GAIN = 0.3;

/** How far a second rank is planted behind a stand, and how much of the
 *  farmhouse bearing gets one. */
const ROW_STEP = 24;
const ROW_SHARE = 0.25;

/** How far a candidate that landed on a pad is pushed before it is given up on,
 *  and the step it moves each try. */
const PAD_PUSH_STEP = 11;
const PAD_PUSH_TRIES = 4;

/** Tilt is held to 3 degrees. Past that a crown scaled off vertical reads as a
 *  felled tree rather than as one leaning into the weather. */
const TILT = 0.06;
const WIND_BEARING = Math.atan2(WIND_X, WIND_Z);

interface Stand {
  /** Centre, in metres. */
  readonly x: number;
  readonly z: number;
  readonly lift: number;
  /** The tallest tree in it, metres. */
  readonly top: number;
  readonly members: number;
  /** No member may stand inside this Chebyshev radius. A grove is fourteen metres
   *  across and the near belt's inner edge is only eight metres outside the
   *  grass the sheep graze, so without this a stand seeded on that edge would
   *  put a tree in the pasture. */
  readonly floor: number;
  readonly seed: number;
  readonly stream: number;
}

interface TreeRoot {
  readonly x: number;
  readonly z: number;
}

/** Resolve the rare collision between independently authored groves. Member
 * offsets already start at 3 m; this pass is for neighbouring anchors and the
 * pad/floor corrections that can otherwise squeeze two leaders together. */
function separateRoot(
  startX: number,
  startZ: number,
  stand: Stand,
  roots: readonly TreeRoot[],
  seed: number,
): { x: number; z: number } | null {
  let x = startX;
  let z = startZ;
  for (let pass = 0; pass < 12; pass++) {
    const footprint = Math.max(Math.abs(x), Math.abs(z));
    if (footprint < stand.floor) {
      const scale = (stand.floor + 0.15) / Math.max(0.001, footprint);
      x *= scale;
      z *= scale;
    }
    for (let pull = 0; pull < 4 && insidePad(x, z); pull++) {
      x = (x + stand.x) * 0.5;
      z = (z + stand.z) * 0.5;
    }
    if (insidePad(x, z)) return null;

    let nearest: TreeRoot | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const root of roots) {
      const distance = Math.hypot(x - root.x, z - root.z);
      if (distance < nearestDistance) {
        nearest = root;
        nearestDistance = distance;
      }
    }
    if (nearest === undefined || nearestDistance >= MIN_TREE_SPACING) return { x, z };

    let dx = x - nearest.x;
    let dz = z - nearest.z;
    if (nearestDistance < 0.001) {
      const bearing = hashUnit(seed, stand.stream + 91) * TAU;
      dx = Math.sin(bearing);
      dz = Math.cos(bearing);
      nearestDistance = 1;
    }
    const push = MIN_TREE_SPACING - nearestDistance + 0.02;
    x += (dx / nearestDistance) * push;
    z += (dz / nearestDistance) * push;
  }
  return null;
}

/** Every tree of one stand, emitted. */
function plantStand(
  belt: BeltSpec,
  field: Heightfield,
  stand: Stand,
  roots: TreeRoot[],
  canopies: CanopyPlacement[],
  trunks: TrunkPlacement[],
): void {
  for (let k = 0; k < stand.members; k++) {
    const seed = stand.seed * 13 + k;
    // Golden-angle separation keeps members from landing on top of one
    // another, while a bounded hash jitter stops the stand becoming a rosette.
    const bearing =
      hashUnit(stand.seed, stand.stream) * TAU +
      k * 2.399963229728653 +
      (hashUnit(seed, stand.stream + 16) - 0.5) * 0.48;
    const away =
      STAND_SPREAD_MIN +
      (STAND_SPREAD_MAX - STAND_SPREAD_MIN) * Math.sqrt(hashUnit(seed, stand.stream + 1));
    let x = stand.x + Math.sin(bearing) * (k === 0 ? 0 : away);
    let z = stand.z + Math.cos(bearing) * (k === 0 ? 0 : away);
    // A companion that falls on a keep-out walks back toward its valid stand
    // anchor instead of disappearing and leaving the anchor as a lone tree.
    for (let pull = 0; pull < 3 && insidePad(x, z); pull++) {
      x = (x + stand.x) * 0.5;
      z = (z + stand.z) * 0.5;
    }
    if (insidePad(x, z)) continue;
    const root = separateRoot(x, z, stand, roots, seed);
    if (root === null) continue;
    x = root.x;
    z = root.z;

    // Member 0 is the stand's tallest and member 1 its shortest, so the 1.9
    // spread is a property of the code rather than of the draw.
    let share = STAND_RANGE + (1 - STAND_RANGE) * hashUnit(seed, stand.stream + 2);
    if (k === 0) share = 1;
    if (k === 1) share = STAND_RANGE;

    // The archetype draw stays inside the chosen Fox Round + Spreading family.
    const draw = hashUnit(seed, stand.stream + 3);
    let kind = BROAD;
    if (draw > 1 - COMPACT_SHARE) kind = COMPACT;
    else if (draw < BALANCED_SHARE) kind = BALANCED;
    else if (draw < BALANCED_SHARE + LEANING_SHARE) kind = LEANING;
    const archetype = ARCHETYPES[kind]!;

    const height = Math.max(MIN_HEIGHT, stand.top * share * archetype.height);
    const span = archetype.width;
    const width = height * (span[0] + (span[1] - span[0]) * hashUnit(seed, stand.stream + 4));

    const turning = hashUnit(seed, stand.stream + 13);
    const yawDraw = hashUnit(seed, stand.stream + 8);
    const yaw = archetype.family === LEANING
      ? WIND_BEARING + (yawDraw - 0.5) * 0.24
      : yawDraw * TAU;
    emitTree(
      {
        x,
        z,
        ground: field.groundY(x, z) + stand.lift,
        height,
        width,
        slenderness:
          SLENDERNESS[0] + (SLENDERNESS[1] - SLENDERNESS[0]) * hashUnit(seed, stand.stream + 7),
        yaw,
        tiltX: (hashUnit(seed, stand.stream + 9) - 0.5) * TILT,
        tiltZ: (hashUnit(seed, stand.stream + 10) - 0.5) * TILT,
        tint: hashUnit(seed, stand.stream + 12),
        turn: turning < TURNING_SHARE ? 0.55 + 0.45 * (turning / TURNING_SHARE) : 0,
        family: archetype.family,
        belt: belt.id,
      },
      canopies,
      trunks,
    );
    roots.push({ x, z });
  }
}

/** Walk one belt's perimeter, siting stands. */
function plantBelt(
  belt: BeltSpec,
  field: Heightfield,
  canopies: CanopyPlacement[],
  trunks: TrunkPlacement[],
): void {
  const roots: TreeRoot[] = [];
  let emptyNearRun = 0;
  for (let a = 0; a < belt.stands; a++) {
    const u = (a + hashUnit(a, belt.stream)) / belt.stands;
    const pairCentre = (Math.floor(a / 2) * 2 + 1) / belt.stands;
    const bearingU = belt.id === 0 ? u + (pairCentre - u) * NEAR_PAIR_PULL : u;
    const theta = bearingU * TAU;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);

    const open = belt.gapFloor + (1 - belt.gapFloor) * skyGap(theta);
    const weight = bearingWeight(theta) * belt.density * open;
    const drawn = hashUnit(a, belt.stream + 1) <= ringDensity(u, belt.stream + 2) * weight;
    // The near belt closes only accidental runs, never the three authored sky
    // windows. Two missed non-gap candidates may breathe; the third becomes a
    // grove anchor so the foreground cannot lose a seventy-degree arc again.
    const outsideAuthoredWindow = open >= 0.98;
    const capsAccidentalNearRun =
      belt.id === 0 && outsideAuthoredWindow && emptyNearRun >= 2;
    if (!drawn && !capsAccidentalNearRun) {
      emptyNearRun = outsideAuthoredWindow ? emptyNearRun + 1 : 0;
      continue;
    }
    emptyNearRun = 0;

    const push = belt.foreground ? northness(theta) : 0;
    const inner = belt.inner + NORTH_PUSH_INNER * push;
    const outer = belt.outer + NORTH_PUSH_OUTER * push;
    // Squared draw: the front rank is the one the eye reads, so it gets the
    // stands, and the depth behind it thins into the haze.
    const independentDepth = hashUnit(a, belt.stream + 3);
    const pairedDepth = hashUnit(Math.floor(a / 2), belt.stream + 103);
    const depthDraw = belt.id === 0
      ? independentDepth * 0.3 + pairedDepth * 0.7
      : independentDepth;
    const depth = depthDraw;
    const radius = inner + (outer - inner) * depth * depth;

    const wave = STAND_BASE + STAND_SWING * ringNoise(u, STAND_CELLS, belt.stream + 30);
    const rank = RANK_BASE + RANK_GAIN * depth * depth;
    const emergent =
      depth > EMERGENT_DEPTH && hashUnit(a, belt.stream + 4) < EMERGENT_SHARE ? EMERGENT_GAIN : 1;
    const draw = Math.pow(hashUnit(a, belt.stream + 5), 1.15);
    const top =
      (belt.heights[0] + (belt.heights[1] - belt.heights[0]) * draw) * wave * rank * emergent;
    const members = 2 + (hashUnit(a, belt.stream + 6) < THIRD_MEMBER_SHARE[belt.id] ? 1 : 0);

    // Behind the farmhouse a minority of stands gets a second, smaller rank.
    // This preserves depth without concentrating most of the middle belt in
    // one quadrant.
    const ranks =
      hashUnit(a, belt.stream + 7) < farmhouseness(theta) * ROW_SHARE ? [0, ROW_STEP] : [0];
    for (const rank of ranks) {
      // The Chebyshev square at this bearing: the field is square, the fence is
      // square, and a circular treeline around a square field reads as a stadium.
      const axis = Math.max(Math.abs(sin), Math.abs(cos));
      let reach = radius + rank;
      let x = (sin * reach) / axis;
      let z = (cos * reach) / axis;
      let tries = 0;
      while (insidePad(x, z) && tries < PAD_PUSH_TRIES) {
        reach += PAD_PUSH_STEP;
        if (belt.foreground && reach > NEAR_LIMIT) break;
        x = (sin * reach) / axis;
        z = (cos * reach) / axis;
        tries++;
      }
      if (insidePad(x, z)) continue;

      plantStand(
        belt,
        field,
        {
          x,
          z,
          // Every tree uses the actual sampled terrain. Earlier deep belts
          // added an invisible two-to-five metre ridge here, which made their
          // trunks and crowns visibly hover above the rendered field.
          lift: 0,
          top: rank === 0 ? top : top * 0.94,
          members: rank === 0 ? members : Math.max(2, members - 1),
          floor: belt.inner - 2 + NORTH_PUSH_INNER * push,
          seed: a * 7 + rank,
          stream: belt.stream + 40,
        },
        roots,
        canopies,
        trunks,
      );
    }
  }
}

/** Everything, planted once. Called from a memo, never from a frame. */
export function placeTreeline(field: Heightfield): TreelinePlacement {
  const canopies: CanopyPlacement[] = [];
  const shrubs: ShrubPlacement[] = [];
  const trunks: TrunkPlacement[] = [];
  for (const belt of BELTS) plantBelt(belt, field, canopies, trunks);
  plantHeroOak(field, canopies, trunks);
  assertTreesOutsideFences(canopies);
  // Keep the exact authored population but group the one shared crown draw by
  // family. The vertex shader then derives its family range from instanceIndex
  // without the backend-unsafe vertex read of an instanced buffer attribute.
  canopies.sort((a, b) => a.family - b.family);
  return { canopies, shrubs, trunks };
}
