// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Everything the pen floor is tuned by. Split out of `floorMaterial.ts` so both
 * files stay small and so the numbers a critic argues with sit in one place.
 *
 * Every colour here is a palette candidate: promote in cohesion pass.
 */
/**
 * The floor's tones, authored sRGB and measured ON THE RENDERED PIXEL against
 * the pasture beside it, because that is the only place the comparison means
 * anything.
 *
 * THE LAST PASS AUTHORED THE CHROMA OUT OF THE EARTH AND GOT ASPHALT. Reasoning
 * that the ramp's warm gain would open a brown's saturation back out, it carried
 * the blue channel far too close to the other two - and the arithmetic was right
 * while the picture was wrong: the floor sampled rgb(131,116,82) on the phone,
 * which is a road surface. Trodden ground at golden hour is not a dulled version
 * of grass, it is a different and MORE saturated colour: ochre where it is dry,
 * umber where it is packed.
 *
 * So these are authored as the ochre-umber they should look like, at or above
 * the pasture's own saturation, and the value is where the discipline lives
 * instead. The dry rim is most of the pen's area and it stays clearly under the
 * grass; the compacted core stays well under that. The pen is the destination.
 * The gate is the landmark.
 *
 * palette candidate: promote in cohesion pass
 */
/**
 * THE THREE TIERS ARE A LADDER AND THEY RUN ONE WAY.
 *
 * The pass before this authored the rim light, the middle tier DARK and the core
 * light again, which is not a ladder, it is a checkerboard: the quantiser then
 * cut it into pale amoebas floating on a brown field and the floor read as
 * blotches rather than as trodden ground. Value now climbs monotonically from the
 * untrodden rim to the polished centre, eight points a step, and the marks read as
 * wear because wear is the only thing that changes across them.
 *
 * All three sit in the farmhouse yard's own colour family (farmhouse/palette.ts,
 * YARD and YARD_PACKED) rather than near it. Two dirt surfaces thirty metres
 * apart in one frame are one material or the frame has two art directions in it.
 */
export const EARTH = '#987c58';
/** The dry rim: what earth does where nothing walks on it, and most of the pen's
 *  area. */
export const EARTH_DRY = '#ae9068';
/**
 * The trodden centre, and it is the LIGHTEST of the three. Ground walked on every
 * day is dry dust polished flat, not a wet patch: taking the core to the bottom of
 * the ladder is what turned the pen into a black hole punched through the field
 * at the Classic camera, with the flock standing on what read as standing water.
 */
export const EARTH_CORE = '#c3a77e';
/** Straw and dry stalks, the pale flecks lying on the dry rim. */
export const STRAW = '#d0b78d';
/** Cart ruts: two dark lines running out of the mouth and up the pen. The one
 *  mark on this floor with a direction and an author. */
export const RUT = '#7c6448';

/**
 * Three plateau gains, not a gradient. Smooth noise averages to flat; the marks
 * are quantised into three HARD steps the way the toon ramp quantises light, so
 * the floor reads as painted patches with edges rather than as blurred smears.
 * The core step is the darkest because compacted earth is.
 *
 * The spread between them and the spread between EARTH and EARTH_DRY are one
 * decision, and it is a readability decision rather than a realism one. On the
 * phone the pen is 20 m of floor across a 1170 px frame: a ten percent gain step
 * and a twenty-unit tone gap put the whole worn area inside four values, and
 * four values across that much screen is a grey slab whatever noise is under it.
 */
export const PLATEAU_DRY = 0.97;
export const PLATEAU_MID = 1;
export const PLATEAU_CORE = 1.01;

/**
 * The cart ruts: two parallel lines a metre and a half apart running out of the
 * gate mouth and up the pen, with a slow wander so they are not drawn with a
 * ruler. This is the one confident, authored mark on the floor - everything else
 * is a field - and it is what makes the pen read as ground somebody uses rather
 * than as noise inside a rectangle.
 */
export const RUT_GAUGE = 0.78;
export const RUT_HALF = 0.13;
export const RUT_EDGE = 0.09;
export const RUT_WANDER = 0.9;
export const RUT_WANDER_SCALE = 0.05;
export const RUT_FADE = 26;
export const RUT_STRENGTH = 0.7;

/**
 * Where the three tiers cut, and how hard. The cut is a tenth of what it was:
 * every mark on this floor is meant to have a painterly EDGE, and a smoothstep
 * fourteen hundredths wide across smooth noise is the soft directionless smear a
 * critic correctly called a blur. Two hard lines through the same field give the
 * same shapes with a boundary you can point at.
 */
export const TIER_MID = 0.33;
export const TIER_CORE = 0.64;
export const TIER_EDGE = 0.022;

/**
 * Wear streaks: marks whose long axis follows the way animals walked, which is
 * out of the mouth and up the pen, so they run along +z.
 *
 * PARALLEL, NOT RADIAL, and that took three attempts to accept. Sampling noise
 * in polar coordinates about the mouth draws exactly what the arithmetic says -
 * every mark in the pen pointing at one pixel - and the result is a sunburst.
 * Domain-warping it turned the sunburst into a whirlpool. Shearing it by
 * `dx / dz` turned the whirlpool into brushed metal. Every one of those is the
 * same mistake: convergence built into the coordinate system, where no amount of
 * noise on top can undo it.
 *
 * Traffic through an 8 m gate into a 60 m pen is, to the eye, a set of tracks
 * running up the pen. That is two multiplies - fast across, slow along - and it
 * cannot curl, because there is nothing in it to curl around. The warp then
 * pushes each track sideways by a metre or two over an 18 m wavelength, which is
 * waviness rather than rotation.
 */
export const TRACK_ACROSS = 0.5;
export const TRACK_ALONG = 0.16;
export const WEAR_WARP = 1.6;
export const WEAR_WARP_SCALE = 0.055;

/**
 * How far the traffic reached, as a FAN rather than as a radius, and this is the
 * third and last attempt at it.
 *
 * A radius was the obvious reading of "worn out of the gate mouth" and it is a
 * trap. `length(dx, dz)` is one number that varies the same way in every
 * direction, so the moment the plateaus quantise it the floor grows concentric
 * rings centred on the gate. Wandering the radius by seven metres did not remove
 * them; it turned them into the sweeping arcs a critic correctly called a
 * fingerprint. There is no amount of noise that fixes a shape built into the
 * coordinate.
 *
 * A fan is two INDEPENDENT one-dimensional falloffs multiplied together: how far
 * up the pen this fragment is, and how far off the centre line, each with its
 * own noise at its own scale. The half-width grows with distance from the mouth,
 * so the worn ground spreads the way animals spread once they are through the
 * gate, and no contour of the product can close into a circle because the two
 * terms never agree on where their edges are.
 */
export const FAN_NEAR = 7;
export const FAN_FAR = 34;
export const FAN_ALONG_WANDER = 6;
export const FAN_ALONG_SCALE = 0.07;
/** Half-width at the mouth, metres, and how fast it opens up the pen. */
export const FAN_HALF = 5;
export const FAN_SPREAD = 0.42;
export const FAN_EDGE = 7;
export const FAN_ACROSS_WANDER = 4.5;
export const FAN_ACROSS_SCALE = 0.115;

/**
 * Mottle: the earth's own coarseness, at a scale that drifts so nothing tiles.
 *
 * THE DRIFT IS TAKEN ABOUT THE PEN'S OWN CENTRE, and that is where the sweeping
 * arcs across this floor were actually coming from. Multiplying a WORLD position
 * by a varying scale is a scaling about the world origin, and the pen sits 115 m
 * from it: a drift of 0.55 then swept the sample point 63 m along the line back
 * to (0, 0), so every contour of the mottle bent into an arc centred on the
 * middle of the field. The traffic pattern was blamed for those arcs twice and
 * rewritten twice; it was this multiply both times. Centred on the pen the same
 * drift moves the sample by at most 8 m, and an additive warp does the rest of
 * the work with no centre at all.
 */
export const MOTTLE = 0.42;
/** A coarse octave under it, at seven-metre patches. Without it the mottle is
 *  all one size and quantises into an even stipple; with it the floor breaks
 *  into a few large areas that one finer octave then scuffs.
 *
 *  BOTH SCALES ARE HALF WHAT THEY WERE. A metre-wide blotch on a 60 m floor is
 *  sixty blotches across the frame, and sixty quantised blotches is airbrushed
 *  camouflage however hard their edges are. Fifteen larger patches is a small
 *  number of confident marks, which is the brief. */
export const MOTTLE_COARSE = 0.15;
export const MOTTLE_DRIFT = 0.032;
export const MOTTLE_DRIFT_AMOUNT = 0.26;
export const MOTTLE_WARP = 6;
export const MOTTLE_WARP_SCALE = 0.041;
/**
 * Straw flecks, and the scale came down by more than half. At 3.2 cycles per
 * metre a fleck is 15 cm, which on the Classic frame is one pixel: the dry rim
 * came back sprinkled with white confetti rather than strewn with straw. At 1.3
 * a patch is 40 cm and reads as something lying on the ground.
 */
export const FLECK_SCALE = 1.3;
export const FLECK_STRENGTH = 0.3;

/** Pasture still showing between the tracks, at the quiet end of the marks. */
export const UNWORN = 0.2;

/**
 * The rim. `feather` is how far in from its own edge the floor gives up;
 * `erosion` is how far a noise boundary pushes that line either way, and it is
 * six times the feather on purpose, because a feathered straight line is still a
 * straight line. `tuft` is how far grass fingers reach in over the dirt.
 *
 * The feather is short now. A blurred boundary is exactly the soft edge this
 * floor was told to stop having, and the actual job - breaking the line so it
 * survives four metres of screen on a phone - is done by real geometry standing
 * across it (pen/boundaryDressing.ts) rather than by widening a gradient.
 */
export const FEATHER = 0.55;
export const EROSION = 5.2;
export const EROSION_SCALE = 0.42;
export const EROSION_FINE = 1.6;
/** A third octave, and the one the phone capture needed. At a 390 pt viewport
 *  the pen's east edge is four metres of screen: two octaves at 0.4 and 1.6
 *  cycles per metre both fall below one bump per pixel there, so the boundary
 *  that reads as broken on the desktop shot arrives as a ruled line. This one
 *  runs at 5 cycles per metre and puts the erosion back at pixel scale. */
export const EROSION_GRAIN = 5.2;
export const TUFT_REACH = 2.6;
export const TUFT_SCALE = 2.6;
/** A second, finer tuft field, so grass reaches in at two sizes rather than as
 *  one repeating lobe. */
export const TUFT_FINE = 6.4;
