// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/** The Kiln farmhouse: how the baked GLB becomes this game's welded buffers. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFarmhouse } from '@app/scene/farmhouse/cluster';
import { parseKilnHouse, type KilnHouse } from '@app/scene/farmhouse/kilnHouse';
import { HOUSE_AT, KILN_STACK } from '@app/scene/farmhouse/plan';
import { FARMHOUSE_SOURCE } from '@app/scene/farmhouse/source';

const GLB = new URL('../assets/house/farmhouse.glb', import.meta.url);
const LEVEL = -0.6;
const flat = (): number => LEVEL;

async function parsed(): Promise<KilnHouse> {
  const bytes = readFileSync(GLB);
  return parseKilnHouse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

const vertices = (position: ArrayLike<number>): number => position.length / 3;

describe('Kiln farmhouse import', () => {
  it('names a source the game can draw', () => {
    expect(['procedural', 'kiln']).toContain(FARMHOUSE_SOURCE);
  });

  it('welds the 282 baked meshes into one triangle list per band set', async () => {
    const kiln = await parsed();
    expect(kiln.sourceNodes).toBe(282);
    expect(kiln.triangles).toBe(3440);
    expect(Object.keys(kiln.parts).sort()).toEqual(
      ['dress', 'lamp', 'opening', 'roof', 'timber', 'wall'],
    );
    let triangles = 0;
    for (const part of Object.values(kiln.parts)) {
      triangles += vertices(part.positions) / 3;
      expect(part.normals.length).toBe(part.positions.length);
      expect(part.uvs.length / 2).toBe(vertices(part.positions));
      for (const value of [...part.positions, ...part.normals, ...part.uvs]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
    expect(triangles).toBe(kiln.triangles);
  });

  it('rebuilds the channels the shipped materials read', async () => {
    const { parts } = await parsed();
    // Walls: uv.x 0 and a distance below the eaves, never negative.
    for (let i = 0; i < parts.wall!.uvs.length; i += 2) {
      expect(parts.wall!.uvs[i]).toBe(0);
      expect(parts.wall!.uvs[i + 1]).toBeGreaterThanOrEqual(0);
      expect(parts.wall!.uvs[i + 1]).toBeLessThanOrEqual(5.8 + 1e-6);
    }
    // Dressings: the plinth stone is selector 0 and the chimney masonry is 1.
    const selectors = new Set<number>();
    for (let i = 0; i < parts.dress!.uvs.length; i += 2) selectors.add(parts.dress!.uvs[i]!);
    expect([...selectors].sort()).toEqual([0, 1]);
    // Slate: metres up the 7.37 m slope, never below the eave line or past it.
    for (let i = 1; i < parts.roof!.uvs.length; i += 2) {
      expect(parts.roof!.uvs[i]).toBeGreaterThanOrEqual(0);
      expect(parts.roof!.uvs[i]).toBeLessThanOrEqual(7.37);
    }
  });
});

describe('Kiln farmhouse in the cluster', () => {
  it('keeps the draw count and puts the house on the procedural pad', async () => {
    const kiln = await parsed();
    const procedural = buildFarmhouse(flat);
    const welded = buildFarmhouse(flat, kiln);
    expect(Object.keys(welded.geometry).sort()).toEqual(Object.keys(procedural.geometry).sort());

    // The walls buffer held only the house and the wing, so it becomes the Kiln
    // limewash exactly; every other buffer gains the baked triangles on top of
    // what the barn and the log stack already put in it.
    const count = (g: typeof welded.geometry, key: keyof typeof welded.geometry): number =>
      g[key].getAttribute('position').count;
    expect(count(welded.geometry, 'wall')).toBe(vertices(kiln.parts.wall!.positions));
    expect(count(welded.geometry, 'barn')).toBe(count(procedural.geometry, 'barn'));
    expect(count(welded.geometry, 'smoke')).toBe(count(procedural.geometry, 'smoke'));

    // Placed with the cluster: the wall's bounds centre on the pad.
    const sphere = welded.geometry.wall.boundingSphere!;
    expect(Math.hypot(sphere.center.x - HOUSE_AT.x, sphere.center.z - HOUSE_AT.z)).toBeLessThan(2);
    expect(welded.level).toBe(LEVEL);
  });

  it('starts the smoke at the baked stack, not the procedural one', async () => {
    const kiln = await parsed();
    const smoke = (kiln_: KilnHouse | null): number[] => {
      const geometry = buildFarmhouse(flat, kiln_).geometry.smoke;
      const p = geometry.getAttribute('position');
      return [p.getX(0), p.getY(0), p.getZ(0)];
    };
    const baked = smoke(kiln);
    const authored = smoke(null);
    expect(baked).not.toEqual(authored);
    const sin = Math.sin(1.1);
    const cos = Math.cos(1.1);
    const { x, y, z } = KILN_STACK.mouth;
    expect(baked[0]).toBeCloseTo(HOUSE_AT.x + x * cos + z * sin, 4);
    expect(baked[1]).toBeCloseTo(LEVEL + y, 4);
    expect(baked[2]).toBeCloseTo(HOUSE_AT.z - x * sin + z * cos, 4);
  });
});
