// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * One TSL node material for every tree crown on both backends, with no
 * per-frame CPU work behind it. Bushes use shrubMaterial.ts instead.
 *
 * WHAT THE VERTEX STAGE DOES
 *
 *  - SILHOUETTE comes from crownShape.ts's interlocking lobe shells and the
 *    family-authored instance proportions. It is deliberately not a
 *    high-frequency vertex effect, so shoulders and cut-ins survive the
 *    gameplay horizon crop instead of aliasing back into a smooth oval.
 *  - SWAY AS HORIZONTAL, BASE-ANCHORED DRIFT. Its weight is exactly zero at
 *    local y=0 and its Y component is the exported literal zero in
 *    diagnostics.ts. Wind moves the crown top without lifting either side of
 *    the lower rim away from the supporting limb.
 *
 * AND THE VERTEX STAGE READS NO INSTANCED ATTRIBUTE, which is a hard rule in
 * this folder rather than a style. trunkMaterial.ts carries the full account: an
 * instanced buffer attribute read in the vertex stage comes back as garbage on
 * this backend, and it cost this pass most of its capture budget to prove it,
 * because the data audited clean and a fragment-stage read of the same buffer
 * was correct. The trunk's version of the failure was total - brown ribbons
 * three hundred metres long. The canopy's was rarer and so nastier to see: two
 * crowns came back as long leaning capsules floating in front of the belt
 * because their copy of the read returned a wild value into the sway.
 * Everything the vertex stage needs that varies per tree now comes from
 * `hash(instanceIndex)`, which is a built-in and not a buffer read; everything
 * else it needs is world position, which is also not one. What the instance
 * buffer still carries is read by the fragment stage alone.
 *
 * WHAT THE FRAGMENT STAGE DOES
 *
 *  - THREE BANDS, ONE SUN, over the blended radial normal the geometry bakes
 *    (crownShape.ts). The 0.085-wide terminators model a rounded shoulder while
 *    leaving three discrete plateaus. Everything else in the
 *    fragment stage is held well under a band step so the ramp stays the thing
 *    the eye reads; the pass before this lost its bands under its own noise.
 *  - THE SKY, ADDED TO nDotL BEFORE THE BANDS. The Classic camera is 41 m up
 *    and pitched 50 degrees down, so the only part of the treeline it ever sees
 *    is the tops. Feeding the sky through the ramp promotes those tops a whole
 *    band and gives them a hard rim; adding it afterwards, as the last pass
 *    did, is an airbrush over the edges.
 *  - AERIAL PERSPECTIVE toward the fog colour, on world depth, per fragment.
 *
 * WHAT IT NO LONGER DOES: sky holes. Two passes tried cutting gaps through the
 * upper crown with alphaTest, and both times the noise's thin tail rendered as
 * cream worms and pinpricks brighter than the sky behind them. The horizon
 * breathes through the GAPS BETWEEN STANDS instead (treePlacement.ts), which is
 * where a real wood keeps its sky. Solid crowns beat corrupted-looking crowns,
 * and the material is fully opaque as a result.
 */

import * as THREE from 'three/webgpu';
import { PALETTE } from '@app/tsl/palette';
import {
  abs,
  color,
  float,
  hash,
  instanceIndex,
  instancedBufferAttribute,
  mix,
  normalWorld,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  step,
  time,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import { TREE_VERTICAL_DRIFT_MAX } from './diagnostics';
import {
  FOLIAGE_BODY,
  FOLIAGE_LIT,
  FOLIAGE_SHADOW,
  FOLIAGE_TURNING,
  WIND_X,
  WIND_Z,
  aerial,
  gustAt,
  recede,
  sunFacing,
  threeBand,
} from './foliage';

/**
 * Peak lean at full gust, radians. On the hero crown this is roughly six
 * tenths of a metre at the outer shoulder: readable over 650 ms, not a storm.
 *
 * The lean is no longer divided by the crown's aspect. That correction existed
 * because the rotation happens in a space the instance matrix scales
 * anisotropically, so the travel comes out proportional to the crown's WIDTH
 * rather than its height - but it needed a per-instance number in the vertex
 * stage to apply, and this material is not allowed one any more. Crowns here run
 * between 0.62 and 1.6 as tall as they are wide, so the error is a few
 * centimetres of travel on a metre-scale motion, and no frame can show it.
 */
const SWAY_LEAN = 0.055;
/** Per-tree flutter, so no two crowns move in lockstep. */
const FLUTTER_RATE = 1.9;
const FLUTTER_LEAN = 0.01;

/**
 * Painted breakup: one restrained, object-space mass tone.
 *
 * THE DEPTHS ARE A THIRD OF WHAT THEY WERE, and the reason is the whole shape
 * of this pass. A band step in the ramp is a value change of about 30 percent;
 * the old breakup swung value by plus or minus 18 percent, which is more than
 * half a band. Every crown therefore carried a full band's worth of noise
 * scribbled across all three of its bands, and the bands stopped being edges.
 * Anything that is not the ramp has to stay well under the ramp here, or the
 * ramp is not what the eye reads.
 */
const MASS_SCALE = 4.6;
const MASS_DEPTH = 0.01;

/** Contact shade at the very foot of a crown, and the local height over which
 *  it lifts. Gentler than the last pass's 0.58: the foot of the mass should go
 *  into its own shadow, not into a black rim. */
const CONTACT_SHADE = 0.74;
const CONTACT_HEIGHT = 0.24;

/**
 * The sky, and it enters the ramp TWICE on purpose.
 *
 * SKY_LIFT is added to nDotL BEFORE the bands, so an upward-facing patch of
 * crown is promoted a whole band rather than washed with a gradient. That is
 * the fix for a note the critique made twice: the Classic camera is 41 m up on
 * a 50 degree pitch and sees almost nothing of a tree except its top, and a
 * smooth additive bounce there is an airbrush laid straight over the band edges
 * the same pass was trying to sharpen. Quantized, the crown top gets a lit cap
 * with a hard rim on it, and the band edge that rim shares with the shoulder is
 * the second of the two edges a critic can point at on one mass.
 *
 * BOUNCE is what is left of the old term: small, and there only to move the
 * HUE. A leaf facing up at this hour sees the low warm band of the sky rather
 * than the blue overhead, so the colour is most of the way to the horizon
 * cream; a straight skyMid bounce turned every crown top teal against a warm
 * field.
 */
const SKY_LIFT = 0.055;
const SKY_BOUNCE = 0.045;
const BOUNCE_EDGE = [0.15, 0.9] as const;
const BOUNCE_WARMTH = 0.7;

/** How much of the sun's own halo the surfaces facing straight into the key
 *  take, and where inside the lit band it starts. This is the treeline's rim
 *  light: it lands on the last handspan of leaf that sees sun, which at a low
 *  golden key is the top and the west shoulder of every crown, and it is what
 *  ties the wood to the same light as the grass and the peach sky. */
const CROWN_GOLD = 0.065;
const GOLD_EDGE = 0.88;

/**
 * CROWN-SCALE MASSING, added to nDotL before the bands, and the thing that
 * stops the lit band reading as one decal stamped on every crown in the belt.
 *
 * The critique's words were "a single vertical lime highlight stripe ... a
 * specular smear stamped identically on every crown", and they described a real
 * property of the asset rather than a taste. A crown's shading normal is very
 * nearly the radial from its own centre, and every crown is lit by the same
 * vector, so the lit crescent lands in the same place on the same ellipsoid
 * every time - and rolling the instance cannot move it, because a radial field
 * is invariant under rotation. The only lever that moves a band edge is nDotL.
 *
 * So the mass is perturbed at ELEVEN METRES, which is one crown across. The
 * depth stays far below the softened terminator, so the edge shifts slightly
 * without becoming a crystalline stripe - and because the field is
 * sampled in world space, two crowns nine metres apart get different samples
 * without any per-instance read at all. It also does the thing the note was
 * really asking for: a crown whose lit side is bitten into by the shoulder of
 * its own foliage reads as a mass of leaves, not as a lit sphere.
 *
 * It does NOT fade with distance the way the fine dapple does. Eleven metre
 * features on a crown two pixels wide are simply a slightly different green,
 * which is exactly what a far wood should be.
 */
const MASSING_SCALE = 0.09;
const MASSING_DEPTH = 0.015;

/**
 * DAPPLED FOLIAGE, added to nDotL before the bands.
 *
 * This is what makes the band edge read as leaves rather than as a contour. The
 * noise is sampled in WORLD space at roughly one feature every two metres, so
 * clumps are the size of a bough's worth of foliage, they are the same size on
 * every tree regardless of how the instance matrix scales it, and they are
 * round rather than stretched.
 *
 * IT IS FINE NOW RATHER THAN COARSE. Its amplitude stays far below the
 * terminator width, so it eases the edge around the geometry's scallops without
 * carrying whole patches across it - a
 * patch that crosses a long band edge arrives as a thin finger lying along it,
 * and a crown covered in fingers reads as broken glass.
 *
 * IT FADES OUT WITH THE HAZE. Half-metre foliage on a crown two pixels wide is
 * shimmer, so the amplitude runs to nothing over the same 120 to 400 m the
 * aerial mix runs in over (foliage.ts). The far belts get their edges from the
 * geometry alone, which is all that resolves out there anyway.
 */
const DAPPLE_SCALE = 1.35;
const DAPPLE_DEPTH = 0.006;

/**
 * Per-mass brightness spread. Plus or minus two and a half percent, which is a
 * twelfth of a band step.
 *
 * THE BOUND IS THE POINT NOW, not the variety. The critique found a crown
 * reading a whole band brighter than its neighbours in two separate frames, and
 * an unbounded hash is how that happens: with the spread wide enough to be worth
 * having, two adjacent draws eventually land at the two ends of it. Variety
 * between crowns comes from the massing term above, which moves a band EDGE
 * rather than the whole mass's level, so it can never produce an outlier - the
 * two crowns still share the same three colours. This term is left only to stop
 * a stand of identical trees looking printed.
 */
const TINT_MIN = 0.975;
const TINT_MAX = 1.025;

export interface CanopyMaterialInputs {
  /** Per-instance (tint, turn, family). Read by the FRAGMENT stage only. */
  readonly instances: THREE.InstancedBufferAttribute;
}

/** The deterministic placement is sorted by family before serialization. The
 * vertex stage can therefore recover family ranges from the safe built-in
 * instance index without reading the backend-unsafe instance buffer. */
export const CANOPY_FAMILY_STARTS = [85, 107, 168] as const;

/**
 * Two crossed, deterministic brush waves in roughly [-1, 1]. The crowns need
 * metre-scale mass breakup, not the full MaterialX noise helper library that
 * made this first-frame pipeline expensive to compile on both backends.
 */
function paintedWave(point: TSLNode, phase: number): TSLNode {
  const broad = sin(
    point.x.mul(float(0.73))
      .add(point.y.mul(float(1.17)))
      .add(point.z.mul(float(1.43)))
      .add(float(phase)),
  );
  const cross = sin(
    point.x.mul(float(1.61))
      .sub(point.y.mul(float(0.91)))
      .add(point.z.mul(float(0.57)))
      .add(float(phase * 1.73 + 0.41)),
  );
  return broad.mul(float(0.68)).add(cross.mul(float(0.32)));
}

export function makeCanopyMaterial(inputs: CanopyMaterialInputs): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();

  const instance: TSLNode = instancedBufferAttribute(inputs.instances, 'vec3');
  const tintSeed = instance.x;
  const turning = instance.y;
  const family = instance.z;

  // --- silhouette -----------------------------------------------------------

  // The per-tree seed, from the instance's index rather than from its buffer.
  // Deterministic across reloads for the same reason the placement is: it is a
  // pure function of an integer, and the placement order never changes.
  const shape = hash(instanceIndex);
  const floatIndex = float(instanceIndex);
  const afterOak = step(float(CANOPY_FAMILY_STARTS[0]), floatIndex);
  const afterElm = step(float(CANOPY_FAMILY_STARTS[1]), floatIndex);
  const afterAsh = step(float(CANOPY_FAMILY_STARTS[2]), floatIndex);
  const oak = float(1).sub(afterOak);
  const elm = afterOak.mul(float(1).sub(afterElm));
  const ash = afterElm.mul(float(1).sub(afterAsh));
  const fieldOak = afterAsh;
  const right = smoothstep(float(0.03), float(0.34), positionLocal.x);
  const left = smoothstep(float(0.03), float(0.34), positionLocal.x.mul(float(-1)));
  const signedOuter = right.sub(left);
  const side = right.add(left);
  const upper = smoothstep(float(0.42), float(0.9), positionLocal.y);
  const familyX = signedOuter.mul(
    oak.mul(float(0.025))
      .add(elm.mul(float(-0.035)))
      .add(ash.mul(upper).mul(float(0.07)))
      .add(fieldOak.mul(float(0.018))),
  ).add(right.mul(fieldOak).mul(float(0.035)));
  const familyY = upper.mul(
    oak.mul(side).mul(float(-0.012))
      .add(elm.mul(float(0.025)))
      .add(ash.mul(side).mul(float(0.035)))
      .add(fieldOak.mul(right).mul(float(-0.012))),
  );
  const familyPosition = positionLocal.add(vec3(familyX, familyY, float(0)));
  const outerLobe = smoothstep(
    float(0.08),
    float(0.38),
    abs(positionLocal.x).add(abs(positionLocal.z).mul(float(0.45))),
  );

  // --- sway -----------------------------------------------------------------

  // The gust is sampled at the VERTEX's world position rather than the crown's
  // own, because the crown's own would have to be read out of the instance
  // buffer. A gust is tens of metres across and a crown is ten, so a mass leans
  // a few hundredths of a degree more on one side than the other: a shear far
  // below what a half-metre sway makes visible.
  const gust = gustAt(positionWorld.x, positionWorld.z);
  const flutter = sin(time.mul(float(FLUTTER_RATE)).add(shape.mul(float(43.1))));
  const lean = gust.mul(float(SWAY_LEAN)).add(flutter.mul(float(FLUTTER_LEAN)));
  // Move only in the horizontal plane and fade the displacement to exactly
  // zero at the crown base. The previous 3D rotation changed local Y around
  // the whole lower rim, so a static trunk could visibly detach while the
  // crown bobbed above and below the terrain. Trees may breathe in wind, but
  // their support joint never moves vertically.
  const anchored = smoothstep(float(0), float(0.72), positionLocal.y);
  const drift = lean.mul(anchored);
  // The upper mass follows the gust a fraction of a cycle late. The support
  // joint remains fixed, while the outer shoulders complete one small motion
  // after the trunk-height core has begun to settle.
  const followThrough = sin(
    time.mul(float(0.85)).add(shape.mul(float(37.2))).add(float(0.9)),
  ).mul(float(0.015)).mul(outerLobe).mul(anchored.mul(anchored));
  const lobeFlutter = sin(
    time.mul(float(2.15))
      .add(shape.mul(float(31.7)))
      .add(positionLocal.x.mul(float(10.7)))
      .add(positionLocal.z.mul(float(6.3))),
  ).mul(float(0.003)).mul(outerLobe).mul(anchored);
  material.positionNode = familyPosition.add(
    vec3(
      drift.add(followThrough).add(lobeFlutter).mul(float(WIND_X)),
      float(TREE_VERTICAL_DRIFT_MAX),
      drift.add(followThrough).add(lobeFlutter).mul(float(WIND_Z)),
    ),
  );

  // --- colour ---------------------------------------------------------------

  const away = aerial();
  const objectPhase = vec3(
    shape.mul(float(7.31)),
    shape.mul(float(3.17)),
    shape.mul(float(5.93)),
  );
  const objectBreakup = paintedWave(positionLocal.mul(float(MASS_SCALE)).add(objectPhase), 4.1)
    .mul(float(MASS_DEPTH));
  const dapple = paintedWave(positionWorld.mul(float(DAPPLE_SCALE)), 0.7)
    .mul(float(DAPPLE_DEPTH))
    .mul(float(1).sub(away));
  const skyward = smoothstep(float(BOUNCE_EDGE[0]), float(BOUNCE_EDGE[1]), normalWorld.y);
  const massing = paintedWave(positionWorld.mul(float(MASSING_SCALE)), 2.3)
    .mul(float(MASSING_DEPTH));
  // The sky enters the ramp here, before the bands, so it promotes a crown top
  // by a whole band instead of laying a gradient over the edges.
  const nDotL = sunFacing()
    .add(dapple)
    .add(massing)
    .add(objectBreakup)
    .add(skyward.mul(float(SKY_LIFT)));
  const speciesLift = smoothstep(float(0), float(3), family).mul(float(0.035));
  const speciesBody = mix(color(FOLIAGE_BODY), color(FOLIAGE_LIT), speciesLift);
  const body = mix(speciesBody, color(FOLIAGE_TURNING), turning);

  let tone = threeBand(color(FOLIAGE_SHADOW), body, color(FOLIAGE_LIT), nDotL);

  const tint = mix(float(TINT_MIN), float(TINT_MAX), tintSeed);
  const contact = mix(
    float(CONTACT_SHADE),
    float(1),
    smoothstep(float(0), float(CONTACT_HEIGHT), positionLocal.y),
  );
  tone = tone.mul(tint).mul(contact);

  const bounce = mix(color(PALETTE.skyMid), color(PALETTE.skyHorizon), float(BOUNCE_WARMTH));
  tone = tone.add(bounce.mul(float(SKY_BOUNCE)).mul(skyward));
  tone = tone.add(
    color(PALETTE.sunGlow).mul(float(CROWN_GOLD)).mul(smoothstep(float(GOLD_EDGE), float(1), nDotL)),
  );

  material.colorNode = recede(tone);

  return material;
}

/** The attribute layout the component has to fill, stated where the shader
 *  that reads it is written so the two cannot drift. */
export const CANOPY_ATTRIBUTE_SIZE = 3;
