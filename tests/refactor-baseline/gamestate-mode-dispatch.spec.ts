// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * GameState mode-dispatch refactor-baseline (Cycle 29 Stream A0).
 *
 * Locks down GameState's mode-dispatch behavior BEFORE the B-stream
 * extractions decompose it into js/gamestate/. The fixture asserts
 * each extraction preserves bit-exact observable behavior:
 *
 *   B1 — modes.js (capability table)
 *   B2 — polygonSpawn.js (geometry helpers)
 *   B3 — winConditions.js (resolver wrapping shared/GameStateValidation)
 *   B4 — objective.js (state machine + tick)
 *   B5 — completion.js (React-delegate stubs + leaderboard submit)
 *   B6 — sandboxStart.js (the big startSandboxGame body)
 *
 * Regenerate after an intentional behavior change with:
 *
 *     UPDATE_FIXTURES=true npm test -- gamestate-mode-dispatch
 *
 * Don't regenerate as a shortcut to make tests pass. Same posture as
 * the Cycle 28 B0 baseline.spec.ts and the sim-baseline fixtures —
 * read the diff, decide, record the decision in the active cycle plan
 * before committing.
 *
 * Why we mock OptimizedSheep: it transitively imports `three` and
 * `three/addons` which fail under vitest's node environment. The mock
 * replaces it with a stub whose constructor + getSheep + setAudioManager
 * + setSpawnConfig + resetAllSheep + setUseExtremeBoids all no-op.
 * GameState references the class via `new OptimizedSheepSystem(...)`
 * inside `createSheepFlock`, which the harness deliberately doesn't
 * call — but the import itself must succeed.
 */

import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../js/OptimizedSheep.js', () => ({
    OptimizedSheepSystem: class {
        constructor() {
            this.instancedMesh = null;
        }
        getSheep() { return []; }
        setAudioManager() {}
        setSpawnConfig() {}
        resetAllSheep() {}
        setUseExtremeBoids() {}
        update() {}
    },
}));

// Mock GameBridge so getCurrentRoom() doesn't pull React/network
// (the function itself is pure, but its sibling exports may grow
// browser-only deps over time; pinning a stub keeps the harness stable).
vi.mock('../../js/GameBridge.js', () => ({
    getCurrentRoom: () => null,
    getGameInstance: () => null,
    getNetworkManager: () => null,
    getGameState: () => null,
    setGameInstance: () => {},
    emitGameEvent: () => {},
    subscribeGameEvent: () => () => {},
}));

// @ts-expect-error — harness is plain JS, no .d.ts
import { captureGoldens } from './gamestate-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '__fixtures__');
const UPDATE = process.env.UPDATE_FIXTURES === 'true';

function loadOrWriteFixture(name: string, data: unknown): unknown {
    const path = resolve(FIXTURES_DIR, name);
    if (UPDATE || !existsSync(path)) {
        if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });
        writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
        return data;
    }
    return JSON.parse(readFileSync(path, 'utf8'));
}

describe('refactor-baseline — gamestate mode dispatch', () => {
    const captured = captureGoldens() as Record<string, Record<string, unknown>>;
    const fixture = loadOrWriteFixture('gamestate-mode-dispatch.json', captured) as Record<string, Record<string, unknown>>;

    it('startGame matrix matches the committed fixture for every (mode, sub) combo', () => {
        expect(captured.startGameMatrix).toEqual(fixture.startGameMatrix);
    });

    it('objective setup matches across null/explicit/fractional defs', () => {
        expect(captured.objectiveSetup).toEqual(fixture.objectiveSetup);
    });

    it('objective tick matches the roundup → drive transition contract', () => {
        expect(captured.objectiveTick).toEqual(fixture.objectiveTick);
    });

    it('competitive completion matches across 2p/3p/4p × score boundaries', () => {
        expect(captured.competitiveCompletion).toEqual(fixture.competitiveCompletion);
    });

    it('sandbox completion matches across {none, all, percentage} × thresholds', () => {
        expect(captured.sandboxCompletion).toEqual(fixture.sandboxCompletion);
    });
});
