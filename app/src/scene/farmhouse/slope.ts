// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * What a roof plane IS, before anything is built out of it: the spec a range is
 * described by, the two small deformations that keep it off the CAD grid, and the
 * arithmetic that turns a (t, s) pair into a point, a normal and a metre count on
 * the slate.
 *
 * `t` runs along the ridge, 0 to 1. `s` runs up the pitch, 0 at the eave and 1 at
 * the ridge flat. Every course, every occlusion ramp and every barge board in the
 * cluster is expressed in those two numbers, which is why they are parallel to
 * the eave on every pitch by construction and cannot be knocked out of true by
 * the viewing angle.
 *
 * farmhouse/roof.ts builds the slab and its edges from this; farmhouse/hull.ts
 * builds the outline envelope from the same numbers, so the drawn line sits on
 * the roof rather than cutting a chord across it.
 */

import type { Local } from './shell';

/** Nodes along the ridge. Enough for the sag to read as a curve, not a crease. */
export const NODES = 9;
/** Rows across each slope. Enough for the curve to carry a terminator. */
export const CROSS = 5;
/** Depth of the fascia and the raking barge board under the roof edge. */
export const FASCIA = 0.26;
/**
 * How far the slate slab stands proud of the structural plane. Small, uniform
 * across the whole slope: one offset for the entire surface cannot serrate
 * anything.
 */
export const SLAB = 0.14;
/** How far the slope bellies below the straight line from eave to ridge. */
const BOW = 0.055;

export interface RoofSpec {
  /** Along the ridge, metres. */
  readonly length: number;
  /** Across the building, metres. */
  readonly width: number;
  /** Eave height above the footing. */
  readonly wallHeight: number;
  /** Ridge height above the footing. */
  readonly ridgeHeight: number;
  /** How far the eaves reach past the wall. */
  readonly eaveOverhang: number;
  /** How far the roof reaches past the gable ends. */
  readonly endOverhang: number;
  /** Half-width of the flat band at the apex, under the ridge cap. */
  readonly ridgeFlat: number;
  /** Drop of the eave at the +x end, metres. The one deliberate kink. */
  readonly settle: number;
  /** How far the ridge bows down between the gables, metres. */
  readonly sag: number;
  /** How far back from the end the hip climbs to the ridge. 0 for no hip. */
  readonly hipRun?: number;
}

export interface RoofOptions {
  /** 0 house slate, 1 barn slate. */
  readonly tag?: number;
  /** Skip the verge at this end, for a wing whose end is buried in a range. */
  readonly skipEnd?: -1 | 1;
  /** Hip this end instead of gabling it. Needs `hipRun` on the spec. */
  readonly hipEnd?: -1 | 1;
}

/** How far the ridge has dropped at `t` along it. */
export function ridgeSag(spec: RoofSpec, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return spec.sag * Math.sin(Math.PI * Math.pow(u, 0.82));
}

/** Eave height at a node, carrying the single settled bay at the +x end. */
export function eaveDrop(spec: RoofSpec, t: number): number {
  const s = Math.max(0, (t - 0.62) / 0.38);
  return spec.settle * s * s;
}

/** How far the ridge is cut back at `end` by a hip, metres. */
export function hipCut(spec: RoofSpec, options: RoofOptions, end: -1 | 1): number {
  return options.hipEnd === end ? (spec.hipRun ?? 0) : 0;
}

/** One slope's geometry, resolved once and shared by every quad on it. */
export interface Slope {
  readonly side: number;
  readonly az: number;
  readonly ay: number;
  /** Across-building distance from eave edge to ridge flat, on the slate. */
  readonly run: number;
  readonly eaveZo: number;
  readonly ridgeZo: number;
  /** Length of the chord from eave to ridge. The slope's own metre stick. */
  readonly span: number;
  readonly bow: number;
}

export function slopeOf(spec: RoofSpec, side: number): Slope {
  const eaveZ = spec.width / 2 + spec.eaveOverhang;
  const rise = spec.ridgeHeight - spec.wallHeight;
  const flat = eaveZ - spec.ridgeFlat;
  const chord = Math.hypot(flat, rise);
  const az = flat / chord;
  const ay = rise / chord;
  const eaveZo = eaveZ + SLAB * ay;
  const ridgeZo = spec.ridgeFlat + SLAB * ay;
  const run = eaveZo - ridgeZo;
  return { side, az, ay, run, eaveZo, ridgeZo, span: Math.hypot(run, rise), bow: rise * BOW };
}

/** Height of the slate at `s` up the slope (0 eave, 1 ridge) at `t` along it. */
export function slopeY(spec: RoofSpec, slope: Slope, t: number, s: number): number {
  const eaveY = spec.wallHeight - eaveDrop(spec, t) + SLAB * slope.az;
  const ridgeY = spec.ridgeHeight - ridgeSag(spec, t) + SLAB * slope.az;
  return eaveY + (ridgeY - eaveY) * s - slope.bow * Math.sin(Math.PI * s);
}

/** The slate point at (t, s), in the building's frame. */
export function slopePoint(spec: RoofSpec, slope: Slope, x: number, t: number, s: number): Local {
  return [x, slopeY(spec, slope, t, s), slope.side * (slope.eaveZo - slope.run * s)];
}

/** The outward normal of the curved slate at (t, s). */
export function slopeNormal(spec: RoofSpec, slope: Slope, t: number, s: number): Local {
  const rise = spec.ridgeHeight - ridgeSag(spec, t) - (spec.wallHeight - eaveDrop(spec, t));
  const dy = rise - slope.bow * Math.PI * Math.cos(Math.PI * s);
  const dz = -slope.side * slope.run;
  const k = dz < 0 ? 1 : -1;
  const ny = -k * dz;
  const nz = k * dy;
  const len = Math.hypot(ny, nz) || 1;
  return [0, ny / len, nz / len];
}

/**
 * The height of the slate at a point in the building's frame. The chimney reads
 * it to sit its flashing on the pitch rather than hovering over it.
 */
export function roofSurfaceLocal(spec: RoofSpec): (x: number, z: number) => number {
  const span = spec.length / 2 + spec.endOverhang;
  return (x, z) => {
    const t = Math.min(1, Math.max(0, (x + span) / (2 * span)));
    const slope = slopeOf(spec, z >= 0 ? 1 : -1);
    const s = Math.min(1, Math.max(0, (slope.eaveZo - Math.abs(z)) / slope.run));
    return slopeY(spec, slope, t, s);
  };
}
