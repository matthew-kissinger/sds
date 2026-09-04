// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Where the collie's markings are, as masks over anatomy coordinates.
 *
 * `positionGeometry` is undeformed dog-local everywhere on this mesh
 * (dogGeometry.ts builds every part in place, with no per-part group transform),
 * so "the blaze is the
 * wedge above y 1.20 between z 0.80 and z 1.40" is a statement the shader can
 * evaluate directly. Three things follow: the marks cannot z-fight the coat,
 * their edges are authored rather than unwrapped, and moving a mark is a number
 * rather than a re-export.
 *
 * THE BLAZE IS THE MARK. That is the hierarchy, and it is an inversion of the
 * previous pass. At the Classic camera the dog is a 45 px dash on olive grass and
 * the player has to find it in under a second AND know which way it faces
 * (spec/05). The old set led with a full white collar ring, which is a bright
 * band across the middle of the animal and says nothing about direction, and gave
 * the blaze 3.6 cm of stripe that vanished by 20 m. So:
 *
 *   blaze     0.64 m of white wedge from the nape to the nose, 0.18 m across
 *             between the ears narrowing to 0.06 m at the muzzle. A quarter of
 *             the animal's length, and an arrowhead pointing where it is going.
 *             It is confined to the TOP of the skull and muzzle (y above 1.20),
 *             which is what stops it joining the bib into one cream plastron.
 *   collar    a dimmed 0.10 m ring at the base of the neck, laid in at half
 *             strength so it reads as a smoky off-white rather than as a second
 *             beacon. There is 0.20 m of dark neck between it and the blaze, so
 *             from above the pair read as two marks with a gap: mark, gap, arrow.
 *   bib       throat and forechest, stopping at z 1.05, well behind the jaw.
 *   socks     four white feet, cut at the knuckles. The leg above stays dark,
 *             which is what stops four legs merging into one skirt from above.
 *   tail tip  white on the last 13 cm of the plume. Blaze forward, tip aft.
 *
 * NO WHITE CROSSES THE SPINE between the withers and the tail set.
 *
 * EDGES ARE AUTHORED, NOT FEATHERED. Every boundary is a 1.5 to 2.5 cm
 * smoothstep - one or two pixels at hero magnification - displaced by two octaves
 * of noise summing to about 5 cm of wander on a 2.40 m animal. The previous pass
 * ran 14 cm of wander through 10 cm smoothsteps and every mark on the dog read as
 * a specular blowout rather than as a patch of fur. The face marks take no wander
 * at all: an eye is a feature, and a wandering pupil reads as a bug.
 *
 * THE FACE IS FIVE MASKS, and they exist for hero magnification: a dark almond
 * rim, an amber iris inside it, a soft catch light, a small nose button and a lip
 * line along the jaw.
 */

import {
  abs,
  clamp,
  float,
  length,
  max as tslMax,
  min as tslMin,
  mix,
  positionGeometry,
  smoothstep,
  step,
  vec2,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';

// --- the eye, in metres ------------------------------------------------------

/** Centre of the eye: placed on the front-outer temple of the skull at the brow.
 *  Mirrored by `abs(x)`, so one set of numbers gives two eyes. */
const EYE_X = 0.138;
const EYE_Y = 1.332;
const EYE_Z = 1.172;
/** How much the eye is squashed vertically into an alert almond. 1.35 forms an expressive almond without compressing into a slit. */
const EYE_SQUASH = 1.35;
/**
 * The outer dark eyeliner rim framing the eye.
 */
const EYE_INNER = 0.04;
const EYE_OUTER = 0.054;
/** The amber iris fills the middle of the eye, contrasting against the dark rim. */
const IRIS_INNER = 0.024;
const IRIS_OUTER = 0.038;
/** Central dark pupil inside the iris giving the dog depth and focal gaze. */
const PUPIL_INNER = 0.01;
const PUPIL_OUTER = 0.018;
/**
 * The catch light: a bright specular glint in the upper-forward eye quadrant.
 */
const CATCH_X = 0.134;
const CATCH_Y = 1.346;
const CATCH_Z = 1.182;
const CATCH_INNER = 0.004;
const CATCH_OUTER = 0.014;
const CATCH_STRENGTH = 0.9;

/**
 * How much of the white the collar is allowed to be. Working collies have a
 * proud, bright white neck ring.
 */
const COLLAR_STRENGTH = 0.88;

/** One white mark set, plus the dark face features, as 0..1 masks. */
export interface DogMarks {
  /** The five white marks, unioned. */
  readonly cream: TSLNode;
  /** Eye rim, nose leather and lip line, unioned. */
  readonly dark: TSLNode;
  /** The amber iris, laid inside the dark rim. */
  readonly iris: TSLNode;
  /** The central dark pupil, laid inside the iris. */
  readonly pupil: TSLNode;
  /** The catch light. Laid last, so it is always the top of the eye. */
  readonly glint: TSLNode;
}

/**
 * The belly-to-throat line the SPINE table actually draws, as a function of z.
 * The brisket is at y 0.64 but the underside of the neck has climbed to 1.02 by
 * the time it reaches the nape, so a flat cutoff either misses the throat or
 * climbs onto the shoulder. This traces the real line to within 2 cm over its
 * whole run, and the bib is the band of surface above it.
 */
function undersideAt(pz: TSLNode): TSLNode {
  return float(0.64).add(smoothstep(float(0.25), float(1.0), pz).mul(float(0.44)));
}

/** The five white marks, as one 0..1 mask. */
function creamMask(wander: TSLNode): TSLNode {
  const py = positionGeometry.y.add(wander);
  const pz = positionGeometry.z.add(wander);
  const px = abs(positionGeometry.x);

  // The blaze. Runs smoothly from between the ears down the forehead and bridge
  // of the muzzle, tapering gracefully toward the nose leather.
  const blazeHalf = float(0.088).sub(smoothstep(float(0.85), float(1.4), pz).mul(float(0.052)));
  const blazeEdge = tslMax(blazeHalf.add(wander.mul(float(0.18))), float(0.024));
  const blazeDorsal = smoothstep(float(1.18), float(1.23), py);
  const blaze = float(1)
    .sub(smoothstep(blazeEdge, blazeEdge.add(float(0.016)), px))
    .mul(smoothstep(float(0.78), float(0.83), pz))
    .mul(float(1).sub(smoothstep(float(1.41), float(1.44), pz)))
    .mul(blazeDorsal);

  // The collar: a crisp, handsome white ring wrapping the base of the neck.
  const pzRing = positionGeometry.z.add(wander.mul(float(0.2)));
  const collar = smoothstep(float(0.46), float(0.51), pzRing)
    .mul(float(1).sub(smoothstep(float(0.61), float(0.66), pzRing)))
    .mul(float(COLLAR_STRENGTH));

  // Throat and forechest: a lush, elegant white chest ruff filling the forechest down
  // to the brisket, joining naturally with the neck collar.
  const cutoff = undersideAt(pz).add(float(0.2));
  const bib = smoothstep(float(0.32), float(0.42), pz)
    .mul(float(1).sub(smoothstep(float(0.92), float(0.98), pz)))
    .mul(float(1).sub(smoothstep(float(0.1), float(0.22), px)))
    .mul(float(1).sub(smoothstep(cutoff.sub(float(0.03)), cutoff.add(float(0.03)), py)));

  // Socks: white stockings rising past the pasterns on forelegs and hocks on hindlegs.
  const pySock = positionGeometry.y.add(wander.mul(float(0.25)));
  const sockHeight = mix(float(0.16), float(0.24), step(float(0), positionGeometry.z));
  const socks = float(1).sub(smoothstep(sockHeight.sub(float(0.025)), sockHeight.add(float(0.025)), pySock));

  // The tail tip: the last 14 cm of the plume.
  const pzTail = positionGeometry.z.add(wander.mul(float(0.35)));
  const tailTip = float(1).sub(smoothstep(float(-1.48), float(-1.43), pzTail));

  return clamp(blaze.add(collar).add(bib).add(socks).add(tailTip), float(0), float(1));
}

/** Distance to the eye centre, squashed into the almond the eye actually is. */
function eyeDistance(): TSLNode {
  return length(
    vec3(
      abs(positionGeometry.x).sub(float(EYE_X)),
      positionGeometry.y.sub(float(EYE_Y)).mul(float(EYE_SQUASH)),
      positionGeometry.z.sub(float(EYE_Z)),
    ),
  );
}

/** Eye rim, nose leather and lip line. No wander: these are features. */
function darkMask(): TSLNode {
  const x = abs(positionGeometry.x);
  const y = positionGeometry.y;
  const z = positionGeometry.z;

  const eye = float(1).sub(smoothstep(float(EYE_INNER), float(EYE_OUTER), eyeDistance()));

  // Nose leather: rounded anatomical pad capping the front of the muzzle and snout tip.
  // Replaces the narrow streak with full-width rounded coverage wrapping the front cap.
  const nx = x.div(float(0.080));
  const ny = y.sub(float(1.221)).div(float(0.072));
  const noseRadial = length(vec2(nx, ny));
  const noseZ = smoothstep(float(1.425), float(1.455), z);
  const noseRounded = float(1).sub(smoothstep(float(0.85), float(1.10), noseRadial)).mul(noseZ);

  // Front cap: ensures the entire forward-most tip (z >= 1.46) across the nose plane is dark leather
  const noseCap = smoothstep(float(1.458), float(1.478), z)
    .mul(float(1).sub(smoothstep(float(0.068), float(0.088), x)))
    .mul(smoothstep(float(1.145), float(1.175), y));

  const nose = clamp(tslMax(noseRounded, noseCap), float(0), float(1));

  // The lip line: a value break along the jaw, from under the eye to the corner
  // of the mouth and merging with the nose pad.
  const lip = float(1)
    .sub(smoothstep(float(0.005), float(0.016), abs(y.sub(float(1.168)))))
    .mul(smoothstep(float(1.24), float(1.29), z))
    .mul(float(1).sub(smoothstep(float(1.43), float(1.46), z)))
    .mul(float(0.38));

  return clamp(eye.add(nose).add(lip), float(0), float(1));
}

/** The amber iris, inside the dark rim. */
function irisMask(): TSLNode {
  return float(1).sub(smoothstep(float(IRIS_INNER), float(IRIS_OUTER), eyeDistance()));
}

/** The deep dark central pupil inside the amber iris. */
function pupilMask(): TSLNode {
  return float(1).sub(smoothstep(float(PUPIL_INNER), float(PUPIL_OUTER), eyeDistance()));
}

/** The catch light, on its own so it can be laid over the iris last. */
function catchMask(): TSLNode {
  const d = length(
    vec3(
      abs(positionGeometry.x).sub(float(CATCH_X)),
      positionGeometry.y.sub(float(CATCH_Y)),
      positionGeometry.z.sub(float(CATCH_Z)),
    ),
  );
  return float(1)
    .sub(smoothstep(float(CATCH_INNER), float(CATCH_OUTER), d))
    .mul(float(CATCH_STRENGTH));
}

/** Build every mask the coat needs, from one shared edge-wander field. */
export function buildDogMarks(wander: TSLNode): DogMarks {
  const dark = darkMask();
  const iris = tslMin(irisMask(), dark);
  const pupil = tslMin(pupilMask(), iris);
  return {
    cream: creamMask(wander),
    dark,
    iris,
    pupil,
    glint: catchMask(),
  };
}

/** The tones one band hands to `applyMarks`. */
export interface MarkTones {
  readonly cream: TSLNode;
  readonly faceDark: TSLNode;
  readonly iris: TSLNode;
  readonly catchLight: TSLNode;
}

/** Fold one mark set into a band colour: coat, then white, then the face with pupil and glint. */
export function applyMarks(marks: DogMarks, coat: TSLNode, tones: MarkTones): TSLNode {
  const withWhite = mix(coat, tones.cream, marks.cream);
  const withRim = mix(withWhite, tones.faceDark, marks.dark);
  const withIris = mix(withRim, tones.iris, marks.iris);
  const withPupil = mix(withIris, tones.faceDark, marks.pupil);
  return mix(withPupil, tones.catchLight, marks.glint);
}
