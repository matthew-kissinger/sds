// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Home Field. One field, playtested numbers from spec/02:
 * 200 x 200 m centred on the origin, perimeter fence, north gate at x = 0,
 * z = 100, 8 m wide, pen rect x [-30, 30] z [102, 130] behind it, flock
 * spawning around (-20, -20) with spread radius 25.
 *
 * Gate geometry, stated once because two fences share the opening:
 *
 *   z = 100   the perimeter fence line. `gate` is its only gap.
 *   z = 102   the pen's south fence. PenBarrier is built with the SAME gap,
 *             same x and same width, moved to the pen's own south edge
 *             (see state.ts). The 2 m between them is a corridor open only
 *             within the gate width: the perimeter's hard clamp lets a body
 *             cross the fence line only inside |x| <= width/2, and the pen's
 *             gap slot reaches back past z = 100 to meet it.
 *
 * A flock size is a config value, not a field property: 25 / 75 / 200 all play
 * this same field (spec/02).
 */

import type { FieldDef } from './types';

export const HOME_FIELD: FieldDef = {
  bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  gate: { position: { x: 0, z: 100 }, width: 8 },
  pen: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 },
  spawn: { center: { x: -20, z: -20 }, spreadRadius: 25 },
  // South-west of the flock, inside the fence, well outside the flee radius so
  // the first tick does not scatter the spawn.
  dogSpawn: { x: -20, z: -60 },
};
