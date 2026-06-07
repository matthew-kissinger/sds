// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 67 P4: the `survival` co-op room mode + lobby gate.
 *
 * Locks the RoomDO create-room validation for survival:
 *   - a survival room on Newsheepdogland (which declares survival in
 *     allowedModes) is accepted, and the sheepCount is forced to the scene's
 *     maxFlock pool regardless of what the client sent (no count selector);
 *   - a survival room on a scene whose allowedModes omits survival (field) is
 *     rejected with a clean 400;
 *   - an unknown game mode is rejected.
 *
 * Reuses the FakeStorage / fake-Env DurableObject mocks from the other RoomDO
 * specs (the create path only needs blockConcurrencyWhile + storage).
 */
import { describe, it, expect } from 'vitest';
import { RoomDO } from '../../worker/src/RoomDO.ts';

class FakeStorage {
  map = new Map<string, unknown>();
  async get(key: string) { return this.map.get(key); }
  async put(key: string, val: unknown) { this.map.set(key, val); }
  async delete(key: string) { this.map.delete(key); }
}

function makeFakeState() {
  return {
    storage: new FakeStorage(),
    blockConcurrencyWhile: async (fn: () => unknown) => { await fn(); },
  } as any;
}

function makeFakeEnv() {
  return { ROOM_DO: {}, LOBBY_DO: {}, DB: {}, JWT_SECRET: 'test-secret' } as any;
}

async function initRoom(room: any, roomSettings: Record<string, unknown>) {
  const body = {
    roomCode: 'SURVRM',
    hostId: 'host-sess',
    hostName: 'Alice',
    hostDogType: 'jep',
    hostPersistentId: 'pid-host',
    hostDisplayName: 'Alice',
    roomSettings,
  };
  return room.fetch(new Request('http://room/init', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
}

describe('survival co-op room mode (Cycle 67 P4)', () => {
  it('accepts a survival room on Newsheepdogland and forces sheepCount to maxFlock', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const res = await initRoom(room, {
      isPublic: true, gameMode: 'survival', sceneId: 'newsheepdogland', sheepCount: 500,
    });
    expect(res.status).toBe(200);
    expect(room.meta.gameMode).toBe('survival');
    expect(room.meta.sceneId).toBe('newsheepdogland');
    // Client sent 500; survival forces the scene's maxFlock pool (200).
    expect(room.meta.sheepCount).toBe(200);
    expect(room.getSerializableState().state).toBe('waiting');
  });

  it('rejects a survival room on a scene that does not allow it (field)', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const res = await initRoom(room, { gameMode: 'survival', sceneId: 'field' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('mode_not_allowed_on_scene');
    expect(body.gameMode).toBe('survival');
  });

  it('rejects an unknown game mode', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const res = await initRoom(room, { gameMode: 'bogus', sceneId: 'newsheepdogland' });
    expect(res.status).toBe(400);
  });

  it('still accepts a cooperative room on Newsheepdogland (mode list unbroken)', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const res = await initRoom(room, { gameMode: 'cooperative', sceneId: 'newsheepdogland', sheepCount: 200 });
    expect(res.status).toBe(200);
    expect(room.meta.gameMode).toBe('cooperative');
    expect(room.meta.sheepCount).toBe(200);
  });
});
