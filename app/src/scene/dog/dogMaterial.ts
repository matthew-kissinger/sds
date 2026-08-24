// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The dog's two materials - the coat and the outline that carries it at
 * distance - built as TSL node materials on the scene's ramp (dogToon.ts). No
 * ShaderMaterial, no onBeforeCompile, one source for both backends.
 *
 * THE OUTLINE is an inverted hull: the same geometry drawn back faces only, each
 * vertex pushed along its normal, in a darkened warm tone of the coat (spec/05
 * forbids a black line). Its width is a uniform the frame loop sets from the
 * camera distance, which is what keeps it a constant ~1.5 px whether the dog is
 * 20 m away at Follow or 54 m away at Classic. A world-constant width would be
 * a fat marker pen at one distance and invisible at the other, and Classic is
 * the distance where the outline is the whole point: it is the cheapest thing
 * that separates a 26 px animal from grass of a similar hue.
 *
 * THE GAIT is one shared vertex expression, used by BOTH materials. That is not
 * a tidiness point - an outline hull built on the undeformed mesh detaches from
 * the legs the moment the dog runs, and the detachment reads as a bug.
 *
 * Two uniforms drive it: phase and effort. Nothing here allocates per frame and
 * nothing needs a bone.
 */

import * as THREE from 'three/webgpu';
import {
  clamp,
  float,
  cos,
  max as tslMax,
  mix,
  normalLocal,
  positionLocal,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import { outlineColor, paintDog } from './dogMarkings';
import { makeDogSurface, shadeDog } from './dogToon';
import { DOG_PAW_BASELINE } from './dogGeometry';

/** Below this height a vertex belongs to a leg, so it swings. Set just under
 *  the belly line (0.64 m at the ribs) so the body itself never shears: the
 *  diagonal-pair selector flips sign at the midline, and a body caught by it
 *  would crease straight down its belly. */
const LEG_LINE = 0.62;
/** Behind this the leg swing is switched off. The plume now hangs no lower than
 *  y 0.70, which is above the leg line, so nothing on the tail can be caught by
 *  the diagonal-pair selector in the first place - but the gate stays, because
 *  that clearance is a consequence of the tail table rather than a guarantee.
 *  The rearmost swinging vertex is the back of the hock at z -0.88; the gate is
 *  fully open there and fully shut by z -1.02, behind the tail root at -0.90. */
const TAIL_LINE_BACK = -1.02;
const TAIL_LINE_FRONT = -0.9;
/**
 * Girth, in metres, at which the outline hull takes its full width, and the
 * fraction of it the thinnest parts keep.
 *
 * The line was heavy around the head and dissolved along the topline. A hull
 * pushed a constant distance along the normal inflates a 0.048 m nose by half its
 * own radius and a 0.33 m back by a seventh of its, so the same width is a thick
 * marker on the muzzle and a hairline on the loin. Scaling the push by the girth
 * the vertex came from (dog/loft.ts writes it into uv.x) evens the WEIGHT rather
 * than the offset, which is what the eye actually reads.
 */
const HULL_FULL_GIRTH = 0.2;
const HULL_MIN_SCALE = 0.55;

export interface DogMaterial {
  readonly material: THREE.MeshBasicNodeMaterial;
  /** Back-face hull, drawn with the same geometry and the same gait. */
  readonly outlineMaterial: THREE.MeshBasicNodeMaterial;
  /** Gait phase in radians. The renderer advances it from dog speed. */
  readonly gaitPhase: TSLNode;
  /** 0 standing, 1 flat out. Scales stride, lift, tail carry and head drop. */
  readonly effort: TSLNode;
  /** Hull thickness in metres. The renderer sets it from camera distance. */
  readonly outlineWidth: TSLNode;
  /** 0 standing, 1 settled onto the haunches after five idle seconds. */
  readonly sit: TSLNode;
  /** Signed head cant, applied with explicit scalar rotation math. */
  readonly headTilt: TSLNode;
  /** Accessibility gain for secondary movement. Locomotion remains readable. */
  readonly motionScale: TSLNode;
  /** Body-only vertical gait, kept off the planted paw vertices. */
  readonly bodyBob: TSLNode;
  /** Body-only pitch and bank. Paws are explicitly excluded. */
  readonly bodyLean: TSLNode;
  readonly bodyRoll: TSLNode;
  /** Per-paw local extensions sampled from the visible terrain. */
  readonly terrainOffsets: TSLNode;
}

/** Build the dog's materials, plus the handles the frame loop drives. */
export function makeDogMaterial(): DogMaterial {
  const gaitPhase = uniform(0);
  const effort = uniform(0);
  const outlineWidth = uniform(0.03);
  const sit = uniform(0);
  const headTilt = uniform(0);
  const motionScale = uniform(1);
  const bodyBob = uniform(0);
  const bodyLean = uniform(0);
  const bodyRoll = uniform(0);
  const terrainOffsets = uniform(new THREE.Vector4());

  const material = makeDogSurface(shadeDog(paintDog()));
  const outlineMaterial = makeDogSurface(outlineColor());
  outlineMaterial.side = THREE.BackSide;

  // --- gait ---------------------------------------------------------------
  // Legs. `reach` is zero above the belly and grows toward the paw, so the
  // swing is a shear that hinges at the elbow rather than a rigid rotation.
  const reach = tslMax(float(LEG_LINE).sub(positionLocal.y), float(0)).mul(
    smoothstep(float(TAIL_LINE_BACK), float(TAIL_LINE_FRONT), positionLocal.z),
  );
  // Diagonal pairs: front-left with hind-right. The sign of x * z picks the
  // pair with no branch and no per-vertex attribute.
  const pairFlip = step(float(0), positionLocal.x.mul(positionLocal.z)).mul(float(Math.PI));
  const swing = sin(gaitPhase.add(pairFlip));
  // 0.80 over a 0.60 m lever is a 38 degree sweep at the gallop, which is what
  // a dog at 15 m/s actually covers; the 0.05 floor is the weight shift a
  // standing dog never quite stops making.
  const stride = float(0.05).add(effort.mul(float(0.8)));
  const standing = float(1).sub(sit);
  const paceZ = swing.mul(reach).mul(stride).mul(standing).mul(motionScale);
  // Lift only on the forward half of the swing, so the foot travels back along
  // the ground and comes forward through the air.
  const paceY = tslMax(swing, float(0))
    .mul(reach)
    .mul(effort)
    .mul(float(0.3))
    .mul(standing)
    .mul(motionScale);

  // Tail. The carry is authored in the mesh and stays authored: the plume trails
  // low behind the hocks, and a gait that swung it upward would put a bright
  // shape back across the hindquarters. What speed does is lift the tip a little
  // and stretch the sway out, and at rest it sways gently. The mask runs from the
  // root at z -0.90 to the tip at -1.585, so it can never catch a hind leg.
  const tailMask = float(1).sub(smoothstep(float(-1.585), float(-0.92), positionLocal.z));
  const wag = sin(gaitPhase.mul(float(0.5)).add(float(1.1)))
    .mul(tailMask)
    .mul(float(0.06).add(effort.mul(float(0.08))))
    .mul(motionScale);
  const tailLift = tailMask.mul(effort).mul(float(0.04)).mul(motionScale);

  // Head. Settles a little toward the line of the back at speed, which reads as a
  // dog working rather than strolling. Two centimetres, not six: the mesh carries
  // the skull only 2.5 cm above the withers now that the neck is short, and the
  // pass that spent six on a drop plus a nose-down lean came back with the head
  // sitting under the topline.
  const headMask = smoothstep(float(0.95), float(1.3), positionLocal.z);
  const headDrop = headMask.mul(effort).mul(float(-0.02));
  const headNod = sin(gaitPhase.mul(float(2)).add(float(0.4)))
    .mul(headMask)
    .mul(effort)
    .mul(float(0.025));

  // Idle posture. The hindquarters lower only above the hocks, so all four paws
  // stay on the ground while the rear mass settles. The front rises a fraction
  // to keep the collie's chest proud instead of folding the whole mesh.
  const upperBody = smoothstep(float(0.28), float(0.92), positionLocal.y);
  const rearBody = float(1).sub(smoothstep(float(-0.16), float(0.48), positionLocal.z));
  const frontBody = smoothstep(float(0.02), float(0.62), positionLocal.z);
  const sitY = rearBody.mul(upperBody).mul(sit).mul(float(-0.25))
    .add(frontBody.mul(upperBody).mul(sit).mul(float(0.045)));

  // Semi-erect ears answer the head before the whole animal moves. This is a
  // tiny lateral fold, gated to the ear tips by anatomy coordinates, and stays
  // out of the accepted coat/ramp path.
  const earTip = smoothstep(float(1.43), float(1.62), positionLocal.y)
    .mul(float(1).sub(smoothstep(float(1.08), float(1.2), positionLocal.z)));
  const earFlick = sin(gaitPhase.mul(float(0.23)).add(positionLocal.x.mul(float(4.1))))
    .mul(earTip)
    .mul(float(0.025))
    .mul(motionScale);

  // A continuous shoulder-to-sole contact weight. At the paw it is one, so
  // body bob/pitch/bank cannot pull a planted foot off the terrain. The tail
  // gate prevents its low vertices from being mistaken for legs.
  const contactWeight = clamp(
    float(LEG_LINE).sub(positionLocal.y).div(float(LEG_LINE - DOG_PAW_BASELINE)),
    float(0),
    float(1),
  ).mul(smoothstep(float(TAIL_LINE_BACK), float(TAIL_LINE_FRONT), positionLocal.z));
  const bodyWeight = float(1).sub(contactWeight);

  // Select one of four CPU-sampled paw offsets with scalar branchless math.
  // This is deliberately not a node-valued Euler or a backend-specific path.
  const positiveSide = step(float(0), positionLocal.x);
  const front = step(float(0), positionLocal.z);
  const frontOffset = mix(terrainOffsets.y, terrainOffsets.x, positiveSide);
  const hindOffset = mix(terrainOffsets.w, terrainOffsets.z, positiveSide);
  const terrainLift = mix(hindOffset, frontOffset, front).mul(contactWeight);

  const posed = positionLocal.add(
    vec3(
      wag.add(earFlick),
      paceY.add(tailLift).add(headDrop).add(headNod).add(sitY)
        .add(bodyBob.mul(bodyWeight))
        .add(terrainLift),
      paceZ,
    ),
  );

  // Head tilt is written out component-by-component. A node-valued Euler fed
  // to `rotate` produced cross-backend ribbon geometry on the instanced sheep;
  // keeping one scalar rotation here makes the dependency explicit and safe.
  const tiltCos = cos(headTilt);
  const tiltSin = sin(headTilt);
  const tiltArmY = posed.y.sub(float(1.22));
  const tiltX = posed.x.mul(tiltCos).sub(tiltArmY.mul(tiltSin)).sub(posed.x);
  const tiltY = posed.x.mul(tiltSin).add(tiltArmY.mul(tiltCos)).sub(tiltArmY);
  const tiltDelta = vec3(tiltX, tiltY, 0).mul(headMask);
  const headed = posed.add(tiltDelta);

  // Body pitch and bank are explicit scalar rotations masked away from the
  // paw line. The old Group Euler rotated every sole and then lifted the whole
  // animal to compensate, which made stance contact visibly breathe.
  const leanCos = cos(bodyLean);
  const leanSin = sin(bodyLean);
  const leanY = headed.y.mul(leanCos).sub(headed.z.mul(leanSin));
  const leanZ = headed.y.mul(leanSin).add(headed.z.mul(leanCos));
  const leaned = headed.add(vec3(0, leanY.sub(headed.y), leanZ.sub(headed.z)).mul(bodyWeight));
  const rollCos = cos(bodyRoll);
  const rollSin = sin(bodyRoll);
  const rollX = leaned.x.mul(rollCos).sub(leaned.y.mul(rollSin));
  const rollY = leaned.x.mul(rollSin).add(leaned.y.mul(rollCos));
  const deformed = leaned.add(vec3(rollX.sub(leaned.x), rollY.sub(leaned.y), 0).mul(bodyWeight));

  // Even line weight: thin parts get a proportionally smaller push. See
  // HULL_FULL_GIRTH.
  const hullScale = mix(
    float(HULL_MIN_SCALE),
    float(1),
    smoothstep(float(0), float(HULL_FULL_GIRTH), uv().x),
  );

  material.positionNode = deformed;
  outlineMaterial.positionNode = deformed.add(normalLocal.mul(outlineWidth).mul(hullScale));

  return {
    material,
    outlineMaterial,
    gaitPhase,
    effort,
    outlineWidth,
    sit,
    headTilt,
    motionScale,
    bodyBob,
    bodyLean,
    bodyRoll,
    terrainOffsets,
  };
}
