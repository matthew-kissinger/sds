// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHerdingDriver } from './helpers/herding-driver';
import { describe, expect, it } from 'vitest';
import { competitiveField, penLocal, penWorld } from '@sim/competitiveLayout';
import { createSimState } from '@sim/state';
import { RoomMatch } from '../realtime/RoomMatch';
import { bind, reserve, newRoom, disconnect, expire } from '../realtime/roomState';
import { CpuDeterministicSim } from '@sim/FlockSim';
import { createInteractionField } from '@app/scene/grass/interactionField';
import { competitiveBearing } from '@app/camera/competitiveBearing';
import { createClassicFraming } from '@app/camera/classicFraming';
import { RemoteView } from '@app/multiplayer/RemoteView';
const roster = (n: number) => Array.from({ length: n }, (_, i) => i);
function party(n: number) {
  const room = newRoom('na_' + 'a'.repeat(32), 'na', { mode: 'competitive', flockSize: 25, visibility: 'private' }, 0);
  for (const slot of roster(n)) { reserve(room, { id: String(slot), name: `Dog ${slot}` }, String(slot), String(slot), 0); bind(room, String(slot), String(slot), 0); }
  room.phase = 'playing'; room.round = 'b'.repeat(32);
  return { room, match: new RoomMatch(room.round, 25, roster(n), 42, 0, 'competitive') };
}
function capture(match: RoomMatch, id: number, pen: number) {
  const s = match.sim.state.sheep[id]!, p = match.sim.state.field.competition!.pens[pen]!;
  const at = penWorld(p, 0, 0.1); s.position.set(at.x, at.z); s.velocity.set(0, 0);
  match.sim.state.arena!.update([s]); match.score!.collect(match.sim.state.arena!);
}
describe('competitive geometry', () => {
  it.each([2, 3, 4])('has equal area, openings and opposite spawns for %i players', n => {
    const field = competitiveField(roster(n)), layout = field.competition!;
    const area = Math.abs(layout.sides.reduce((a, s) => a + s.a.x * s.b.z - s.b.x * s.a.z, 0)) / 2;
    expect(area).toBeCloseTo(40000, 8);
    const state = createSimState(field, 25, 42, roster(n));
    for (const [i, p] of layout.pens.entries()) {
      expect(p.width).toBe(8); expect(p.halfWidth * 2 * p.depth).toBe(1800);
      expect(Math.hypot(state.dogs[i]!.position.x, state.dogs[i]!.position.z)).toBeCloseTo(45);
      expect(state.dogs[i]!.heading.x).toBeCloseTo(p.normal.x);
      for (const q of layout.pens) if (p !== q) expect(Math.hypot(p.position.x - q.position.x, p.position.z - q.position.z)).toBeGreaterThan(60);
    }
  });
  it.each([2, 3, 4])('allows mouths, blocks solid corners and contains dogs in every orientation (%i)', n => {
    for (let penIndex = 0; penIndex < n; penIndex++) {
      for (const x of [-3.2, 0, 3.2, -4.2, 4.2, -29.8, 29.8]) {
        const state = createSimState(competitiveField(roster(n)), 25, 42, roster(n));
        const pen = state.field.competition!.pens[penIndex]!, s = state.sheep[0]!;
        const at = penWorld(pen, x, 0.1); s.position.set(at.x, at.z);
        state.arena!.update([s]);
        expect(state.arena!.destinations[0], `pen ${penIndex}, x ${x}`).toBe(Math.abs(x) < 4 ? penIndex : -1);
        if (Math.abs(x) >= 4) expect(penLocal(pen, s.position).z).toBeLessThan(0);
      }
      const state = createSimState(competitiveField(roster(n)), 25, 42, roster(n)), dog = state.dogs[0]!;
      const pen = state.field.competition!.pens[penIndex]!;
      for (const z of [-1, 0.1, 2, 10]) { const at = penWorld(pen, 0, z); dog.position.set(at.x, at.z); state.arena!.containDog(dog); }
      expect(dog.penMemory.inside).toBe(true);
      const edge = penWorld(pen, 30.2, 10); dog.position.set(edge.x, edge.z); state.arena!.containDog(dog);
      expect(penLocal(pen, dog.position).x).toBeLessThan(30);
      for (const z of [2, 0.1, -1, -4]) { const at = penWorld(pen, 0, z); dog.position.set(at.x, at.z); state.arena!.containDog(dog); }
      expect(dog.penMemory.inside).toBe(false);
    }
  });
  it.each([2, 3, 4])('settles 200 sheep in each oriented pen (%i)', n => {
    for (const penIndex of roster(n)) {
      const state = createSimState(competitiveField(roster(n)), 200, 42, roster(n));
      const pen = state.field.competition!.pens[penIndex]!;
      for (const sheep of state.sheep) { const at = penWorld(pen, 0, 0.1); sheep.position.set(at.x, at.z); }
      for (let tick = 0; tick < 600; tick++) state.arena!.update(state.sheep);
      expect(state.sheep.every(s => s.state === 'penned')).toBe(true);
      for (const sheep of state.sheep) { const p = penLocal(pen, sheep.position); expect(Math.abs(p.x)).toBeLessThan(30); expect(p.z).toBeGreaterThan(0); expect(p.z).toBeLessThan(30); }
    }
  });
  it('uses any qualifying dog, ignores IDs, and suppresses equidistant overlapping assistance', () => {
    const state = createSimState(competitiveField([0, 1]), 25, 42, [0, 1]);
    const sheep = state.sheep[0]!; sheep.position.set(0, 90);
    state.dogs[0]!.position.set(0, 95); state.dogs[1]!.position.set(0, 85);
    expect(state.arena!.guidance(sheep, state.dogs)?.slot).toBe(0);
    state.dogs.reverse(); expect(state.arena!.guidance(sheep, state.dogs)?.slot).toBe(0);
    const pens = state.field.competition!.pens;
    pens[1]!.position = { x: 0, z: 100 };
    expect(state.arena!.guidance(sheep, state.dogs)).toBeNull();
  });
});
describe('competitive outcomes', () => {
  it('keeps banked sheep, marks later captures unclaimed, and excludes the forfeited leader', () => {
    const { room, match } = party(3);
    for (let i = 0; i < 10; i++) capture(match, i, 0);
    room.members.splice(0, 1); expect(match.advance(500, room)).toBe('playing');
    capture(match, 10, 0); capture(match, 11, 1); capture(match, 12, 2);
    expect(match.result().standings.map(s => s.count)).toEqual([10, 1, 1]);
    expect(match.result().unclaimed).toBe(1); expect(match.result().winners).toEqual([1, 2]);
    match.score!.collect(match.sim.state.arena!); expect(match.result().unclaimed).toBe(1);
    expect(match.snapshot().roster).toEqual([0, 1, 2]);
    const view = new RemoteView(match.snapshot(), 1, () => 0, () => {});
    expect(view.state.field.competition!.pens.map(p => p.slot)).toEqual([0, 1, 2]);
    expect(view.state.field.competition!.sides).toHaveLength(6);
  });
  it('finishes the entire flock including the final unclaimed sheep and shares eligible ties', () => {
    const { room, match } = party(3);
    room.members.splice(0, 1); match.advance(500, room);
    for (let i = 0; i < 24; i++) capture(match, i, i % 2 + 1);
    expect(match.advance(520, room)).toBe('playing');
    capture(match, 24, 0);
    expect(match.advance(540, room)).toBe('finished');
    expect(match.result()).toMatchObject({ reason: 'flock', count: 25, winners: [1, 2], unclaimed: 1 });
  });
  it('retains eligibility until the exact grace deadline, then awards a forfeit win', () => {
    const { room, match } = party(2);
    disconnect(room, '1', '1', 1000);
    // Keep the clock current: a 15s jump would correctly trip overload.
    for (let t = 500; t < 16000; t += 20) expect(match.advance(t, room)).toBe('playing');
    expect(match.advance(16000, room)).toBe('finished');
    expect(match.result()).toMatchObject({ reason: 'forfeit', winners: [0], remaining: 1 });
  });
  it('preserves a no-winner result when every competitor leaves', () => {
    const { room, match } = party(2); capture(match, 0, 0);
    room.members = []; expire(room, 500);
    expect(match.advance(500, room)).toBe('empty');
    expect(match.result()).toMatchObject({ reason: 'no_winner', winners: [], remaining: 0 });
    expect(match.result().standings[0]).toMatchObject({ count: 1, forfeited: true });
  });
});

it('covers distant hex corners and every dog with the grass grid', () => {
  const sim = new CpuDeterministicSim(competitiveField([0, 1, 2]), 25, 42, [0, 1, 2]);
  sim.stateFlags.fill(2);
  sim.state.dogs.forEach((d, i) => d.position.set(i === 0 ? 120 : -120, i * 8));
  const interaction = createInteractionField(161.25);
  try {
    interaction.update(1 / 60, sim, null, false);
    const data = interaction.cells.image.data as Float32Array;
    const cells = interaction.cells.image.width;
    for (const dog of sim.state.dogs) {
      const x = Math.floor((dog.position.x + interaction.halfExtent) / 2.5), z = Math.floor((dog.position.z + interaction.halfExtent) / 2.5);
      expect(Array.from(data.slice((z * cells + x) * 4, (z * cells + x) * 4 + 4)).some(v => v > 0)).toBe(true);
    }
  } finally { interaction.dispose(); }
});
it.each([2, 3, 4])('seats every Classic camera and its input bearing toward the own pen (%i)', n => {
  const match = new RoomMatch('a'.repeat(32), 25, roster(n), 42, 0, 'competitive');
  for (const slot of roster(n)) {
    const view = new RemoteView(match.snapshot(), slot, () => 0, () => {});
    const bearing = competitiveBearing(view)!;
    const camera = createClassicFraming(bearing); camera.update(1 / 60, view.state.dogs[0]!);
    const dx = camera.aim.x - camera.position.x, dz = camera.aim.z - camera.position.z, length = Math.hypot(dx, dz);
    const pen = view.state.field.competition!.pens.find(p => p.slot === slot)!;
    expect(dx / length).toBeCloseTo(pen.normal.x); expect(dz / length).toBeCloseTo(pen.normal.z);
    expect(Math.sin(bearing)).toBeCloseTo(pen.normal.x); expect(Math.cos(bearing)).toBeCloseTo(pen.normal.z);
  }
});

it.each([2, 3, 4])('finishes a competitive flock through normal inputs toward a rotated pen (%i)', n => {
  const { room, match } = party(n), slot = 1;
  const pen = match.sim.state.field.competition!.pens[slot]!;
  const distance = Math.hypot(pen.position.x, pen.position.z);
  const field = { ...competitiveField(roster(n)), gate: { position: { x: 0, z: distance }, width: 8 } };
  const observation = createSimState(field, 25, 42, [slot]);
  const drive = createHerdingDriver(); let outcome = '';
  const local = (x: number, z: number) => ({ x: x * pen.normal.z - z * pen.normal.x, z: x * pen.normal.x + z * pen.normal.z });
  for (let tick = 1; tick <= 30000; tick++) {
    const dog = match.sim.state.dogs[slot]!, observed = observation.dogs[0]!;
    const p = local(dog.position.x, dog.position.z), v = local(dog.velocity.x, dog.velocity.z);
    observed.position.set(p.x, p.z); observed.velocity.set(v.x, v.z); observed.stamina = dog.stamina;
    for (let i = 0; i < 25; i++) {
      const sheep = match.sim.state.sheep[i]!, at = local(sheep.position.x, sheep.position.z);
      observation.sheep[i]!.position.set(at.x, at.z); observation.sheep[i]!.state = sheep.state;
    }
    const input = drive(observation), now = 500 + tick * 1000 / 60;
    match.input(slot, tick, input.direction.x * pen.normal.z + input.direction.z * pen.normal.x,
      -input.direction.x * pen.normal.x + input.direction.z * pen.normal.z, input.sprint, 0, now);
    outcome = match.advance(now, room); if (outcome !== 'playing') break;
  }
  expect(outcome).toBe('finished'); expect(match.result().count).toBe(25);
  expect(match.result().reason).toBe('flock'); expect(match.result().standings.reduce((sum, s) => sum + s.count, 0)).toBe(25);
});

it.each([25, 75, 200])('is deterministic for every layout at %i sheep', count => {
  for (const n of [2, 3, 4]) {
    const { room } = party(n);
    const a = new RoomMatch('a'.repeat(32), count, roster(n), 123, 0, 'competitive');
    const b = new RoomMatch('a'.repeat(32), count, roster(n), 123, 0, 'competitive');
    for (let tick = 1; tick <= 120; tick++) {
      const now = 500 + tick * 1000 / 60;
      for (const match of [a, b]) {
        for (const dog of match.sim.state.dogs) match.input(dog.id, tick, dog.heading.x, dog.heading.z, true, 1, now);
        expect(match.advance(now, room)).toBe('playing');
      }
    }
    expect(a.snapshot()).toEqual(b.snapshot());
  }
});
