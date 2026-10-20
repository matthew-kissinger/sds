// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { reset, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { clients, connect, create, DEFAULT, join, register, request, roomStub } from './helpers';
import { randomKey } from '../regions';

afterEach(async () => {
  for (const client of clients.splice(0)) client.socket.close(1000, 'test_complete');
  await reset();
});
describe('real local Worker admission and rooms', () => {
  it('requires a valid identity and origin; ignores spoofed identity headers', async () => {
    const body = { region: 'na', settings: DEFAULT };
    expect((await request('/r/rooms', undefined, body, { 'X-Player-Id': 'fake' })).status).toBe(401);
    expect((await request('/r/rooms', 'invalid', body)).status).toBe(401);
    const token = await register('one');
    expect((await request('/r/rooms', token, body, { Origin: 'https://foreign.test' })).status).toBe(403);
  });
  it('idempotently creates a regional room and does not reserve a seat on link GET', async () => {
    const token = await register('one'); const key = randomKey();
    const first = await create(token, 'eu', DEFAULT, key);
    const second = await create(token, 'eu', DEFAULT, key);
    expect(second.handle).toBe(first.handle);
    expect(first.handle.startsWith('eu_')).toBe(true);
    const preview = await (await request(`/r/${first.handle}`)).json<{ occupancy: number }>();
    expect(preview.occupancy).toBe(1);
    expect(JSON.stringify(preview)).not.toContain('ticket');
    expect(JSON.stringify(preview)).not.toContain('one');
  });
  it('atomically admits only four of five simultaneous independent joins', async () => {
    const host = await create(await register('host'));
    await connect(host);
    const tokens = await Promise.all(['a', 'b', 'c', 'd'].map(register));
    const responses = await Promise.all(tokens.map(t => request(`/r/${host.handle}/join`, t, {})));
    expect(responses.filter(r => r.ok)).toHaveLength(3);
    expect(responses.filter(r => r.status === 409)).toHaveLength(1);
  });
  it('uses single-use tickets, validates origin and rejects protocol mismatch before consumption', async () => {
    const admission = await create(await register('one'));
    const path = `/r/${admission.handle}/ws?ticket=${admission.ticket}&v=2`;
    expect((await request(path, undefined, undefined, { Upgrade: 'websocket' })).status).toBe(400);
    expect((await request(path.replace('v=2', 'v=1'), undefined, undefined,
      { Upgrade: 'websocket', Origin: 'https://foreign.test' })).status).toBe(403);
    await connect(admission);
    expect((await request(path.replace('v=2', 'v=1'), undefined, undefined, { Upgrade: 'websocket' })).status).toBe(401);
  });
  it('keeps private rooms out of every regional board', async () => {
    const token = await register('host');
    const visible = await create(token, 'na');
    const hidden = await create(token, 'eu', { ...DEFAULT, visibility: 'private' });
    const na = await (await request('/r/lobbies/na')).json<{ rooms: { handle: string }[] }>();
    expect(na.rooms.map(r => r.handle)).toEqual([visible.handle]);
    for (const region of ['eu', 'apac']) {
      const text = await (await request(`/r/lobbies/${region}`)).text();
      expect(text).not.toContain(hidden.handle);
      expect(JSON.parse(text).rooms).toEqual([]);
    }
  });
  it('requires readiness, locks the starting roster, and honestly aborts without a simulation host', async () => {
    const a = await create(await register('a')); const ca = await connect(a);
    const b = await join(a.handle, await register('b')); const cb = await connect(b);
    await ca.until(v => v.members.length === 2 && v.members.every(m => m.connected));
    ca.send('ready', true); cb.send('ready', true);
    await ca.until(v => v.members.every(m => m.ready));
    ca.send('start'); const start = await ca.until(v => v.phase === 'starting');
    const outsider = await request(`/r/${a.handle}/join`, await register('late'), {});
    expect(outsider.status).toBe(409);
    ca.send('loaded', start.round); cb.send('loaded', start.round);
    const back = await ca.until(v => v.interruption === 'simulation_unavailable');
    expect(back.phase).toBe('waiting'); expect(back.members.every(m => !m.ready)).toBe(true);
  });
  it('removes only while waiting and blocks that identity for the room lifetime', async () => {
    const a = await create(await register('a')); const ca = await connect(a);
    const bt = await register('b'); const b = await join(a.handle, bt); await connect(b);
    await ca.until(v => v.members.length === 2);
    ca.send('remove', b.slot); await ca.until(v => v.revision > 4 && v.members.length === 1);
    expect((await request(`/r/${a.handle}/join`, bt, {})).status).toBe(403);
  });
  it('preserves party and settings across a real Durable Object eviction', async () => {
    const a = await create(await register('a')); const ca = await connect(a);
    await ca.until(v => v.members.some(m => m.connected));
    await evictDurableObject(roomStub(a.handle));
    ca.send('ready', true);
    const view = await ca.until(v => v.members.some(m => m.ready));
    expect(view.settings).toEqual(DEFAULT);
    expect(view.members).toHaveLength(1);
  });
  it('interrupts a starting round across actual eviction without inventing a result', async () => {
    const a = await create(await register('a')); const ca = await connect(a);
    const cb = await connect(await join(a.handle, await register('b')));
    ca.send('ready', true); cb.send('ready', true);
    await ca.until(v => v.members.every(m => m.ready)); ca.send('start');
    await ca.until(v => v.phase === 'starting');
    await evictDurableObject(roomStub(a.handle));
    ca.send('ready', true);
    const back = await ca.until(v => v.interruption === 'server_restart');
    expect(back.phase).toBe('waiting'); expect(back.members).toHaveLength(2);
    expect(back).not.toHaveProperty('result');
  });
  it('expires pending seats and rejects expired tickets inside workerd', async () => {
    const a = await create(await register('a'));
    await runInDurableObject(roomStub(a.handle), async (_instance, state) => {
      const room = await state.storage.get<import('../roomState').RoomState>('room');
      room!.members[0].deadline = Date.now() - 1;
      await state.storage.put('room', room);
    });
    await evictDurableObject(roomStub(a.handle));
    const response = await request(`/r/${a.handle}/ws?ticket=${a.ticket}&v=1`, undefined, undefined, { Upgrade: 'websocket' });
    expect(response.status).toBe(401);
  });
});
