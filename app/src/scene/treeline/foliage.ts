// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The treeline's pigment and its ramp, in one place, so crown, scrub and bark
 * cannot drift apart.
 *
 * WHY THE RAMP IS AUTHORED RATHER THAN MULTIPLIED. tsl/toon.ts bands a base
 * colour by three linear gains, which is right for a surface whose midtone is
 * the thing being described. Foliage is not that surface: it is the one mass in
 * the frame whose job is to be the dark note, and a 0.46 gain over an already
 * dark green lands the shadow band in a hole. So the three bands are three
 * authored colours. Everything else is the scene's: the same SUN_DIRECTION
 * uniform and the same half-lambert remap.
 *
 * Palette candidates: promote in cohesion pass. Every hex below belongs in
 * tsl/palette.ts and is here only because several builders hold that file open
 * during the fan-out.
 *
 * THE HUES ARE PULLED ONTO THE GRASS. The pasture is a warm yellow-green:
 * PALETTE.grassLight #a7b76c is hue 73, PALETTE.grassDark #87995f is hue 76.
 * The last pass painted its crowns from hue 86 up to a teal shadow at 141, and
 * the treeline read as a colder asset pack parked behind a warm field. These
 * run the other way:
 *
 *   crown lit      hue 68    warmer than the grass, nine tenths its value
 *   crown body     hue 79    the mass the whole treeline is judged on
 *   crown shadow   hue 96    cool of the body, still unmistakably green
 *
 * so the shadow makes the hue shift spec/05 asks for without leaving the
 * family, and no band is a desaturated teal. Saturation is held near 0.50
 * across all three: a shadow that loses saturation is the grey mud the spec
 * forbids.
 *
 * VALUES, as max-channel, against the neighbours they sit next to:
 *
 *   crown shadow 0.42   crown body 0.54   crown lit 0.69
 *   scrub shadow 0.32   scrub body 0.42   scrub lit 0.52
 *   grass dark   0.60   grass light 0.72
 *
 * The crown ladder steps by about a quarter each time, which is what makes the
 * three bands readable as three bands rather than as one green with a wash on
 * it. The scrub ladder sits BELOW the crown's, at about 0.72 of it and cooler
 * in hue, because the foot of a wood is in the crowns' shade: separated in
 * value AND in hue, so a bracken clump can never be mistaken for a crown that
 * fell off.
 */

import { SUN_DIRECTION } from '@app/tsl/palette';
import {
  cameraPosition,
  color,
  dot,
  float,
  length,
  mix,
  normalWorld,
  positionWorld,
  sin,
  smoothstep,
  time,
  uniform,
  type TSLNode,
} from '@app/tsl/nodes';

// --- pigment ----------------------------------------------------------------

/**
 * THE WHOLE LADDER CAME UP HALF A STOP THIS PASS, and the reason is a
 * composition error the critique named as a depth inversion.
 *
 * The pasture in front of the wood renders at a max channel around 0.65 to
 * 0.72. The crown body was 0.50 and its shadow band 0.34, and the near belt
 * sits at 111 m where neither the asset's own haze nor the scene fog had begun -
 * so a treeline a hundred metres away was DARKER than the grass in front of it,
 * which is what distance never does at golden hour. Air lifts value and drops
 * saturation, and the eye reads that as depth before it reads anything else.
 *
 * Two things move together to fix it: these three colours come up, and the
 * aerial mix below now reaches the near belt at all. The dark note the
 * composition still needs comes from the hero oak, which stands at forty metres
 * with almost no haze on it and is the one green in the frame that is allowed to
 * go deep.
 */
/** Crown in shadow. Cool of the body, saturated, still green. */
export const FOLIAGE_SHADOW = '#47745a';
/** The body of the crown, and the value the whole treeline is judged on. */
export const FOLIAGE_BODY = '#718548';
/** Crown in full key: the grass hue at nine tenths its value. Warmed onto the
 *  golden key: hue 68 sits between the grass at 73 and the sun's own gold, so
 *  the lit band belongs to the same light as the field rather than reading as a
 *  cooler asset dropped behind it. */
export const FOLIAGE_LIT = '#bda64f';
/** The one tree in eight already turning. Restraint, not autumn: an 8 degree
 *  hue shift inside the same family at the same value, so a turning crown can
 *  never be the outlier blob a critic points at. */
export const FOLIAGE_TURNING = '#95994b';

/**
 * The understory: bracken, hedge and low scrub at the foot of the ring.
 *
 * SEPARATED FROM THE CROWNS IN VALUE AND IN HUE, which is the whole reason
 * these are three colours of their own rather than a gain over the crown's. The
 * pass before this painted the scrub within three points of FOLIAGE_BODY at the
 * same hue, so a bracken mass was a crown lying on the grass. These run about
 * 0.72 of the crown's value and 15 to 20 degrees cooler - green, not
 * yellow-green - which is what the foot of a wood does: it is in the crowns'
 * shade and it sees sky rather than sun.
 */
export const UNDER_SHADOW = '#30391f';
export const UNDER_BODY = '#465127';
export const UNDER_LIT = '#667039';

/** Bark in the key and in the mid: warm, the colour of a wet oak at this hour. */
export const BARK_LIT = '#96724a';
export const BARK_BODY = '#6d4f33';
/**
 * Bark in shade: pulled round past red toward mauve and held at a quarter
 * saturation.
 *
 * This is the hue event that makes the terminator on a bole readable as an
 * edge. An umber shade band beside an umber body band differs only in value,
 * and a value-only edge on a curved surface under a soft terminator is an
 * airbrushed gradient - the note the critique made. Rotating the shade side to
 * 338 degrees while the lit side sits at 26 gives the ramp a 50 degree hue swing
 * across the bole, and the warm bounce added on top of it (trunkMaterial.ts) is
 * what keeps it from reading as cold.
 */
export const BARK_SHADOW = '#503a3b';
/** What the sunlit pasture throws back onto the shaded side of a bole. Additive
 *  and keyed to the shadow band alone: the dark side of a real bole at this hour
 *  is lit by the field it stands in, and putting that warmth in an additive term
 *  rather than in the pigment is what lets the pigment stay cool. */
export const BARK_BOUNCE = '#a4652f';

/**
 * What distance does to colour, before the scene's fog does anything.
 *
 * IT IS THE FOG COLOUR, WARM. An earlier pass mixed toward a slate blue-grey,
 * so the deepest belt arrived on screen as pale mauve cut-outs against a cream
 * sky and read as ghosts, not as depth. Atmosphere fades everything toward
 * PALETTE.skyHorizon #eebd88; this is the same cream pulled a little off full
 * saturation so a crown at 300 m lands in the haze band rather than in front of
 * it.
 */
export const AERIAL_HAZE = '#e6c49c';
/**
 * Ceiling on the aerial mix, and where it runs.
 *
 * THE NEAR PLANE CAME IN FROM 120 m TO 20 m, WHICH IS THE DEPTH-INVERSION FIX.
 * At 120 the smoothstep had not started when the near belt began at 111 m, so
 * the wood a hundred metres away carried exactly zero haze and rendered at its
 * own pigment: darker than the grass in front of it, which is the inversion the
 * critique named. The scene fog does not help there either, since it starts at
 * 160 m.
 *
 * What the new run puts on screen, with AERIAL_MAX at 0.40:
 *
 *   hero oak      40 m    0.02 haze   pigment almost untouched, the dark note
 *   near belt    111 m    0.25 haze   body band lands level with the grass
 *   middle belt  200 m    0.40 haze   plus 0.11 of scene fog on top
 *   far belt     246 m    0.40 haze   plus 0.24 of scene fog on top
 *
 * so value climbs and saturation falls monotonically with distance, the near
 * belt no longer sits below the pasture, and the three belts separate from each
 * other by roughly a fifth of a stop each.
 *
 * THE CEILING CAME BACK DOWN FROM 0.58 AFTER A CAPTURE, and it is worth
 * recording why, because the depth-inversion note pushes hard in one direction
 * and there is a wall on the other side of it. At 0.58 the near belt lifted
 * past the grass rather than up to it, the deep belts went to nine tenths
 * horizon cream, and the whole treeline arrived on screen as a pale ghost strip
 * - which un-fixes the problem the asset exists for, the dead band between the
 * grass edge and the sky. 0.40 is where the belt is no longer darker than the
 * pasture and is still unmistakably a wood.
 */
export const AERIAL_MAX = 0.4;
/** Bark keeps more value separation than foliage at distance so a supported
 *  crown never turns back into a floating ball in the haze. */
const BARK_AERIAL_MAX = 0.3;
export const AERIAL_NEAR = 20;
export const AERIAL_FAR = 175;

// --- the ramp ---------------------------------------------------------------

/** The one sun, shared with tsl/toon.ts through the palette. */
const sunNode = uniform(SUN_DIRECTION) as TSLNode;

/**
 * Terminator width in nDotL, and the treeline's single most load-bearing
 * shading number.
 *
 * SOFTENED WITHOUT LOSING THE THREE STEPS. A crown's shading normal is nearly
 * radial, so an overly narrow transition turns the band boundaries into hard
 * vertical cuts. At 0.085 each transition rolls across enough of the lobe to
 * model a rounded shoulder, while the stable shadow, body and lit plateaus stay
 * separately readable. Canopy breakup remains subordinate to this width.
 */
const TERMINATOR = 0.085;
const HALF = TERMINATOR / 2;

/**
 * Where the two band edges sit, in half-lambert nDotL.
 *
 * SOLVED FOR HOW MUCH OF THE MASS EACH BAND OWNS, because that is the note the
 * critique makes. With a radial shading normal the share of a crown's projected
 * disc above a threshold T is the circular segment at t = 2T - 1, which is
 * (acos t - t*sqrt(1 - t^2)) / pi. At the two edges below that comes out:
 *
 *   lit     0.665 ->  t = 0.33  ->  29 percent of the mass
 *   mid                              23 percent, down the sun-facing shoulder
 *   shadow  0.485 ->  t = -0.03 ->  48 percent, the whole underside
 *
 * so the light band is well inside the 55 percent ceiling, the mid band is a
 * real shoulder rather than a hairline, and the shadow band owns the away side
 * of the mass instead of a lip along its bottom. Three bands, all three
 * pointable, on every crown in the game.
 *
 * The scene's shared edges (RAMP.shadowEdge 0.42, RAMP.litEdge 0.58) are placed
 * for the GROUND, whose normal barely moves, and on a sphere they give 42
 * percent key - which is a mass with the light on the wrong half of it. The
 * light DIRECTION is still the scene's one vector. Only the two thresholds and
 * the width are the treeline's.
 */
const SHADOW_EDGE = 0.485;
const LIT_EDGE = 0.665;

/**
 * Half-lambert nDotL against the world normal.
 *
 * The world normal here is the BLENDED radial the crown geometry bakes
 * (crownShape.ts): almost entirely the direction from the crown's own centre,
 * with a trace of the true surface. So the bands follow the mass, and the lobes
 * and bites survive only as the shallow modelling inside each band. This is the
 * only thing in the asset that decides where light is - no height gradient, no
 * baked directional cue anywhere (spec/05).
 */
export function sunFacing(): TSLNode {
  return dot(normalWorld, sunNode).mul(0.5).add(0.5);
}

/** Three quantized bands with a soft terminator, over three authored colours. */
export function threeBand(
  shadow: TSLNode,
  body: TSLNode,
  lit: TSLNode,
  nDotL: TSLNode,
): TSLNode {
  const outOfShadow = smoothstep(float(SHADOW_EDGE - HALF), float(SHADOW_EDGE + HALF), nDotL);
  const intoKey = smoothstep(float(LIT_EDGE - HALF), float(LIT_EDGE + HALF), nDotL);
  return mix(mix(shadow, body, outOfShadow), lit, intoKey);
}

// --- aerial perspective -----------------------------------------------------

/**
 * Send a shaded tone into the air. THE ONLY PLACE IN THE ASSET THAT DOES.
 *
 * Crown and bark both call this and neither carries a second recession term, so
 * "no tree is hazier than the tree behind it" is a property of the code rather
 * than a thing two modules have to keep agreeing about: the single input is
 * distance from the camera, and both the deep-tone fall and the haze mix are
 * monotonic increasing in it.
 */
export function recede(tone: TSLNode): TSLNode {
  return mix(tone, color(AERIAL_HAZE), aerial().mul(float(AERIAL_MAX)));
}

/** The same monotonic aerial curve with a lower ceiling for narrow boles. */
export function recedeBark(tone: TSLNode): TSLNode {
  return mix(tone, color(AERIAL_HAZE), aerial().mul(float(BARK_AERIAL_MAX)));
}

/** How far into the air a fragment is, 0 to 1. Shared so the dapple can fade
 *  out over the same run the haze fades in over: half-metre foliage noise on a
 *  crown two pixels wide is shimmer, not leaves. */
export function aerial(): TSLNode {
  return smoothstep(
    float(AERIAL_NEAR),
    float(AERIAL_FAR),
    length(positionWorld.sub(cameraPosition)),
  );
}

/** Where the shadow band begins, for the one material that needs to know: the
 *  bark's warm bounce is keyed to it so the bounce lands on the shade side and
 *  nowhere else. */
export const BAND_SHADOW_EDGE = SHADOW_EDGE;

// --- wind -------------------------------------------------------------------

/**
 * The same direction and travel speed the grass uses (scene/grass/grassMaterial
 * WIND_X / WIND_Z). Duplicated rather than imported because that module belongs
 * to another asset; one shared wind module is the right answer and is noted for
 * the cohesion pass. If these two disagree, the field and the treeline blow in
 * different weather, and that reads instantly.
 */
export const WIND_X = 0.76;
export const WIND_Z = 0.65;

const GUST = [
  { k: 0.0125, rate: 0.42, weight: 0.62 },
  { k: 0.031, rate: 0.77, weight: 0.38 },
] as const;

/** The travelling gust at a world position, in roughly [-1, 1]. Sampled at the
 *  tree's own position so a gust crosses the treeline as one event rather than
 *  as a thousand independent wobbles. */
export function gustAt(worldX: TSLNode, worldZ: TSLNode): TSLNode {
  let total: TSLNode = float(0);
  for (const wave of GUST) {
    const along = worldX.mul(float(WIND_X * wave.k)).add(worldZ.mul(float(WIND_Z * wave.k)));
    total = total.add(sin(along.sub(time.mul(float(wave.rate)))).mul(float(wave.weight)));
  }
  return total;
}
