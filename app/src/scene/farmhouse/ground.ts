// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The ground the homestead stands on: a trodden yard, a drive running down toward
 * the gate, and a hue-shifted contact shadow at the footings.
 *
 * ONE BUFFER, TWO CHANNELS. Every vertex carries a uv that is not a texture
 * coordinate: `u` is how much trodden earth covers the grass there, `v` is how
 * deep the contact shadow is. The material reads both, so the yard, the drive and
 * the shadow under every wall are a single draw call and a single dissolve rule.
 *
 * THE DRIVE IS BUILT FROM A CROSS SECTION. A drive reads as a made road because
 * of three things a viewer can name - a defined edge, a constant width, and two
 * wheel tracks with a crown between them - so the profile below states all three
 * explicitly and the builder just sweeps it down the path.
 *
 * THE VERGE STEP IS TWELVE CENTIMETRES WIDE and that is the whole difference
 * between a road and a bald patch of dirt. The previous profile ramped its cover
 * off over half a metre, and half a metre of ramp under the material's own
 * threshold is a fuzzy alpha edge however hard the threshold is. The tracks
 * widened for the same reason: a sixty-centimetre track is under a pixel at the
 * aerial distance the drive is mostly seen from, and a value break nobody can
 * resolve is a value break that is not there.
 *
 * `u` above 1 means a wheel track; the material darkens on it. Packing the track
 * into the same channel keeps the whole yard on one attribute rather than adding
 * a second for a value break two pixels wide.
 *
 * EVERY VERTEX IS SEATED ON `groundY`. The drive leaves the flat pad and runs out
 * across the rim where the terrain starts to roll, so a flat plane would cut into
 * the hill; sampling the one ground function (spec/04) at each vertex is what lets
 * the drive follow it.
 */

/** How far above the ground the yard is laid, metres. Enough not to z-fight. */
const LIFT = 0.07;

export type GroundSample = (x: number, z: number) => number;

/**
 * Position, normal and the (cover, shade) pair, accumulated flat. All of it faces
 * straight up: under an 8 degree sun that is the band the pasture around it sits
 * in, so the yard never reads as a differently lit patch.
 */
export class GroundShell {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];

  constructor(private readonly sample: GroundSample) {}

  private vertex(x: number, z: number, cover: number, shade: number): void {
    this.positions.push(x, this.sample(x, z) + LIFT, z);
    this.normals.push(0, 1, 0);
    this.uvs.push(cover, shade);
  }

  tri(
    a: readonly [number, number, number, number],
    b: readonly [number, number, number, number],
    c: readonly [number, number, number, number],
  ): void {
    this.vertex(a[0], a[1], a[2], a[3]);
    this.vertex(b[0], b[1], b[2], b[3]);
    this.vertex(c[0], c[1], c[2], c[3]);
  }

  quad(
    a: readonly [number, number, number, number],
    b: readonly [number, number, number, number],
    c: readonly [number, number, number, number],
    d: readonly [number, number, number, number],
  ): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  attributes(): { positions: Float32Array; normals: Float32Array; uvs: Float32Array } {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
    };
  }
}

/** Deterministic wobble in -1..1 from an index. No Math.random in scene code. */
function wobble(i: number, stream: number): number {
  const h = Math.sin(i * 78.233 + stream * 12.9898) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}

/**
 * The yard: a plateau with a wandering rim, not a fade.
 *
 * THE EDGE IS THE WHOLE CORRECTION. The previous yard ran its cover from full at
 * the centre to zero at the rim over its entire radius, so the material's own
 * threshold was crossed over ten metres of ground and the trodden earth arrived
 * as a soft airbrushed halo round the buildings. Here the cover is held flat
 * across the whole yard and falls through the threshold inside `EDGE` metres, so
 * where the earth meets the pasture there is a line - one that wanders a quarter
 * of its radius, so it is a worn boundary rather than a circle.
 *
 * The core carries a cover above 1, which is what tells the material to take the
 * packed-earth band rather than the loose one: two values in the earth, so the
 * surface has structure instead of being one wash.
 */
export function yard(g: GroundShell, cx: number, cz: number, radius: number): void {
  const spokes = 32;
  /** Metres over which the cover falls off the plateau. */
  const EDGE = 1.2;
  const at = (a: number, r: number): readonly [number, number] => [
    cx + Math.sin(a) * r,
    cz + Math.cos(a) * r,
  ];
  for (let i = 0; i < spokes; i++) {
    const a0 = (i / spokes) * Math.PI * 2;
    const a1 = ((i + 1) / spokes) * Math.PI * 2;
    const r0 = radius * (1 + 0.24 * wobble(i, 3));
    const r1 = radius * (1 + 0.24 * wobble((i + 1) % spokes, 3));
    const [x0, z0] = at(a0, r0 * 0.62);
    const [x1, z1] = at(a1, r1 * 0.62);
    const [e0, f0] = at(a0, r0);
    const [e1, f1] = at(a1, r1);
    const [o0, p0] = at(a0, r0 + EDGE);
    const [o1, p1] = at(a1, r1 + EDGE);
    // The beaten core, the loose apron round it, then the step out to pasture.
    g.tri([cx, cz, 1.45, 0], [x0, z0, 1.3, 0], [x1, z1, 1.3, 0]);
    g.quad([x0, z0, 1.3, 0], [e0, f0, 0.95, 0], [e1, f1, 0.95, 0], [x1, z1, 1.3, 0]);
    g.quad([e0, f0, 0.95, 0], [o0, p0, 0, 0], [o1, p1, 0, 0], [e1, f1, 0.95, 0]);
  }
}

/**
 * The drive's cross section, as (offset from the spine in half-widths, cover).
 * Read it left to right and it is the whole shape of the road: grass, a hard
 * edge, a worn verge, a wheel track, a grassed crown, the other track, the other
 * verge, a hard edge, grass.
 */
const PROFILE: readonly (readonly [number, number])[] = [
  [-1.3, 0],
  [-1.15, 0],
  [-1.11, 0.9],
  [-0.78, 0.95],
  [-0.7, 1.55],
  [-0.3, 1.55],
  [-0.22, 1.0],
  [0.22, 1.0],
  [0.3, 1.55],
  [0.7, 1.55],
  [0.78, 0.95],
  [1.11, 0.9],
  [1.15, 0],
  [1.3, 0],
];

/**
 * The drive. The profile above is swept down a polyline, so the road keeps its
 * width and its edge the whole way and only fades in the last stretch, where it
 * is meant to be running out of frame rather than stopping at a line.
 */
export function drive(
  g: GroundShell,
  path: readonly (readonly [number, number])[],
  halfWidth: number,
): void {
  const last = path.length - 1;
  for (let i = 0; i < last; i++) {
    const [x0, z0] = path[i]!;
    const [x1, z1] = path[i + 1]!;
    const t0 = i / last;
    const t1 = (i + 1) / last;
    // Perpendicular to the segment, in the ground plane.
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const px = (-dz / len) * halfWidth;
    const pz = (dx / len) * halfWidth;
    // Held at full strength almost the whole way. A road that fades from its
    // first metre has no edge at all, and this one is going somewhere: only the
    // last stretch softens, where it meets the gate corridor.
    const fade = (t: number): number => 1 - 0.35 * Math.max(0, (t - 0.86) / 0.14);
    const f0 = fade(t0);
    const f1 = fade(t1);

    for (let s = 0; s < PROFILE.length - 1; s++) {
      const [oa, ca] = PROFILE[s]!;
      const [ob, cb] = PROFILE[s + 1]!;
      g.quad(
        [x0 + px * oa, z0 + pz * oa, ca * f0, 0],
        [x0 + px * ob, z0 + pz * ob, cb * f0, 0],
        [x1 + px * ob, z1 + pz * ob, cb * f1, 0],
        [x1 + px * oa, z1 + pz * oa, ca * f1, 0],
      );
    }
  }
}

/**
 * The contact shadow at a building's footings: a skirt round the footprint, dark
 * against the wall and gone a couple of metres out, pushed further on the side
 * the sun is not. Without it a building floats however well it is shaded.
 */
export function apron(
  g: GroundShell,
  cx: number,
  cz: number,
  yaw: number,
  halfX: number,
  halfZ: number,
  reach: number,
  bias: readonly [number, number],
): void {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const toWorld = (lx: number, lz: number): readonly [number, number] => [
    cx + lx * cos + lz * sin,
    cz - lx * sin + lz * cos,
  ];

  // The footprint walked by angle: a rectangle rather than a circle, so the
  // shadow hugs the wall it belongs to.
  const edge = (a: number): number => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return 1 / Math.max(Math.abs(c) / halfX, Math.abs(s) / halfZ);
  };
  const inner = (a: number): readonly [number, number] => {
    const k = edge(a);
    return toWorld(Math.cos(a) * k, Math.sin(a) * k);
  };
  const outer = (a: number, step: number): readonly [number, number] => {
    const k = edge(a) + reach * (1 + 0.3 * wobble(step, 7));
    const [ox, oz] = toWorld(Math.cos(a) * k, Math.sin(a) * k);
    return [ox + bias[0], oz + bias[1]];
  };

  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * Math.PI * 2;
    const a1 = ((i + 1) / steps) * Math.PI * 2;
    const i0 = inner(a0);
    const i1 = inner(a1);
    const o0 = outer(a0, i);
    const o1 = outer(a1, (i + 1) % steps);
    g.quad(
      [i0[0], i0[1], 0.6, 1],
      [i1[0], i1[1], 0.6, 1],
      [o1[0], o1[1], 0.24, 0],
      [o0[0], o0[1], 0.24, 0],
    );
  }
}
