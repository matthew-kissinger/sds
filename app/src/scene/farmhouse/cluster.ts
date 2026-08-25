// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The build. One function walks the plan in farmhouse/plan.ts and fills every
 * buffer the component mounts; the component itself just hands them to meshes.
 *
 * WHAT GOES IN WHICH BUFFER IS A MATERIAL DECISION, not a structural one. Walls,
 * house slate, barn boards, timber, dressings, dark openings, lit openings,
 * cast shadow, outline hull and smoke are ten draw calls, and the
 * split exists so each takes its own band set. Anything that would fit an
 * existing band set goes into that buffer rather than earning a new one.
 *
 * The dimensions, the yaw and every placement live next door in plan.ts, with the
 * arithmetic that produced them.
 */

import * as THREE from 'three/webgpu';
import { Shell, offsetStand, stand, type Stand } from './shell';
import type { GroundSample } from './shadows';
import { gableWalls, leanTo, logStack, openingPanel } from './parts';
import { BASE_X as CHIMNEY_HALF_X, BASE_Z as CHIMNEY_HALF_Z, chimney, potLocal } from './chimney';
import { roofHull } from './hull';
import { BARN_OPENINGS, HOUSE_OPENINGS, WING_OPENINGS } from './openings';
import { courseRoof, roofSurfaceLocal, type RoofSpec } from './roof';
import { buildSmoke } from './smoke';
import { LENGTH, boxCaster, buildShadows, type Caster } from './shadows';
import {
  BARN,
  BARN_AT,
  BARN_YAW,
  CHIMNEY_AT,
  CHIMNEY_DOWN,
  CHIMNEY_RISE,
  HOUSE,
  HOUSE_AT,
  LEANTO_AT,
  LEANTO_HALF,
  LOGS_AT,
  LOGS_YAW,
  WING,
  WING_ALONG,
  WING_OUT,
  WING_SKEW,
  YAW,
} from './plan';

export interface FarmhouseGeometry {
  readonly wall: THREE.BufferGeometry;
  readonly roof: THREE.BufferGeometry;
  readonly barn: THREE.BufferGeometry;
  readonly timber: THREE.BufferGeometry;
  readonly dress: THREE.BufferGeometry;
  readonly opening: THREE.BufferGeometry;
  readonly lamp: THREE.BufferGeometry;
  readonly shadow: THREE.BufferGeometry;
  readonly outline: THREE.BufferGeometry;
  readonly smoke: THREE.BufferGeometry;
}

export interface Farmstead {
  readonly geometry: FarmhouseGeometry;
  /** The pad the cluster stands on. The limewash reads it to find a wall's foot. */
  readonly level: number;
}

/** A base course under a building, so it sits on the ground rather than in it. */
function plinth(shell: Shell, place: Stand, spec: RoofSpec): void {
  shell.taperedBox(
    place,
    [0, 0.2, 0],
    [spec.length / 2 + 0.22, 0.2, spec.width / 2 + 0.22],
    [spec.length / 2 + 0.1, 0.2, spec.width / 2 + 0.1],
  );
}

/** A stand's local point in world coordinates. */
function toWorld(place: Stand, p: readonly [number, number, number]): [number, number, number] {
  const sin = Math.sin(place.yaw);
  const cos = Math.cos(place.yaw);
  return [place.x + p[0] * cos + p[2] * sin, place.y + p[1], place.z - p[0] * sin + p[2] * cos];
}

/** The three marks the cluster lays on the grass under this sun. */
function buildCasters(house: Stand, wing: Stand, barn: Stand): readonly Caster[] {
  const stack = toWorld(house, [CHIMNEY_AT, 0, CHIMNEY_DOWN]);
  const homestead = boxCaster(house.x, house.z, house.yaw, HOUSE.length / 2, HOUSE.width / 2, HOUSE.ridgeHeight);
  const wingBox = boxCaster(wing.x, wing.z, wing.yaw, WING.length / 2, WING.width / 2, WING.ridgeHeight);
  return [
    // House and wing throw one mark. Two overlapping slabs would double-darken
    // where they cross, because the blend is alpha and not multiply.
    { points: [...homestead.points, ...wingBox.points], from: 0, to: homestead.to },
    boxCaster(barn.x, barn.z, barn.yaw, BARN.length / 2, BARN.width / 2, BARN.ridgeHeight),
    // The stack's finger, starting where the roof's mark runs out.
    boxCaster(
      stack[0],
      stack[2],
      house.yaw,
      CHIMNEY_HALF_X,
      CHIMNEY_HALF_Z,
      HOUSE.ridgeHeight + CHIMNEY_RISE + 0.6,
      HOUSE.ridgeHeight * LENGTH,
    ),
  ];
}

/**
 * Build the whole cluster against the one `groundY` every ground-sitting object
 * in the game reads (spec/04). The pad is flat, so the buildings take a single
 * sample; the cast shadows leave the pad, so those sample per
 * vertex.
 */
export function buildFarmhouse(sample: GroundSample): Farmstead {
  const wall = new Shell();
  const roof = new Shell();
  const barnShell = new Shell();
  const timber = new Shell();
  const dress = new Shell();
  const opening = new Shell();
  const lamp = new Shell();
  const hull = new Shell();

  const level = sample(HOUSE_AT.x, HOUSE_AT.z);
  const house = stand(HOUSE_AT.x, level, HOUSE_AT.z, YAW);
  const wing = offsetStand(house, WING_ALONG, WING_OUT, WING_SKEW);
  // The barn owns a second flattened pad behind the pasture. Sampling it here
  // keeps both structures planted without pretending the two pads share height.
  const barn = stand(BARN_AT.x, sample(BARN_AT.x, BARN_AT.z), BARN_AT.z, BARN_YAW);
  const houseSurface = roofSurfaceLocal(HOUSE);

  gableWalls(wall, house, HOUSE, { hipEnd: 1 });
  courseRoof(roof, house, HOUSE, { hipEnd: 1 });
  leanTo(roof, timber, house, HOUSE, LEANTO_AT, LEANTO_HALF);

  // The wing's -x end is buried in the range: no gable, no verge, nothing to
  // surface through the main slope.
  gableWalls(wall, wing, WING, { skipEnd: -1 });
  courseRoof(roof, wing, WING, { skipEnd: -1 });

  gableWalls(barnShell, barn, BARN);
  courseRoof(roof, barn, BARN, { tag: 1 });

  dress.mark(0, 0);
  plinth(dress, house, HOUSE);
  plinth(dress, wing, WING);
  plinth(dress, barn, BARN);
  chimney(dress, house, HOUSE, CHIMNEY_AT, CHIMNEY_DOWN, CHIMNEY_RISE, houseSurface);

  for (const [place, list] of [
    [house, HOUSE_OPENINGS],
    [wing, WING_OPENINGS],
    [barn, BARN_OPENINGS],
  ] as const) {
    for (const o of list) openingPanel(o.lit === true ? lamp : opening, place, o);
  }

  logStack(timber, stand(LOGS_AT.x, level, LOGS_AT.z, LOGS_YAW), [0, 0]);

  // The outline hull is a plain envelope of the same masses. See
  // farmhouse/hull.ts for why it is not the real geometry.
  gableWalls(hull, house, HOUSE, { hipEnd: 1 });
  roofHull(hull, house, HOUSE, { hipEnd: 1 });
  gableWalls(hull, wing, WING);
  roofHull(hull, wing, WING);
  gableWalls(hull, barn, BARN);
  roofHull(hull, barn, BARN);
  chimney(hull, house, HOUSE, CHIMNEY_AT, CHIMNEY_DOWN, CHIMNEY_RISE, houseSurface);

  const pot = toWorld(house, potLocal(HOUSE, CHIMNEY_AT, CHIMNEY_DOWN, CHIMNEY_RISE));

  return {
    level,
    geometry: {
      wall: wall.build()!,
      roof: roof.build()!,
      barn: barnShell.build()!,
      timber: timber.build()!,
      dress: dress.build()!,
      opening: opening.build()!,
      lamp: lamp.build()!,
      shadow: buildShadows(buildCasters(house, wing, barn), sample),
      outline: hull.build()!,
      smoke: buildSmoke(pot[0], pot[1], pot[2]),
    },
  };
}

/** Where the cluster is, for the one `groundY` sample it needs. */
export const FARMHOUSE_CENTRE = HOUSE_AT;
