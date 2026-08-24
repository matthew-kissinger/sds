// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import terrainManifest from '../assets/terrain/manifest.json';
import { HOME_FIELD } from '@sim/field';
import { BARN_OPENINGS, HOUSE_OPENINGS, WING_OPENINGS } from '../app/src/scene/farmhouse/openings';
import {
  BARN,
  BARN_AT,
  BARN_YAW,
  HOUSE,
  WING,
} from '../app/src/scene/farmhouse/plan';

function footprintHalfExtents(
  length: number,
  width: number,
  yaw: number,
): { x: number; z: number } {
  const sin = Math.abs(Math.sin(yaw));
  const cos = Math.abs(Math.cos(yaw));
  return {
    x: cos * (length / 2) + sin * (width / 2),
    z: sin * (length / 2) + cos * (width / 2),
  };
}

describe('farmstead composition', () => {
  it('keeps the enlarged buildings substantial at gameplay distance', () => {
    expect(HOUSE.length).toBeGreaterThanOrEqual(18);
    expect(HOUSE.ridgeHeight).toBeGreaterThanOrEqual(10);
    expect(WING.length).toBeGreaterThanOrEqual(7.5);
    expect(BARN.length).toBeGreaterThanOrEqual(16);
    expect(BARN.width).toBeGreaterThanOrEqual(10);
    expect(BARN.ridgeHeight).toBeGreaterThanOrEqual(10);
  });

  it('puts the entire barn north of the pasture with a visible grass interval', () => {
    const half = footprintHalfExtents(BARN.length, BARN.width, BARN_YAW);
    const nearestBarnEdge = BARN_AT.z - half.z;
    expect(nearestBarnEdge - HOME_FIELD.pen.maxZ).toBeGreaterThanOrEqual(6);
    expect(BARN_AT.x).toBeGreaterThan(HOME_FIELD.pen.minX);
    expect(BARN_AT.x).toBeLessThan(HOME_FIELD.pen.maxX);
  });

  it('contains the barn footprint on its dedicated deterministic terrain pad', () => {
    const pad = terrainManifest.pads.find((candidate) => candidate.id === 'barn');
    expect(pad).toBeDefined();
    const half = footprintHalfExtents(BARN.length, BARN.width, BARN_YAW);
    expect(BARN_AT.x - half.x).toBeGreaterThan(pad!.minX);
    expect(BARN_AT.x + half.x).toBeLessThan(pad!.maxX);
    expect(BARN_AT.z - half.z).toBeGreaterThan(pad!.minZ);
    expect(BARN_AT.z + half.z).toBeLessThan(pad!.maxZ);
  });

  it('keeps every facade opening on the resized wall that owns it', () => {
    expect(HOUSE_OPENINGS.filter((opening) => opening.face === 'plusX').every((opening) => opening.wall === HOUSE.length / 2)).toBe(true);
    expect(HOUSE_OPENINGS.filter((opening) => opening.face === 'minusZ').every((opening) => opening.wall === -HOUSE.width / 2)).toBe(true);
    expect(WING_OPENINGS.find((opening) => opening.face === 'plusX')?.wall).toBe(WING.length / 2);
    expect(WING_OPENINGS.find((opening) => opening.face === 'plusZ')?.wall).toBe(WING.width / 2);
    expect(BARN_OPENINGS.find((opening) => opening.face === 'minusZ')?.wall).toBe(-BARN.width / 2);
    expect(BARN_OPENINGS.find((opening) => opening.face === 'plusX')?.wall).toBe(BARN.length / 2);
  });
});
