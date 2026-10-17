// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Kiln oak's two materials: `leaf` for the crown and `bark` for the wood
 * (treeline/kilnTree.ts binds them by the recipe's material names).
 *
 * THE PAINTING IS HERE, NOT IN THE ASSET. The recipe bakes only what does not
 * depend on the light - a seed per leaf cluster, the normal of the lobe each
 * leaf vertex belongs to, and Kiln's exposure (`cavity`) - and these two
 * materials do the rest in code: banded, wrapped light that turns warm where
 * it is lit and cool where it is not; a tint per cluster; darkening in the
 * deep folds; a leaf-dab breakup of each turn from light to shade; a swell of
 * the outline into soft lumps; the low sun through the crown's edge when it is
 * behind the tree; a slow sway. One opaque material per role, one instanced
 * draw each, no texture, no alpha and no extra pass.
 *
 * WHAT THE CAMERA SEES IS MASSES. These trees stand 20 to 150 metres from the
 * cameras, so the crown is lit as masses within masses: mostly by its lobes'
 * normals, a share of it by the whole crown's (its envelope, from the loader),
 * and only a trace by each cluster's own, so a lobe turns from light to shade
 * as one soft form and its clusters show at its outline. Everything calms
 * with distance: the dabs give way to the soft ramp they were painted over by
 * `DAB_FADE[1]`, and the crown settles a little toward one deep blue-green
 * (`SETTLE`) before the haze takes it.
 *
 * THE STAND MATRIX, READ AGAIN. Three's instancing transforms a mesh's position
 * and its NORMAL by the stand's matrix and nothing else, but the crown needs the
 * same matrix for its lobe normal and for a swell that has to happen in the
 * tree's own frame. So both materials read the stand matrices themselves, as
 * the uniform array Three's own instancing reads (`buffer(...).element(
 * instanceIndex)`), and place the vertex from it. That is a second binding of
 * the same 139 x 64 bytes, uploaded once; no stand carries anything new.
 * Nothing per stand is read from an instanced buffer attribute in a vertex
 * stage (trunkMaterial.ts records why), and no noise function is shared
 * between the stages: the vertex stage uses sines only.
 *
 * THE SWELL AND THE SWAY MOVE TOGETHER. The swell only ever pushes a leaf
 * vertex OUT along its cluster's normal, by a noise that changes slowly across
 * the crown, so neighbouring clusters grow together and the faces the recipe
 * dropped stay covered (oak.kiln.js, BURIED). The sway is one offset per height
 * in the tree's frame, the same function in both materials, so the wood moves
 * exactly as the leaves round it do and never shows through.
 *
 * COST, counted in scalar operations, a vec3 operation as three. PER VERTEX,
 * over Three's own instancing (which runs as for every instanced mesh): the
 * bark places the vertex from the stand matrix and sways it, about 50 and
 * three sines; the leaf adds the swell (about 30 and three sines), the lobe
 * normal (about 25) and the envelope normal (about 35), about 140 and six sines
 * in all. PER FRAGMENT: the leaf about 200 and three sines - the three-normal
 * blend (30), the key (12), the dabs (20 and the sines), the two painted ramps
 * (28), the tone (25), the backlit edge (22), distance and haze (40) - against
 * about 70 and two sines for the procedural canopy; the bark about 75 and no
 * sine. No texture fetch, no new per-stand data: the only inputs are the stand
 * matrices both instanced meshes already upload, the stand attributes the
 * procedural materials already read, and compile-time constants.
 */

import * as THREE from 'three/webgpu';
import { PALETTE } from '@app/tsl/palette';
import {
  attribute,
  buffer,
  cameraPosition,
  clamp,
  color,
  dot,
  float,
  hash,
  instanceIndex,
  instancedBufferAttribute,
  length,
  max,
  mix,
  normalGeometry,
  normalize,
  normalWorld,
  positionGeometry,
  positionWorld,
  sin,
  smoothstep,
  time,
  uv,
  varying,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import {
  BAND_LIT_EDGE,
  BAND_SHADOW_EDGE,
  WIND_X,
  WIND_Z,
  gustAt,
  recede,
  recedeBark,
  sunFacing,
  sunNode,
  threeBand,
} from './foliage';
import { CROWN_SWELL, type KilnCrownEnvelope } from './kilnTree';

// ------------------------------------------------------------------ the light
/** How much of the crown's lighting normal is its lobe's rather than its
 *  cluster's. Nearly all of it: each lobe lights as one soft form, and its
 *  clusters show at its outline and, through the cavity, in its creases. */
const LOBE_WEIGHT = 0.9;
/** And how much of that is then the whole crown's (its envelope's): enough
 *  that the lobes low on the crown sit in its shade and the high ones in its
 *  light, so the tree reads as one mass before it reads as lobes. */
const CROWN_WEIGHT = 0.25;
/** The sky's share of the light key, so tops read lighter than undersides
 *  even with the sun behind the crown, which from the field it mostly is. */
const SKY_SHARE = 0.3;
/** How far the key drops in a closed cavity, and how dark it paints. Both go
 *  with the square of the closure, so the deep folds between lobes darken and
 *  the shallow creases between one lobe's clusters barely do. */
const CAVITY_KEY = 0.2;
const CAVITY_FLOOR = 0.92;
/** The full width, in key, of the ramp each band edge turns over: wide, so a
 *  lobe goes from light to shade as one soft form. */
const LEAF_RAMP = 0.22;

// --------------------------------------------------------------- the dabbing
/** Leaf dabs: near the camera each ramp is laid down in crisp-edged clumps
 *  whose share of the light follows the ramp, as a painter breaks a soft turn
 *  into leaf strokes; across the field the dabs give way to the ramp itself.
 *  The frequency in the unit frame (a dab of about three quarters of a metre
 *  on a full-size stand), the share of the ramp the dabs' thresholds span,
 *  the softness of a dab's edge (in ramp), and the range they fade over, in
 *  metres from the camera: full out to 40, quiet by 100. */
const DAB_SCALE = 75;
const DAB_SPAN = 0.7;
const DAB_EDGE = 0.07;
const DAB_FADE = [40, 105] as const;

// ------------------------------------------------------------------ the tone
/** A cluster's value spread, and how far its seed leans it toward turning:
 *  a quiet shift of hue more than of value, so no cluster reads as a ball. */
const CLUSTER_VALUE = 0.04;
const CLUSTER_WARMTH = 0.2;
/** A stand's value spread, and how far its `turn` leans it toward turning. */
const STAND_VALUE = 0.07;
const STAND_WARMTH = 0.45;
/** The low sun through the thin outer leaves of a crown seen against it (it
 *  follows the square of how straight the camera looks toward the sun): how
 *  far round the crown's turning away it starts, how bright it gets, and the
 *  share of it left across the field. */
const GLOW_FROM = 0.35;
const GLOW_STRENGTH = 0.55;
const GLOW_FAR = 0.45;
/** Across the field the crown settles toward one deep blue-green: from where,
 *  to where, and how far, before the haze in `recede` takes it on. */
const SETTLE = [70, 220] as const;
const SETTLE_MAX = 0.3;

// ------------------------------------------------------------------- motion
/** The swell's frequency in the unit frame: about one lump a cluster. */
const SWELL_SCALE = 30;
/** The sway: where up the tree it starts, how far a gust and the stand's own
 *  slow drift carry the top (as shares of the stand's height), and the
 *  drift's rate. Slow and small. */
const SWAY_FROM = 0.2;
const SWAY_GUST = 0.0075;
const SWAY_DRIFT = 0.0045;
const SWAY_RATE = 0.45;

// --------------------------------------------------------------------- bark
/** The wood takes the leaves' banding, quieter: a wide edge between bands
 *  that are close in value, so a limb reads round and warm, not striped. No
 *  grain: a painted trunk is its light, and rings round an oak are wrong. */
const BARK_SKY = 0.25;
const BARK_CAVITY_KEY = 0.1;
const BARK_CAVITY_FLOOR = 0.86;
const BARK_TERMINATOR = 0.2;
/** Shade at the foot of the bole, over the flare (the bottom twentieth). */
const ROOT_SHADE = 0.7;
const ROOT_HEIGHT = 0.05;
const STAND_BARK_VALUE = 0.08;
/** The warm bounce off the sunlit field into the wood's shade side. */
const BOUNCE_STRENGTH = 0.12;
const BOUNCE_REACH = 0.16;

export interface KilnTreeMaterialInputs {
  /** Every stand's instance matrix, sixteen floats each: the same values the
   *  instanced mesh draws with. */
  readonly matrices: Float32Array;
  /** Per stand: (tint, turn, family) for the crown, (tint, 0) for the wood.
   *  Read in the FRAGMENT stage only. */
  readonly instances: THREE.InstancedBufferAttribute;
}

export interface KilnLeafMaterialInputs extends KilnTreeMaterialInputs {
  /** The crown as one mass, in the unit frame: compile-time constants, the
   *  same for every stand. */
  readonly envelope: KilnCrownEnvelope;
}

interface StandFrame {
  /** A point in the tree's unit frame, placed in the world. */
  place(point: TSLNode): TSLNode;
  /** A normal in the tree's unit frame, turned into the world (unnormalised). */
  turn(normal: TSLNode): TSLNode;
  readonly origin: TSLNode;
  readonly height: TSLNode;
}

/**
 * This vertex's stand. The stand matrices are a yaw times a positive scale -
 * orthogonal columns and no shear - so a normal's transform is the matrix with
 * each column divided by its squared length, and needs no inverse.
 */
function standFrame(matrices: Float32Array): StandFrame {
  const matrix = buffer(matrices, 'mat4', matrices.length / 16).element(instanceIndex);
  const across = matrix.element(0).xyz;
  const up = matrix.element(1).xyz;
  const along = matrix.element(2).xyz;
  const origin = matrix.element(3).xyz;
  return {
    place: (point) => across.mul(point.x).add(up.mul(point.y)).add(along.mul(point.z)).add(origin),
    turn: (normal) => across.mul(normal.x.div(dot(across, across)))
      .add(up.mul(normal.y.div(dot(up, up))))
      .add(along.mul(normal.z.div(dot(along, along)))),
    origin,
    height: length(up),
  };
}

/**
 * The sway: one horizontal offset per height in the tree's frame, carried by
 * the field's gusts at the stand's foot and a slow drift of the stand's own.
 * Both materials call this, so the wood and the leaves move as one.
 */
function sway(frame: StandFrame): TSLNode {
  const gust = gustAt(frame.origin.x, frame.origin.z);
  const drift = sin(time.mul(float(SWAY_RATE)).add(hash(instanceIndex).mul(float(Math.PI * 2))));
  const bend = smoothstep(float(SWAY_FROM), float(1), positionGeometry.y);
  const reach = gust.mul(float(SWAY_GUST)).add(drift.mul(float(SWAY_DRIFT)))
    .mul(frame.height).mul(bend.mul(bend));
  return vec3(reach.mul(float(WIND_X)), float(0), reach.mul(float(WIND_Z)));
}

/**
 * How far out, as a share of `CROWN_SWELL`, this leaf vertex is pushed: three
 * long sine waves across the crown, offset per stand so no two stands share an
 * outline. Never below zero, so the swell only ever grows a cluster.
 */
function swell(): TSLNode {
  const q = positionGeometry.mul(float(SWELL_SCALE))
    .add(vec3(37.1, 53.7, 71.3).mul(hash(instanceIndex)));
  const waves = sin(dot(q, vec3(0.62, 0.48, -0.62)))
    .add(sin(dot(q, vec3(-0.35, 0.86, 0.37)).mul(float(1.31))))
    .add(sin(dot(q, vec3(0.71, -0.17, 0.68)).mul(float(0.77))));
  return smoothstep(float(-1.8), float(2.7), waves);
}

export function makeKilnLeafMaterial(inputs: KilnLeafMaterialInputs): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  const frame = standFrame(inputs.matrices);

  // --- vertex ----------------------------------------------------------------
  const swollen = positionGeometry.add(normalGeometry.mul(swell().mul(float(CROWN_SWELL))));
  material.positionNode = frame.place(swollen).add(sway(frame));
  const lobeNormal = varying(normalize(frame.turn(attribute('lobeNormal', 'vec3'))), 'vOakLobeNormal');
  // The envelope's normal: the gradient of its ellipsoid at this vertex.
  const radii = vec3(...inputs.envelope.radii);
  const inCrown = positionGeometry.sub(vec3(...inputs.envelope.center)).div(radii);
  const crownNormal = varying(normalize(frame.turn(inCrown.div(radii))), 'vOakCrownNormal');

  // --- fragment --------------------------------------------------------------
  const normal = normalize(mix(
    mix(normalize(normalWorld), normalize(lobeNormal), float(LOBE_WEIGHT)),
    normalize(crownNormal),
    float(CROWN_WEIGHT),
  ));
  const seed = uv().x;
  const cavity = attribute('cavity', 'float');
  const closed = float(1).sub(cavity);
  const fold = closed.mul(closed);
  const stand: TSLNode = instancedBufferAttribute(inputs.instances, 'vec3');
  const toCamera = cameraPosition.sub(positionWorld);
  const range = length(toCamera);
  const view = toCamera.div(range);
  const near = float(1).sub(smoothstep(float(DAB_FADE[0]), float(DAB_FADE[1]), range));

  // The key: the sun wrapped half way round, the sky's share, and the folds.
  const key = mix(sunFacing(normal), normal.y.mul(float(0.5)).add(float(0.5)), float(SKY_SHARE))
    .sub(fold.mul(float(CAVITY_KEY)));
  // Leaf dabs: three crossed waves in the tree's own frame, phased per cluster,
  // as a threshold: where a ramp has climbed past it, the dab is lit. It spans
  // only the middle of [0, 1] (`DAB_SPAN`), so dabs gather where a ramp is
  // turning and none speckle full light or full shade.
  const q = positionGeometry.mul(float(DAB_SCALE)).add(seed.mul(float(17.3)));
  const dab = sin(dot(q, vec3(0.83, 0.31, -0.46)))
    .mul(sin(dot(q, vec3(-0.27, 0.91, 0.32)).mul(float(1.37))))
    .add(sin(dot(q, vec3(0.44, -0.38, 0.81)).mul(float(0.71))).mul(float(0.5)))
    .mul(float(DAB_SPAN / 3))
    .add(float(0.5));
  const painted = (edge: number): TSLNode => {
    const ramp = smoothstep(float(edge - LEAF_RAMP / 2), float(edge + LEAF_RAMP / 2), key);
    return mix(ramp, smoothstep(dab.sub(float(DAB_EDGE)), dab.add(float(DAB_EDGE)), ramp), near);
  };

  const warmth = clamp(
    stand.y.mul(float(STAND_WARMTH)).add(seed.sub(float(0.5)).mul(float(CLUSTER_WARMTH * 2))),
    float(0),
    float(1),
  );
  const body = mix(color(PALETTE.oakLeafBody), color(PALETTE.oakLeafTurning), warmth);
  const lit = mix(color(PALETTE.oakLeafLit), color(PALETTE.oakLeafTurning), warmth.mul(float(0.5)));
  const banded = mix(
    mix(color(PALETTE.oakLeafShade), body, painted(BAND_SHADOW_EDGE)),
    lit,
    painted(BAND_LIT_EDGE),
  );
  const value = float(1).add(seed.sub(float(0.5)).mul(float(CLUSTER_VALUE * 2)))
    .mul(mix(float(1 - STAND_VALUE), float(1 + STAND_VALUE), stand.x))
    .mul(mix(float(1), float(CAVITY_FLOOR), fold));

  // The backlit edge: the low sun through the thin outer leaves, where the
  // WHOLE CROWN turns away from the camera - its envelope's edge, not every
  // lobe's, or each lobe would be outlined as a ball - strongest looking
  // straight toward the sun, on the open upper edges more than the undersides.
  // The leaves there take the light's colour rather than adding to their own:
  // lit through, a leaf is a clear yellow-green, not a paler blue-green.
  const crownFacing = normalize(crownNormal);
  const toward = max(dot(view, sunNode).negate(), float(0));
  const rim = smoothstep(float(GLOW_FROM), float(1), float(1).sub(max(dot(crownFacing, view), float(0))));
  const glow = toward.mul(toward).mul(rim).mul(cavity)
    .mul(crownFacing.y.mul(float(0.35)).add(float(0.65)))
    .mul(mix(float(GLOW_FAR), float(1), near))
    .mul(float(GLOW_STRENGTH));

  const settle = smoothstep(float(SETTLE[0]), float(SETTLE[1]), range).mul(float(SETTLE_MAX));
  const tone = mix(banded.mul(value), color(PALETTE.oakLeafGlow), glow);
  material.colorNode = recede(mix(tone, color(PALETTE.oakLeafFar), settle));
  return material;
}

export function makeKilnBarkMaterial(inputs: KilnTreeMaterialInputs): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  const frame = standFrame(inputs.matrices);

  // --- vertex: placed and swayed exactly as the leaves round it -------------
  material.positionNode = frame.place(positionGeometry).add(sway(frame));

  // --- fragment --------------------------------------------------------------
  const normal = normalize(normalWorld);
  const cavity = attribute('cavity', 'float');
  const stand: TSLNode = instancedBufferAttribute(inputs.instances, 'vec2');
  const key = mix(sunFacing(normal), normal.y.mul(float(0.5)).add(float(0.5)), float(BARK_SKY))
    .sub(float(1).sub(cavity).mul(float(BARK_CAVITY_KEY)));
  const banded = threeBand(
    color(PALETTE.oakBarkShade),
    color(PALETTE.oakBarkBody),
    color(PALETTE.oakBarkLit),
    key,
    BARK_TERMINATOR,
  );
  const root = mix(float(ROOT_SHADE), float(1), smoothstep(float(0), float(ROOT_HEIGHT), positionGeometry.y));
  const value = root
    .mul(mix(float(1 - STAND_BARK_VALUE), float(1 + STAND_BARK_VALUE), stand.x))
    .mul(mix(float(BARK_CAVITY_FLOOR), float(1), cavity));
  // The warm bounce off the sunlit field, on the shade side only.
  const inShade = smoothstep(float(BAND_SHADOW_EDGE), float(BAND_SHADOW_EDGE - BOUNCE_REACH), key);
  material.colorNode = recedeBark(
    banded.mul(value).add(color(PALETTE.treeBarkBounce).mul(float(BOUNCE_STRENGTH)).mul(inShade).mul(cavity)),
  );
  return material;
}
