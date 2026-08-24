// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The grass interaction field: the CPU half of "grass bends around every body
 * and wakes behind them".
 *
 * The bending itself is a vertex shader and is judged in a picture. What is
 * testable here is everything the picture depends on and cannot show:
 *
 *  - the carried feel constants from spec/06, unchanged;
 *  - the grid covering every metre of ground a body can stand on;
 *  - the four-slot cap actually capping, and the DOG never losing its slot;
 *  - the trail dropping distance-spaced ghosts, never emitting while still,
 *    ageing them, and retiring them only after
 *    the recovery spring has stopped pushing (an early retirement is a pop);
 *  - two hundred sheep and a dog fitting in the texture that has to hold them.
 */

import { describe, expect, it } from 'vitest';
import { springResponse } from '@app/scene/grass/grassMaterial';
import {
  DOG_FOOTPRINT,
  DOG_GHOSTS,
  GHOST_BIRTH_DURATION,
  GRID_CELL,
  GRID_CELLS,
  GRID_HALF_EXTENT,
  INTERACTION_RADIUS,
  INTERACTION_STRENGTH,
  KIND_OFFSET,
  MAX_AGE,
  MAX_INTERACTORS,
  MIN_GHOST_DISTANCE,
  SHEEP_FOOTPRINT,
  SHEEP_GHOSTS,
  SHEEP_SCALE,
  SLOTS,
  createInteractionField,
} from '@app/scene/grass/interactionField';
import { CpuDeterministicSim, SHEEP_STATE_FLAG } from '@sim/FlockSim';
import { HOME_FIELD } from '@sim/field';
import grassManifest from '../assets/grass/manifest.json';

/** A sim whose bodies this test places by hand. Real class, real buffers: the
 *  field reads presentation arrays and `state.dogs[0]`, and both are writable. */
function makeSim(sheepCount: number): CpuDeterministicSim {
  const sim = new CpuDeterministicSim(HOME_FIELD, sheepCount, 1234);
  sim.stateFlags.fill(SHEEP_STATE_FLAG.penned);
  sim.positions.fill(0);
  sim.headings.fill(0);
  return sim;
}

function placeSheep(sim: CpuDeterministicSim, i: number, x: number, z: number, heading = 0): void {
  sim.positions[i * 2] = x;
  sim.positions[i * 2 + 1] = z;
  sim.headings[i] = heading;
  sim.stateFlags[i] = SHEEP_STATE_FLAG.active;
}

function placeDog(sim: CpuDeterministicSim, x: number, z: number): void {
  const dog = sim.state.dogs[0]!;
  dog.position.x = x;
  dog.position.z = z;
}

function floats(texture: { image: { data: unknown } }): Float32Array {
  const { data } = texture.image;
  if (!(data instanceof Float32Array)) throw new Error('expected an RGBA32F texture');
  return data;
}

const cellIndex = (x: number, z: number) => {
  const ix = Math.floor((x + GRID_HALF_EXTENT) / GRID_CELL);
  const iz = Math.floor((z + GRID_HALF_EXTENT) / GRID_CELL);
  return (iz * GRID_CELLS + ix) * SLOTS;
};

/** The interactors a cell names, decoded. */
function bodiesIn(
  cells: Float32Array,
  interactors: Float32Array,
  x: number,
  z: number,
): { x: number; z: number; heading: number; isDog: boolean; age: number }[] {
  const slot = cellIndex(x, z);
  const out = [];
  for (let s = 0; s < SLOTS; s++) {
    const u = cells[slot + s]!;
    if (u === 0) continue;
    const index = Math.round(u * MAX_INTERACTORS - 0.5);
    const base = index * 4;
    const raw = interactors[base + 2]!;
    const isDog = raw < KIND_OFFSET / 2;
    out.push({
      x: interactors[base]!,
      z: interactors[base + 1]!,
      heading: raw - (isDog ? 0 : KIND_OFFSET),
      isDog,
      age: interactors[base + 3]!,
    });
  }
  return out;
}

function allNamedBodies(
  cells: Float32Array,
  interactors: Float32Array,
): { x: number; z: number; isDog: boolean; age: number }[] {
  const indices = new Set<number>();
  for (const u of cells) {
    if (u !== 0) indices.add(Math.round(u * MAX_INTERACTORS - 0.5));
  }
  return [...indices].map((index) => {
    const base = index * 4;
    const raw = interactors[base + 2]!;
    return {
      x: interactors[base]!,
      z: interactors[base + 1]!,
      isDog: raw < KIND_OFFSET / 2,
      age: interactors[base + 3]!,
    };
  });
}

describe('the carried feel constants', () => {
  it('are spec/06 verbatim', () => {
    expect(INTERACTION_RADIUS).toBe(1.02);
    expect(INTERACTION_STRENGTH).toBe(0.58);
    expect(DOG_FOOTPRINT).toEqual({ halfLen: 1.16, halfWid: 0.48, falloff: 0.68 });
    expect(SHEEP_SCALE).toEqual({ x: 1.25, z: 1.45 });
  });

  it('build the sheep footprint by scaling the dog, not by a second guess', () => {
    expect(SHEEP_FOOTPRINT.halfWid).toBeCloseTo(DOG_FOOTPRINT.halfWid * SHEEP_SCALE.x, 12);
    expect(SHEEP_FOOTPRINT.halfLen).toBeCloseTo(DOG_FOOTPRINT.halfLen * SHEEP_SCALE.z, 12);
    expect(SHEEP_FOOTPRINT.falloff).toBe(DOG_FOOTPRINT.falloff);
    // A sheep is wider and longer than a collie, or the scale is upside down.
    expect(SHEEP_FOOTPRINT.halfWid).toBeGreaterThan(DOG_FOOTPRINT.halfWid);
    expect(SHEEP_FOOTPRINT.halfLen).toBeGreaterThan(DOG_FOOTPRINT.halfLen);
  });
});

describe('the lookup grid', () => {
  it('is a whole number of cells across its declared extent', () => {
    expect(GRID_CELLS * GRID_CELL).toBeCloseTo(GRID_HALF_EXTENT * 2, 12);
  });

  it('covers the whole interactive grass tier', () => {
    // Every tuft that can be pushed has to be able to find a cell, and the
    // interactive tier is the one the bake calls `field`.
    expect(GRID_HALF_EXTENT).toBeGreaterThanOrEqual(grassManifest.footprint.fieldHalf);
    // ...and every body is clamped inside the fence, well inside that.
    expect(GRID_HALF_EXTENT).toBeGreaterThan(HOME_FIELD.bounds.maxX + SHEEP_FOOTPRINT.halfLen);
  });
});

describe('packing bodies into the grid', () => {
  it('files the dog under itself, as a dog, facing where it faces', () => {
    const sim = makeSim(4);
    placeDog(sim, 12, -30);
    const field = createInteractionField();
    field.update(1 / 60, sim, null, false);
    const found = bodiesIn(floats(field.cells), floats(field.interactors), 12, -30);
    const dog = found.find((body) => body.isDog);
    expect(dog).toBeDefined();
    expect(dog!.x).toBeCloseTo(12, 5);
    expect(dog!.z).toBeCloseTo(-30, 5);
    expect(dog!.age).toBe(0);
    // The sim spawns the dog facing +z; the field stores that as an angle.
    expect(dog!.heading).toBeCloseTo(Math.PI / 2, 5);
    field.dispose();
  });

  it('tells a sheep from a dog by the kind offset alone', () => {
    const sim = makeSim(2);
    placeDog(sim, -80, -80);
    placeSheep(sim, 0, 5, 5, -1.1);
    const field = createInteractionField();
    field.update(1 / 60, sim, null, false);
    const found = bodiesIn(floats(field.cells), floats(field.interactors), 5, 5);
    expect(found).toHaveLength(1);
    expect(found[0]!.isDog).toBe(false);
    expect(found[0]!.heading).toBeCloseTo(-1.1, 5);
    field.dispose();
  });

  it('never names more than four bodies in one cell', () => {
    const sim = makeSim(40);
    placeDog(sim, -80, -80);
    // Forty sheep in a two-metre huddle: every one of them reaches the same
    // cells, which is exactly the case the cap exists for.
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      placeSheep(sim, i, Math.cos(angle) * 2, Math.sin(angle) * 2);
    }
    const field = createInteractionField();
    field.update(1 / 60, sim, null, false);
    const cells = floats(field.cells);
    let fullest = 0;
    for (let cell = 0; cell < cells.length; cell += SLOTS) {
      let used = 0;
      for (let s = 0; s < SLOTS; s++) if (cells[cell + s] !== 0) used++;
      fullest = Math.max(fullest, used);
    }
    expect(fullest).toBe(SLOTS);
    field.dispose();
  });

  it('keeps the dog even when four sheep stand closer than it does', () => {
    const sim = makeSim(4);
    // Cell centres sit at -106.25 + (i + 0.5) * 2.5; (1.25, 1.25) is one.
    const cx = 1.25;
    const cz = 1.25;
    for (let i = 0; i < 4; i++) placeSheep(sim, i, cx + (i - 1.5) * 0.05, cz);
    placeDog(sim, cx + 1.1, cz + 1.1);
    const field = createInteractionField();
    field.update(1 / 60, sim, null, false);
    const found = bodiesIn(floats(field.cells), floats(field.interactors), cx, cz);
    expect(found).toHaveLength(SLOTS);
    expect(found.filter((body) => body.isDog)).toHaveLength(1);
    field.dispose();
  });

  it('holds two hundred sheep, a dog and every trail they drag', () => {
    const sim = makeSim(200);
    for (let i = 0; i < 200; i++) placeSheep(sim, i, (i % 20) * 4 - 40, Math.floor(i / 20) * 4 - 20);
    const field = createInteractionField();
    // Long enough that every ring slot has been written at least once.
    for (let frame = 0; frame < 200; frame++) field.update(1 / 60, sim, null, false);
    const interactors = floats(field.interactors);
    const cells = floats(field.cells);
    let named = 0;
    for (const u of cells) if (u !== 0) named = Math.max(named, Math.round(u * MAX_INTERACTORS));
    // The worst case is 1 dog + its ghosts + 200 sheep + four ghosts each.
    expect(1 + DOG_GHOSTS + 200 * (1 + SHEEP_GHOSTS)).toBeLessThanOrEqual(MAX_INTERACTORS);
    expect(named).toBeLessThanOrEqual(MAX_INTERACTORS);
    expect(interactors).toHaveLength(MAX_INTERACTORS * 4);
    field.dispose();
  });

  it('reuses the same two buffers forever: nothing is allocated per frame', () => {
    const sim = makeSim(30);
    for (let i = 0; i < 30; i++) placeSheep(sim, i, i - 15, 3);
    const field = createInteractionField();
    field.update(1 / 60, sim, null, false);
    const interactors = floats(field.interactors);
    const cells = floats(field.cells);
    for (let frame = 0; frame < 500; frame++) field.update(1 / 60, sim, null, false);
    expect(floats(field.interactors)).toBe(interactors);
    expect(floats(field.cells)).toBe(cells);
    field.dispose();
  });
});

describe('the wake', () => {
  it('never creates rhythmic ghosts under a stationary body', () => {
    const sim = makeSim(2);
    placeDog(sim, -80, -80);
    placeSheep(sim, 0, 0, 0, 0);
    const field = createInteractionField();
    for (let frame = 0; frame < 300; frame++) field.update(1 / 60, sim, null, false);
    const found = bodiesIn(floats(field.cells), floats(field.interactors), 0, 0);
    expect(found.filter((body) => !body.isDog)).toHaveLength(1);
    expect(found.every((body) => body.age === 0)).toBe(true);
    field.dispose();
  });

  it('drops a ghost where the body was and ages it from there', () => {
    const sim = makeSim(2);
    placeDog(sim, -80, -80);
    placeSheep(sim, 0, 0, 0, 0);
    const field = createInteractionField();
    field.update(1 / 60, sim, null, false);
    // Walk the sheep well clear of its own footprint. Samples are based on
    // distance, not on a timer shared by every body.
    const steps = 5;
    for (let frame = 0; frame < steps; frame++) {
      placeSheep(sim, 0, 0, MIN_GHOST_DISTANCE * 0.55 * (frame + 1), Math.PI / 2);
      field.update(1 / 60, sim, null, false);
    }
    const behind = bodiesIn(floats(field.cells), floats(field.interactors), 0, 0);
    const ghost = behind.find((body) => body.age > 0);
    expect(ghost).toBeDefined();
    expect(ghost!.age).toBeGreaterThan(0);
    expect(ghost!.age).toBeLessThan(MAX_AGE);
    // ...and it stayed where the body was, not where the body went.
    expect(Math.abs(ghost!.z)).toBeLessThan(1);
    field.dispose();
  });

  it('samples the same visible wake path at 30, 60 and 120 Hz', () => {
    const pathAt = (hz: number): number[] => {
      const sim = makeSim(1);
      placeDog(sim, -80, -80);
      placeSheep(sim, 0, 0, 0, Math.PI / 2);
      const field = createInteractionField();
      field.update(1 / hz, sim, null, false);
      for (let frame = 1; frame <= hz; frame++) {
        placeSheep(sim, 0, 0, frame * 3 / hz, Math.PI / 2);
        field.update(1 / hz, sim, null, false);
      }
      const positions = allNamedBodies(floats(field.cells), floats(field.interactors))
        .filter((body) => !body.isDog && body.age > 0)
        .map((body) => body.z)
        .sort((a, b) => a - b);
      field.dispose();
      return positions;
    };
    const reference = pathAt(30);
    for (const candidate of [pathAt(60), pathAt(120)]) {
      expect(candidate).toHaveLength(reference.length);
      for (let index = 0; index < reference.length; index++) {
        expect(candidate[index]).toBeCloseTo(reference[index]!, 4);
      }
    }
  });

  it('leaves nothing behind once a body has been gone long enough', () => {
    const sim = makeSim(2);
    placeDog(sim, -80, -80);
    placeSheep(sim, 0, 0, 0, Math.PI / 2);
    const field = createInteractionField();
    for (let frame = 0; frame < 30; frame++) field.update(1 / 60, sim, null, false);
    // Teleport it across the field and let every ghost age out.
    placeSheep(sim, 0, 60, 60, Math.PI / 2);
    for (let frame = 0; frame < 180; frame++) field.update(1 / 60, sim, null, false);
    expect(bodiesIn(floats(field.cells), floats(field.interactors), 0, 0)).toHaveLength(0);
    field.dispose();
  });

  it('retires a trail only after the spring has stopped pushing', () => {
    // The claim in interactionField.ts is that the oldest ghost is already at
    // the response curve's zero, so a trail that ends does not end with a step.
    expect(springResponse(0)).toBeCloseTo(1, 12);
    expect(GHOST_BIRTH_DURATION).toBeGreaterThan(0);
    expect(GHOST_BIRTH_DURATION).toBeLessThan(MAX_AGE);
    expect(springResponse(MAX_AGE)).toBeCloseTo(0, 12);
  });

  it('overshoots: the grass leans back past upright before it settles', () => {
    let lowest = 0;
    for (let age = 0; age < MAX_AGE; age += 1 / 240) {
      lowest = Math.min(lowest, springResponse(age));
    }
    expect(lowest).toBeLessThan(-0.05);
    expect(lowest).toBeGreaterThan(-0.35);
  });
});
