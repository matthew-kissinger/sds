// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * One fallen log: colour, banding and placement. The barrel, the splinter
 * crowns, the raked branch stub and the contour shell are in
 * scatter/logGeometry.ts and scatter/logProfile.ts.
 *
 * IT IS THE OAK'S OWN WOOD, WEATHERED. The note that set this pass was that a
 * viewer must not be able to tell the log and the hero oak came from different
 * authors, and the log before it was a maroon at hue 10 that read as cured meat.
 * These tones are the treeline's bark (scene/treeline/foliage.ts BARK_LIT
 * #8f6c46, BARK_BODY #6d4f33, BARK_SHADOW #553a25) pulled 38 per cent of the way
 * to their own grey and lifted six points in value. Same hue family - 30 degrees
 * against the oak's 31 - at three fifths of its chroma. That is what dead wood
 * does: it greys and it pales, it does not redden.
 *
 * THE BANDS WRAP THE RADIUS, NOT THE LENGTH. The pass before this laid four
 * bark seams along fixed angles around the barrel, which on a surface of
 * revolution is four straight lines running the whole six metres, and the
 * capture read them as the grain of a painted plank. They are gone. What is left
 * is three quantised bands with a soft terminator that follow the barrel's own
 * curve from every bearing: a lit crown along the top third, a mid flank across
 * the middle, and a cool saturated underside where the timber turns away from
 * the sky. `normalLocal.y` is the sine of the angle around the trunk, because
 * the facets are radial, so the boundaries are a property of the log rather than
 * of where the camera or the sun happens to be.
 *
 * THE BUTT CUT CARRIES REAL GROWTH RINGS. Four concentric QUANTISED bands, a
 * darker heartwood core, a pale sapwood outer ring, and two radial checks
 * running from centre to bark. No airbrush anywhere on the asset: the rings are
 * flat steps, like every other surface in this scene.
 *
 * NO LICHEN. On stone a crust reads as lichen; on timber it reads as mildew.
 *
 * IT LIES IN THE GROUND, NOT ON IT. The pitch comes from `groundY` sampled at
 * both ends, so the log follows the slope it is on, and it is sunk far enough
 * that the barrel's own wobble decides where the timber meets the grass.
 */

import * as THREE from 'three/webgpu';
import {
  abs,
  clamp,
  float,
  floor,
  fract,
  mix,
  normalLocal,
  smoothstep,
  step,
  uv,
  type TSLNode,
} from '@app/tsl/nodes';
import { makeBandedMaterial, type BandTargets } from './bandedMaterial';
import { buildLogGeometry } from './logGeometry';
import { OUTLINE_COLOR, negativeMask } from './outline';
import type { LogTransform } from './placement';

/**
 * Weathered driftwood, per band. palette candidate: promote in cohesion pass.
 * These are TARGETS - bandedMaterial.ts divides the ramp's own gain back out.
 *
 *   lit     #a3907b   hue 30   chroma 24%   renders near luminance 0.57
 *   mid     #8e7c69   hue 30   chroma 26%   near 0.49
 *   shadow  #7a6858   hue 30   chroma 28%   near 0.42
 *
 * THE WHOLE LADDER CAME UP TWELVE POINTS, because the last one photographed as a
 * near-silhouette. Sampled off the Follow frame, the pasture the log lies in
 * renders 0.74 lit and 0.55 shaded while the trunk's camera-facing flank came
 * back at 0.34: a dark bar laid across a bright field, which is a shape and not a
 * surface. Both gameplay rigs look up-field INTO an eight-degree key, so almost
 * the whole visible barrel sits in the shadow band, and the only way that band
 * carries any modelling is to author it near the field's own shaded value.
 * Chroma came down at the same time - 29 per cent to 24 in the key - which is the
 * "greyed toward driftwood" half of the note. The hue does not move: 30 against
 * the hero oak's 31, so the log still reads as a limb off that tree.
 *
 * Chroma still rises as value falls, which is spec/05's saturated-shadow rule,
 * and it rises WITHOUT rotating the hue away from the oak. A ten-degree rotation
 * into plum was tried on an earlier pass and the capture came back with a
 * wine-coloured barrel.
 */
const BARK: BandTargets = { shadow: '#7a6858', mid: '#8e7c69', lit: '#a3907b' };

/**
 * The underside, and the only cool thing on the log. A slate-olive at hue 100
 * and 10 per cent chroma, reached only where a facet's normal points well below
 * the horizon: the grass under a trunk bounces green, and the sky reaches the
 * gap between them, so the darkest band on the piece is the one place it is
 * honest to go cool.
 */
const UNDERSIDE: BandTargets = { shadow: '#5d6058', mid: '#5d6058', lit: '#6a6e64' };

/**
 * The exposed sapwood on a break or a cut.
 *
 * IT CAME DOWN A LONG WAY, and that is a value correction rather than a taste
 * one. The last set rendered near luminance 0.86, which is BRIGHTER than the
 * flock's wool at 0.76: the pale end of the log was the brightest thing on the
 * ground plane, and the dressing's one job is to sit under the herd. These land
 * at 0.70, 0.61 and 0.51 - clear of pasture at 0.46 to 0.60, clear under wool.
 */
const HEARTWOOD: BandTargets = { shadow: '#8f8368', mid: '#ab9d7d', lit: '#bfb190' };

/**
 * The angular ladder: what the crown, the flank and the underside multiply their
 * band by, and where the boundaries sit on `normalLocal.y`.
 *
 * THE BOUNDARIES ARE PLACED INSIDE THE VISIBLE ARC. `normalLocal.y` is +1 at the
 * crown and -1 at the underside. A gameplay camera stands about ten degrees
 * above a log eighteen metres out, so the arc it can see runs from roughly +0.98
 * at the skyline down to -0.4 where the timber meets the grass. Both boundaries
 * land inside that window, and both windows are WIDE - 0.26 and 0.35 of the
 * sine - which is the soft terminator the note asked for rather than a cel step
 * on a facet edge.
 *
 * The crown lift and the underside drop are deliberately unequal. A log lying in
 * a meadow has sky above it and grass below, so the top gains more than the
 * bottom loses; matching them would give a barrel with a painted-on gradient
 * rather than one lit from above.
 */
const CROWN_TONE = 1.12;
const FLANK_TONE = 0.93;
const UNDER_TONE = 0.83;
const FLANK_EDGE = [-0.1, 0.16] as const;
const CROWN_EDGE = [0.45, 0.8] as const;
/**
 * Where a facet stops being a flank and becomes the underside proper, which is
 * the only place the cool band is allowed.
 *
 * THE WINDOW WIDENED BECAUSE OF THE BRANCH STUB. On the barrel this rule is
 * unambiguous: a trunk lying along the ground has facets that point at the sky
 * and facets that point at the grass, and nothing in between matters. The stub
 * breaks that assumption. It leaves the barrel 32 degrees off vertical, so the
 * flank facing the camera carries a normal about 0.53 BELOW the horizon - well
 * inside the old window - and the capture came back with the one silhouette
 * detail that says "this limb snapped off" rendered as a flat black cutout. The
 * old edges were authored for a horizontal tube and applied to a raked one.
 * Starting the window at -0.78 keeps the trunk's true underside fully cool while
 * leaving a 32 degree limb reading as lit timber.
 */
const UNDER_EDGE = [-0.78, -0.32] as const;

/**
 * The growth rings on the sawn butt: how many concentric bands, how much darker
 * the heartwood core runs than the sapwood rim, the value step between adjacent
 * bands, and the two radial checks.
 *
 * Four bands, quantised with `floor`, so the end of the log is flat-banded like
 * every other surface in the scene. The core is a third of the way to full
 * sapwood and the rim is all of it, which puts a dark heart inside a pale ring
 * without either of them being a gradient.
 */
const RING_COUNT = 4;
const RING_CORE_HEART = 0.3;
const RING_STEP = 0.085;
const CHECKS = [0.13, 0.62] as const;
const CHECK_WIDTH = 0.018;
const CHECK_DEPTH = 0.4;

/** Metres the log is sunk below the ground line at its ends. */
const SINK = 0.11;

/** The three-step ladder around the barrel, as one value multiplier. */
function angularTone(): TSLNode {
  const around = normalLocal.y;
  const outOfUnder = smoothstep(float(FLANK_EDGE[0]), float(FLANK_EDGE[1]), around);
  const intoCrown = smoothstep(float(CROWN_EDGE[0]), float(CROWN_EDGE[1]), around);
  return mix(
    mix(float(UNDER_TONE), float(FLANK_TONE), outOfUnder),
    float(CROWN_TONE),
    intoCrown,
  );
}

/** The sawn face: which quantised ring a fragment is in, 0 at the heart and 1 at
 *  the bark. */
function ringIndex(disc: TSLNode): TSLNode {
  const radius = clamp(disc, float(0), float(0.999));
  return floor(radius.mul(float(RING_COUNT)));
}

/** The value ripple across the rings, plus the radial checks. */
function ringTone(index: TSLNode, turn: TSLNode): TSLNode {
  // Every other ring a step darker: two quantised values inside a quantised
  // ladder, which is what a cut end of timber actually looks like.
  const alternate = fract(index.mul(float(0.5))).mul(float(2));
  let tone = mix(float(1 - RING_STEP), float(1 + RING_STEP), alternate);
  for (const at of CHECKS) {
    // Wrapped distance around the face, so a check is one line and not two.
    const gap = abs(fract(turn.sub(float(at)).add(float(0.5))).sub(float(0.5)));
    tone = tone.mul(
      float(1).sub(float(CHECK_DEPTH).mul(float(1).sub(smoothstep(float(0), float(CHECK_WIDTH), gap)))),
    );
  }
  return tone;
}

/**
 * The log, placed. Returns null if a later change to HOME_FIELD ever slides the
 * herding corridor under the authored position: dropping the prop is the right
 * answer there, and a silent floating log in the lane is not.
 */
export function buildLogMesh(transform: LogTransform | null): THREE.Mesh | null {
  if (transform === null) return null;

  const disc: TSLNode = uv(1).x;
  const turn: TSLNode = uv(1).y;
  // -1 everywhere except a sawn face, so one `step` gates the whole ring
  // treatment off the barrel, the splinters and the contour hull at once.
  const onCut = step(float(0), disc);
  const index = ringIndex(disc);
  // Pale sapwood at the rim, darker heartwood at the core, in RING_COUNT steps.
  const cutHeart = mix(
    float(RING_CORE_HEART),
    float(1),
    index.div(float(Math.max(RING_COUNT - 1, 1))),
  );
  const heart = mix(uv().y, cutHeart, onCut);
  const underside = float(1).sub(
    smoothstep(float(UNDER_EDGE[0]), float(UNDER_EDGE[1]), normalLocal.y),
  );
  // The ladder is a bark feature. Held off a sawn face, which takes the rings
  // instead, so the cut keeps its own value whichever way the log lies.
  const tone = mix(angularTone(), ringTone(index, turn), onCut);

  const material = makeBandedMaterial({
    surface: BARK,
    inlays: [
      { targets: UNDERSIDE, mask: underside },
      { targets: HEARTWOOD, mask: heart },
    ],
    // Coarse and gentle. The decided bands are the picture now; grain is only
    // there to keep two facets in the same band from being one dead flat tone.
    grainScale: 5.5,
    grainAmount: 0.055,
    mottle: { scale: 1.7, amount: 0.04, steps: 3 },
    tone,
    outline: { color: OUTLINE_COLOR, mask: negativeMask() },
  });

  const mesh = new THREE.Mesh(buildLogGeometry(), material);
  // Local +x is the log's length; three's yaw about Y sends it to (cos, -sin).
  mesh.position.set(transform.x, transform.y - SINK, transform.z);
  mesh.rotation.set(0, transform.yaw, 0);
  // Pitch about the log's own local +z, which after the yaw runs across it, so
  // the barrel follows the slope between its ends instead of cutting into it.
  mesh.rotateZ(transform.pitch);
  return mesh;
}
