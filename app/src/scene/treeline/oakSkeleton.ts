// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Authored dimensions retained by the placement bake for the one in-field tree. */

import { ACTIVE_SOURCED_CROWN } from './crownShape';

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
export const ROOTS: readonly {
  readonly yaw: number;
  readonly length: number;
  readonly diameter: number;
  readonly lean: number;
}[] = [];

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

/** Two short buried fork chains retained for placement diagnostics only. The
 * sourced candidate renders its complete original wood silhouette. */
export const BOUGHS: readonly Bough[] = [
  {
    yaw: 0.35,
    from: 4.1,
    diameter: 1.2,
    segments: [
      { length: 2.2, lean: 0.58 },
      { length: 0.95, lean: 0.72 },
    ],
  },
  {
    yaw: 3.65,
    from: 4.25,
    diameter: 1.1,
    segments: [
      { length: 2.1, lean: 0.5 },
      { length: 0.9, lean: 0.66 },
    ],
  },
] as const;

/** Girth of each segment relative to its parent and how deeply joints lap. */
export const OUTER_GIRTH = 0.62;
export const JOINT_LAP = 1;

/** One dominant field-tree envelope. The active sourced geometry supplies the
 * actual trunk-to-crown relationship and silhouette. */
const ACTIVE_ENVELOPE = ACTIVE_SOURCED_CROWN === 'fox-broad-spreading'
  ? { dy: 7.35, width: 14.3, height: 7.75, depth: 10.5 }
  : { dy: 7.3, width: 10, height: 8.45, depth: 9.4 };

export const HEART = {
  dx: 1.4,
  ...ACTIVE_ENVELOPE,
  dz: -0.8,
  yaw: 0.7,
  tint: 0.46,
} as const;

/** One distinct ground-cover asset at the bole contact. */
export const HERO_SHRUBS = [
  { dx: 0.3, dz: -0.2, width: 3.4, depth: 2.2, height: 0.58, yaw: 0.35, tint: 0.12 },
  { dx: -1.1, dz: 0.45, width: 3, depth: 1.9, height: 0.52, yaw: 1.7, tint: 0.2 },
  { dx: 1.1, dz: 0.8, width: 2.7, depth: 1.7, height: 0.48, yaw: -0.8, tint: 0.08 },
] as const;
