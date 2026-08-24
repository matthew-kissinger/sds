// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Every fence in the field, submitted in one GPU batch. The perimeter carries
 * the north gate at x = 0, z = 100. The retirement pasture begins on that same
 * rail line and adds only its west, east and north sides. The perimeter's north
 * rails are its fourth side, so no duplicate front run stands behind the gate.
 */

import { HOME_FIELD } from '@sim/field';
import { RectFence, type RectFenceSection } from './RectFence';
import type { FenceGap, FenceSide } from './fenceGeometry';

/** The gate, read straight off the sim's field definition. The one opening in
 *  the game that carries the gate kit. */
const PERIMETER_GAPS: Partial<Record<FenceSide, FenceGap>> = {
  north: {
    center: HOME_FIELD.gate.position.x,
    width: HOME_FIELD.gate.width,
    kit: true,
  } satisfies FenceGap,
};

/** Visual enclosure shares the perimeter rail at z = 100. The simulation keeps
 *  its specified retirement threshold at z = 102; only the static timber moves
 *  to express one attached, three-sided pasture. */
export const RETIREMENT_PASTURE_FENCE = {
  ...HOME_FIELD.pen,
  minZ: HOME_FIELD.bounds.maxZ,
};

const RETIREMENT_PASTURE_SIDES = ['north', 'west', 'east'] as const;

export const FIELD_FENCE_SECTIONS: readonly RectFenceSection[] = [
  { rect: HOME_FIELD.bounds, gaps: PERIMETER_GAPS, postSpacing: 5 },
  {
    rect: RETIREMENT_PASTURE_FENCE,
    postSpacing: 4,
    sides: RETIREMENT_PASTURE_SIDES,
  },
];

export function FenceLine() {
  return <RectFence sections={FIELD_FENCE_SECTIONS} />;
}
