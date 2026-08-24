// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The wildflowers: one cross-quad flower (scatter/flowerGeometry.ts), one
 * instance per bloom, one draw call for every drift in the field.
 *
 * THEY ARE WARM NOW. The last set authored a cream at hue 60 and 8 per cent
 * chroma with a violet-slate shadow, on the reasoning that spec/05 asks for
 * hue-rotated shadows; what the beauty frame actually showed was drifts of
 * grey-lilac specks in a golden meadow, which belongs to a different painting.
 * The brief asks for warm cream and soft butter yellow and that is what these
 * are: hue 38 and 44 in the key, and a shadow that rotates DOWN the warm side of
 * the wheel to hue 20 rather than across to violet. The rotation and the chroma
 * gain that spec/05 wants are both still there - the cream's shadow carries more
 * chroma than its lit band - they just go to dusty rose instead of to lavender.
 *
 * THE HEADS ARE IN THE GRASS, NOT ABOVE IT. The stem came down from 0.55 m to
 * 0.40 m and thickened by a quarter (scatter/flowerGeometry.ts), and the stem
 * green came UP into the pasture's own value range: it renders 0.49 in shade
 * against a field at 0.55 to 0.74, so a stalk is a green line among green blades
 * rather than a black hairline with a pale dot on the end.
 *
 * THEY HAD TO CLEAR THE GRASS, AND THE LAST SET DID NOT. This is the correction
 * the capture forced, and the number is the whole argument. Sampled off the
 * Follow frame, lit pasture renders about 0.74 and its shaded blades about 0.55.
 * The previous cream's mid band was authored at 0.58 - BELOW the grass it stands
 * in - and because both gameplay cameras look into an eight-degree key, a head
 * spends most of its area in the mid and shadow bands. So the drifts photographed
 * as patches of dusty taupe sitting darker than the field, which the eye reads as
 * dead leaf litter rather than as blossom. Every petal band moved up:
 *
 *   cream   mid 0.76, lit 0.83   (was 0.58 and 0.66)
 *   butter  mid 0.72, lit 0.82   (was 0.60 and 0.69)
 *
 * Wool is 0.87 and stays the brightest thing on the ground, so the order of the
 * scene's values is unchanged; the drifts have simply stopped hiding under the
 * pasture they are meant to sit on top of.
 *
 * A HEAD IS A PAINTED BLOSSOM, NOT A VECTOR STAR. Two things do that and both
 * are cheap: the petal notches are shallower next door, and the value falls from
 * the petal tip into the cup, so the centre of every head is a step darker and a
 * step warmer than its rim. Near the camera a gold heart is mixed into the
 * middle of that; it fades out by 26 m, because at Classic distance a head is
 * seven pixels and a warm core is not a detail, only a warmer flower.
 *
 * ONE BLOOM IN SEVEN IS STILL A BUD. It is drawn from the same per-bloom seed
 * the tint and the flutter use, gathers the head's petals in toward the stem
 * axis and lifts them a little, and tints them toward the stem green. It costs
 * no geometry, no attribute and no branch: a bud is the open head with its
 * petals pulled in.
 *
 * THEY MOVE WITH THE GRASS: the sway rides the same wind frame the field does,
 * so a gust reaches a flower at the moment it reaches the blades around it.
 * Nothing is written per frame; the wind is a function of `time` in the shader.
 */

import * as THREE from 'three/webgpu';
import { makeToonMaterial } from '@app/tsl/toon';
import {
  cameraPosition,
  float,
  fract,
  instancedBufferAttribute,
  length as tslLength,
  max as tslMax,
  min as tslMin,
  mix,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uv,
  vec2,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import {
  bandBases,
  bandWeights,
  blendBands,
  mixBandBases,
  paintedField,
  type BandTargets,
} from './bandedMaterial';
import { STEM_HEIGHT, buildFlowerGeometry } from './flowerGeometry';
import type { FlowerBloom } from './flowerPlacement';
import { BARK_WAVE_WIDTH } from '../juice/barkPulse';

/**
 * The two species, their gold hearts and their stems, per band. palette
 * candidate: promote in cohesion pass.
 *
 *   cream   warm white,  hue 42, lit renders near luminance 0.83, chroma 20%
 *   butter  soft yellow, hue 45, lit near 0.82, chroma 47%
 *   heart   a deeper gold than either petal, so the cup reads as a cup and the
 *           value falls from the rim inward rather than punching a bright hole
 *   stem    a warm meadow green INSIDE the pasture's own value range, so a
 *           stalk never reads as a wire
 *
 * A PETAL'S SHADOW BAND IS HALF THE DRIFT, NOT AN ACCENT, and getting that wrong
 * is what made the beauty frame photograph a bed of rust. A head is two crossed
 * quads, so its normals are horizontal and one of the pair always faces away from
 * a key that sits eight degrees off the horizon: the shadow band is not a rim, it
 * is about half the area the camera sees. Authored at #a88752 it rendered as dark
 * ochre and the whole drift read as dead marigold. Real blossom has almost no
 * internal value range - a white flower in shade is still a light thing - so the
 * ladder here is deliberately SHORT: fifteen points from shadow to key on the
 * cream and sixteen on the butter, against the forty a stone gets. What that buys
 * is a drift that reads as one soft pale mass at any camera angle instead of a
 * chequerboard of lit and unlit petals.
 *
 * The shadows still rotate warm rather than cool and still carry more chroma than
 * the band above them, which is spec/05's saturated shadow; they simply do it
 * near the top of the value range instead of near the bottom.
 */
const CREAM: BandTargets = { shadow: '#bcae9a', mid: '#d3c6a7', lit: '#e6d9b8' };
const BUTTER: BandTargets = { shadow: '#c4ab6e', mid: '#dabf68', lit: '#eed37e' };
const HEART: BandTargets = { shadow: '#b39457', mid: '#c9a75a', lit: '#d9b662' };
const STEM: BandTargets = { shadow: '#72855f', mid: '#879b6e', lit: '#9aae7c' };

/** Per-bloom brightness spread. Held at or near 1: a bloom allowed well above
 *  the authored tone is the one that reads as a white spot in a warm field. */
const TINT_MIN = 0.88;
const TINT_MAX = 1.02;

/** Where the gold heart gives way to the petal, in head-radius units, and the
 *  metres over which it fades out. */
const HEART_EDGE = 0.24;
const HEART_NEAR = 12;
const HEART_FAR = 26;

/** How dark the very centre of the cup runs against the petal tips. A tenth:
 *  enough that a head has an inside and an outside at Follow range, small
 *  enough that it is one blossom and not two tones. */
const CUP_TONE = 0.93;

/** Head-versus-stem switch. Stem vertices stop at 0.995, so this is a hard edge
 *  that no triangle spans. */
const HEAD_EDGE = 0.9975;

/** Buds: where in the seed's own range one falls, how far a bud's petals gather
 *  toward the stem axis, how far they lift, and how far the head tints toward
 *  the stem green. About one bloom in seven. */
const BUD_FROM = 0.84;
const BUD_TO = 0.94;
const BUD_TIGHT = 0.42;
const BUD_RISE = 0.035;
const BUD_GREEN = 0.4;
const BUD_DRAW = 29.3;

/**
 * The wind frame, mirroring scene/grass/grassMaterial.ts: same direction, same
 * 6.5 m/s travel, same coarse octave and churn. Restated rather than imported
 * because grassMaterial does not export them; the cohesion pass should lift one
 * wind module and have both read it.
 */
const WIND_X = 0.76;
const WIND_Z = 0.65;
const WIND_SPEED = 6.5;
const WIND_FREQUENCY = 0.03;
const WIND_EVOLVE = 0.35;

/** Metres the head travels at the calm and gusty ends of the envelope. */
const SWAY_MIN = 0.04;
const SWAY_MAX = 0.11;
/** Sway grows as up^this. Roots are planted. */
const BEND_POWER = 1.8;
/** The small shiver that keeps neighbours from moving as one body. */
const FLUTTER_RATE = 4.4;
const FLUTTER_AMP = 0.013;
/** A leaning stem is shorter, which keeps the arc roughly isometric. */
const BEND_DROP = 0.5;

const TAU = Math.PI * 2;

function makeFlowerMaterial(
  blooms: THREE.InstancedBufferAttribute,
  spins: THREE.InstancedBufferAttribute,
  barkPulse: THREE.DataTexture | null,
): THREE.MeshBasicNodeMaterial {
  const bloom: TSLNode = instancedBufferAttribute(blooms, 'vec4');
  const spin: TSLNode = instancedBufferAttribute(spins, 'vec2');
  const root = bloom.xy;
  const seed = bloom.z;
  const species = bloom.w;

  const up = uv().x;
  const radial = uv().y;
  const onHead = step(float(HEAD_EDGE), up);
  const bud = smoothstep(float(BUD_FROM), float(BUD_TO), fract(seed.mul(float(BUD_DRAW))));

  // --- wind -----------------------------------------------------------------

  const travel = vec2(float(WIND_X), float(WIND_Z)).mul(time.mul(float(WIND_SPEED)));
  const flow = root.sub(travel).mul(float(WIND_FREQUENCY));
  const gust = paintedField(vec3(flow.x, flow.y, time.mul(float(WIND_EVOLVE))), 1.9);
  const envelope = mix(float(SWAY_MIN), float(SWAY_MAX), gust.mul(float(0.5)).add(float(0.5)));

  const stalk = tslMin(up, float(1));
  const bend = pow(stalk, float(BEND_POWER));
  const flutter = sin(time.mul(float(FLUTTER_RATE)).add(seed.mul(float(TAU)))).mul(
    float(FLUTTER_AMP),
  );
  const lean = envelope.add(flutter).mul(bend);

  // The world push, rotated into the instance's own frame: the inverse of the
  // matrix's yaw, with spin = (cos yaw, sin yaw). Without it a drift shivers
  // instead of leaning, because every bloom bends along its own local axis.
  let worldX: TSLNode = float(WIND_X).mul(lean);
  let worldZ: TSLNode = float(WIND_Z).mul(lean);
  let springDrop: TSLNode = float(0);
  if (barkPulse !== null) {
    const pulse: TSLNode = texture(barkPulse, vec2(float(0.5), float(0.5)), 0);
    const offset = root.sub(pulse.xy);
    const distance = tslLength(offset);
    const passed = pulse.z.sub(distance);
    const front = smoothstep(float(-BARK_WAVE_WIDTH), float(0), passed)
      .mul(float(1).sub(smoothstep(float(0), float(BARK_WAVE_WIDTH * 0.45), passed)));
    const overshoot = smoothstep(float(BARK_WAVE_WIDTH * 0.2), float(BARK_WAVE_WIDTH * 0.5), passed)
      .mul(float(1).sub(smoothstep(float(BARK_WAVE_WIDTH * 0.5), float(BARK_WAVE_WIDTH), passed)))
      .mul(float(0.3));
    const response = front.sub(overshoot).mul(pulse.w);
    const away = offset.div(tslMax(distance, float(0.001)));
    worldX = worldX.add(away.x.mul(response).mul(float(0.28)));
    worldZ = worldZ.add(away.y.mul(response).mul(float(0.28)));
    springDrop = response.mul(response).mul(float(-0.16));
  }
  const localX = worldX.mul(spin.x).sub(worldZ.mul(spin.y));
  const localZ = worldX.mul(spin.y).add(worldZ.mul(spin.x));
  const drop = lean.mul(lean).mul(float(BEND_DROP)).negate().add(springDrop);

  // --- the bud ---------------------------------------------------------------

  // A bud is the open head with its petals gathered toward the stem axis and
  // lifted. Nothing but the head moves: `onHead` is a hard 0 or 1.
  const headLocal = positionLocal.sub(vec3(float(0), float(STEM_HEIGHT), float(0)));
  const gather = mix(float(1), float(BUD_TIGHT), bud).sub(float(1));
  const budShift = vec3(
    headLocal.x.mul(gather),
    headLocal.y.mul(gather).add(bud.mul(float(BUD_RISE))),
    headLocal.z.mul(gather),
  ).mul(onHead);

  // --- colour, band by band -------------------------------------------------

  const petal = mixBandBases(bandBases(CREAM), bandBases(BUTTER), species);
  const near = float(1).sub(
    smoothstep(float(HEART_NEAR), float(HEART_FAR), tslLength(positionWorld.sub(cameraPosition))),
  );
  const heartMask = float(1).sub(smoothstep(float(0), float(HEART_EDGE), radial)).mul(near);
  const head = mixBandBases(petal, bandBases(HEART), heartMask);
  let bands = mixBandBases(bandBases(STEM), head, onHead);
  bands = mixBandBases(bands, bandBases(STEM), onHead.mul(bud).mul(float(BUD_GREEN)));

  const tint = mix(float(TINT_MIN), float(TINT_MAX), fract(seed.mul(float(13.7))));
  // Value falls from the petal tip into the cup. Stem vertices carry radial 1,
  // so the stalk is untouched by it.
  const cup = mix(float(CUP_TONE), float(1), radial);
  const material = makeToonMaterial(blendBands(bands, bandWeights()).mul(tint).mul(cup));

  material.positionNode = positionLocal.add(vec3(localX, drop, localZ)).add(budShift);
  // Crossed planes and one-quad stems are seen from behind half the time; three
  // flips the normal for those faces and the far side lights as the far side.
  material.side = THREE.DoubleSide;
  return material;
}

/** How far a bloom rolls onto the ground's own normal, 0..1. Nearly all the way,
 *  so a drift on a slope leans with the slope and its heads cross a band edge
 *  where the grass around them does. */
const SETTLE = 0.85;

const UP = new THREE.Vector3(0, 1, 0);

export function buildFlowerMesh(
  blooms: readonly FlowerBloom[],
  barkPulse: THREE.DataTexture | null = null,
): THREE.InstancedMesh {
  const count = blooms.length;

  const bloomData = new Float32Array(count * 4);
  const spinData = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const item = blooms[i]!;
    bloomData[i * 4] = item.x;
    bloomData[i * 4 + 1] = item.z;
    bloomData[i * 4 + 2] = item.seed;
    bloomData[i * 4 + 3] = item.species;
    spinData[i * 2] = Math.cos(item.yaw);
    spinData[i * 2 + 1] = Math.sin(item.yaw);
  }

  const material = makeFlowerMaterial(
    new THREE.InstancedBufferAttribute(bloomData, 4),
    new THREE.InstancedBufferAttribute(spinData, 2),
    barkPulse,
  );
  const mesh = new THREE.InstancedMesh(buildFlowerGeometry(), material, count);
  const dummy = new THREE.Object3D();
  const settled = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const item = blooms[i]!;
    settled
      .set(
        item.normalX * SETTLE,
        1 - SETTLE + item.normalY * SETTLE,
        item.normalZ * SETTLE,
      )
      .normalize();
    dummy.position.set(item.x, item.groundY, item.z);
    dummy.quaternion.setFromUnitVectors(UP, settled);
    dummy.rotateY(item.yaw);
    // The lean, after the yaw, so it tips the plant in its own facing rather
    // than always toward one compass point.
    dummy.rotateX(item.tilt);
    dummy.scale.setScalar(item.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  // The wind moves the heads a little past the built bounds; the drifts are far
  // smaller than the field, so widening the sphere is cheaper than turning
  // culling off the way the grass has to.
  if (mesh.boundingSphere !== null) mesh.boundingSphere.radius += SWAY_MAX + FLUTTER_AMP;
  return mesh;
}
