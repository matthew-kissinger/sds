/**
 * Cycle 34 Phase 4: RoomDO.initRoom honours scene.allowedModes.
 *
 * Asserts:
 *   - OC + competitive → 400 mode_not_allowed_on_scene.
 *   - OC + cooperative → 200.
 *   - OC + timed → 200.
 *   - RH + competitive → 200 (RH allows it).
 *   - Field + any legacy mode → 200 (Field allows all three modes).
 *
 * Mocks the DurableObjectState minimally so the constructor's
 * blockConcurrencyWhile + storage.get round-trip without a real DO.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RoomDO } from '../worker/src/RoomDO.ts';

class FakeStorage {
    constructor() { this.map = new Map(); }
    async get(key) { return this.map.get(key); }
    async put(key, val) { this.map.set(key, val); }
    async delete(key) { this.map.delete(key); }
}

function makeFakeState() {
    const storage = new FakeStorage();
    return {
        storage,
        blockConcurrencyWhile: async (fn) => { await fn(); }
    };
}

function makeFakeEnv() {
    return {
        ROOM_DO: {},
        LOBBY_DO: {},
        DB: {},
        JWT_SECRET: 'test-secret'
    };
}

async function callInit(room, body) {
    const req = new Request('http://room/init', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' }
    });
    return room.fetch(req);
}

function makeBody(overrides = {}) {
    return {
        roomCode: 'TESTRM',
        hostId: 'p1',
        hostName: 'Alice',
        hostDogType: 'jep',
        hostPersistentId: 'pid-1',
        hostDisplayName: 'Alice',
        roomSettings: {
            isPublic: false,
            gameMode: 'cooperative',
            sceneId: 'open-country',
            ...overrides
        }
    };
}

describe('Cycle 34 Phase 4: RoomDO allowedModes enforcement', () => {
    it('rejects OC + competitive with 400 mode_not_allowed_on_scene', async () => {
        const room = new RoomDO(makeFakeState(), makeFakeEnv());
        const res = await callInit(room, makeBody({ sceneId: 'open-country', gameMode: 'competitive' }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('mode_not_allowed_on_scene');
        expect(body.sceneId).toBe('open-country');
        expect(body.gameMode).toBe('competitive');
        expect(body.allowedModes).toEqual(['cooperative', 'timed']);
    });

    it('accepts OC + cooperative', async () => {
        const room = new RoomDO(makeFakeState(), makeFakeEnv());
        const res = await callInit(room, makeBody({ sceneId: 'open-country', gameMode: 'cooperative' }));
        expect(res.status).toBe(200);
    });

    it('accepts OC + timed', async () => {
        const room = new RoomDO(makeFakeState(), makeFakeEnv());
        const res = await callInit(room, makeBody({ sceneId: 'open-country', gameMode: 'timed' }));
        expect(res.status).toBe(200);
    });

    it('accepts RH + competitive (RH allows it)', async () => {
        const room = new RoomDO(makeFakeState(), makeFakeEnv());
        const res = await callInit(room, makeBody({ sceneId: 'rolling-hills', gameMode: 'competitive' }));
        expect(res.status).toBe(200);
    });

    it('accepts RH + cooperative', async () => {
        const room = new RoomDO(makeFakeState(), makeFakeEnv());
        const res = await callInit(room, makeBody({ sceneId: 'rolling-hills', gameMode: 'cooperative' }));
        expect(res.status).toBe(200);
    });

    it('accepts Field + any legacy mode (Field allows all three)', async () => {
        for (const mode of ['cooperative', 'competitive', 'timed']) {
            const room = new RoomDO(makeFakeState(), makeFakeEnv());
            const res = await callInit(room, makeBody({ sceneId: 'field', gameMode: mode }));
            expect(res.status, `field + ${mode} should be 200`).toBe(200);
        }
    });
});
