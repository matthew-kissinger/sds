// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, it } from 'vitest';
import { reset, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { clients, connect, create, DEFAULT, join, register, roomStub } from './helpers';
import type { RoomState } from '../roomState';
import type { RoomMatch } from '../RoomMatch';
import { penWorld } from '../../sim/competitiveLayout';
afterEach(async () => { for (const c of clients.splice(0)) c.socket.close(1000, 'done'); await reset(); });
async function start(n: number) {
  const admission = await create(await register('host'), 'na', { ...DEFAULT, mode: 'competitive' });
  const group = [await connect(admission)];
  for (let i = 1; i < n; i++) group.push(await connect(await join(admission.handle, await register(`guest${i}`))));
  for (const c of group) c.send('ready', true);
  await group[0].until(r => r.members.length === n && r.members.every(m => m.ready));
  group[0].send('start'); const room = await group[0].until(r => r.phase === 'starting');
  for (const c of group) c.send('loaded', room.round);
  await group[0].until(r => r.phase === 'playing');
  return { admission, group };
}
it.each([2, 3, 4])('starts %i competitors through sockets, keeps the original roster, and preserves completed results', async n => {
  const { admission, group } = await start(n);
  const initial = await group[0].snapshotUntil(s => s.tick >= 3);
  expect(initial.rules).toBe('competitive-1'); expect(initial.roster).toHaveLength(n);
  group[n - 1].send('leave');
  const frame = await group[0].snapshotUntil(s => s.dogs.length === n - 1);
  expect(frame.roster).toHaveLength(n); expect(frame.standings[n - 1].forfeited).toBe(true);
  for (let i = n - 2; i >= 1; i--) group[i].send('leave');
  const finished = await group[0].until(r => r.phase === 'finished');
  expect(finished.result).toMatchObject({ mode: 'competitive', reason: 'forfeit', winners: [0], remaining: 1 });
  const closed = new Promise<void>(resolve => group[0].socket.addEventListener('close', () => resolve(), { once: true }));
  group[0].send('leave');
  await closed;
  const persisted = await runInDurableObject(roomStub(admission.handle), async (_instance, state) => state.storage.get<RoomState>('room'));
  expect(persisted?.result).toEqual(finished.result);
});
it('records no winner and capture history when every grace deadline expires before the match timer', async () => {
  const { admission } = await start(3);
  await runInDurableObject(roomStub(admission.handle), async (instance) => {
    const live = instance as unknown as { room: RoomState; match: RoomMatch; timer: ReturnType<typeof setInterval> };
    clearInterval(live.timer);
    const sheep = live.match.sim.state.sheep[0];
    const at = penWorld(live.match.sim.state.field.competition!.pens[0], 0, 0.1);
    sheep.position.set(at.x, at.z); live.match.sim.state.arena!.update([sheep]); live.match.score!.collect(live.match.sim.state.arena!);
    for (const m of live.room.members) { m.connected = false; m.deadline = Date.now() - 1; }
    await instance.alarm();
    const result = live.room.result;
    expect(live.room.phase).toBe('closed');
    expect(result).toMatchObject({ reason: 'no_winner', winners: [], remaining: 0 });
    expect(result!.standings[0]).toMatchObject({ count: 1, forfeited: true });
  });
});
it('host mode changes clear every ready flag before a competitive start', async () => {
  const a = await create(await register('host'));
  const host = await connect(a), guest = await connect(await join(a.handle, await register('guest')));
  host.send('ready', true); guest.send('ready', true);
  await host.until(r => r.members.length === 2 && r.members.every(m => m.ready));
  host.send('settings', 'competitive', 75, 'public');
  const changed = await host.until(r => r.settings.mode === 'competitive');
  expect(changed.members.every(m => !m.ready)).toBe(true);
  expect(changed.settings.flockSize).toBe(75);
});

it('migrates a completed protocol-2 co-op result without erasing it', async () => {
  const a = await create(await register('host')); const host = await connect(a);
  await runInDurableObject(roomStub(a.handle), async (_instance, state) => {
    const room = (await state.storage.get<RoomState>('room'))!;
    await state.storage.put('room', { ...room, schema: 2, phase: 'finished', result: { tick: 600, count: 25, started: 2, remaining: 2 } });
  });
  await evictDurableObject(roomStub(a.handle)); host.send('ping');
  const result = (await host.until(r => r.phase === 'finished')).result;
  expect(result).toMatchObject({ mode: 'coop', reason: 'flock', count: 25, tick: 600, winners: [] });
});
