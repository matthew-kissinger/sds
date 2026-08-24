// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Where the collie's markings are, as masks over anatomy coordinates.
 *
 * `positionLocal` is dog-local everywhere on this mesh (dogGeometry.ts builds
 * every part in place, with no per-part group transform), so "the blaze is the
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
  positionLocal,
  smoothstep,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';

// --- the eye, in metres ------------------------------------------------------

/** Centre of the eye: on the front-outer quarter of the skull, just behind and
 *  above the stop. Mirrored by `abs(x)`, so one set of numbers gives two eyes. */
const EYE_X = 0.132;
const EYE_Y = 1.3;
const EYE_Z = 1.165;
/** How much the eye is squashed vertically. 1.8 turns a sphere into the almond a
 *  dog actually has; a round eye is a toy. */
const EYE_SQUASH = 1.8;
/**
 * The rim runs from 0.030 to 0.044 rather than 0.042 to 0.058. Measured on the
 * skull that is a 3.7 cm eye rather than a 5.0 cm one, on a head 0.55 m across.
 * The larger mark was reading from the front capture as a dark patch under the
 * brow rather than as an eye, and paired with the jowl seam it made a spectacle.
 */
const EYE_INNER = 0.03;
const EYE_OUTER = 0.044;
/** The iris fills the middle of the almond and leaves a dark rim around it. */
const IRIS_INNER = 0.014;
const IRIS_OUTER = 0.024;
/**
 * The catch light, up and forward of the iris - toward the 8 degree key, which
 * is where a catch light comes from. It sits ON the skull surface rather than
 * near it, and it is laid in at CATCH_STRENGTH rather than opaque, so at hero
 * magnification it is a soft light in a wet eye and at gameplay distance a 2 cm
 * mark at six tenths strength on a dark head disappears entirely.
 */
const CATCH_X = 0.13;
const CATCH_Y = 1.308;
const CATCH_Z = 1.175;
const CATCH_INNER = 0.005;
const CATCH_OUTER = 0.016;
const CATCH_STRENGTH = 0.6;

/**
 * How much of the white the collar is allowed to be. Three tenths, down from a
 * half: it is a supporting mark, and at half strength the overhead capture came
 * back with a bright band across the neck that out-read the blaze it is meant to
 * support. At three tenths it is a smoky lift in the coat that says "neck" from
 * the beauty angle and does not compete from Classic.
 */
const COLLAR_STRENGTH = 0.25;

/** One white mark set, plus the dark face features, as 0..1 masks. */
export interface DogMarks {
  /** The five white marks, unioned. The collar contributes at half weight. */
  readonly cream: TSLNode;
  /** Eye rim, nose leather and lip line, unioned. */
  readonly dark: TSLNode;
  /** The amber iris, laid inside the dark rim. */
  readonly iris: TSLNode;
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
  const py = positionLocal.y.add(wander);
  const pz = positionLocal.z.add(wander);
  const px = abs(positionLocal.x);

  // The blaze. Width falls from 10 cm half between the ears to 3 cm half at the
  // muzzle, so from directly overhead the mark tapers toward the nose and points
  // where the dog is going. The wander goes on the EDGE rather than on the
  // coordinate and is floored, because a negative threshold would flood the whole
  // skull white; it is also cut to a fifth, because a 6 cm stripe cannot afford
  // 5 cm of drift and still be a stripe.
  //
  // The y gate is what separates this from the bib. Below y 1.20 is the side of
  // the muzzle and the underside of the jaw, and the previous pass let the mark
  // run there and join the chest into one continuous cream plastron.
  const blazeHalf = float(0.092).sub(smoothstep(float(0.88), float(1.38), pz).mul(float(0.062)));
  const blazeEdge = tslMax(blazeHalf.add(wander.mul(float(0.2))), float(0.022));
  const blaze = float(1)
    .sub(smoothstep(blazeEdge, blazeEdge.add(float(0.018)), px))
    .mul(smoothstep(float(0.78), float(0.82), pz))
    .mul(float(1).sub(smoothstep(float(1.4), float(1.425), pz)))
    .mul(smoothstep(float(1.2), float(1.23), py));

  // The collar: an 8 cm ring at the base of the neck, top included, so it is the
  // one mark an overhead camera cannot hide. It takes a fifth of the wander,
  // because at full wander a ring this narrow reaches the withers at one end and
  // stops being a ring.
  const pzRing = positionLocal.z.add(wander.mul(float(0.2)));
  const collar = smoothstep(float(0.5), float(0.525), pzRing)
    .mul(float(1).sub(smoothstep(float(0.58), float(0.605), pzRing)))
    .mul(float(COLLAR_STRENGTH));

  // Throat and forechest: a 0.28 m stripe up the middle of a 0.90 m chest, cut
  // at z 0.95 so it stops 0.34 m behind the jaw. The previous width of 0.34 m
  // over the whole throat came back from the front capture as a shield, and a
  // shield under a blaze is the continuous cream plastron this mark exists to
  // avoid. The lateral cut at 0.14 also keeps it clear of the forelegs, whose
  // innermost vertex is at x 0.17.
  const cutoff = undersideAt(pz).add(float(0.13));
  const bib = smoothstep(float(0.44), float(0.48), pz)
    .mul(float(1).sub(smoothstep(float(0.9), float(0.95), pz)))
    .mul(float(1).sub(smoothstep(float(0.075), float(0.14), px)))
    .mul(float(1).sub(smoothstep(cutoff.sub(float(0.025)), cutoff.add(float(0.025)), py)));

  // Socks: the foot and nothing above it. The paw's sole is at y 0.02 and its
  // knuckles at 0.12, so a cutoff at 0.13 whitens the foot and stops. A third of
  // the wander, so a sock cannot climb.
  const pySock = positionLocal.y.add(wander.mul(float(0.3)));
  const socks = float(1).sub(smoothstep(float(0.115), float(0.145), pySock));

  // The tail tip: the last 13 cm of a plume that runs from z -0.90 to -1.585.
  const pzTail = positionLocal.z.add(wander.mul(float(0.4)));
  const tailTip = float(1).sub(smoothstep(float(-1.47), float(-1.44), pzTail));

  return clamp(blaze.add(collar).add(bib).add(socks).add(tailTip), float(0), float(1));
}

/** Distance to the eye centre, squashed into the almond the eye actually is. */
function eyeDistance(): TSLNode {
  return length(
    vec3(
      abs(positionLocal.x).sub(float(EYE_X)),
      positionLocal.y.sub(float(EYE_Y)).mul(float(EYE_SQUASH)),
      positionLocal.z.sub(float(EYE_Z)),
    ),
  );
}

/** Eye rim, nose leather and lip line. No wander: these are features. */
function darkMask(): TSLNode {
  const x = abs(positionLocal.x);
  const y = positionLocal.y;
  const z = positionLocal.z;

  const eye = float(1).sub(smoothstep(float(EYE_INNER), float(EYE_OUTER), eyeDistance()));

  // Nose leather: a button on the end of the muzzle, 7 cm across and 5.5 cm long
  // on a 28.5 cm muzzle. The size is the whole note: at 11 cm across it still
  // read from the front capture as a black mask over most of the face, and at
  // full muzzle width before that it was a plush toy. It stays dark in every
  // band, because a nose does not brighten when the sun catches it.
  const nose = smoothstep(float(1.43), float(1.452), z).mul(
    float(1).sub(smoothstep(float(0.032), float(0.055), x)),
  );

  // The lip line: a value break along the jaw, from under the eye to the corner
  // of the mouth. Half strength and 1.2 cm deep, so it is a line drawn on the
  // muzzle rather than a slot cut into it - the previous 2.2 cm at six tenths
  // joined the nose into one dark bandit mask across the front of the face.
  const lip = float(1)
    .sub(smoothstep(float(0.005), float(0.014), abs(y.sub(float(1.168)))))
    .mul(smoothstep(float(1.24), float(1.29), z))
    .mul(float(1).sub(smoothstep(float(1.4), float(1.44), z)))
    .mul(float(0.32));

  return clamp(eye.add(nose).add(lip), float(0), float(1));
}

/** The amber iris, inside the dark rim. */
function irisMask(): TSLNode {
  return float(1).sub(smoothstep(float(IRIS_INNER), float(IRIS_OUTER), eyeDistance()));
}

/** The catch light, on its own so it can be laid over the iris last. */
function catchMask(): TSLNode {
  const d = length(
    vec3(
      abs(positionLocal.x).sub(float(CATCH_X)),
      positionLocal.y.sub(float(CATCH_Y)),
      positionLocal.z.sub(float(CATCH_Z)),
    ),
  );
  return float(1)
    .sub(smoothstep(float(CATCH_INNER), float(CATCH_OUTER), d))
    .mul(float(CATCH_STRENGTH));
}

/** Build every mask the coat needs, from one shared edge-wander field. */
export function buildDogMarks(wander: TSLNode): DogMarks {
  const dark = darkMask();
  // The iris and the glint are clipped to the rim they live inside, so neither
  // can spill onto the cheek if the eye numbers are ever re-tuned.
  return {
    cream: creamMask(wander),
    dark,
    iris: tslMin(irisMask(), dark),
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

/** Fold one mark set into a band colour: coat, then white, then the face. */
export function applyMarks(marks: DogMarks, coat: TSLNode, tones: MarkTones): TSLNode {
  const withWhite = mix(coat, tones.cream, marks.cream);
  const withRim = mix(withWhite, tones.faceDark, marks.dark);
  const withIris = mix(withRim, tones.iris, marks.iris);
  return mix(withIris, tones.catchLight, marks.glint);
}
