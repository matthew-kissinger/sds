// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { evictDurableObject, reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { bindings, clients, connect, create, DEFAULT, join, register, request, roomStub, SECRET } from './helpers';
import { signJwt } from '../../worker/src/jwt';
import { randomKey } from '../regions';
import { newRoom, publicRoom, type RoomState } from '../roomState';
import type { RealtimeEnv } from '../bindings';

afterEach(async () => {
  for (const client of clients.splice(0)) client.socket.close(1000, 'test_complete');
  await reset();
});
const directory = () => bindings.LOBBIES.get(bindings.LOBBIES.idFromName('na'));

describe('durability and adversarial admission', () => {
  it('rejects expired, wrong-secret and unknown-player identities', async () => {
    await register('one');
    for (const token of [await signJwt({ persistent_id: 'one' }, SECRET, -1),
      await signJwt({ persistent_id: 'one' }, 'wrong-secret'),
      await signJwt({ persistent_id: 'unknown' }, SECRET)]) {
      expect((await request('/r/rooms', token, { region: 'na', settings: DEFAULT },
        { 'Idempotency-Key': randomKey() })).status).toBe(401);
    }
  });
  it('rejects oversized requests, unsupported flocks and conflicting idempotency keys', async () => {
    const token = await register('one'); const key = randomKey();
    await create(token, 'na', DEFAULT, key);
    for (const [body, status] of [
      [{ region: 'na', settings: { ...DEFAULT, flockSize: 5000 } }, 400],
      [{ region: 'na', settings: DEFAULT, padding: 'x'.repeat(2100) }, 413],
      [{ region: 'na', settings: { ...DEFAULT, mode: 'coop' } }, 409],
    ] as const) {
      expect((await request('/r/rooms', token, body, { 'Idempotency-Key': key })).status).toBe(status);
    }
  });
  it('reconnects in the same slot and hands host authority to the connected peer', async () => {
    const token = await register('one'); const a = await create(token); const ca = await connect(a);
    const b = await join(a.handle, await register('two')); const cb = await connect(b);
    await ca.until(v => v.members.length === 2 && v.members.every(m => m.connected));
    ca.socket.close(1000, 'disconnect');
    await cb.until(v => v.hostSlot === b.slot && !v.members.find(m => m.slot === a.slot)!.connected);
    const replacement = await join(a.handle, token); expect(replacement.slot).toBe(a.slot);
    const cr = await connect(replacement);
    const view = await cr.until(v => v.members.every(m => m.connected));
    expect(view.members).toHaveLength(2); expect(view.hostSlot).toBe(b.slot);
    await evictDurableObject(roomStub(a.handle));
    cr.send('ready', true);
    expect((await cb.until(v => v.members.some(m => m.ready))).hostSlot).toBe(b.slot);
  });
  it('withdraws private rooms and refuses stale directory publications across eviction', async () => {
    const a = await create(await register('one')); const ca = await connect(a);
    const before = await ca.until(v => v.members.some(m => m.connected));
    ca.send('settings', 'coop', 75, 'private');
    await ca.until(v => v.settings.visibility === 'private');
    // Await inspect so the settings event's directory publication completes.
    await request(`/r/${a.handle}`);
    await directory().publish(a.handle, before.revision, before, false);
    await evictDurableObject(directory());
    expect((await directory().list(null)).rooms).toEqual([]);
  });
  it('bounds boards to 25 entries and expires stale listings after a directory restart', async () => {
    for (let n = 0; n < 26; n++) {
      const result = await directory().allocate('na', `owner-${n}`, randomKey(), DEFAULT);
      if (!result.ok) throw new Error(result.code);
      const room = newRoom(result.value, 'na', DEFAULT, Date.now());
      await directory().publish(room.handle, 1, publicRoom(room), false);
    }
    const first = await directory().list(null); expect(first.rooms).toHaveLength(25);
    const second = await directory().list(first.next); expect(second.rooms).toHaveLength(1);
    expect(new Set([...first.rooms, ...second.rooms].map(r => r.handle)).size).toBe(26);
    await runInDurableObject(directory(), async (_instance, state) => {
      const leases = await state.storage.get<{ listedUntil: number }[]>('leases');
      for (const lease of leases!) lease.listedUntil = Date.now() - 1;
      await state.storage.put('leases', leases);
    });
    await evictDurableObject(directory());
    expect((await directory().list(null)).rooms).toEqual([]);
  });
  it('can disable individual regions and bound the pilot to one allocated room', async () => {
    await runInDurableObject(directory(), async (instance) => {
      const env = (instance as unknown as { env: RealtimeEnv }).env;
      const old = env.ROOM_CAPS;
      try {
        env.ROOM_CAPS = { na: 1, eu: 0, apac: 0 };
        expect((await instance.allocate('eu', 'one', randomKey(), DEFAULT)).ok).toBe(false);
        expect((await instance.allocate('na', 'one', randomKey(), DEFAULT)).ok).toBe(true);
        expect(await instance.allocate('na', 'two', randomKey(), DEFAULT))
          .toEqual({ ok: false, code: 'region_capacity', status: 429 });
      } finally { env.ROOM_CAPS = old; }
    });
  });
  it('keeps a tombstone and a bounded retry when closing during a directory outage', async () => {
    const a = await create(await register('one'));
    await runInDurableObject(roomStub(a.handle), async (instance, state) => {
      const internal = instance as unknown as { room: RoomState; env: RealtimeEnv };
      const original = internal.env.LOBBIES;
      internal.room.members = []; internal.room.idleExpires = Date.now() - 1;
      internal.env.LOBBIES = { idFromName: () => ({}), get: () => ({ publish: async () => { throw new Error('outage'); } })
      } as unknown as RealtimeEnv['LOBBIES'];
      try {
        const before = Date.now(); await instance.alarm();
        expect((await state.storage.get<RoomState>('room'))!.phase).toBe('closed');
        expect(await state.storage.getAlarm()).toBeGreaterThanOrEqual(before + 4_900);
        expect(await instance.admit({ id: 'one', name: 'One' }, { handle: a.handle, region: 'na', settings: DEFAULT }))
          .toEqual({ ok: false, code: 'room_expired', status: 410 });
      } finally { internal.env.LOBBIES = original; }
    });
    await evictDurableObject(roomStub(a.handle));
    expect((await request(`/r/${a.handle}/join`, await register('one'), {})).status).toBe(410);
  });
  it('removes expired storage and its alarm once the allocation lease expires', async () => {
    const a = await create(await register('one'));
    await runInDurableObject(roomStub(a.handle), async (instance, state) => {
      (instance as unknown as { room: RoomState }).room.expiresAt = Date.now() - 1;
      await instance.alarm();
      expect(await state.storage.get('room')).toBeUndefined();
      expect(await state.storage.getAlarm()).toBeNull();
    });
    expect(await runDurableObjectAlarm(roomStub(a.handle))).toBe(false);
  });
  it('disconnects a socket that stops acknowledging room revisions', async () => {
    const a = await create(await register('one')); const ca = await connect(a, false);
    const closed = new Promise<CloseEvent>(resolve => ca.socket.addEventListener('close', resolve, { once: true }));
    for (let n = 0; n < 8; n++) {
      const revision = ca.frames.at(-1)?.revision ?? 0;
      ca.send('ready', n % 2 === 0);
      if (n < 7) await ca.until(v => v.revision > revision);
    }
    expect((await closed).code).toBe(1013);
  });
});
