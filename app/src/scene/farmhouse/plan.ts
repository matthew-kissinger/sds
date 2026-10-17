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
 * keeps the corner nearest the gate so it still anchors the approach.
 * The barn now stands beyond the retirement pasture, with its whole footprint
 * north of the back rail and enough grass between the two to keep both silhouettes
 * readable.
 *
 * TWO MASSES WITH PASTURE BETWEEN THEM. The house remains the east-side approach
 * landmark while the barn anchors the north rail. From down-field they occupy
 * separate thirds of the frame rather than collapsing into one roof cluster.
 * The house faces the pen squarely, with its front wall parallel to the pen's
 * east rail. The open field between them preserves the gate approach as the
 * dominant route.
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
import { HOME_FIELD } from '@sim/field';

/**
 * Owner-directed alignment (2026-10-17): the house stands east of the pen, whose
 * east fence runs north-south. Its front is local -Z and its ridge is local X,
 * so a quarter turn faces the front west into the pen and aligns the facade with
 * that fence. The previous 1.10 rad bearing favoured light bands but left the
 * house visibly skewed by about 27 degrees. Geometry, outline, shadows, smoke
 * and the grass footprint all read this placement; rebake grass when it moves.
 */
export const YAW = Math.PI / 2;

/**
 * The main range, hipped at its +x end. Long and narrow, and both are load
 * bearing: they keep the range readable above the pasture from the gameplay
 * cameras, with a broad roof and a narrower end elevation.
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
 * is level to the centimetre, and the whole cluster - building, shadow and all
 * - clears the frame edge at the two gameplay framings.
 */
export const HOUSE_AT = { x: 45.6, z: 113 } as const;

/**
 * Owner-directed alignment (2026-10-17): centre the barn behind the pen and
 * gate, with its south facade parallel to the pen's back rail. This replaces
 * the previous 12 m offset and 0.14 rad yaw. Keep the same northward setback;
 * terrain pad, grass footprints and the ambient farmer route follow the move.
 */
export const BARN_AT = { x: HOME_FIELD.gate.position.x, z: 143 } as const;
export const BARN_YAW = 0;

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
/** Independent yard dressing: keep its bearing when the house is realigned. */
export const LOGS_YAW = 0.75;

/** Where along the ridge the chimney stands, how far down the near pitch it is
 *  seated, and how far its head rises above the ridge. */
export const CHIMNEY_AT = -0.6;
export const CHIMNEY_DOWN = -0.78;
export const CHIMNEY_RISE = 1.6;

/** Where the lean-to sits along the main range's sunlit wall, and how wide. */
export const LEANTO_AT = 6.65;
export const LEANTO_HALF = 1.8;
/** How far a lean-to stands out from the wall it is built against. */
export const LEANTO_DEPTH = 2.8;

/** How far the plinth course stands out past a building's walls at its foot. */
export const PLINTH_OUT = 0.22;

/**
 * The procedural porch over FRONT_DOOR: half its width across the door, and how
 * far it stands out from the front wall; the posts stand just inside that line.
 */
export const PORCH = { half: 1.32, depth: 1.95 } as const;

/**
 * The barn's outshot and its cupola, both in the barn's own frame.
 *
 * The outshot takes the left third of the door elevation, clear of the cart door
 * at -2.1 and of the man door past it, so that wall reads as three things of
 * three different heights instead of one board plane with a hole in it.
 *
 * The cupola is deliberately NOT on the barn's centre line. On centre it would
 * stand directly over the cart door and read as part of it, and from the field
 * it would line up with the house's stack behind; two and a half metres off
 * breaks both alignments and still leaves it clear of the lean-to's ridge.
 */
export const BARN_LEANTO_AT = -5.9;
export const BARN_LEANTO_HALF = 2;
export const BARN_CUPOLA_AT = -2.45;

/**
 * The walk-in house's stack and roof, in the house's own frame, from
 * assets/house/farmhouse.kiln.js. That file is a Kiln program rather than a
 * module, so these are repeated: they place the three things the baked mesh
 * cannot say for itself, which are where the smoke leaves, where the stack
 * throws its shadow and how big the outline's envelope is.
 */
export const KILN_STACK = {
  x: -8.1,
  z: -1.35,
  halfX: 1.4,
  halfZ: 1.25,
  /** The cap's top face. */
  top: 11.35,
  /** The pot's mouth, where the smoke starts, offset from the shaft's axis. */
  mouth: { x: -7.84, y: 12.28, z: -1.45 },
} as const;

/**
 * The Kiln house's porch, in the house's frame, from the recipe: centred on the
 * front door at x 3.5, 1.38 m each side (the posts' outer faces at 1.33), and
 * 2.05 m out from the front wall's outer face at z -4.575. The step stands
 * under it. Repeated for the same reason as KILN_STACK: the grass bake cuts
 * the house's footprint, and the GLB is not something a bake script reads.
 */
export const KILN_PORCH = { across: 3.5, half: 1.38, depth: 2.05 } as const;

/**
 * The outline's envelope for the Kiln house: its roof as built, not HOUSE's.
 *
 * The Kiln roof bears on the walls' OUTER faces (19.15 by 9.15), oversails the
 * long walls by 0.45 m, and its slate runs from 5.338 m at the eave edge to
 * 10.72 m at the ridge with no sag or settle. `roofHull` puts the slate's top
 * SLAB above the structural line, so the two heights here are the slate's less
 * that offset (0.14 x 0.682 on this pitch).
 *
 * THE ENVELOPE STOPS AT THE GABLES, though the verge oversails them by 0.45 m.
 * `roofHull` closes its section with a flat underside at fascia depth below the
 * eave, and wherever that plate stands outside a gable it is seen from above,
 * so the outline drew it as a dark line straight across each gable from eave
 * to eave. That is what the earlier envelope - HOUSE with the eaves trimmed,
 * 18.6 by 8.6 with its eave at 5.8 - did, at wall-head height, on both gables
 * of the authored house. Ending the envelope at the gable face costs the
 * outline only the 0.45 m end of the verge.
 *
 * THESE ARE A HAND COPY of the recipe's roof, and they drifted: the eave
 * overhang and the edge depth below were the procedural house's numbers until
 * an adversarial review measured the ledge they drew. The first-principles
 * version is for the bake to write the slab's eave and verge corners into the
 * GLB extras beside `surfaceChannels` and for this envelope to be derived from
 * them; that is the open follow-up.
 */
export const KILN_ROOF: RoofSpec = {
  length: 19.15,
  width: 9.15,
  wallHeight: 5.338 - 0.0955,
  ridgeHeight: 10.72 - 0.0955,
  // Not the slab's 0.45 m oversail. `roofHull` puts its eave SLAB x ay (about
  // 0.10 m) further out than the structural line, then the outline pushes the
  // envelope out again, so at 0.45 the hull's eave stood past the slab and its
  // underside showed as a dark ledge in the outline colour under both long
  // eaves, widest at the corners and painted over the wall corners from above.
  // 0.2 lands the envelope's eave on the slab's lower outer corner (z 4.87);
  // 0.35 still hung a line below the slab.
  eaveOverhang: 0.2,
  endOverhang: 0,
  ridgeFlat: 0,
  settle: 0,
  sag: 0,
  // The slab's cut edge is about 0.15 m deep (its lowest point is y 5.19), not
  // the code-built roof's 0.26 m fascia.
  eaveDepth: 0.15,
  // A flat Kiln slab: the procedural bow sank the envelope mid-slope and hid the
  // rake's outline along the middle of each verge.
  bow: 0,
};

/**
 * The ground the Kiln barn covers at its foot, in the barn's own frame, from
 * assets/barn/barn.kiln.js: the walls with their plinth (16.66 by 10.96, the
 * stone standing 0.08 m proud of the boards), the stone apron under the swing of
 * the cart doors, and the step at the stable door.
 *
 * Repeated for the same reason as KILN_PORCH: the grass bake cuts the footprint
 * of the barn that ships, and a bake script does not read a GLB. The bake also
 * writes this list into its root node's extras (`footprint`), and
 * tests/barn-kiln.spec.ts holds this copy to that record and to the geometry.
 *
 * Nothing else about the Kiln barn is copied here. It stands in BARN's box on
 * BARN_AT at BARN_YAW and throws BARN's shadow, and its outline envelope is
 * derived from the masses the bake records (farmhouse/hull.ts `envelopeHull`).
 */
export const KILN_BARN_FOOTPRINT = [
  { id: 'barn', minX: -8.33, maxX: 8.33, minZ: -5.48, maxZ: 5.48 },
  { id: 'barn apron', minX: -3.1, maxX: 4, minZ: -7.5, maxZ: -5.48 },
  { id: 'barn step', minX: 4.6, maxX: 6, minZ: -5.9, maxZ: -5.48 },
] as const;
