// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Authored dimensions for the one in-field hero oak. The runtime recipe is
 * one leader, nine bough segments, one watertight umbrella crown and three
 * low bramble wedges. There are no satellite canopy masses. */

/** The frozen production route frames this root in a rule-of-thirds region in
 * Classic, Follow and the narrow phone crop. Keeping it down-field of the old position
 * puts crown, forks and roots in one frame instead of leaving only the bole. */
export const HERO = { x: 0, z: 28 } as const;

export const BOLE = {
  diameter: 3,
  length: 9.4,
  yaw: 0.5,
  tiltX: 0.042,
  tiltZ: -0.03,
} as const;

/** Three exposed root runs around the hero bole. They use the shared tapered,
 * flared wood geometry and remain part of the existing wood draw. */
export const ROOTS = [
  { yaw: -0.55, length: 4.4, diameter: 1.15, lean: 1.4 },
  { yaw: 1.65, length: 3.8, diameter: 1, lean: 1.42 },
  { yaw: 3.75, length: 3.4, diameter: 0.9, lean: 1.43 },
] as const;

export interface BoughSegment {
  readonly length: number;
  readonly lean: number;
}

export interface Bough {
  readonly yaw: number;
  readonly from: number;
  readonly diameter: number;
  readonly segments: readonly BoughSegment[];
}

/** Two asymmetric, visibly forked shoulders. Their terminal tips land deep
 * inside HEART instead of carrying separate foliage balls. */
export const BOUGHS: readonly Bough[] = [
  {
    yaw: 0.25,
    from: 4,
    diameter: 1.28,
    segments: [
      { length: 3, lean: 0.55 },
      { length: 2.3, lean: 0.7 },
      { length: 1.5, lean: 0.82 },
    ],
  },
  {
    yaw: 2.35,
    from: 4.3,
    diameter: 1.15,
    segments: [
      { length: 2.8, lean: 0.52 },
      { length: 2.1, lean: 0.68 },
      { length: 1.45, lean: 0.8 },
    ],
  },
  {
    yaw: 4.45,
    from: 4.1,
    diameter: 1.08,
    segments: [
      { length: 2.65, lean: 0.54 },
      { length: 2, lean: 0.7 },
      { length: 1.35, lean: 0.82 },
    ],
  },
];

/** Girth of each segment relative to its parent and how deeply joints lap. */
export const OUTER_GIRTH = 0.62;
export const JOINT_LAP = 1;

/** One dominant field-oak crown. Its broad 2.06:1 proportion exposes the lower
 * fork hierarchy and lets the shared lobe kit read as an asymmetric umbrella. */
export const HEART = {
  dx: 1.4,
  dy: 8.1,
  dz: -0.8,
  width: 15.675,
  height: 7.6,
  depth: 11.4,
  yaw: 0.7,
  tint: 0.46,
} as const;

/** One distinct ground-cover asset at the bole contact. */
export const HERO_SHRUBS = [
  { dx: 0.3, dz: -0.2, width: 3.4, depth: 2.2, height: 0.58, yaw: 0.35, tint: 0.12 },
  { dx: -1.1, dz: 0.45, width: 3, depth: 1.9, height: 0.52, yaw: 1.7, tint: 0.2 },
  { dx: 1.1, dz: 0.8, width: 2.7, depth: 1.7, height: 0.48, yaw: -0.8, tint: 0.08 },
] as const;
