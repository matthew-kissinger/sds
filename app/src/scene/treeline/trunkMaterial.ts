// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The bole material: boles on the front rank of the near ring, and the hero
 * oak's trunk and boughs.
 *
 * THE VERTEX STAGE DOES NOTHING, AND THAT IS THE HARD-WON PART.
 *
 * The taper and the bow that answer the critique's "parallel-edged mitred
 * plank" are real, but they are baked into the geometry (trunkShape.ts) rather
 * than driven per instance, because a per-instance version of them could not be
 * made to render. Reading an instanced buffer attribute in this material's
 * VERTEX stage returns garbage on this backend: it laid six brown ribbons three
 * hundred metres long across the pasture, through every one of the four capture
 * cameras. What makes it worth writing down is how thoroughly the evidence
 * pointed elsewhere first. A placement audit found all ninety trunk records
 * finite and in range. A diagnostic build that painted the very same taper and
 * bow straight into the fragment colour came back with one flat, correct colour
 * per limb, so the buffer, the stride and the values were all right. Splitting
 * the pack into two buffers, one per stage, changed nothing. Only removing the
 * vertex-stage read entirely cleared it.
 *
 * So: THIS MATERIAL'S VERTEX STAGE READS NO INSTANCED ATTRIBUTE. It is the
 * second instance of the same hazard in this folder - canopyMaterial.ts records
 * mx_noise_float coming back as per-vertex garbage in the vertex stage of a
 * material that also calls it in the fragment stage - and two of them make a
 * rule worth handing to whoever reads this next.
 *
 * THE SHADE SIDE IS COOL AND SATURATED, WITH A WARM BOUNCE UNDER IT. Two passes
 * ran an authored warm umber there on the theory that golden-hour bark goes to
 * rust where the key leaves it. On screen that gave a bole with one orange half
 * and one slightly darker orange half: an airbrushed gradient with no hue event
 * in it, which is the opposite of the ramp discipline spec/05 asks for. The
 * shadow band is now pulled round past red toward mauve while KEEPING its
 * saturation, so the terminator is a hue edge as well as a value edge, and the
 * bounce off the sunlit pasture goes back on top of it as an additive warm -
 * which is where the warmth on a real shade side comes from anyway. Cool
 * pigment plus warm bounce reads as light; warm pigment alone reads as paint.
 *
 * AND THERE IS NO STRAIGHT SEAM LEFT. Three things break it. The geometry's
 * smooth surface-of-revolution normals put the terminator on a curve that
 * follows the cylinder rather than down a facet edge; the bark relief below
 * perturbs nDotL in world space, so the band edge wanders across the bole
 * instead of running down it; and the grain varies faster UP the bole than
 * around it, so value breaks along the length the way bark does.
 */

import * as THREE from 'three/webgpu';
import {
  color,
  float,
  fract,
  instancedBufferAttribute,
  mix,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import {
  BAND_SHADOW_EDGE,
  BARK_BODY,
  BARK_BOUNCE,
  BARK_LIT,
  BARK_SHADOW,
  recedeBark,
  sunFacing,
  threeBand,
} from './foliage';

/** Bark noise frequencies. The grain runs UP the bole faster than it runs
 *  around it, which is what puts value breakup along the length rather than
 *  camouflage across it: bark is a directional material. */
const BARK_GRAIN = 2.4;
const BARK_RISE = 1.15;
const BARK_PATCH = 0.34;
/**
 * The low-frequency one: about one feature every eleven metres, at nearly twice
 * the depth of the pass before.
 *
 * IT IS THE ONLY BARK NOISE THAT SURVIVES THE FOLLOW CAMERA. A near bole there
 * is eight pixels across and a couple of hundred tall, so a 2.4 cycle-per-metre
 * grain lands under a pixel and averages to a flat tone - which is exactly what
 * came back, and why the critique read the bole as airbrushed. Eleven metre
 * blotches are twenty pixels of value drift along the length at that distance,
 * which is the scale at which a viewer reads bark rather than noise.
 */
const BARK_BLOTCH = 0.09;
const GRAIN_DEPTH = 0.14;
const PATCH_DEPTH = 0.12;
const BLOTCH_DEPTH = 0.17;

/**
 * BARK RELIEF: a world-space perturbation of nDotL, applied before the bands.
 *
 * This is what removes the straight vertical seam, and it removes it in the one
 * place a seam can be removed - the band edge itself. A bole is a vertical
 * cylinder under a fixed sun, so its terminator is a vertical line, and no
 * amount of colour breakup laid over the two sides changes where that line is.
 * Perturbing nDotL by a shade more than a terminator width, at a scale of about
 * a metre and a half, makes the edge wander across the bole by a bark plate's
 * width at a time. It is the same trick the canopy uses on its own band edges,
 * and it is in world space for the same reason: round features, the same size
 * on every limb, whatever the instance matrix does to the geometry.
 */
const RELIEF_SCALE = 0.65;
const RELIEF_DEPTH = 0.05;

/**
 * Shade at the foot of the bole, and the local height over which it lifts.
 *
 * MATCHED TO THE ROOT FLARE, which is now the bottom tenth of the limb
 * (trunkShape.ts). The two have to agree: the darkening is the ambient
 * occlusion of the flare's own undercut plus the grass shadow it stands in, so
 * a darkening that ran further up the bole than the swell did read as a
 * gradient painted on rather than as a foot in the ground.
 */
const ROOT_SHADE = 0.56;
const ROOT_HEIGHT = 0.12;

/** Per-tree brightness spread. */
const TINT_MIN = 0.86;
const TINT_MAX = 1.14;

/** How dark a bough buried inside its own crown goes, at shade = 1. The hero
 *  oak's limbs run through the canopy mass and would otherwise be the brightest
 *  thing in the tree, which is backwards. */
const BOUGH_SHADE = 0.72;

/** The bounce off the sunlit field onto the shade side, and how far below the
 *  shadow edge it reaches full strength. Additive, and stronger than the pass
 *  before because the pigment under it is cool now: the warmth on a shade side
 *  is light arriving from the field, so it belongs in an additive term keyed to
 *  the shadow band and not in the band's own colour. */
const BOUNCE_STRENGTH = 0.115;
const BOUNCE_REACH = 0.14;

export interface TrunkMaterialInputs {
  /** Per-instance (tint, shade). The FRAGMENT stage is the only thing that
   *  reads it, and that is a hard rule here rather than a coincidence. */
  readonly instances: THREE.InstancedBufferAttribute;
}

/** Compact crossed brush waves for bark value and terminator breakup. */
function paintedWave(point: TSLNode, phase: number): TSLNode {
  const grain = sin(
    point.x.mul(float(0.71))
      .add(point.y.mul(float(1.31)))
      .add(point.z.mul(float(1.07)))
      .add(float(phase)),
  );
  const cross = sin(
    point.x.mul(float(1.47))
      .sub(point.y.mul(float(0.53)))
      .add(point.z.mul(float(0.83)))
      .add(float(phase * 1.91 + 0.33)),
  );
  return grain.mul(float(0.7)).add(cross.mul(float(0.3)));
}

export function makeTrunkMaterial(inputs: TrunkMaterialInputs): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();

  const instance: TSLNode = instancedBufferAttribute(inputs.instances, 'vec2');
  const tintSeed = instance.x;
  const shade = mix(float(1), float(BOUGH_SHADE), instance.y);

  // --- colour ---------------------------------------------------------------

  const grain = paintedWave(
    vec3(
      positionWorld.x.mul(float(BARK_GRAIN)),
      positionWorld.y.mul(float(BARK_RISE)),
      positionWorld.z.mul(float(BARK_GRAIN)),
    ),
    0.7,
  );
  const patch = paintedWave(positionWorld.mul(float(BARK_PATCH)), 3.1);
  const blotch = paintedWave(positionWorld.mul(float(BARK_BLOTCH)), 6.7);
  const painted = float(1)
    .add(grain.mul(float(GRAIN_DEPTH)))
    .add(patch.mul(float(PATCH_DEPTH)))
    .add(blotch.mul(float(BLOTCH_DEPTH)));

  const relief = paintedWave(positionWorld.mul(float(RELIEF_SCALE)), 9.3)
    .mul(float(RELIEF_DEPTH));
  const nDotL = sunFacing().add(relief);
  const banded = threeBand(color(BARK_SHADOW), color(BARK_BODY), color(BARK_LIT), nDotL);
  const tint = mix(float(TINT_MIN), float(TINT_MAX), fract(tintSeed.mul(float(5.73))));
  const root = mix(
    float(ROOT_SHADE),
    float(1),
    smoothstep(float(0), float(ROOT_HEIGHT), positionLocal.y),
  );

  // Rises as nDotL falls past the shadow edge, so it lands on the shade side of
  // the bole and nowhere else.
  const inShade = smoothstep(
    float(BAND_SHADOW_EDGE),
    float(BAND_SHADOW_EDGE - BOUNCE_REACH),
    nDotL,
  );
  const lit = banded.mul(painted).mul(tint).mul(root).mul(shade);
  material.colorNode = recedeBark(
    lit.add(color(BARK_BOUNCE).mul(float(BOUNCE_STRENGTH)).mul(inShade).mul(shade)),
  );
  return material;
}

/** The attribute layout the component has to fill. */
export const TRUNK_ATTRIBUTE_SIZE = 2;
