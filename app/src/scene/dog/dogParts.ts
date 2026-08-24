// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The border collie, as tables of cross-sections. These numbers ARE the asset
 * (AGENTS.md rule 11); dogGeometry.ts only places them.
 *
 * Dog-local axes: +z forward, +y up, origin on the ground under the dog, so
 * every number below is also a measurement. The dog is 2.45 m nose to point of
 * buttock, 0.90 m across the haunch, 1.47 m at the withers, and the tail adds
 * 0.63 m of plume behind it. Next to a sheep that stands 0.95 m and measures
 * about 1.2 m by 0.8 m, the dog is half again as long and a third again as wide,
 * which is the point: from the Classic camera the player has to find it in under
 * a second (spec/05), and the previous pass shipped an animal that covered fewer
 * pixels than one sheep.
 *
 * FIVE NUMBERS DECIDE WHETHER IT IS A BORDER COLLIE, and each was measured off a
 * capture rather than felt:
 *
 *  - NECK LENGTH AGAINST NECK GIRTH. The neck runs 0.28 m from base to nape at a
 *    half-width of 0.28 to 0.33. The pass before this ran 0.46 m at a half-width
 *    of 0.19, and every hero angle came back with an anteater: a neck reads long
 *    when it is thin, so the fix is two thirds girth and one third length.
 *  - SKULL WIDTH AGAINST MUZZLE WIDTH. 0.55 m across the dome against 0.23 m
 *    across the muzzle, with the change concentrated in the 7 cm between the brow
 *    and the stop. Spread that step over the head and the profile is a wedge;
 *    concentrate it and there is a face. The skull carries the same 0.225 m of
 *    depth as it does half-width, so it is a box rather than a plate: a head that
 *    is broad from above and shallow from the side reads as a snake from the
 *    beauty angle, which is the angle a profile is actually judged from.
 *  - RIB DEPTH AGAINST ELBOW HEIGHT. The barrel bottoms out at 0.64 and the
 *    elbow sits at 0.73, so the chest reaches past the elbow the way a working
 *    collie's does, and the daylight under the dog is a third of its depth.
 *  - LOIN AGAINST HAUNCH. 0.70 m across the waist against 0.90 m across the
 *    haunch and 0.90 m across the ribs. From directly overhead - the read the
 *    game actually ships with - that is two masses with a waist between them
 *    rather than the single tapered rat the previous pass produced.
 *  - HOCK BEHIND STIFLE. 16 cm, which is what turns a hind leg from a tube into
 *    a Z: the gaskin sweeps back and down to a point of hock at y 0.43, then the
 *    cannon travels 15 cm forward over its last 23 cm of drop.
 *
 * PAWS ARE THEIR OWN PARTS, and small. A separate paw part steps forward, widens
 * to 0.076 against a 0.062 pastern and then flattens; because it shares no
 * vertices with the leg, the loft's smooth normals break at the pastern the way
 * they break on a real ankle. The previous pass ran 0.082 against 0.062 and
 * painted the whole thing white, and four slippers was the note it earned.
 */

import type { LoftRing } from './loft';

/**
 * Rump to nose in one unbroken loft. One part, not a body plus a head box: a
 * continuous neck is the difference between a dog and a snowman, and it lets the
 * toon terminator run the whole length without a seam at the shoulders.
 *
 * Read the topline as `y + halfHeight`. It is deliberately not a straight line:
 * 1.43 at the haunch, 1.41 across the loin, 1.46 at the ribs and 1.47 at the
 * withers, then 1.31 at the croup and 1.17 at the point of buttock. That is
 * withers standing proud of a dipped loin and a croup that slopes away, which is
 * the profile a collie has and a dead-level plank is not.
 *
 * Read the underline the same way, as `y - halfHeight`: 0.64 at the ribs rising
 * to 0.74 at the loin. A belly that climbs into the flank is the tuck.
 */
export const SPINE: readonly LoftRing[] = [
  { z: -0.96, y: 1.0, halfWidth: 0.19, halfHeight: 0.17 }, // point of buttock
  { z: -0.82, y: 1.05, halfWidth: 0.33, halfHeight: 0.26 }, // croup, sloping
  { z: -0.56, y: 1.09, halfWidth: 0.44, halfHeight: 0.34 }, // haunch, the rear mass
  { z: -0.24, y: 1.075, halfWidth: 0.35, halfHeight: 0.335 }, // loin, the waist
  { z: 0.1, y: 1.05, halfWidth: 0.45, halfHeight: 0.41 }, // ribs, deepest
  { z: 0.35, y: 1.07, halfWidth: 0.43, halfHeight: 0.4 }, // withers
  { z: 0.54, y: 1.115, halfWidth: 0.33, halfHeight: 0.335 }, // neck base
  { z: 0.68, y: 1.175, halfWidth: 0.28, halfHeight: 0.29 }, // neck, cresting
  { z: 0.82, y: 1.24, halfWidth: 0.26, halfHeight: 0.245 }, // nape
  { z: 0.93, y: 1.282, halfWidth: 0.27, halfHeight: 0.225 }, // occiput
  { z: 1.03, y: 1.29, halfWidth: 0.275, halfHeight: 0.225 }, // the dome, broadest
  { z: 1.13, y: 1.278, halfWidth: 0.235, halfHeight: 0.195 }, // brow
  { z: 1.175, y: 1.262, halfWidth: 0.196, halfHeight: 0.168 }, // cheek, in the skull
  { z: 1.225, y: 1.244, halfWidth: 0.132, halfHeight: 0.115 }, // the stop
  { z: 1.29, y: 1.237, halfWidth: 0.124, halfHeight: 0.11 }, // muzzle root
  { z: 1.38, y: 1.229, halfWidth: 0.116, halfHeight: 0.104 }, // muzzle, blunt
  { z: 1.45, y: 1.224, halfWidth: 0.106, halfHeight: 0.096 }, // square at the end
  { z: 1.485, y: 1.221, halfWidth: 0.078, halfHeight: 0.07 }, // nose plane
];

/**
 * THE CHEEK IS IN THE SKULL NOW, and the pair of jowl parts that used to carry it
 * are gone. They were two short lofts sitting either side of the muzzle root, and
 * they were interpenetrating geometry: the outline hull is built from the same
 * mesh, so wherever a jowl surface passed within a hull width of the muzzle its
 * expanded back faces came through the front of the face. The hero-front capture
 * measured a hard dark hexagon drawn round the muzzle every time, which the critic
 * read as spectacles, and no amount of burying the jowl's cap could fix a line
 * being drawn by its FLANK.
 *
 * The ring at z 1.175 above does the same job with no second surface. Brow 0.235,
 * cheek 0.196, stop 0.132: the drop is still concentrated in the 10 cm in front of
 * the eye, which is what makes a stop rather than a wedge, and there is mass under
 * the eye on the way down. One part, one silhouette, one line around it.
 */

/**
 * Front leg, lofted downward: local +z is toward the ground and local +y is
 * world forward, so a NEGATIVE ring y sets a section back and a positive one
 * steps it forward. It stops at the pastern; PAW finishes it.
 *
 * THE ELBOW IS THE POINT. The upper arm slopes 3.8 cm BACKWARD from the shoulder
 * over its first 32 cm of drop, and then the forearm comes forward again by the
 * same amount over the next 13 cm. That break is what the critic could not find
 * on the previous pass, which stepped monotonically forward and read as a stick
 * socketed into the chest. The column also tapers the whole way, 0.165 at the
 * upper arm to 0.062 at the pastern, so it has a bone in it.
 *
 * THE FIRST RING IS A BURIED SEED, for the reason written out on JOWL: the upper
 * arm's own top ring reaches 0.505 from the midline against a ribcage half-width
 * of 0.43, so capping THERE drew a hard-edged panel with a line around it on the
 * shoulder - visible in the hero-side capture as a straight-sided plate on an
 * animal that has no straight sides. The seed sits 6 cm higher and 0.045 wide,
 * well inside the ribs, and what emerges below it is a cone rather than a lid.
 */
export const FORE_LEG: readonly LoftRing[] = [
  { z: -0.06, y: 0.012, halfWidth: 0.045, halfHeight: 0.058 }, // seed, inside the ribs
  { z: 0.0, y: 0.0, halfWidth: 0.165, halfHeight: 0.195 }, // upper arm, in the chest
  { z: 0.18, y: -0.022, halfWidth: 0.148, halfHeight: 0.172 }, // sweeping back
  { z: 0.32, y: -0.038, halfWidth: 0.122, halfHeight: 0.14 }, // the elbow, set back
  { z: 0.45, y: -0.002, halfWidth: 0.093, halfHeight: 0.1 }, // forearm, forward again
  { z: 0.66, y: 0.022, halfWidth: 0.074, halfHeight: 0.078 }, // cannon
  { z: 0.85, y: 0.036, halfWidth: 0.062, halfHeight: 0.065 }, // pastern
];

/**
 * Hind thigh: the mass over the stifle. Its own part so the normals break where
 * a real thigh breaks.
 *
 * ITS FIRST RING IS A BURIED SEED AND ITS THIRD IS THE WIDEST THING ON THE DOG.
 * An earlier pass opened at full width inside the pelvis, and because it was a
 * six-sided loft the result from directly overhead was a hexagonal slab with
 * machined corners bolted to each hip. Lofting it at body resolution took the
 * corners; the seed takes the slab. At a half-width of 0.155 placed 0.385 out the
 * cap reached 0.54 against a hip half-width of 0.437, so it was OUTSIDE the animal
 * and the outline hull drew a line all the way round it. The current 0.045 seed
 * is centred 0.22 out and set 7 cm up into the pelvis; even the later 0.212 swell
 * stays just inside the 0.44 haunch envelope, so the camera sees a supported
 * thigh rather than a plate attached to the side of the dog.
 */
export const THIGH: readonly LoftRing[] = [
  { z: -0.07, y: 0.008, halfWidth: 0.045, halfHeight: 0.06 }, // seed, inside the pelvis
  { z: 0.0, y: 0.0, halfWidth: 0.155, halfHeight: 0.21 }, // buried in the pelvis
  { z: 0.11, y: -0.012, halfWidth: 0.212, halfHeight: 0.255 }, // the swell of the hip
  { z: 0.27, y: -0.035, halfWidth: 0.198, halfHeight: 0.232 },
  { z: 0.41, y: -0.058, halfWidth: 0.14, halfHeight: 0.162 }, // above the stifle
  { z: 0.5, y: -0.07, halfWidth: 0.11, halfHeight: 0.128 }, // stifle
];

/**
 * Gaskin, hock and rear cannon. Negative ring y is world-backward, which is the
 * kick of the hock; the last rings bring the pastern forward under the dog.
 *
 * The angulation is the point. The hock lands 16 cm behind the stifle and 21 cm
 * below it, and the cannon then travels 15 cm forward over its last 23 cm of
 * drop, so the leg is a Z with three straights in it.
 */
export const GASKIN: readonly LoftRing[] = [
  { z: 0.0, y: 0.0, halfWidth: 0.108, halfHeight: 0.128 }, // under the stifle
  { z: 0.105, y: -0.088, halfWidth: 0.092, halfHeight: 0.112 }, // gaskin, sweeping back
  { z: 0.205, y: -0.162, halfWidth: 0.07, halfHeight: 0.088 }, // the point of hock
  { z: 0.265, y: -0.13, halfWidth: 0.055, halfHeight: 0.06 },
  { z: 0.355, y: -0.056, halfWidth: 0.047, halfHeight: 0.051 }, // cannon, tapered
  { z: 0.43, y: -0.01, halfWidth: 0.054, halfHeight: 0.056 }, // pastern
];

/**
 * The paw, lofted downward like the legs it finishes. It steps 6.8 cm forward
 * over 18 cm of drop, widens from 0.066 to 0.076 at the knuckles and then
 * flattens to a 0.048 m sole. Twenty-three percent wider than the pastern above
 * it, which is a foot; the previous pass ran a third wider and painted it white
 * to the shin, which is a slipper. The same part serves all four feet.
 */
export const PAW: readonly LoftRing[] = [
  { z: 0.0, y: 0.0, halfWidth: 0.066, halfHeight: 0.063 }, // above the knuckles
  { z: 0.07, y: 0.028, halfWidth: 0.076, halfHeight: 0.08 }, // knuckles
  { z: 0.14, y: 0.055, halfWidth: 0.069, halfHeight: 0.072 }, // toes
  { z: 0.18, y: 0.068, halfWidth: 0.048, halfHeight: 0.038 }, // the sole
];

/**
 * Ear, lofted upward: negative local y is world forward here, so the tip folds
 * over toward the nose.
 *
 * ONE FORM, HELD FROM EVERY ANGLE. The section is nearly square - 0.098 by 0.075
 * at the base - so the ear presents about the same mass from side, front, rear
 * and top, and the read comes from the FOLD instead: the last 7.5 cm of height
 * carries 11 cm of forward travel, which is a semi-erect working collie's ear and
 * is unmistakably canine from directly overhead. 0.23 m tall on a skull 0.52 m
 * across, so the pair break the head outline from above without becoming antennae.
 */
export const EAR: readonly LoftRing[] = [
  { z: 0.0, y: 0.0, halfWidth: 0.098, halfHeight: 0.075 },
  { z: 0.085, y: -0.008, halfWidth: 0.092, halfHeight: 0.07 },
  { z: 0.155, y: -0.036, halfWidth: 0.078, halfHeight: 0.058 }, // the fold begins
  { z: 0.205, y: -0.092, halfWidth: 0.05, halfHeight: 0.038 },
  { z: 0.23, y: -0.152, halfWidth: 0.021, halfHeight: 0.017 }, // folded tip
];

/**
 * The tail, lofted backward from the croup with `rotY = PI`, so a ring's +z is
 * world-backward, a NEGATIVE ring x is the dog's RIGHT, and ring y is still up.
 *
 * A SICKLE, NOT A BLADE. The previous pass hung 0.90 m of straight plume that
 * bottomed out level with the paws and read from directly behind as a flat blade
 * with its tip under the ground plane. This one is 0.685 m long, falls away
 * immediately, bottoms out at local y -0.332 - world y 0.818, which is 39 cm
 * ABOVE the point of hock at 0.43 - and then hooks 11 cm back up to a tip at
 * 0.928. Nothing on it is ever the lowest thing on the animal, and from the rear
 * camera the whole plume now sits above the paw line rather than crossing it.
 *
 * IT IS A PLUME. Through the middle the section is 0.174 tall against 0.098 wide,
 * so the silhouette carries real feathering from the side while staying narrow
 * from above, and it tapers monotonically to 0.012 at the tip.
 *
 * IT ALSO SWEEPS 0.29 m TO THE DOG'S RIGHT, which is the difference between a
 * tail and a rudder blade. A plume held on the centreline is fully foreshortened
 * from directly behind - the one framing where a tail is most likely to be seen -
 * and the rear capture of the previous pass came back with a vertical stump. At
 * 0.29 m of drift the rear camera sees the whole curve laid out sideways, clear
 * of both hocks, while from overhead it is still a shallow S off the back of the
 * animal with a white flick on the end.
 */
export const TAIL: readonly LoftRing[] = [
  { z: 0.0, y: 0.0, x: 0.0, halfWidth: 0.1, halfHeight: 0.112 }, // root at the croup
  { z: 0.105, y: -0.075, x: -0.02, halfWidth: 0.104, halfHeight: 0.14 }, // falls at once
  { z: 0.215, y: -0.172, x: -0.058, halfWidth: 0.106, halfHeight: 0.166 }, // broadening
  { z: 0.325, y: -0.258, x: -0.108, halfWidth: 0.098, halfHeight: 0.174 }, // widest feather
  { z: 0.43, y: -0.315, x: -0.165, halfWidth: 0.082, halfHeight: 0.158 },
  { z: 0.52, y: -0.332, x: -0.215, halfWidth: 0.064, halfHeight: 0.128 }, // the low point
  { z: 0.6, y: -0.308, x: -0.255, halfWidth: 0.046, halfHeight: 0.094 }, // hooking up
  { z: 0.655, y: -0.264, x: -0.278, halfWidth: 0.028, halfHeight: 0.056 },
  { z: 0.685, y: -0.222, x: -0.288, halfWidth: 0.012, halfHeight: 0.024 }, // the tip
];
