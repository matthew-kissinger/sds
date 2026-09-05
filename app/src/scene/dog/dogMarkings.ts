// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The collie's coat: three authored band colours, mottled, with the marks in
 * dogMarks.ts laid over them and the face laid over those.
 *
 * WHY THE BANDS ARE AUTHORED RATHER THAN MULTIPLIED. The field's ramp is three
 * linear gains over one base colour (tsl/palette.ts RAMP), which is right for
 * grass: the gains are gentle, the base is mid-value, and the steps land where
 * the eye wants them. Run the same gains over a dark coat and all three bands
 * collapse into the bottom eighth of the range - the terminator becomes a smooth
 * wash and the shadow band becomes a hole. So the dog names its three tones
 * outright (coatTones.ts), on one hue family and a real value ladder.
 *
 * THE MOTTLE HAS TO STAY UNDER THE BAND STEP, and that is the note this pass was
 * given. The previous version swung each band by 18 percent, which the tone map
 * amplified to about a third on screen - larger than the 3 point lightness steps
 * the ramp was making - so the quantization was buried in noise and the dog came
 * back as the one object in the scene that was not cel-shaded. The bands now step
 * eleven and ten points of lightness, and the mottle swings 8 percent: brushwork
 * that lives inside a band rather than across it.
 *
 * PAINT IS REST-SPACE. Three's `positionLocal` includes `positionNode` gait and
 * head deformation. Using it here made the nose move through a stationary white
 * mask as the head nodded. `positionGeometry` is the undeformed anatomy frame,
 * so every mark remains attached to the same fur through bob, lean and tilt.
 */

import {
  color,
  dot,
  float,
  mix,
  positionGeometry,
  sin,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import {
  COAT_LIT,
  COAT_MID,
  COAT_SHADOW,
  CREAM_LIT,
  CREAM_MID,
  CREAM_SHADOW,
  EYE_CATCH,
  EYE_IRIS,
  FACE_DARK,
  OUTLINE,
} from './coatTones';
import { applyMarks, buildDogMarks, type MarkTones } from './dogMarks';

/** Broad patching and fine brush, in cycles per metre, for both the coat mottle
 *  and the edge wander. Broad enough that a patch spans a hand's width on a
 *  2.40 m animal rather than dissolving into grain at any camera. */
const NOISE_BROAD = 2.0;
const NOISE_FINE = 6.5;

/** How far the mark edges wander, metres, per octave. Together about 5 cm on a
 *  2.40 m animal: enough that no boundary is die-cut, small enough that a 6 cm
 *  blaze tip and a 10 cm collar survive as the shapes they were drawn as. */
const WANDER_BROAD = 0.035;
const WANDER_FINE = 0.015;

/**
 * How far the mottle swings a band colour, either way, as a linear gain.
 *
 * 0.40 is large as a number and small on screen, and that is the whole point:
 * measured off a capture, 0.13 moved the shadow band by ONE POINT of lightness
 * (sRGB 44 to 47 over the whole flank), because Khronos Neutral compresses hard
 * where the coat lives. 0.40 moves it by about five, against band steps of eight
 * and ten. Brushwork that lives inside a band and never crosses one - which is
 * the note the pass before last earned by swinging harder than the ramp stepped.
 */
const MOTTLE_DEPTH = 0.4;
/** How much of the mottle the white takes. Less than the coat, because a mark
 *  that breaks up as hard as the coat stops reading as a mark. */
const CREAM_MOTTLE = 0.4;

/** Two compact painted frequencies, -1..1, anchored to rest-space and never to
 *  the sun. Interfering sine strokes retain the hand-painted breakup without
 *  compiling MaterialX gradient-noise helpers during the first playable frame. */
function mottleNode(): TSLNode {
  const broad = sin(
    dot(
      positionGeometry,
      vec3(float(NOISE_BROAD), float(NOISE_BROAD * 0.61), float(-NOISE_BROAD * 0.77)),
    ).add(float(1.73)),
  );
  const fine = sin(
    dot(
      positionGeometry,
      vec3(float(-NOISE_FINE * 0.47), float(NOISE_FINE), float(NOISE_FINE * 0.72)),
    ).add(float(7.1)),
  );
  return broad
    .mul(float(0.72))
    .add(fine.mul(float(0.28)));
}

/** The three band colours and the white mask that produced them. */
export interface DogPaint {
  /** 0 coat, 1 white mark. dogToon reads it to hold the rim off the marks. */
  readonly mask: TSLNode;
  readonly shadow: TSLNode;
  readonly mid: TSLNode;
  readonly lit: TSLNode;
}

export interface DogCoatInputNodes {
  readonly shadow?: TSLNode;
  readonly mid?: TSLNode;
  readonly lit?: TSLNode;
  readonly outline?: TSLNode;
}

/** Build the coat: three tones, mottled, marked, and given a face. */
export function paintDog(coatNodes?: DogCoatInputNodes): DogPaint {
  const mottle = mottleNode();
  const wander = mottle.mul(float(WANDER_BROAD)).add(
    sin(
      dot(
        positionGeometry,
        vec3(float(NOISE_FINE * 0.83), float(-NOISE_FINE * 0.39), float(NOISE_FINE)),
      ).add(float(19.3)),
    ).mul(float(WANDER_FINE)),
  );
  const marks = buildDogMarks(wander);

  const coatSwing = float(1).add(mottle.mul(float(MOTTLE_DEPTH)));
  const creamSwing = float(1).add(mottle.mul(float(MOTTLE_DEPTH * CREAM_MOTTLE)));

  // The face tones take no band and no mottle. A nose is the same near-black in
  // key and in shadow, an iris does not change colour with the terminator, and a
  // catch light that dimmed with it would stop being a catch light.
  const face = {
    faceDark: color(FACE_DARK),
    iris: mix(color(EYE_IRIS), color(COAT_MID), float(0.4)),
    catchLight: color(EYE_CATCH),
  };

  const band = (coat: string | TSLNode, cream: string): TSLNode => {
    const tones: MarkTones = { ...face, cream: mix(color(cream), color(CREAM_MID), float(0.18)).mul(creamSwing) };
    const coatNode = typeof coat === 'string' ? color(coat) : coat;
    return applyMarks(marks, coatNode.mul(coatSwing), tones);
  };

  if (coatNodes?.shadow && coatNodes?.mid && coatNodes?.lit) {
    return {
      mask: marks.cream,
      shadow: band(mix(coatNodes.shadow, coatNodes.mid, float(0.1)), CREAM_SHADOW),
      mid: band(coatNodes.mid, CREAM_MID),
      lit: band(coatNodes.lit, CREAM_LIT),
    };
  }

  return {
    mask: marks.cream,
    shadow: band(COAT_SHADOW, CREAM_SHADOW),
    mid: band(COAT_MID, CREAM_MID),
    lit: band(COAT_LIT, CREAM_LIT),
  };
}

/**
 * The outline colour (spec/05: a darkened warm tone of the surface, never pure
 * black). ONE tone for the whole animal: a line that graded from near-black on
 * the coat to tan on the marks put four line weights and two line colours around
 * one silhouette, and a single warm brown is what makes the outline read as
 * drawn rather than as noise.
 */
export function outlineColor(overrideNode?: TSLNode): TSLNode {
  return overrideNode ?? color(OUTLINE);
}
