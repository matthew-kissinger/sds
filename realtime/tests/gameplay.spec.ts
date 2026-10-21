// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { reset, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { RoomMatch } from '../RoomMatch';
import { bind, newRoom, reserve, type RoomState } from '../roomState';
import { createHerdingDriver } from '../../tests/helpers/herding-driver';
import { clients, connect, create, DEFAULT, join, register, request, roomStub } from './helpers';
import { command, packet } from '../protocol';
function party(count = 25, slots = [0, 1]): RoomState {
  const room = newRoom('na_' + 'a'.repeat(32), 'na', { ...DEFAULT, flockSize: count as 25 | 75 | 200 }, 0);
  for (const slot of slots) {
    reserve(room, { id: String(slot), name: `Dog ${slot}` }, String(slot), String(slot), 0);
    bind(room, String(slot), String(slot), 0);
  }
  room.phase = 'playing'; room.round = 'b'.repeat(32); return room;
}
afterEach(async () => { for (const c of clients.splice(0)) c.socket.close(1000, 'done'); await reset(); });
describe('authoritative co-op gameplay', () => {
  it.each([25, 75, 200])('uses deterministic shared flock stepping for %i sheep and four dogs', count => {
    const room = party(count, [0, 1, 2, 3]);
    const a = new RoomMatch(room.round!, count, [0, 1, 2, 3], 42, 0);
    const b = new RoomMatch(room.round!, count, [0, 1, 2, 3], 42, 0);
    for (let tick = 1; tick <= 180; tick++) {
      const now = 500 + tick * 1000 / 60;
      for (const match of [a, b]) {
        for (let slot = 0; slot < 4; slot++) match.input(slot, tick, slot % 2 ? 0 : 1, slot % 2 ? 1 : 0, true, 1, now);
        expect(match.advance(now, room)).toBe('playing');
      }
    }
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.snapshot().barks.map(b => b.slot)).toEqual([0, 1, 2, 3]);
    expect(a.snapshot().sheep).toHaveLength(count * 4);
    expect(a.snapshot()).not.toHaveProperty('seed');
  });
  it('stops stale input and removes departed dogs without losing flock progress', () => {
    const room = party(); const match = new RoomMatch(room.round!, 25, [0, 1], 42, 0);
    match.input(0, 1, 0, 1, true, 1, 500);
    for (let t = 520; t <= 1200; t += 20) match.advance(t, room);
    expect(match.sim.state.dogs[0].sprinting).toBe(false);
    const sheep = match.sim.state.sheep;
    room.members.splice(0, 1); match.advance(1220, room);
    expect(match.sim.state.dogs.map(d => d.id)).toEqual([1]);
    expect(match.sim.state.sheep).toBe(sheep);
    expect(match.started).toBe(2);
  });
  it('finishes a real herding run after a co-op departure, without teleporting sheep', () => {
    const room = party(); const match = new RoomMatch(room.round!, 25, [0, 1], 42, 0);
    room.members.splice(1, 1);
    const drive = createHerdingDriver(); let outcome = '';
    for (let tick = 1; tick <= 15000; tick++) {
      const input = drive(match.sim.state), now = 500 + tick * 1000 / 60;
      match.input(0, tick, input.direction.x, input.direction.z, input.sprint, 0, now);
      outcome = match.advance(now, room); if (outcome !== 'playing') break;
    }
    expect(outcome).toBe('finished'); expect(match.snapshot().count).toBe(25);
  });
  it('can finish with two dogs and a stationary partner', () => {
    const room = party(); const match = new RoomMatch(room.round!, 25, [0, 1], 42, 0);
    const drive = createHerdingDriver(); let outcome = '';
    for (let tick = 1; tick <= 15000; tick++) {
      const input = drive(match.sim.state), now = 500 + tick * 1000 / 60;
      match.input(0, tick, input.direction.x, input.direction.z, input.sprint, 0, now);
      outcome = match.advance(now, room); if (outcome !== 'playing') break;
    }
    expect(outcome).toBe('finished'); expect(match.snapshot().count).toBe(25);
  });
  it('interrupts a clock backlog instead of fabricating a successful result', () => {
    const room = party(); const match = new RoomMatch(room.round!, 25, [0, 1], 42, 0);
    expect(match.advance(1200, room)).toBe('overload'); expect(match.sim.completed).toBe(false);
  });
  it('rejects nonfinite, oversized direction and malformed movement commands', () => {
    for (const vector of [[NaN, 0], [Infinity, 0], [1, 1], ['1', 0]]) {
      expect(() => command(packet([3, 'input', 0, 'a'.repeat(32), ...vector, false, 1]))).toThrow();
    }
    expect(command(packet([3, 'input', 0, 'a'.repeat(32), 0.6, 0.8, false, 1])).type).toBe('input');
  });
  it('persists a completed-result fixture and requires a fresh ready barrier for rematch', async () => {
    const a = await create(await register('host')); const ca = await connect(a);
    const cb = await connect(await join(a.handle, await register('guest')));
    await ca.until(v => v.members.length === 2);
    // A lifecycle fixture, not evidence of a herding run. Simulation completion
    // is exercised above with real sheep movement and no position overrides.
    await runInDurableObject(roomStub(a.handle), async (_instance, state) => {
      const room = (await state.storage.get<RoomState>('room'))!;
      room.phase = 'finished'; room.round = 'c'.repeat(32);
      room.result = { mode: 'coop', reason: 'flock', standings: [], unclaimed: 0, winners: [], tick: 3000, count: 25, started: 2, remaining: 2 };
      await state.storage.put('room', room);
    });
    await evictDurableObject(roomStub(a.handle)); ca.send('ping');
    expect((await ca.until(v => v.phase === 'finished')).result?.count).toBe(25);
    ca.send('again'); const waiting = await ca.until(v => v.phase === 'waiting' && v.round === 'c'.repeat(32));
    expect(waiting.result).toBeNull(); expect(waiting.members.every(m => !m.ready)).toBe(true);
    ca.send('ready', true); cb.send('ready', true); await ca.until(v => v.members.every(m => m.ready));
    ca.send('start'); expect((await ca.until(v => v.phase === 'starting')).round).not.toBe('c'.repeat(32));
  });
  it('runs real sockets, agrees on snapshots, resumes a seat and interrupts on server eviction', async () => {
    const token = await register('host'); const a = await create(token); const ca = await connect(a);
    const cb = await connect(await join(a.handle, await register('guest')));
    ca.send('ready', true); cb.send('ready', true); await ca.until(v => v.members.every(m => m.ready));
    ca.send('start'); const start = await ca.until(v => v.phase === 'starting');
    ca.send('loaded', start.round); cb.send('loaded', start.round);
    await ca.until(v => v.phase === 'playing');
    await ca.snapshotUntil(s => s.tick >= 3);
    ca.send('input', start.round, 0, 1, false, 1); cb.send('input', start.round, 1, 0, false, 1);
    const first = await ca.snapshotUntil(s => s.barks.length === 2);
    const same = await cb.snapshotUntil(s => s.tick === first.tick);
    expect(first).toEqual(same); expect(first.barks).toHaveLength(2);
    expect((await request(`/r/${a.handle}/join`, await register('late'), {})).status).toBe(409);
    ca.socket.close(1000, 'reconnect'); await cb.until(v => !v.members.find(m => m.slot === a.slot)?.connected);
    const back = await connect(await join(a.handle, token));
    expect((await back.snapshotUntil(s => s.tick >= first.tick)).dogs.map(d => d.slot)).toEqual([0, 1]);
    // The eviction helper waits for hibernation eligibility. Stop the active
    // interval, then discard the actual object instance with its live match.
    await runInDurableObject(roomStub(a.handle), instance => {
      clearInterval((instance as unknown as { timer: ReturnType<typeof setInterval> }).timer);
    });
    await evictDurableObject(roomStub(a.handle)); back.send('ping');
    const interrupted = await back.until(v => v.interruption === 'server_restart');
    expect(interrupted.phase).toBe('waiting'); expect(interrupted.result).toBeNull();
  });
});
