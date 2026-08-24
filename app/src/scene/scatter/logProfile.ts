// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The fallen log's PROFILE: every number that decides its silhouette, and
 * nothing about how it is turned into triangles.
 *
 * THE SILHOUETTE HAD TO BE REBUILT FROM SCRATCH, and the note that ordered it
 * was exact: in flat black the old trunk was a capsule with a peg on it. A
 * capsule is what a lathe makes. A fallen tree is what a break makes, so every
 * term in this file is a break:
 *
 *   WEDGE, NOT TUBE     0.46 m at the butt to 0.29 m at the tip over 4.8 m. The
 *                       ratio is 1.59 to 1, which is enough that the two ends
 *                       are visibly different sizes at Classic distance and the
 *                       profile reads as a direction rather than as a bar.
 *   SPLINTERED FAR END  the tip does not stop on a disc. Fourteen sides each
 *                       carry their own reach past the last ring, and four of
 *                       them run long, so the end is a crown of spikes of
 *                       unequal length with deep valleys between them.
 *   BITTEN TOP EDGE     three shallow concave scallops at unequal spacing along
 *                       the crown, each a fifth of the local radius deep. They
 *                       are what turn a smooth arc into an irregular one, and
 *                       they are the reason a viewer reads rot and weather
 *                       rather than sawn timber.
 *   ONE LENGTHWISE      a narrow groove along the crown from a fifth of the way
 *   CRACK               out to nine tenths, deep enough to notch the skyline and
 *                       narrow enough that it never becomes a second band.
 *
 * THE BRANCH STUB IS RAKED, NOT PERPENDICULAR. It leaves the barrel 32 degrees
 * off vertical and leaning toward the tip, its root ring starts ON the trunk's
 * own axis so the join is a flare rather than a butt seam, and it ends in the
 * same splinter crown the trunk does. The version before this stood at right
 * angles to the log and photographed as a black peg.
 *
 * Everything is authored in log-local metres with the butt break at the origin
 * and the length running along +x. Nothing here is random: the same numbers
 * build the same log on every reload and on both renderer backends.
 */

import { LOG_LENGTH } from './placement';

/** Sides around the barrel. Fourteen is 26 degrees of arc per facet, so between
 *  the crown and the flank there are two or three intermediate tones before a
 *  band changes, and the change lands on a facet boundary. */
export const SIDES = 14;

/** End radii, metres. 0.92 m across the butt, 0.58 m across the tip. */
const ROOT_RADIUS = 0.46;
const TIP_RADIUS = 0.29;
/** Rings along the trunk. Fourteen, because a bite three rings wide has to be a
 *  scallop rather than a step. */
const RINGS = 14;

/** How far the trunk bends sideways and how far it sags, metres. */
const BEND = 0.22;
const SAG = 0.08;

/** Per-side radial wobble, as a fraction of the radius. Bark, not machining,
 *  and the reason the log's contact with the ground is a broken line. */
const WOBBLE = 0.08;

/** The angle around the barrel that points at the sky. `sin(angle)` is the +y
 *  component in the tube builder, so a quarter turn is the crown. */
const CROWN = Math.PI / 2;

/**
 * The concave bites out of the top edge: where along the trunk, how far the
 * scallop reaches along it, how deep as a fraction of the local radius, and
 * which way round the barrel it faces. Unequal in all four, so no two read as
 * the same event.
 */
const BITES = [
  { at: 0.24, spread: 0.1, depth: 0.28, around: CROWN - 0.22 },
  { at: 0.55, spread: 0.075, depth: 0.2, around: CROWN + 0.35 },
  { at: 0.79, spread: 0.09, depth: 0.32, around: CROWN - 0.1 },
] as const;

/** The lengthwise crack: where it runs, how wide in radians, how deep. */
const CRACK = { from: 0.14, to: 0.9, fade: 0.08, width: 0.26, depth: 0.15 } as const;

/**
 * How far each side runs past the last ring at a break, metres, and how far the
 * break's own centre sits past it. Four long splinters, ten short, none of them
 * matching a neighbour: the pattern is authored rather than generated so the
 * teeth can be placed where a silhouette needs them.
 */
const TRUNK_SPIKES = [
  0.4, 0.06, 0.14, 0.04, 0.52, 0.1, 0.2, 0.05, 0.44, 0.08, 0.16, 0.04, 0.32, 0.07,
] as const;
const STUB_SPIKES = [
  0.16, 0.03, 0.08, 0.02, 0.21, 0.05, 0.1, 0.03, 0.18, 0.04, 0.07, 0.02, 0.13, 0.04,
] as const;
/** Radius of the ring the splinters are drawn from, as a fraction of the last
 *  solid ring. Half: a splinter is a shard off the outside of the trunk. */
const SPIKE_WAIST = 0.5;
const SPIKE_CENTRE = 0.08;

/** How far back from the butt cut the exposed sapwood wraps around the barrel,
 *  metres, and how strongly it shows there. */
const COLLAR = 0.26;
const COLLAR_HEART = 0.75;
/** How pale a splintered break goes. A snapped limb shows the same wood. */
const BREAK_HEART = 0.7;

export interface Ring {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** One radius per side, metres. The bites and the crack live in here. */
  readonly radii: readonly number[];
  /** Metres each side reaches past the ring along the tube's own axis. Zero
   *  everywhere except a splinter ring. */
  readonly reach: readonly number[];
  /** How much exposed sapwood shows on this ring, 0..1. */
  readonly heart: number;
}

const NO_REACH = new Array<number>(SIDES).fill(0);

/** Wrapped distance between two angles, radians. */
function angleGap(a: number, b: number): number {
  const raw = Math.abs(a - b) % (Math.PI * 2);
  return raw > Math.PI ? Math.PI * 2 - raw : raw;
}

/** A falloff that is 1 on the bite's own bearing and 0 a right angle away. */
function around(angle: number, centre: number, reach: number): number {
  const gap = angleGap(angle, centre);
  if (gap >= reach) return 0;
  const t = 1 - gap / reach;
  return t * t;
}

/** One trunk ring's fourteen radii, with the wobble, the bites and the crack in
 *  them. */
function trunkRadii(t: number, phase: number): number[] {
  const base = ROOT_RADIUS + (TIP_RADIUS - ROOT_RADIUS) * t;
  const radii: number[] = [];
  for (let s = 0; s < SIDES; s++) {
    const angle = (s / SIDES) * Math.PI * 2;
    const wobble =
      1 + WOBBLE * Math.sin(angle * 3 + phase) + WOBBLE * 0.6 * Math.sin(angle * 5 - phase * 1.7);
    let radius = base * wobble;
    for (const bite of BITES) {
      const step = (t - bite.at) / bite.spread;
      const along = Math.exp(-step * step);
      radius -= base * bite.depth * along * around(angle, bite.around, 1.35);
    }
    const run =
      Math.min((t - CRACK.from) / CRACK.fade, (CRACK.to - t) / CRACK.fade, 1);
    if (run > 0) radius -= base * CRACK.depth * run * around(angle, CROWN, CRACK.width);
    radii.push(radius);
  }
  return radii;
}

/** The trunk: a sapwood collar, the barrel, then the splinter crown. */
export function trunkRings(): Ring[] {
  const core: Ring[] = [];
  for (let r = 0; r < RINGS; r++) {
    const t = r / (RINGS - 1);
    const radii = trunkRadii(t, t * 5.1);
    core.push({
      // The axis sits one nominal radius up, so the tapered barrel rests on
      // y = 0 along its whole length rather than only at the butt.
      x: t * LOG_LENGTH,
      y: ROOT_RADIUS + (TIP_RADIUS - ROOT_RADIUS) * t - SAG * Math.sin(t * Math.PI),
      z: BEND * Math.sin(t * Math.PI - 0.4),
      radii,
      reach: NO_REACH,
      heart: 0,
    });
  }

  const butt = core[0]!;
  const tip = core[RINGS - 1]!;
  return [
    {
      ...butt,
      x: butt.x - COLLAR,
      radii: butt.radii.map((radius) => radius * 0.9),
      heart: COLLAR_HEART,
    },
    ...core,
    {
      ...tip,
      radii: tip.radii.map((radius) => radius * SPIKE_WAIST),
      reach: TRUNK_SPIKES,
      heart: BREAK_HEART,
    },
  ];
}

/**
 * Where the stub leaves the barrel, how long it is, and how thick at the root.
 *
 * IT IS SHORT AND STOUT, WHICH IS THE SECOND CORRECTION IT NEEDED. The first
 * rebuild raked it correctly and then ran it 1.6 m at a 0.06 m tip, and the
 * silhouette probe came back with a 0.96 m antenna standing off a 0.9 m trunk.
 * A broken branch keeps its mass to the break. At 1.1 m long with 0.35 m of it
 * buried in the barrel, what shows is 0.6 m of limb that starts 0.52 m thick and
 * still measures 0.2 m where it snaps - a stub the eye can name.
 */
const STUB = { at: 0.3, length: 1.1, radius: 0.3 } as const;
/** The stub's axis: 32 degrees off vertical, leaning along the log toward the
 *  tip, with a little across it so it is not coplanar with the trunk. */
export const STUB_AXIS: readonly [number, number, number] = [0.52, 0.84, 0.16];
/** Radius at each of the stub's five stations, as a fraction of its root. */
const STUB_TAPER = [1, 0.92, 0.78, 0.6, 0.34] as const;
const STUB_STATIONS = [0, 0.35, 0.62, 0.82, 1] as const;

/**
 * The stub's rings, off the barrel's crown and raked along its length.
 *
 * Station zero sits ON the trunk's axis rather than on its surface, which is
 * what rounds the join: the first 0.35 m of the limb is inside the barrel, so
 * what a camera sees emerging is a flare of bark rather than a cylinder butted
 * against a cylinder.
 */
export function stubRings(core: readonly Ring[]): Ring[] {
  const index = STUB.at * (core.length - 1);
  const low = core[Math.floor(index)]!;
  const high = core[Math.min(Math.ceil(index), core.length - 1)]!;
  const blend = index - Math.floor(index);
  const [ax, ay, az] = STUB_AXIS;

  return STUB_STATIONS.map((t, station) => {
    const radius = STUB.radius * STUB_TAPER[station]!;
    const last = station === STUB_STATIONS.length - 1;
    const phase = 2.3 + t * 3.7;
    const radii: number[] = [];
    for (let s = 0; s < SIDES; s++) {
      const angle = (s / SIDES) * Math.PI * 2;
      radii.push(radius * (1 + WOBBLE * Math.sin(angle * 3 + phase)));
    }
    return {
      x: low.x + (high.x - low.x) * blend + ax * STUB.length * t,
      y: low.y + (high.y - low.y) * blend + ay * STUB.length * t,
      z: low.z + (high.z - low.z) * blend + az * STUB.length * t,
      radii,
      reach: last ? STUB_SPIKES : NO_REACH,
      heart: last ? BREAK_HEART : 0,
    };
  });
}

/** Where a break's own centre sits past its splinter ring, metres. */
export const BREAK_CENTRE = SPIKE_CENTRE;
