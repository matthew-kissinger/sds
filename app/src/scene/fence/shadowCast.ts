// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * What the fence throws on the ground. Until this pass it threw nothing, and
 * that alone is what made 800 m of timber read as pasted onto the field rather
 * than standing in it: every other solid in the frame - sheep, dog, buildings -
 * has a mark under it, and the one object that spans the whole horizon did not.
 *
 * There is no shadow map in this scene and there is not going to be one. The
 * light is a single authored vector and the ramp is art direction, not a physical
 * model (tsl/toon.ts), so a shadow here is a DECAL: geometry laid on the ground
 * along the sun's own azimuth, built once at mount, drawn in one blended pass.
 * The flock and the dog already sit in the grass this way.
 *
 * THE LENGTH IS ART-DIRECTED AND THE NUMBER IS NOT THE PHYSICAL ONE. The sun is
 * 8 degrees up, so a true shadow is 7.1 times the height of the thing casting it:
 * a 1.9 m post would throw 13.5 m and the three rail bands would lay a 40 m wide
 * dark apron round the entire inside of the field. At 4.6 the same post throws
 * 8.7 m - long enough to rake right across the gate path, short enough that the
 * pasture is still pasture - and the pier throws 13 m, the longest bar in the
 * frame, pointing straight at the landmark.
 *
 * Every quad follows the ground it lies on: four stations under a post, three
 * along a bay, each sampling `groundY` at its own corners. A single flat plane
 * laid over rolling relief buries one end and floats the other, which is the
 * floating-prop bug class spec/04 closed once already.
 */

import * as THREE from 'three/webgpu';
import { SUN_DIRECTION } from '@app/tsl/palette';
import { abs, clamp, float, mix, smoothstep, uv, vec3 } from '@app/tsl/nodes';
import type { GroundSampler, PostPlacement, RailPlacement } from './placement';

/** Shadow length as a multiple of the caster's height. See the note above. */
const LENGTH = 3.9;
/** Height above the sampled ground, metres. Enough to clear the terrain's own
 *  triangles and the pen floor laid over them, low enough not to float. */
const LIFT = 0.09;
/** How far a post shadow widens between its foot and its tip, as a fraction of
 *  the post's girth: a penumbra, and the reason a bar reads as light falling
 *  rather than as a painted stripe. */
const POST_NEAR = 0.46;
const POST_FAR = 0.92;
/** The contact pool at a foot, as a multiple of girth. Small, dense, and the
 *  thing that actually says the post is touching. */
const CONTACT = 1.1;
/** Overall density. Everything else is a fraction of this. */
const DENSITY = 0.85;
/**
 * THE SHADOW IS A MULTIPLY, AND THAT IS A CORRECTNESS FIX RATHER THAN A TASTE
 * ONE. It used to be an alpha blend toward an authored dark green, which does
 * exactly what a blend does: it pulls the destination TOWARD that colour from
 * whichever side it was on. Over pasture already darker than the tone - shaded
 * grass, the pen's earth, the treeline's skirt - the bar therefore rendered
 * PALER than the ground it lay on, and 800 m of fence came with 800 m of what
 * read as lens haze streaked across the field.
 *
 * A multiply cannot do that. `SHADE_MUL` is a per-channel gain under one, so the
 * ground can only ever get darker, and red is held back hardest so the shadow
 * hue-shifts toward cool blue-green rather than toward grey (spec/05: saturated
 * shadows, never mud). Both backends of WebGPURenderer honour CustomBlending, so
 * this stays one material and one source.
 */
const SHADE_MUL = [0.56, 0.68, 0.7] as const;
/** Thinnest bar that gets a cast shadow, metres. */
const MIN_CASTER = 0.1;

/** The sun's azimuth on the ground, pointing AWAY from the sun. */
const AWAY_X = -SUN_DIRECTION.x / Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.z);
const AWAY_Z = -SUN_DIRECTION.z / Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.z);

interface Strip {
  readonly positions: number[];
  readonly uvs: number[];
}

/**
 * One quad band. Each station carries the two edges of the band and how dense it
 * is there; `u` is density and `v` runs across the band, which is what the
 * material feathers on.
 */
function station(
  strip: Strip,
  groundY: GroundSampler,
  lx: number,
  lz: number,
  rx: number,
  rz: number,
  density: number,
): void {
  strip.positions.push(lx, groundY(lx, lz) + LIFT, lz, rx, groundY(rx, rz) + LIFT, rz);
  strip.uvs.push(density, 0, density, 1);
}

/** Two triangles between station `i` and station `i + 1` of a strip. */
function weave(index: number[], i: number): void {
  const a = i * 2;
  index.push(a, a + 1, a + 3, a, a + 3, a + 2);
}

function postShadow(
  strip: Strip,
  index: number[],
  groundY: GroundSampler,
  post: PostPlacement,
): void {
  const first = strip.positions.length / 3;
  const reach = post.height * LENGTH;
  const perpX = -AWAY_Z;
  const perpZ = AWAY_X;
  const steps = 4;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = post.x + AWAY_X * reach * t;
    const cz = post.z + AWAY_Z * reach * t;
    const half = post.girth * (POST_NEAR + (POST_FAR - POST_NEAR) * t);
    // Dense at the foot, gone by the tip: the far end of a long shadow at this
    // sun angle is all penumbra.
    const density = Math.max(0, 1 - t * t * 1.15);
    station(strip, groundY, cx - perpX * half, cz - perpZ * half, cx + perpX * half, cz + perpZ * half, density);
  }
  for (let s = 0; s < steps; s++) weave(index, first / 2 + s);

  // The contact pool, as its own two-station strip square on the foot.
  const pool = post.girth * CONTACT;
  const poolFirst = strip.positions.length / 3;
  for (let s = 0; s <= 1; s++) {
    const along = (s - 0.5) * 2 * pool;
    const cx = post.x + AWAY_X * along;
    const cz = post.z + AWAY_Z * along;
    station(strip, groundY, cx - perpX * pool, cz - perpZ * pool, cx + perpX * pool, cz + perpZ * pool, 1);
  }
  weave(index, poolFirst / 2);
}

function railShadow(
  strip: Strip,
  index: number[],
  groundY: GroundSampler,
  rail: RailPlacement,
): void {
  const first = strip.positions.length / 3;
  const steps = 3;
  const baseA = groundY(rail.ax, rail.az);
  const baseB = groundY(rail.bx, rail.bz);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = rail.ax + (rail.bx - rail.ax) * t;
    const cz = rail.az + (rail.bz - rail.az) * t;
    const high = rail.ay + (rail.by - rail.ay) * t - (baseA + (baseB - baseA) * t);
    if (high <= 0) return;
    const near = (high - rail.thickness / 2) * LENGTH;
    const far = (high + rail.thickness / 2) * LENGTH;
    // The higher the bar, the softer its shadow: a cap rail at 1.4 m is nearly
    // five metres from the ground it marks.
    const density = Math.max(0.28, 0.95 - high * 0.24);
    station(
      strip,
      groundY,
      cx + AWAY_X * near,
      cz + AWAY_Z * near,
      cx + AWAY_X * far,
      cz + AWAY_Z * far,
      density,
    );
  }
  for (let s = 0; s < steps; s++) weave(index, first / 2 + s);
}

/**
 * Every shadow the fence throws, as one mesh and one draw call. Built at mount
 * from the same placements the timber is built from, so a post that leans and a
 * bay that pitches carry their marks with them.
 */
export function buildFenceShadow(
  posts: readonly PostPlacement[],
  rails: readonly RailPlacement[],
  groundY: GroundSampler,
): THREE.Mesh {
  const strip: Strip = { positions: [], uvs: [] };
  const index: number[] = [];
  for (const post of posts) postShadow(strip, index, groundY, post);
  for (const rail of rails) {
    // Joinery pegs and straps are too small to throw a mark a camera can resolve,
    // and a thousand sub-pixel quads is a thousand quads of nothing.
    if (rail.thickness < MIN_CASTER) continue;
    railShadow(strip, index, groundY, rail);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(strip.positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(strip.uvs, 2));
  geometry.setIndex(index);

  const material = new THREE.MeshBasicNodeMaterial();
  const across = abs(uv().y.sub(float(0.5))).mul(float(2));
  const feather = float(1).sub(smoothstep(float(0.5), float(1), across));
  const amount = clamp(uv().x.mul(feather).mul(float(DENSITY)), float(0), float(1));
  // The colour IS the multiplier: 1 where the shadow has gone, SHADE_MUL where
  // it is full. Alpha stays at one, because the blend is dst * src rather than a
  // lerp toward src.
  material.colorNode = mix(vec3(1, 1, 1), vec3(...SHADE_MUL), amount);
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.CustomBlending;
  material.blendSrc = THREE.DstColorFactor;
  material.blendDst = THREE.ZeroFactor;
  material.blendEquation = THREE.AddEquation;

  const mesh = new THREE.Mesh(geometry, material);
  // The fence bounds the world, so its bounding volume IS the world; culling it
  // per frame is work with one possible answer. It draws before the animals'
  // own decals so a sheep standing in the fence's shadow still reads as a sheep.
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
