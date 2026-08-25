// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The shadows the buildings throw.
 *
 * THEY ARE MODELLED, NOT MAPPED. There is no shadow map anywhere in this game and
 * there should not be: the light is one authored vector and a quantised ramp
 * (tsl/toon.ts), not a physical model, so a shadow here is a piece of ground with
 * a piece of geometry over it. The fence, the flock and the dog all already sit in
 * the grass this way.
 *
 * IT IS THE BUILDING'S OWN SHAPE, SWEPT. The previous pass laid an axis-aligned
 * box in the shadow frame - a rectangle whose only relation to the house was its
 * bounding size - at 1.7 times the ridge height and a third opacity, and at the
 * Classic camera it simply could not be found while every fence post in the same
 * frame raked a clear bar across the grass. Three things changed:
 *
 *  - THE OUTLINE IS THE SWEPT FOOTPRINT. Each caster carries its real plan as a
 *    convex polygon, and the slab is the union of that polygon over every
 *    position it occupies as it slides down the sun's bearing: a hexagonal,
 *    plainly house-shaped mark with the range's own crookedness in it, tapering
 *    toward the tip where the ridge is thinner than the plan.
 *  - THE LENGTH RATIO IS THE FENCE'S. scene/fence/shadowCast.ts throws 3.1 times
 *    the height of what casts it, and two shadow lengths in one photograph is a
 *    lighting continuity error the eye catches immediately. A 9.6 m ridge now
 *    throws thirty metres, the same rake as the timber beside it.
 *  - THE TONE IS THE FENCE'S TOO (farmhouse/palette.ts CAST_SHADOW).
 *
 * THE CHIMNEY IS ITS OWN CASTER, swept only over the stretch BEYOND the roof's
 * tip. The slab is an alpha blend rather than a multiply - `MultiplyBlending` does
 * not survive this renderer's blend setup, which three assets in this scene found
 * the same way - so two overlapping slabs would double-darken, and a chimney
 * finger that starts where the roof shadow ends never overlaps it.
 *
 * IT SITS IN THE BASE OF THE CANOPY, not under it: the grass is half a metre of
 * opaque instanced blades drawn before the transparent pass, so a decal on the
 * ground plane loses the depth test to every blade in front of it.
 */

import * as THREE from 'three/webgpu';
import { SUN_DIRECTION } from '@app/tsl/palette';
import { color, float, uv } from '@app/tsl/nodes';
import { CAST_SHADOW, CAST_SHADOW_OPACITY } from './palette';
export type GroundSample = (x: number, z: number) => number;

/** How far above the ground the slab is laid. The fence uses 0.09; this is a
 *  broader surface and wants to clear the same blades. */
const LIFT = 0.12;
/** Shadow length per metre of height. The fence's own ratio. */
export const LENGTH = 3.1;
/** Steps down the shadow and across it. Enough to ride the rim's relief. */
const ALONG = 12;
const ACROSS = 3;
/** Sub-samples of the sweep window at each station. */
const WINDOW = 5;
/** How much narrower the slab is at its tip: a ridge is thinner than a plan. */
const TIP_TAPER = 0.68;
/** Where along the run-out the dissolve starts, as a fraction of it. */
const FADE_FROM = 0.5;

/** A mass that throws one: its plan, and the stretch of sweep it covers. */
export interface Caster {
  /** Footprint corners in world (x, z). Hulled, so order does not matter. */
  readonly points: readonly (readonly [number, number])[];
  /** Where its sweep begins and ends, in metres down the sun's bearing. */
  readonly from: number;
  readonly to: number;
}

/** A caster from a rectangle: centre, yaw and half extents. */
export function boxCaster(
  x: number,
  z: number,
  yaw: number,
  halfX: number,
  halfZ: number,
  height: number,
  from = 0,
): Caster {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const points = ([
    [-halfX, -halfZ],
    [halfX, -halfZ],
    [halfX, halfZ],
    [-halfX, halfZ],
  ] as const).map(
    ([ox, oz]) => [x + ox * cos + oz * sin, z - ox * sin + oz * cos] as const,
  );
  return { points, from, to: height * LENGTH };
}

/** Andrew's monotone chain. Small inputs, and it keeps the sweep convex. */
function hull(
  points: readonly (readonly [number, number])[],
): readonly (readonly [number, number])[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (
    o: readonly [number, number],
    a: readonly [number, number],
    b: readonly [number, number],
  ): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (list: readonly (readonly [number, number])[]): (readonly [number, number])[] => {
    const out: (readonly [number, number])[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...build(sorted), ...build([...sorted].reverse())];
}

/** The polygon's side extent on the line at `a`, or null if it misses. */
function sideRange(
  ring: readonly (readonly [number, number])[],
  a: number,
): readonly [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [a0, s0] = ring[i]!;
    const [a1, s1] = ring[(i + 1) % ring.length]!;
    if (Math.abs(a1 - a0) < 1e-9) continue;
    const t = (a - a0) / (a1 - a0);
    if (t < 0 || t > 1) continue;
    const s = s0 + (s1 - s0) * t;
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
  }
  return lo > hi ? null : [lo, hi];
}

/**
 * One buffer for every shadow on the farm. `uv.x` carries how much of the tone
 * this vertex takes, so the tip runs out without a second draw call.
 */
export function buildShadows(
  casters: readonly Caster[],
  sample: GroundSample,
): THREE.BufferGeometry {
  // The bearing a shadow runs along: the sun's ground direction, reversed.
  const dLen = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.z) || 1;
  const ax = -SUN_DIRECTION.x / dLen;
  const az = -SUN_DIRECTION.z / dLen;
  const px = -az;
  const pz = ax;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (const caster of casters) {
    const ring = hull(
      caster.points.map(([wx, wz]) => [wx * ax + wz * az, wx * px + wz * pz] as const),
    );
    if (ring.length < 3) continue;
    let alongMin = Infinity;
    let alongMax = -Infinity;
    for (const [a] of ring) {
      alongMin = Math.min(alongMin, a);
      alongMax = Math.max(alongMax, a);
    }

    const run = caster.to - caster.from;
    if (run <= 0) continue;
    const start = alongMin + caster.from;
    const total = alongMax - alongMin + run;

    // The swept extent at `a`: the widest the plan ever is anywhere in the window
    // of positions that can still be covering this station.
    const at = (k: number): { a: number; lo: number; hi: number; strength: number } => {
      const a = start + (total * k) / ALONG;
      let lo = Infinity;
      let hi = -Infinity;
      for (let w = 0; w <= WINDOW; w++) {
        const source = a - caster.from - (run * w) / WINDOW;
        const clamped = Math.min(alongMax, Math.max(alongMin, source));
        const found = sideRange(ring, clamped);
        if (found === null) continue;
        lo = Math.min(lo, found[0]);
        hi = Math.max(hi, found[1]);
      }
      if (lo > hi) return { a, lo: 0, hi: 0, strength: 0 };
      const past = Math.max(0, Math.min(1, (a - caster.from - alongMax) / run));
      const mid = (lo + hi) / 2;
      const half = ((hi - lo) / 2) * (1 - (1 - TIP_TAPER) * past);
      return {
        a,
        lo: mid - half,
        hi: mid + half,
        strength: past <= FADE_FROM ? 1 : Math.max(0, 1 - (past - FADE_FROM) / (1 - FADE_FROM)),
      };
    };

    for (let k = 0; k < ALONG; k++) {
      const near = at(k);
      const far = at(k + 1);
      for (let m = 0; m < ACROSS; m++) {
        const w0 = m / ACROSS;
        const w1 = (m + 1) / ACROSS;
        quad(
          positions,
          normals,
          uvs,
          sample,
          [
            [near.a, near.lo + (near.hi - near.lo) * w0, near.strength],
            [near.a, near.lo + (near.hi - near.lo) * w1, near.strength],
            [far.a, far.lo + (far.hi - far.lo) * w1, far.strength],
            [far.a, far.lo + (far.hi - far.lo) * w0, far.strength],
          ],
          [ax, az],
          [px, pz],
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Two triangles in the (along, across) frame, seated on the ground under them. */
function quad(
  positions: number[],
  normals: number[],
  uvs: number[],
  sample: GroundSample,
  corners: readonly (readonly [number, number, number])[],
  along: readonly [number, number],
  side: readonly [number, number],
): void {
  for (const i of [0, 1, 2, 0, 2, 3] as const) {
    const [a, s, strength] = corners[i]!;
    const x = along[0] * a + side[0] * s;
    const z = along[1] * a + side[1] * s;
    positions.push(x, sample(x, z) + LIFT, z);
    normals.push(0, 1, 0);
    uvs.push(strength, 0);
  }
}

/**
 * One shade tone, laid over the ground at the strength each vertex carries in
 * `uv.x`. The tip runs out by losing opacity, which is the one blend every backend
 * agrees about; the sides keep their polygon edges, which is what a cel shadow
 * wants at any distance.
 */
export function makeShadowMaterial(): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.colorNode = color(CAST_SHADOW);
  material.opacityNode = uv().x.mul(float(CAST_SHADOW_OPACITY));
  return material;
}
