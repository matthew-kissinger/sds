// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The plan of the homestead: what each mass measures and where it stands. Every
 * number here was either derived from the sun and the cameras or chosen to break
 * a symmetry, and each carries the reason with it. farmhouse/cluster.ts turns
 * this into buffers; nothing here builds anything.
 *
 * THE PADS DECIDE THE PLACE. assets/terrain/manifest.json declares one flat
 * `farmhouse` rect east of the pen and one `barn` rect north of it. The house
 * keeps the corner nearest the gate so its drive still explains the approach.
 * The barn now stands beyond the retirement pasture, with its whole footprint
 * north of the back rail and enough grass between the two to keep both silhouettes
 * readable.
 *
 * TWO MASSES WITH PASTURE BETWEEN THEM. The house remains the east-side approach
 * landmark while the barn anchors the north rail. From down-field they occupy
 * separate thirds of the frame rather than collapsing into one roof cluster.
 * Their small yaw difference keeps the eaves from becoming parallel rulers, and
 * the open field between them preserves the gate approach as the dominant route.
 *
 * THE RANGE IS HIPPED AT ONE END AND GABLED AT THE OTHER, which is what breaks
 * the triangle-on-box read and, more importantly, is the only way to get a
 * terminator into the roof mass. The sun is 8 degrees up on a bearing that runs
 * along the ridge, so both long slopes take nearly the same light whatever their
 * pitch; a hip is a roof plane turned ninety degrees out of that, and it lands in
 * the shadow band beside a long slope in the key band. farmhouse/roof.ts has the
 * arithmetic.
 */

import type { RoofSpec } from './roof';

/**
 * The bearing that splits sun from shadow across the approach, and the one number
 * here that was derived rather than composed. At 1.10 rad the range puts:
 *
 *   long wall (-z)   -> nDotL 0.74   key band, and 45 per cent facing the camera
 *   end wall (+x)    -> nDotL 0.02   deep shadow, and 89 per cent facing it
 *   near slope       -> nDotL 0.63   key band
 *   hip plane (+x)   -> nDotL 0.23   shadow band, and 74 per cent facing it
 *   lean-to slope    -> nDotL 0.61   key band, on its own shallow pitch
 *   wing near slope  -> nDotL 0.20   shadow band
 *   wing gable (SW)  -> nDotL 0.48   body band
 *
 * which is a three-value facade under one sun rather than one flat sheet of cream
 * with a roofline drawn on it.
 */
export const YAW = 1.1;

/**
 * The main range, hipped at its +x end. Long and narrow, and both are load
 * bearing: at this yaw the long wall is the lit plane and the end is the shadowed
 * one, so every metre traded from width into length is slate traded for cream.
 */
export const HOUSE: RoofSpec = {
  length: 18.6,
  width: 8.6,
  wallHeight: 5.8,
  ridgeHeight: 10.7,
  eaveOverhang: 1.15,
  endOverhang: 1.15,
  ridgeFlat: 0.22,
  settle: 0.26,
  sag: 0.17,
  hipRun: 6.2,
};

/**
 * The cross wing. Steeper than the range by nine degrees and two metres lower at
 * the ridge, on walls that stop at 3.2 m: three separate ways of saying that the
 * two rooflines are different masses rather than one extrusion with a bend in it.
 * The ridge height is also what lets its buried end die a clear metre and a half
 * under the main slope, which is the difference between a valley and a notch.
 */
export const WING: RoofSpec = {
  length: 7.6,
  width: 6.7,
  wallHeight: 3.8,
  ridgeHeight: 8.6,
  eaveOverhang: 0.9,
  endOverhang: 0.9,
  ridgeFlat: 0.2,
  settle: 0.14,
  sag: 0.1,
};

/** Longer, lower, broader, and gabled at both ends. A barn is a shed that got
 *  serious, and its plain double gable is a third roof form in the cluster. */
export const BARN: RoofSpec = {
  length: 16.5,
  width: 10.8,
  wallHeight: 6.2,
  ridgeHeight: 10.5,
  eaveOverhang: 1,
  endOverhang: 1,
  ridgeFlat: 0.22,
  settle: 0.34,
  sag: 0.2,
};

/**
 * Where the house stands: the pad's own corner nearest the gate, and it moved
 * three metres west and one south this pass for a reason that is composition
 * rather than architecture.
 *
 * EVERY CAMERA IN THIS GAME LOOKS UP-FIELD AND WORLD-LOCKED, so a building east
 * of the pen only ever arrives at the left edge of the frame, and the previous
 * stand put its centre a hair OUTSIDE it: at the Classic bearing the cottage was
 * cut in half by the frame edge and the thirty metres of shadow it throws lay
 * entirely off-screen. The pad's rect starts at x = 40 and the baked heightfield
 * is flat from the pen's own pad all the way across (both declare level -0.608),
 * so the west end of the range now sits a little proud of the rect on ground that
 * is level to the centimetre, and the whole cluster - drive, yard, shadow and all
 * - clears the frame edge at the two gameplay framings.
 */
export const HOUSE_AT = { x: 45.6, z: 113 } as const;

/**
 * The barn beyond the pasture. Its nearest footprint corner stays more than six
 * metres north of the pasture's back rail at z = 130, while the twelve-metre
 * east offset keeps the gate axis open and gives the south cart door a clean read
 * between sheep and roof. A small yaw prevents the long eave from becoming a
 * ruler-straight tangent to the pasture rail without turning the facade away.
 */
export const BARN_AT = { x: 12, z: 143 } as const;
export const BARN_YAW = 0.14;

/** How far along the range the wing is attached, and how far it stands out. */
export const WING_ALONG = -3.35;
export const WING_OUT = -5.15;
/**
 * How far the cross wing is turned off the main range. Fifteen degrees short of a
 * right angle, and that shortfall is the point: at a true quarter turn the wing's
 * gable is PARALLEL to the range's long wall, so the two planes take exactly the
 * same band and the facade arrives as one sheet. The skew drops the gable from
 * the key band into the body band, so the corner reads, and it gives the plan the
 * small crookedness of a house that was added to rather than drawn.
 */
export const WING_SKEW = Math.PI / 2 - 0.26;

/**
 * Where the log stack sits: out in the gap between the house and the barn rather
 * than against a wall. Stood at the footing it read as a brown lump on the
 * limewash, which is the worst thing a small prop can do to a big flat plane; out
 * in the open it has earth behind it and sky over it and reads as what it is.
 */
export const LOGS_AT = { x: 55.5, z: 106.5 } as const;
export const LOGS_YAW = YAW - 0.35;

/** Where along the ridge the chimney stands, how far down the near pitch it is
 *  seated, and how far its head rises above the ridge. */
export const CHIMNEY_AT = -0.6;
export const CHIMNEY_DOWN = -0.78;
export const CHIMNEY_RISE = 1.6;

/** Where the lean-to sits along the main range's sunlit wall, and how wide. */
export const LEANTO_AT = 6.65;
export const LEANTO_HALF = 1.8;

/**
 * The drive, leaving the yard and running down to the gate. It threads the two
 * metre corridor between the perimeter fence at z = 100 and the pen's south fence
 * at z = 102 (sim/field.ts), which is the only way to the opening, and it stops a
 * few metres short of the gate mouth so it never argues with the gate's geometry.
 */
export const DRIVE: readonly (readonly [number, number])[] = [
  [45.5, 104.9],
  [42, 104.1],
  [39, 103.6],
  [34, 102.6],
  [28.5, 101.8],
  [22, 101.4],
  [15, 101.1],
  [9, 100.95],
  [5, 100.9],
];
/** Half the width of the worn core, metres. A cart and its verges. */
export const DRIVE_HALF = 2.4;

/** The two beaten patches of yard: one at the house door, one at the barn. */
export const YARDS: readonly (readonly [number, number, number])[] = [
  [43, 107.5, 12],
  [BARN_AT.x, BARN_AT.z, 9.5],
];

/**
 * How far the contact shadow reaches out from a wall, and which way it leans.
 * Narrow: a wide one reads as paving rather than as bedding.
 */
export const APRON_REACH = 1.9;
export const APRON_BIAS: readonly [number, number] = [0.62, -0.74];
