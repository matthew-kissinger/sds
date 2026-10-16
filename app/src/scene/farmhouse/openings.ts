// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Where the holes are. There are twenty-three of them in the cluster and not one
 * of them is joinery.
 *
 * THE BUDGET WENT BACK INTO THE SILHOUETTE, AND IT STILL IS. An earlier pass
 * built five solids per opening - jambs, lintel, projecting sill, mullion - and
 * at a hundred metres that trim rendered brighter and busier than anything on the
 * sheep the player is meant to be watching. Scenery does not out-detail the hero
 * asset. Every opening here is still one dark panel (farmhouse/parts.ts): two
 * triangles, no trim, no glass tint. That is why the count could nearly treble
 * this pass for forty-four triangles and no draw call.
 *
 * NO ELEVATION IS BLANK, AND THAT IS THE CORRECTION THIS PASS IS BUILT AROUND.
 * Nine openings sounded frugal and measured as a fault: they sat on two faces of
 * the house and two of the barn, which left the sunlit long wall of the range -
 * 18.6 m by 5.8 m, the single largest plane in the cluster - carrying a front
 * door at one end and nothing else, and both barn gables, 10.8 m by 10.5 m,
 * carrying nothing at all. A roof says cottage and a blank wall says warehouse,
 * and when the two disagree the eye believes the wall. What reads as a dwelling
 * at this distance is not detail, it is the RHYTHM of dark notes across a light
 * plane, and a plane with no rhythm on it has no scale either: there is nothing
 * in an empty 18 m wall to say whether it is a cottage or a hangar.
 *
 * NO TWO ARE ALIKE AND NO TWO GAPS MATCH. Every opening carries its own width,
 * height and head height, and the spacing between them is uneven. A farmhouse is
 * a building that grew; a row of identical punched holes at an identical pitch is
 * a spreadsheet. The first floor deliberately does not line up over the ground
 * floor everywhere - two of them do, which is what makes the rest look deliberate.
 *
 * THE LAMPS ARE ALL ON A SHADOWED FACE, and that is not decoration. Lamplit glass
 * is driven above 1.0 so the post chain's bloom catches it
 * (farmhouse/materials.ts), and a value driven above 1.0 on a wall already in the
 * key band arrives as a white rectangle. The four shaded planes in this cluster
 * are the range's hipped end (half-lambert 0.02), its plusZ flank (0.39), the
 * barn's door elevation (0.17) and the barn's hayloft gable (0.13); every lamp
 * below is on one of those. The range's minusZ front and minusX gable are in the
 * key band at 0.61 and 0.98, so nothing on them is ever lit.
 */

import type { Opening } from './parts';
import { BARN, HOUSE, WING } from './plan';

/**
 * Openings on the main range.
 *
 * The minusZ front is the elevation both gameplay cameras actually approach, and
 * it is the one that had to grow: the wing covers roughly -6.7 to 0 along it and
 * the lean-to 4.85 to 8.45, so the windows take the stretches those leave and the
 * first floor runs on over both of them. The hipped plusX end keeps its three
 * lamps, the plusZ flank gets the shaded rhythm it never had, and the gabled
 * minusX end - the brightest plane on the house, at half-lambert 0.98 - gets
 * three, including one up in the gable triangle where the roof space would be.
 */
/**
 * The front door, named rather than inlined because the porch is built round it
 * (farmhouse/parts.ts) and a door and the roof over it cannot be allowed to
 * disagree about where they are.
 */
export const FRONT_DOOR: Opening = {
  face: 'minusZ', wall: -HOUSE.width / 2, across: 3.5, sill: 0, width: 1.35, height: 2.55,
};

export const HOUSE_OPENINGS: readonly Opening[] = [
  // The hipped end, square-on to both gameplay cameras and in deep shade.
  { face: 'plusX', wall: HOUSE.length / 2, across: -2.2, sill: 1.45, width: 1.55, height: 2.2, lit: true },
  { face: 'plusX', wall: HOUSE.length / 2, across: 1.65, sill: 1.75, width: 1.1, height: 1.65, lit: true },
  { face: 'plusX', wall: HOUSE.length / 2, across: -0.35, sill: 4, width: 1, height: 1.25 },
  // The front. The door sits in the one clear stretch between the wing and the
  // lean-to; the ground-floor windows take the rest of that stretch and the
  // sliver past the wing, and the first floor runs the length of the elevation.
  FRONT_DOOR,
  { face: 'minusZ', wall: -HOUSE.width / 2, across: 1.45, sill: 1.15, width: 1.3, height: 1.8 },
  { face: 'minusZ', wall: -HOUSE.width / 2, across: -8.15, sill: 1.25, width: 1.15, height: 1.6 },
  { face: 'minusZ', wall: -HOUSE.width / 2, across: 6.65, sill: 4.3, width: 1.1, height: 1.25 },
  { face: 'minusZ', wall: -HOUSE.width / 2, across: 1.3, sill: 4.15, width: 1.15, height: 1.3 },
  { face: 'minusZ', wall: -HOUSE.width / 2, across: -3.2, sill: 4.4, width: 0.95, height: 1.1 },
  { face: 'minusZ', wall: -HOUSE.width / 2, across: -8.05, sill: 4.35, width: 1, height: 1.2 },
  // The shaded flank. One lamp, low, where the yard would be.
  { face: 'plusZ', wall: HOUSE.width / 2, across: 0.9, sill: 1.2, width: 1.4, height: 1.85, lit: true },
  { face: 'plusZ', wall: HOUSE.width / 2, across: -5.6, sill: 1.3, width: 1.25, height: 1.7 },
  { face: 'plusZ', wall: HOUSE.width / 2, across: 6.1, sill: 1.35, width: 1.1, height: 1.55 },
  { face: 'plusZ', wall: HOUSE.width / 2, across: -4.95, sill: 4.4, width: 1, height: 1.15 },
  { face: 'plusZ', wall: HOUSE.width / 2, across: 2.6, sill: 4.25, width: 1.05, height: 1.2 },
  // The gabled end. The gable triangle narrows fast: at the head of the top
  // window it is 2.7 m to the verge either side, so a metre of opening fits.
  { face: 'minusX', wall: -HOUSE.length / 2, across: -1.05, sill: 1.4, width: 1.35, height: 1.85 },
  { face: 'minusX', wall: -HOUSE.length / 2, across: 1.85, sill: 4.3, width: 1, height: 1.15 },
  { face: 'minusX', wall: -HOUSE.length / 2, across: -0.2, sill: 6.55, width: 0.85, height: 1 },
];

/** The cross wing: one window on its gable, one lamp on its shaded flank. */
export const WING_OPENINGS: readonly Opening[] = [
  { face: 'plusX', wall: WING.length / 2, across: 0.25, sill: 1.5, width: 1.35, height: 1.8 },
  { face: 'plusZ', wall: WING.width / 2, across: 0.7, sill: 1.45, width: 1.25, height: 1.75, lit: true },
];

/**
 * The barn.
 *
 * THE CART DOOR CAME DOWN FROM 5.3 M TO 4.75. On a 6.2 m wall a 5.3 m doorway
 * leaves nine hundred millimetres of board over its head, which does not read as
 * a lintel - it reads as a hole punched up to the eaves, and the barn stopped
 * having a front and became a wall with a gap in it. At 4.75 there is a metre and
 * a half of board above the opening for the hood to sit on (farmhouse/parts.ts).
 *
 * The man-door beside it is the whole reason the cart door reads as big: 5 m of
 * dark on a blank elevation is a shape, and 5 m of dark next to 2.1 m of dark is
 * a door a cart goes through next to a door a person goes through. The gables
 * take a hayloft each - one lamplit, because the plusX gable is the barn's
 * deepest shade at half-lambert 0.13 - and the sunlit plusZ flank takes two small
 * ones, high, where a byre's windows go.
 */
/** The cart door, named for the same reason: the hood is built off its head. */
export const CART_DOOR: Opening = {
  face: 'minusZ', wall: -BARN.width / 2, across: 0.4, sill: 0, width: 5, height: 4.75,
};

export const BARN_OPENINGS: readonly Opening[] = [
  CART_DOOR,
  { face: 'minusZ', wall: -BARN.width / 2, across: 4.35, sill: 0, width: 0.95, height: 2.1 },
  // Over the outshot's back, which stands 3.6 m up this wall.
  { face: 'minusZ', wall: -BARN.width / 2, across: -5.1, sill: 4.35, width: 1.15, height: 1.3 },
  { face: 'plusX', wall: BARN.length / 2, across: -0.75, sill: 6.75, width: 1.7, height: 1.5, lit: true },
  { face: 'plusX', wall: BARN.length / 2, across: 2.4, sill: 2.6, width: 1.05, height: 1.4 },
  { face: 'minusX', wall: -BARN.length / 2, across: 0.35, sill: 7.05, width: 1.45, height: 1.35 },
  { face: 'minusX', wall: -BARN.length / 2, across: -2.3, sill: 1.9, width: 1, height: 1.35 },
  { face: 'plusZ', wall: BARN.width / 2, across: -3.9, sill: 3.6, width: 1.2, height: 1.35 },
  { face: 'plusZ', wall: BARN.width / 2, across: 3.05, sill: 3.75, width: 1.1, height: 1.25 },
];
