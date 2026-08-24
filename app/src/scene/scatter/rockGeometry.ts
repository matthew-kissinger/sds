// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * THREE STONES, NOT ONE STONE AT THREE SCALES, and every one of them is now
 * SMALL. The measured note that set this pass said the largest boulder had to be
 * clearly under the dog's body: the dog runs 1.8 m nose to rump and 0.9 m across
 * the ribs, and the stones it stood beside were 3.3 m wide, which is why they
 * photographed as collision geometry rather than as ground dressing. At the
 * sizes in scatter/placement.ts the dominant stone in a cluster is about 1.05 m
 * across and 0.5 m tall - a thing a walker steps over.
 *
 * Each mass has to pass the flat-black test on its own AND against the other
 * two:
 *
 *   BOULDER  the dominant mass. A blocky rounded lump, a little wider than it is
 *            tall, with a knocked crown. In silhouette it is a dome with two
 *            flats cut off the top.
 *   SLAB     a low broad table, two thirds as high as it is wide, with one large
 *            flat top facet. In silhouette it is a long shallow trapezoid.
 *   NUB      a small chunky wedge, sheared, with a steep short face. In
 *            silhouette it is an asymmetric lump that leans.
 *
 * THE LEANING BLADE IS GONE. It was authored twice as high as it was wide, and
 * from every camera it read as a headstone standing in the pasture. The NUB that
 * replaced it is 0.95 high against 0.8 wide and is always the smallest stone in
 * a cluster, so it is a chip beside a boulder rather than a marker.
 *
 * EVERY KIND IS ONE CONVEX LOBE, which is also a rendering decision. The old
 * split boulder was two lobes placed against each other, and each lobe carried
 * its own contour shell (scatter/rocks.ts): where the shells crossed inside the
 * mass they drew a dark line straight down the middle of one stone, and the
 * capture showed it as two z-fighting shapes. A cluster gets its notches from
 * stones OVERLAPPING each other now, where a contour line at the joint is the
 * contact shadow it should be.
 *
 * NO TWO PLANES IN A LOBE ARE PARALLEL, which is the tell that says "box" faster
 * than any proportion does, and no lobe has a flat base: the undersides close on
 * oblique knives at unequal distances, so a stone sunk into the field meets the
 * grass along a broken edge rather than a polygon rim.
 *
 * The cutting itself is in scatter/convexCut.ts; this file is only the choices.
 */

import { carve, normalise, type Facet, type Knife, type Vector } from './convexCut';

/** Radius of the block every knife set starts from, metres. */
const BASE_RADIUS = 0.78;

interface KindRecipe {
  readonly knives: readonly Knife[];
  /** Axis scaling applied after cutting: (across, up, through). */
  readonly scale: Vector;
  /** Metres of eastward lean per metre of height. Applied last. */
  readonly shear: number;
}

/** The dominant lump. Many shallow knives, so the mass rounds rather than
 *  boxes, with two decided flats knocked off the crown. */
const BOULDER_KNIVES: readonly Knife[] = [
  { normal: [0.19, 0.95, 0.25], distance: 0.44 },
  { normal: [0.56, 0.74, -0.37], distance: 0.47 },
  { normal: [-0.88, 0.42, -0.22], distance: 0.46 },
  { normal: [0.11, 0.34, 0.93], distance: 0.54 },
  { normal: [-0.25, 0.3, -0.92], distance: 0.52 },
  { normal: [0.94, 0.24, 0.24], distance: 0.5 },
  { normal: [-0.54, 0.36, 0.76], distance: 0.55 },
  { normal: [0.63, 0.18, -0.75], distance: 0.53 },
  { normal: [0.26, -0.9, 0.35], distance: 0.46 },
  { normal: [-0.34, -0.86, -0.38], distance: 0.44 },
];

/** The low table. One broad crown cut close in, everything else pushed out. */
const SLAB_KNIVES: readonly Knife[] = [
  { normal: [0.07, 0.98, 0.19], distance: 0.38 },
  { normal: [-0.95, 0.24, 0.2], distance: 0.52 },
  { normal: [0.9, 0.3, 0.32], distance: 0.56 },
  { normal: [0.15, 0.26, 0.95], distance: 0.5 },
  { normal: [-0.22, 0.2, -0.95], distance: 0.54 },
  { normal: [0.71, 0.34, -0.62], distance: 0.58 },
  { normal: [-0.66, 0.3, -0.69], distance: 0.55 },
  { normal: [0.31, -0.88, 0.36], distance: 0.44 },
  { normal: [-0.29, -0.9, -0.32], distance: 0.42 },
];

/** The chip. Few knives, one steep short face, an asymmetric crown. */
const NUB_KNIVES: readonly Knife[] = [
  { normal: [0.42, 0.85, 0.32], distance: 0.4 },
  { normal: [-0.93, 0.28, -0.24], distance: 0.42 },
  { normal: [0.87, 0.2, -0.45], distance: 0.44 },
  { normal: [0.1, 0.18, 0.98], distance: 0.48 },
  { normal: [-0.28, 0.12, -0.95], distance: 0.46 },
  { normal: [-0.6, 0.56, 0.57], distance: 0.5 },
  { normal: [0.22, -0.89, 0.4], distance: 0.42 },
  { normal: [-0.36, -0.85, -0.39], distance: 0.4 },
];

const RECIPES: Readonly<Record<string, KindRecipe>> = {
  boulder: { knives: BOULDER_KNIVES, scale: [1.14, 0.86, 1.0], shear: -0.06 },
  slab: { knives: SLAB_KNIVES, scale: [1.2, 0.62, 0.92], shear: 0.05 },
  nub: { knives: NUB_KNIVES, scale: [0.8, 0.95, 0.72], shear: 0.16 },
};

export type RockKindName = keyof typeof RECIPES;
export const ROCK_KINDS = Object.keys(RECIPES) as readonly RockKindName[];

export interface RockKind {
  /** The mass's faces. Points are metres with y = 0 at the contact. */
  readonly faces: readonly Facet[];
  /** Height of the mass, metres, at instance scale 1. */
  readonly height: number;
  /** Largest horizontal half-extent, metres, at instance scale 1. */
  readonly footprint: number;
}

const built = new Map<RockKindName, RockKind>();

/**
 * One kind, cut, scaled, sheared, and dropped so its lowest point is y = 0 -
 * which makes an instance's position its contact point.
 *
 * Memoised: the cutting is a dozen plane passes over fifty-odd points, and the
 * contact shading asks for the extents before the mesh builder asks for the
 * faces.
 */
export function rockKind(name: RockKindName): RockKind {
  const cached = built.get(name);
  if (cached !== undefined) return cached;

  const recipe = RECIPES[name]!;
  const [sx, sy, sz] = recipe.scale;
  let lowest = Infinity;
  let highest = -Infinity;
  let reach = 0;

  const faces = carve(recipe.knives).map<Facet>((face) => {
    // Scaling skews a normal; the inverse-transpose of a diagonal scale is the
    // reciprocal scale. The shear's inverse-transpose costs one more term.
    const normal = normalise([
      face.normal[0] / sx,
      face.normal[1] / sy - (face.normal[0] / sx) * recipe.shear,
      face.normal[2] / sz,
    ]);
    const points = face.points.map<Vector>((p) => {
      const y = p[1] * BASE_RADIUS * sy;
      return [p[0] * BASE_RADIUS * sx + y * recipe.shear, y, p[2] * BASE_RADIUS * sz];
    });
    for (const p of points) {
      if (p[1] < lowest) lowest = p[1];
      if (p[1] > highest) highest = p[1];
      const radius = Math.sqrt(p[0] * p[0] + p[2] * p[2]);
      if (radius > reach) reach = radius;
    }
    return { normal, points };
  });

  for (const face of faces) for (const p of face.points) p[1] -= lowest;

  const kind: RockKind = { faces, height: highest - lowest, footprint: reach };
  built.set(name, kind);
  return kind;
}
