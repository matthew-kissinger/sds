// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Where the holes are. There are nine of them in the whole cluster and none of
 * them is joinery.
 *
 * THE BUDGET WENT BACK INTO THE SILHOUETTE. The previous pass built five solids
 * per opening - jambs, lintel, projecting sill, mullion - across eleven openings,
 * and at a hundred metres that trim rendered brighter and busier than anything on
 * the sheep the player is meant to be watching. Scenery does not out-detail the
 * hero asset. Every opening here is one dark panel (farmhouse/parts.ts), and what
 * the saving paid for is the hipped end and the barn's own mass.
 *
 * NO TWO ARE ALIKE AND NO TWO GAPS MATCH. Every opening carries its own width,
 * height and head height, and the spacing between them is uneven. A farmhouse is
 * a building that grew; a row of identical punched holes at an identical pitch is
 * a spreadsheet.
 *
 * THE LAMPS ARE ALL ON A SHADOWED FACE, and that is not decoration. Lamplit glass
 * is driven above 1.0 so the post chain's bloom catches it
 * (farmhouse/materials.ts), and a value driven above 1.0 on a wall already in the
 * key band arrives as a white rectangle. On the range's hipped end - nDotL 0.02,
 * and the plane most square-on to both gameplay cameras - the same value is the
 * warmest thing in the frame.
 */

import type { Opening } from './parts';
import { BARN, HOUSE, WING } from './plan';

/**
 * Openings on the main range. Three on the shadowed end wall under the hip, two
 * on the sunlit long wall in the stretches the wing and the lean-to leave.
 */
export const HOUSE_OPENINGS: readonly Opening[] = [
  { face: 'plusX', wall: HOUSE.length / 2, across: -2.2, sill: 1.45, width: 1.55, height: 2.2, lit: true },
  { face: 'plusX', wall: HOUSE.length / 2, across: 1.65, sill: 1.75, width: 1.1, height: 1.65, lit: true },
  { face: 'plusX', wall: HOUSE.length / 2, across: -0.35, sill: 4, width: 1, height: 1.25 },
  // The front door, in the one clear stretch between the wing and the lean-to.
  { face: 'minusZ', wall: -HOUSE.width / 2, across: 3.5, sill: 0, width: 1.35, height: 2.55 },
  // First floor, over the lean-to's roof.
  { face: 'minusZ', wall: -HOUSE.width / 2, across: 6.65, sill: 4.3, width: 1.1, height: 1.25 },
];

/** The cross wing: one window on its gable, one lamp on its shaded flank. */
export const WING_OPENINGS: readonly Opening[] = [
  { face: 'plusX', wall: WING.length / 2, across: 0.25, sill: 1.5, width: 1.35, height: 1.8 },
  { face: 'plusZ', wall: WING.width / 2, across: 0.7, sill: 1.45, width: 1.25, height: 1.75, lit: true },
];

/** The barn: the cart door on the yard side, one hayloft in the shadowed gable. */
export const BARN_OPENINGS: readonly Opening[] = [
  { face: 'minusZ', wall: -BARN.width / 2, across: 0.5, sill: 0, width: 5.2, height: 5.3 },
  { face: 'plusX', wall: BARN.length / 2, across: -0.75, sill: 6.75, width: 1.7, height: 1.5 },
];
