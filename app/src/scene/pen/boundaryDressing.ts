// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * What stands ON the line where the pen's earth stops and the pasture starts.
 *
 * The floor material erodes its own edge with three octaves of noise and it is
 * not enough, and the reason is arithmetic rather than tuning: on a 390 pt phone
 * the pen's east edge is about four metres of screen, so a boundary broken at
 * five cycles per metre is broken at a fifth of a pixel. Shader erosion cannot
 * survive a distance where the whole feature is thinner than the noise that is
 * supposed to hide it. What survives is SILHOUETTE - things standing up across
 * the line, occluding it in some places and not others - so this scatters real
 * geometry over it: tufts of pasture that grew back into the trodden ground, and
 * the stones a century of hooves turned up.
 *
 * Two draw calls, both instanced, both built once at mount. Placement is a hash
 * of the walk position (fenceGeometry.ts), so the same tuft grows in the same
 * spot on every reload; there is no Math.random anywhere in the scene.
 */

import * as THREE from 'three/webgpu';
import { makeToonColorMaterial, makeToonMaterial } from '@app/tsl/toon';
import { color, float, mix, positionLocal, smoothstep } from '@app/tsl/nodes';
import { hash01 } from '../fenceGeometry';
import type { GroundSampler } from '../fence/placement';

export interface BoundarySpec {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** The mouth, which stays clear: it is the way in. */
  readonly mouthX: number;
  readonly mouthWidth: number;
  /**
   * The far end of the corridor tongue reaching back to the perimeter gate line.
   * Its two long sides are the last straight tan-against-green edges in the game,
   * and they run right under the gate where a player is looking; they get the
   * same dressing the pen's own boundary does.
   */
  readonly corridorMinZ: number;
}

/** Metres between tufts along the boundary walk, and between stones. */
const TUFT_STRIDE = 0.75;
const STONE_STRIDE = 4.3;
/** How far either side of the line a tuft or a stone may sit. Wider than the
 *  floor's own feather, so the dressing straddles the edge rather than lining
 *  it: a hedge of tufts exactly on the line is a second straight line. */
const SPREAD = 2.9;
/** Tuft size, metres, and how far it varies. Tall enough to break the line at
 *  the beauty camera without becoming a bush. */
const TUFT_HEIGHT = 0.46;
const TUFT_SPREAD = 0.4;
/**
 * How much of its base width a card keeps at the head. A tenth, not a third: at
 * a third the cards of a tuft overlap into a solid cone and the row along the
 * boundary read as a line of paper traffic cones rather than as grass. A blade
 * tapers nearly to a point, and several of them crossing leave sky between.
 */
const BLADE_TAPER = 0.12;
/**
 * How wide a blade is at the root, as a fraction of the tuft's height, and how
 * many blades a tuft is cut from.
 *
 * Tapering to a point was not enough on its own. A card half as wide as the tuft
 * is tall is a PENNANT, and three pennants crossing is a paper cone whatever the
 * head does; the row along the boundary still read as traffic cones. Grass is
 * thin, and the way a tuft gets its mass is by having a lot of thin things in it
 * rather than by having three wide ones. Five blades at a fifth the width cost
 * the same fill and read as grass.
 */
const BLADE_WIDTH = 0.34;
const BLADES = 5;
/**
 * What share of the walk's stations actually grow a tuft, and how far along the
 * line a tuft may slide from its station.
 *
 * A tuft at every station is a row of ticks, and from the classic camera a row of
 * evenly spaced ticks is a dashed line - which is a worse boundary artefact than
 * the ruled one it replaced, because a dash pattern is a thing the eye locks onto.
 * Dropping a third of them and letting the rest wander a full stride either way
 * turns the row into clumps with gaps, which is how grass actually comes back
 * into trodden ground.
 */
const TUFT_KEEP = 0.55;
const TUFT_WANDER = 3.2;
/** Stone radius, metres. Three sizes' worth of range out of one instance, and
 *  the largest of them is now big enough to hold a pixel at Classic. */
const STONE_LOW = 0.12;
const STONE_HIGH = 0.36;

/**
 * The tuft's own colours, and they sit BELOW the pasture in both value and
 * saturation. This is dry verge growth on trodden ground, not lawn: the previous
 * pass took the head to the palette's lit green and got a row of saturated mid
 * green plugs standing in mud, lighter than the pasture behind them, which put
 * the eye on the boundary instead of on the gate. A dry olive climbing to a
 * straw-olive head reads as the thing that grows where nothing is watered, and it
 * lets the pasture stay the greenest mass in the frame.
 *
 * palette candidate: promote in cohesion pass
 */
const TUFT_ROOT = '#3f4526';
const TUFT_MID = '#6b6d3c';
const TUFT_TIP = '#9a9455';
/** How far into the base of a blade the root darkening runs. A tuft with no
 *  shadow at its foot is a green plug pressed into mud; this is the mark that
 *  says the plant is growing out of the ground. */
const ROOT_SHADOW = '#2c3020';
const ROOT_DEPTH = 0.16;
/** The stones: warm grey, a shade off the earth so they are plainly stone, and
 *  lighter than they were - at Classic distance a stone the value of the dirt it
 *  sits in is not a stone, it is nothing.
 *  palette candidate: promote in cohesion pass */
const STONE = '#a4998a';

/** Points along the pen's boundary, with the inward normal at each. */
function walk(spec: BoundarySpec, stride: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const clear = spec.mouthWidth / 2 + 0.7;
  const edge = (
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    nx: number,
    nz: number,
    skipMouth: boolean,
  ): void => {
    const length = Math.hypot(toX - fromX, toZ - fromZ);
    const steps = Math.max(1, Math.round(length / stride));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = fromX + (toX - fromX) * t;
      const z = fromZ + (toZ - fromZ) * t;
      if (skipMouth && Math.abs(x - spec.mouthX) < clear) continue;
      out.push([x, z, nx, nz]);
    }
  };
  edge(spec.minX, spec.minZ, spec.maxX, spec.minZ, 0, 1, true);
  edge(spec.minX, spec.maxZ, spec.maxX, spec.maxZ, 0, -1, false);
  edge(spec.minX, spec.minZ, spec.minX, spec.maxZ, 1, 0, false);
  edge(spec.maxX, spec.minZ, spec.maxX, spec.maxZ, -1, 0, false);
  const half = spec.mouthWidth / 2;
  edge(spec.mouthX - half, spec.corridorMinZ, spec.mouthX - half, spec.minZ, 1, 0, false);
  edge(spec.mouthX + half, spec.corridorMinZ, spec.mouthX + half, spec.minZ, -1, 0, false);
  return out;
}

/**
 * Five thin tapered blades fanned round the root, base at y = 0, head at the
 * blade's own height.
 *
 * The heights are UNEVEN and that is what makes it a tuft rather than a fan: a
 * ring of cards all reaching y = 1 has a flat top edge, and a flat top edge on a
 * green shape is a leaf, not grass. Each blade takes a fixed fraction of the
 * full height, spread over a third, so the silhouette is ragged from every side.
 *
 * The normals lean UP rather than out. A vertical card shaded by its own face
 * normal takes the ramp's shadow band on both sides and every tuft in the row
 * reads as a dark chip; leaning the normal two parts up to one part out puts the
 * cards in the mid and lit bands where the pasture around them already sits, and
 * the blades of one tuft still land on different bands from each other.
 */
function tuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (let c = 0; c < BLADES; c++) {
    const a = (c / BLADES) * Math.PI;
    const dx = Math.cos(a) * BLADE_WIDTH * 0.5;
    const dz = Math.sin(a) * BLADE_WIDTH * 0.5;
    // Uneven heads, cycling rather than random, so the tuft is never flat-topped.
    const top = 0.78 + ((c * 2) % BLADES) / (BLADES - 1) * 0.34;
    // A lean at the head, so a tuft is not a perfectly upright cross.
    const leanX = Math.cos(a + 1.2) * 0.18 * top;
    const leanZ = Math.sin(a + 1.2) * 0.18 * top;
    const nx = -Math.sin(a);
    const nz = Math.cos(a);
    const scale = 1 / Math.hypot(nx * 0.5, 2, nz * 0.5);
    const corners: [number, number, number][] = [
      [-dx, 0, -dz],
      [dx, 0, dz],
      [dx * BLADE_TAPER + leanX, top, dz * BLADE_TAPER + leanZ],
      [-dx * BLADE_TAPER + leanX, top, -dz * BLADE_TAPER + leanZ],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [x, y, z] = corners[i]!;
      positions.push(x, y, z);
      normals.push(nx * 0.5 * scale, 2 * scale, nz * 0.5 * scale);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

function place(
  points: readonly [number, number, number, number][],
  groundY: GroundSampler,
  salt: number,
  size: (h: number) => number,
  sink: number,
  keep: number,
  wander: number,
): { matrices: Float32Array; count: number } {
  const stations = points.filter(([bx, bz]) => hash01(bx, bz, salt + 31) < keep);
  const count = stations.length;
  const matrices = new Float32Array(count * 16);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const [bx, bz, nx, nz] = stations[i]!;
    const across = (hash01(bx, bz, salt) - 0.5) * 2 * SPREAD;
    const along = (hash01(bx, bz, salt + 7) - 0.5) * TUFT_STRIDE * wander;
    const x = bx + nx * across - nz * along;
    const z = bz + nz * across + nx * along;
    const s = size(hash01(bx, bz, salt + 13));
    dummy.position.set(x, groundY(x, z) - s * sink, z);
    dummy.rotation.set(0, hash01(bx, bz, salt + 19) * Math.PI * 2, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    dummy.matrix.toArray(matrices, i * 16);
  }
  return { matrices, count };
}

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placed: { matrices: Float32Array; count: number },
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, placed.count);
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(placed.matrices, 16);
  return mesh;
}

/** The tufts and the stones, as two instanced meshes. */
export function buildBoundaryDressing(
  spec: BoundarySpec,
  groundY: GroundSampler,
): THREE.InstancedMesh[] {
  // Root shadow, root, head: three stops up a blade, the lowest of them a hard
  // dark at the foot so a tuft is bedded into the dirt rather than stood on it.
  const up = positionLocal.y.mul(float(0.95));
  const blade = mix(color(TUFT_ROOT), color(TUFT_TIP), up);
  const midway = mix(blade, color(TUFT_MID), smoothstep(float(0.2), float(0.55), up));
  const bedded = mix(
    color(ROOT_SHADOW),
    midway,
    smoothstep(float(0), float(ROOT_DEPTH), positionLocal.y),
  );
  const tuftMaterial = makeToonMaterial(bedded);
  tuftMaterial.side = THREE.DoubleSide;

  return [
    instanced(
      tuftGeometry(),
      tuftMaterial,
      place(
        walk(spec, TUFT_STRIDE),
        groundY,
        401,
        (h) => TUFT_HEIGHT * (1 - TUFT_SPREAD + h * TUFT_SPREAD * 2),
        0.06,
        TUFT_KEEP,
        TUFT_WANDER,
      ),
    ),
    instanced(
      new THREE.IcosahedronGeometry(1, 0),
      makeToonColorMaterial(STONE),
      place(
        walk(spec, STONE_STRIDE),
        groundY,
        577,
        (h) => STONE_LOW + (STONE_HIGH - STONE_LOW) * h * h,
        0.45,
        0.8,
        1.4,
      ),
    ),
  ];
}
