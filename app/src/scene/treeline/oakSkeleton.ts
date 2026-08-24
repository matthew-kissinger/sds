// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Authored dimensions retained by the placement bake for the boundary tree. */

/** The outside-fence hero remains a useful vista anchor in Classic, Follow and
 * the narrow phone crop while its full crown envelope clears both pastures. */
export const HERO = { x: 65, z: 112 } as const;

export const BOLE = {
  diameter: 3,
  length: 9.4,
  yaw: 0.5,
  tiltX: 0.042,
  tiltZ: -0.03,
} as const;

/** The sourced Round bole supplies its own integrated flare, so no separate
 * root runs are emitted. */
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
const ACTIVE_ENVELOPE = { dy: 7.3, width: 12.8, height: 8, depth: 10.1 } as const;

export const HEART = {
  dx: 1.4,
  ...ACTIVE_ENVELOPE,
  dz: -0.8,
  yaw: 0.7,
  tint: 0.46,
} as const;
