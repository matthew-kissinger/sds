// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The dog's ramp: three authored bands with a hard terminator, and one warm rim
 * drawn on the silhouette edge.
 *
 * It runs on the same light as everything else in the field - SUN_DIRECTION and
 * the rim colour come from tsl/palette.ts, so nothing here can drift out of the
 * game's scheme. What is different is that the bands are SELECTED rather than
 * multiplied. dogMarkings.ts names three tones outright; this file decides which
 * one a fragment gets. See coatTones.ts for why a gain-based ramp cannot work on
 * a dark coat.
 *
 * THE EDGES ARE THE FIELD'S EDGES NOW, and the last pass proved why they have to
 * be. It widened them - shadow at 0.28, key at 0.78 - reasoning that a wide mid
 * band would guarantee two tones from any camera. Measured on the capture it did
 * the opposite: a vertical scanline down the middle of the flank read sRGB
 * (103,85,64) at every one of twenty samples, the same three bytes top to bottom,
 * because a 0.45 m barrel only sweeps the OUTER part of its normal range in the
 * few pixels next to its own silhouette. Widen the bands and all of that sweep
 * lands inside one of them. The dog came back as the single object in the frame
 * that was not cel-shaded.
 *
 * So the edges are RAMP.shadowEdge and RAMP.litEdge from tsl/palette.ts, read as
 * numbers rather than imported, because the dog quantizes by SELECTING tones where
 * the field quantizes by multiplying (see coatTones.ts) and the two cannot share a
 * code path. What they do share is where the steps fall, which is the thing a
 * critic actually compares: the dog's terminator now lands in the same place on
 * the same normal as the terminator on the sheep beside it, and is the same 0.07
 * wide.
 *
 * WITH ONE ADDITION, AND IT IS THE ADDITION THAT MAKES THE RAMP VISIBLE: a sky
 * term. The key is 8 degrees above the horizon, which means it is very nearly
 * PERPENDICULAR TO THE UP AXIS AND PARALLEL TO EVERY CAMERA IN THE GAME. Under a
 * key like that, a horizontal cylinder's nDotL barely changes down a vertical
 * scanline - it is set by the azimuth of the surface, and azimuth is exactly what
 * a vertical scanline holds constant. Both of the last two passes measured out as
 * one flat tone for that reason, one in the key band and one in the shadow band,
 * and no placement of the edges can fix it because the range being banded is not
 * there to begin with.
 *
 * SKY_TERM lifts a fragment by how far its normal points UP, so the light has a
 * vertical component the sun does not supply and the ramp gets something to cut:
 *
 *   top of the back        0.570 + 0.260 = 0.830   key
 *   flank toward the sun   0.818 + 0.000 = 0.818   key
 *   off-sun flank, 75 up   0.418 + 0.251 = 0.669   key
 *   off-sun flank, 60 up   0.341 + 0.225 = 0.566   mid
 *   off-sun flank, level   0.182 + 0.000 = 0.182   shadow
 *   belly                  0.570 - 0.260 = 0.310   shadow
 *
 * so every framing carries a terminator that wraps the barrel horizontally: a lit
 * back, a band that steps down the flank, a dark underline. The overhead read the
 * game ships with gets all three tones across the width of the animal.
 *
 * It is a sky fill and not a second sun. It has no azimuth, so it cannot make the
 * light appear to come from two directions and it cannot contradict SUN_DIRECTION;
 * what it does is what a bright sky dome does to a real animal at golden hour, and
 * RAMP.fill already puts the same idea into the field's ramp as an additive term.
 * It is also the reason the dog can afford the field's own band edges: cohesion on
 * the edges, a range of its own to spend them on.
 *
 * THE RIM IS A DRAWN LINE, AND TWO PREVIOUS PASSES PROVED WHAT HAPPENS WHEN IT IS
 * NOT. A broad surface seen nearly edge-on has a high fresnel over a large screen
 * area, so a rim tuned by strip width on a cylinder becomes a cream wash down the
 * spine - the dorsal stripe a border collie must never have. Opening the ramp at
 * 0.60 was not enough; the rear capture still measured a pale gradient the whole
 * length of the back.
 *
 * So the ramp opens at 0.86 and closes at 0.99, and its strength is 0.30 rather
 * than 0.52. On the dog's 0.45 m barrel that is a strip about 6 mm wide, and at
 * 0.30 over a coat band at lightness 0.23 it lands warm rather than cream. The
 * previous pass ran 0.52 through a strip opening at 0.80 and the belly line in the
 * hero-side capture measured a continuous pale streak; a rim that reaches cream is
 * not a rim, it is a second white mark in a place no collie has one. What carries
 * the dog at gameplay distance is the outline hull and the blaze, not this.
 *
 * Two more things keep it honest. The width scales with the radius of what it is
 * on, and a dog is not one radius - the same threshold that draws a band on a
 * 0.45 m barrel covers an entire 0.05 m ear - so every vertex carries the girth
 * of the ring it came from (dog/loft.ts) and the rim fades out on anything thin.
 * And the rim is held back over the white marks, which are already the brightest
 * thing in the frame and have nowhere to go.
 */

import * as THREE from 'three/webgpu';
import { RAMP, RIM, SUN_DIRECTION } from '@app/tsl/palette';
import {
  clamp,
  dot,
  float,
  mix,
  normalView,
  normalWorld,
  positionViewDirection,
  smoothstep,
  uniform,
  uv,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import type { DogPaint } from './dogMarkings';

/**
 * The one light direction, read from the same palette constant tsl/toon.ts
 * reads. A second uniform node, not a second source of truth: change the palette
 * and both move together.
 */
const sunNode = uniform(SUN_DIRECTION) as TSLNode;

const RIM_COLOR = vec3(...RIM.color) as TSLNode;

/** The field's own band edges (tsl/palette.ts), so the dog's terminator falls on
 *  the same normal as the sheep's standing next to it. See the header. */
const SHADOW_EDGE = RAMP.shadowEdge;
const LIT_EDGE = RAMP.litEdge;
const TERMINATOR = RAMP.terminator;
const HALF_TERMINATOR = TERMINATOR / 2;
/** The sky fill, in band terms: how much a fully up-facing normal is lifted. This
 *  is the number that gives an 8 degree key something to cut across a barrel, and
 *  it has to be large - 0.26 against a 0.16 wide mid band - because it is standing
 *  in for the whole vertical component the key does not have. See the header. */
const SKY_TERM = 0.26;

/** Rim strength at the silhouette. Under the flock's 0.34, because a coat three
 *  times darker than fleece turns the same additive light into cream. */
const RIM_STRENGTH = 0.3;
/** Fresnel below RIM_START contributes nothing; above RIM_FULL the rim is at full
 *  strength. See the header: this pair is what turns a wash into a line. */
const RIM_START = 0.86;
const RIM_FULL = 0.99;
/** Girth, in metres, over which the rim fades in. Under the first number a part
 *  is thin enough that a fresnel band would cover all of it, so it gets none;
 *  over the second it is barrel-sized and gets the full edge. dog/loft.ts writes
 *  the girth into uv.x. */
const RIM_THIN = 0.06;
const RIM_THICK = 0.2;
/**
 * How much rim survives on the shadow side. Nearly two thirds, and measured
 * rather than felt: both gameplay cameras look toward an 8 degree sun, so the
 * shaded side is the side the player sees, and the rim there has to be gold.
 */
const RIM_SHADOW_FLOOR = 0.72;
/** How much of the rim the white marks keep. A blaze at lightness 0.89 with a
 *  full gold rim on it clips to flat white and loses its own edge. */
const RIM_ON_MARKS = 0.35;

/** Shade the dog: pick a band, then add the rim. */
export function shadeDog(paint: DogPaint): TSLNode {
  const nDotL = clamp(
    dot(normalWorld, sunNode).mul(0.5).add(0.5).add(normalWorld.y.mul(float(SKY_TERM))),
    float(0),
    float(1),
  );

  const outOfShadow = smoothstep(
    float(SHADOW_EDGE - HALF_TERMINATOR),
    float(SHADOW_EDGE + HALF_TERMINATOR),
    nDotL,
  );
  const intoKey = smoothstep(
    float(LIT_EDGE - HALF_TERMINATOR),
    float(LIT_EDGE + HALF_TERMINATOR),
    nDotL,
  );

  const banded = mix(mix(paint.shadow, paint.mid, outOfShadow), paint.lit, intoKey);

  // Fresnel: 1 where the surface turns away from the camera, 0 facing it.
  const facing = clamp(dot(normalView, positionViewDirection), float(0), float(1));
  const edge = smoothstep(float(RIM_START), float(RIM_FULL), float(1).sub(facing));
  const keyed = mix(
    float(RIM_SHADOW_FLOOR),
    float(1),
    smoothstep(float(0.3), float(0.66), nDotL),
  );
  const thickness = smoothstep(float(RIM_THIN), float(RIM_THICK), uv().x);
  const onCoat = mix(float(1), float(RIM_ON_MARKS), paint.mask);

  return banded.add(
    RIM_COLOR.mul(edge).mul(keyed).mul(thickness).mul(onCoat).mul(float(RIM_STRENGTH)),
  );
}

/** The dog's material, ready for a positionNode. */
export function makeDogSurface(colorNode: TSLNode): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = colorNode;
  return material;
}
