// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Home Field. One field, playtested numbers from spec/02:
 * 200 x 200 m centred on the origin, perimeter fence, north gate at x = 0,
 * z = 100, 8 m wide, pen rect x [-30, 30] z [100, 130] behind it, flock
 * spawning around (-20, -20) with spread radius 25.
 *
 * The perimeter and pen share one fence line and one opening at z = 100.
 * Owner-directed gate correction, 2026-10-20: retirement used to wait until
 * z = 102, despite the visible fence being at 100. Sheep already through the
 * gate could turn sideways in that invisible corridor and the perimeter clamp
 * snapped them back to 99.5. Crossing the visible opening now retires them
 * before another flocking tick can push them back. The worn floor's inset is
 * presentation only; it must not create a second collision/score threshold.
 *
 * A flock size is a config value, not a field property: 25 / 75 / 200 all play
 * this same field (spec/02).
 */

import type { FieldDef } from './types';

export const HOME_FIELD: FieldDef = {
  bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  gate: { position: { x: 0, z: 100 }, width: 8 },
  pen: { minX: -30, maxX: 30, minZ: 100, maxZ: 130 },
  spawn: { center: { x: -20, z: -20 }, spreadRadius: 25 },
  // South-west of the flock, inside the fence, well outside the flee radius so
  // the first tick does not scatter the spawn.
  dogSpawn: { x: -20, z: -60 },
};
