// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * What the trees throw on the ground.
 *
 * THERE IS NO SHADOW MAP IN THIS SCENE AND THERE IS NOT GOING TO BE ONE. The
 * light is a single authored vector and the ramp is art direction rather than a
 * physical model (tsl/toon.ts), so a shadow here is a DECAL laid on the ground
 * along the sun's own azimuth and built once at mount - the same answer
 * fence/shadowCast.ts and flock/sheepShadow.ts already give.
 *
 * IT IS A MULTIPLY NOW, AND THE FEATHER HAS ITS KNEE THE RIGHT WAY ROUND. Those
 * are the two reasons the last pass's shadows could not be found in a capture,
 * and they compounded. The blend was an alpha lerp toward an authored dark
 * green, which pulls the ground TOWARD that colour from whichever side it was
 * already on - so over the sunlit pasture the pool darkened the grass by a
 * little and over the treeline's own skirt it PALED it. The feather was worse: a
 * smoothstep knee at 0.72 against a uv that runs one at the centre and zero at
 * the rim left the full-strength plateau inside the innermost quarter of the
 * radius and feathered the rest, so the pool averaged a two per cent darkening
 * over its own area. The fence hit the blending wall a pass earlier and fixed it
 * the same way. `SHADE_MUL` is a per-channel gain under one, so the ground can
 * only ever get darker, red is held back hardest so the shade hue-shifts cool
 * rather than grey, and the marks compound where they overlap instead of
 * averaging out.
 *
 * COMPOUNDING IS ALSO WHY THE BELTS FADE. Multiplied marks stack, and the near
 * belt lays several hundred pools inside forty metres of ring; at the oak's
 * strength the whole foot of the wood went to mud. `keep` takes the belts down
 * to about a third by 150 m, which leaves the oak - the one tree a viewer reads
 * as an individual - owning the only full-strength shadow in the frame.
 *
 * ONE POOL PER TREE. Each tree now owns one connected canopy surface, so its
 * shadow reads as one broken mass too. Bramble is excluded: its contact-dark
 * material and grass intersection do the grounding without extra pools.
 *
 * PLUS A CONTACT RING AT EVERY BOLE. The pool proper is thrown clear of the tree
 * by the low sun, which leaves the one place a viewer checks first - where the
 * trunk meets the grass - with nothing in it. The ring is small, round and
 * dense, it does not slant, and it is the difference between a tree standing in
 * the field and a tree stabbed into it.
 *
 * THE LENGTH IS ART-DIRECTED AND IT IS NOT THE PHYSICAL ONE. The sun is 8
 * degrees up, so a true shadow is 7.1 times the caster's height: the oak's crown
 * would throw its mark 130 m across the pasture and out the far fence. A quarter
 * of that reads as a low sun without eating the field, and it keeps the mark
 * inside the Classic frame, which is where it has to be seen.
 *
 * The pools follow the ground they lie on - every rim vertex samples `groundY`
 * for itself - because a flat disc laid over rolling relief buries one edge and
 * floats the other, which is the floating-prop bug class spec/04 closed once.
 */

import * as THREE from 'three/webgpu';
import { SUN_DIRECTION } from '@app/tsl/palette';
import { clamp, float, mix, smoothstep, uv, vec3 } from '@app/tsl/nodes';
import type { Heightfield } from '@app/world/heightfield';
import type { CanopyPlacement, TrunkPlacement } from './placement';
import { hashUnit } from './ringShape';

/** How far out a mass still gets a pool, as a Chebyshev radius in metres.
 *  Past the near belt the understory closes over the ground and a pool would be
 *  overdraw nothing can see. */
const POOL_LIMIT = 178;
/** Shadow reach as a multiple of the mass's height above the ground. */
const SLANT = 1.9;
/** How much the pool stretches along the sun's bearing, as a multiple of that
 *  same height, on top of the mass's own width. */
const STRETCH = 0.5;
/** Across the bearing the pool is a little narrower than the mass: a crown seen
 *  from a low sun is foreshortened across the light. */
const ACROSS = 0.88;
/** Height above the sampled ground, metres. Enough to clear the terrain's own
 *  triangles, low enough not to float. */
const LIFT = 0.1;
/** Per-pool density. Held well under the fence's 0.85 because neighbouring
 * tree pools compound inside a copse while one pool stays gentle at its ragged
 * edge. */
const DENSITY = 0.62;
/** How much of its density a pool keeps out at the belts. The near belt alone
 *  lays several hundred overlapping pools inside forty metres of ring, and a
 *  multiply compounds, so at full strength the wood's own feet went to mud. The
 *  boundary oak keeps all of it; the belts start losing density
 *  at `FADE_NEAR` and are down to `DEEP_KEEP` by `FADE_FAR`. */
const FADE_NEAR = 100;
const FADE_FAR = 150;
const DEEP_KEEP = 0.34;
/** The contact ring at a bole, as a multiple of the trunk's own diameter, and
 *  its density. Small and dense: this is the mark that says the tree is
 *  touching, so it has to be readable at the Follow camera on its own. */
const CONTACT_SPAN = 2.15;
const CONTACT_DENSITY = 0.9;
/** A mass this far above the ground or less throws nothing worth drawing. */
const MIN_RISE = 1.4;

/**
 * The shade gain, shared in spirit with fence/shadowCast.ts: a per-channel
 * multiplier under one, red held back hardest so grass in shade shifts toward
 * cool blue-green rather than toward the grey mud spec/05 forbids.
 *
 * palette candidate: promote in cohesion pass
 */
const SHADE_MUL = [0.52, 0.63, 0.66] as const;

/** Rim vertices per pool. Twelve is enough that the outline is a curve and few
 *  enough that the per-vertex rag reads as a ragged edge rather than as noise. */
const RIM = 12;
const RAG_STREAM = 4457;

/** The sun's azimuth on the ground, pointing AWAY from the sun. */
const AZIMUTH = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.z);
const AWAY_X = -SUN_DIRECTION.x / AZIMUTH;
const AWAY_Z = -SUN_DIRECTION.z / AZIMUTH;

interface Fan {
  readonly positions: number[];
  readonly uvs: number[];
  readonly index: number[];
}

/**
 * One elliptical fan: a centre vertex and a ring of rim vertices, with `uv.x`
 * carrying how dense the shadow is there. The rim radius is ragged two ways - a
 * per-vertex hash and a two-lobed swell - so the outline never closes into the
 * clean ellipse the masses above it are being cut out of.
 */
function fanAt(
  fan: Fan,
  field: Heightfield,
  seed: number,
  cx: number,
  cz: number,
  along: number,
  across: number,
  density: number,
): void {
  // uv.x runs 1 at the centre to 0 at the rim and is what the feather reads;
  // uv.y carries this caster's own density, so one material serves the broad
  // soft pools and the small dense contact rings without a second draw call.
  const centre = fan.positions.length / 3;
  fan.positions.push(cx, field.groundY(cx, cz) + LIFT, cz);
  fan.uvs.push(1, density);

  const lobe = hashUnit(seed, RAG_STREAM + 1) * Math.PI * 2;
  for (let r = 0; r < RIM; r++) {
    const angle = (r / RIM) * Math.PI * 2;
    const rag =
      (0.8 + 0.2 * hashUnit(seed * 31 + r, RAG_STREAM)) * (1 + 0.12 * Math.sin(angle * 2 + lobe));
    // The ellipse is laid out in the sun's own frame: `along` runs down the
    // bearing, `across` runs square to it.
    const u = Math.cos(angle) * along * rag;
    const v = Math.sin(angle) * across * rag;
    const x = cx + AWAY_X * u - AWAY_Z * v;
    const z = cz + AWAY_Z * u + AWAY_X * v;
    fan.positions.push(x, field.groundY(x, z) + LIFT, z);
    fan.uvs.push(0, density);
  }
  for (let r = 0; r < RIM; r++) {
    fan.index.push(centre, centre + 1 + r, centre + 1 + ((r + 1) % RIM));
  }
}

/** How much density a caster at this Chebyshev radius keeps. */
function keep(x: number, z: number): number {
  const radius = Math.max(Math.abs(x), Math.abs(z));
  const t = Math.min(1, Math.max(0, (radius - FADE_NEAR) / (FADE_FAR - FADE_NEAR)));
  return 1 + (DEEP_KEEP - 1) * t;
}

/** The mark one crown mass throws, offset down the sun's bearing. */
function pool(fan: Fan, field: Heightfield, seed: number, mass: CanopyPlacement): void {
  const rise = mass.y + mass.height * 0.5 - field.groundY(mass.x, mass.z);
  if (rise < MIN_RISE) return;
  fanAt(
    fan,
    field,
    seed,
    mass.x + AWAY_X * rise * SLANT,
    mass.z + AWAY_Z * rise * SLANT,
    mass.width * 0.5 + rise * STRETCH,
    mass.depth * 0.5 * ACROSS,
    DENSITY * keep(mass.x, mass.z),
  );
}

/** The ring where a bole meets the grass. Round rather than slanted: this one
 *  is contact occlusion, not a cast shadow. */
function contact(fan: Fan, field: Heightfield, seed: number, bole: TrunkPlacement): void {
  const span = bole.diameter * CONTACT_SPAN;
  fanAt(fan, field, seed, bole.x, bole.z, span, span, CONTACT_DENSITY * keep(bole.x, bole.z));
}

/**
 * Every shadow the treeline throws, as one mesh and one draw call. Built at
 * mount from the same placements the crowns and boles are built from, so a tree
 * cannot move without its marks moving with it.
 */
export function buildTreeShadows(
  canopies: readonly CanopyPlacement[],
  trunks: readonly TrunkPlacement[],
  field: Heightfield,
): THREE.Mesh {
  const fan: Fan = { positions: [], uvs: [], index: [] };
  for (let i = 0; i < canopies.length; i++) {
    const mass = canopies[i]!;
    if (Math.max(Math.abs(mass.x), Math.abs(mass.z)) > POOL_LIMIT) continue;
    pool(fan, field, i, mass);
  }
  for (let i = 0; i < trunks.length; i++) {
    const bole = trunks[i]!;
    // Boughs run through the air; only something standing on the ground has a
    // contact ring, and `shade` is already the flag for which is which.
    if (bole.shade === 1) continue;
    if (Math.max(Math.abs(bole.x), Math.abs(bole.z)) > POOL_LIMIT) continue;
    contact(fan, field, i + 7919, bole);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(fan.positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(fan.uvs, 2));
  geometry.setIndex(fan.index);

  const material = new THREE.MeshBasicNodeMaterial();
  // A plateau through the middle and a feather over the outer quarter, and the
  // 0.28 is the whole reason the last pass's pools could not be found in a
  // capture. `uv.x` falls linearly from one at the centre to zero at the rim, so
  // a smoothstep with its knee at 0.72 puts the plateau inside the innermost
  // quarter of the RADIUS - about eight per cent of the area - and feathers the
  // other ninety-two. Averaged over the ellipse that is a two per cent
  // darkening, which is nothing, which is what the frames showed. With the knee
  // at 0.28 the plateau owns three quarters of the radius and the feather is the
  // outer quarter, which is the penumbra a low sun actually gives.
  const amount = clamp(smoothstep(float(0), float(0.28), uv().x).mul(uv().y), float(0), float(1));
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
  // The pools ring the whole field, so a bounding volume is the world.
  mesh.frustumCulled = false;
  // With the fence's marks, and before the animals' own decals: a sheep
  // standing in the oak's shade still has to read as a sheep.
  mesh.renderOrder = -1;
  return mesh;
}
