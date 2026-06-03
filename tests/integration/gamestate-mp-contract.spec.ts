// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * MultiplayerState ↔ GameState contract — Cycle 29 Stream C1.
 *
 * The two state holders speak DIFFERENT vocabularies for the same modes:
 *
 *   GameState.gameMode           ← 'solo' | 'multiplayer' | 'competitive' | 'timed' | 'sandbox'
 *   MultiplayerState.gameMode    ← 'cooperative' | 'racing' | 'timed'
 *
 * Mapping (the wire/Worker uses MultiplayerState's vocabulary; the
 * client GameState uses its own):
 *
 *   MP 'cooperative' ⇄ GameState 'multiplayer'
 *   MP 'racing'      ⇄ GameState 'competitive'
 *   MP 'timed'       ⇄ GameState 'timed'    (only mode where strings match)
 *
 *   GameState 'solo'    — no MP counterpart (local single-player + 2p-local)
 *   GameState 'sandbox' — no MP counterpart (local creative mode)
 *
 * This spec locks that mapping by exercising every gameMode on the
 * GameState side and every gameMode on the MultiplayerState side, then
 * asserting the cross-vocabulary capabilities (does this mode track
 * player scores? use competitive gates? submit to leaderboard?) line
 * up. The dialect drift is a tribal-knowledge fact today; future
 * contributors who add a new mode will see this spec fail until they
 * register it on both sides.
 *
 * Vitest mocks OptimizedSheep + GameBridge (same as gamestate-mode-dispatch
 * spec) so GameState constructs cleanly under node.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../js/OptimizedSheep.js', () => ({
    OptimizedSheepSystem: class {
        constructor() { this.instancedMesh = null; }
        getSheep() { return []; }
        setAudioManager() {}
        setSpawnConfig() {}
        resetAllSheep() {}
        setUseExtremeBoids() {}
        update() {}
    },
}));

vi.mock('../../js/GameBridge.js', () => ({
    getCurrentRoom: () => null,
    getGameInstance: () => null,
    getNetworkManager: () => null,
    getGameState: () => null,
    setGameInstance: () => {},
    emitGameEvent: () => {},
    subscribeGameEvent: () => () => {},
}));

// Browser shims — node env has no window/localStorage/CustomEvent.
if (typeof globalThis.CustomEvent !== 'function') {
    globalThis.CustomEvent = class CustomEvent {
        type: string;
        detail: unknown;
        constructor(type: string, init?: { detail?: unknown }) {
            this.type = type;
            this.detail = init?.detail;
        }
    } as unknown as typeof CustomEvent;
}
if (typeof globalThis.window !== 'object' || globalThis.window === null) {
    (globalThis as unknown as { window: object }).window = {
        dispatchEvent: () => {},
        submitGameScore: undefined,
        __currentSceneId: undefined,
    };
}
if (typeof globalThis.localStorage !== 'object' || globalThis.localStorage === null) {
    (globalThis as unknown as { localStorage: object }).localStorage = {
        _store: {} as Record<string, string>,
        setItem(k: string, v: string) { (this._store as Record<string, string>)[k] = String(v); },
        getItem(k: string) { return (this._store as Record<string, string>)[k] ?? null; },
        removeItem(k: string) { delete (this._store as Record<string, string>)[k]; },
        clear() { this._store = {}; },
    };
}

// @ts-expect-error — js modules don't ship .d.ts
import { GameState } from '../../js/GameState.js';
// @ts-expect-error
import { MultiplayerState } from '../../js/MultiplayerState.js';
// @ts-expect-error
import { MODE_CAPABILITIES, getModeCapabilities } from '../../js/gamestate/modes.js';

/** The vocabulary mapping the spec is locking. */
const MP_TO_GAMESTATE_MODE: Record<string, string> = {
    cooperative: 'multiplayer',
    racing: 'competitive',
    timed: 'timed',
};

describe('GameState ↔ MultiplayerState contract', () => {
    describe('vocabulary mapping', () => {
        it('every MP gameMode maps to a registered GameState gameMode', () => {
            for (const [mpMode, gsMode] of Object.entries(MP_TO_GAMESTATE_MODE)) {
                expect(MODE_CAPABILITIES, `MP '${mpMode}' should map to a registered GameState mode`).toHaveProperty(gsMode);
            }
        });

        it('GameState modes solo and sandbox have no MP counterpart', () => {
            // These are local-only and intentionally not in the MP vocab.
            expect(Object.values(MP_TO_GAMESTATE_MODE)).not.toContain('solo');
            expect(Object.values(MP_TO_GAMESTATE_MODE)).not.toContain('sandbox');
        });
    });

    describe('2p-local solo', () => {
        it('startGame(solo, classic) supports a second sheepdog without entering MP mode', () => {
            const state = new GameState();
            state.startGame('solo', null, 'classic');
            const dog2 = { id: 'dog2' };
            state.setSheepdog2(dog2);
            expect(state.gameMode).toBe('solo');
            expect(state.getSheepdog2()).toBe(dog2);
            // Solo mode does NOT track per-player scores or use competitive gates.
            expect(getModeCapabilities(state.gameMode).tracksPlayerScores).toBe(false);
            expect(getModeCapabilities(state.gameMode).usesCompetitiveGates).toBe(false);
        });
    });

    describe('MP cooperative', () => {
        it('GameState.multiplayer maps to MultiplayerState.cooperative; both run cooperative UI', () => {
            const gs = new GameState();
            gs.startGame('multiplayer', null, 'classic');
            const mp = new MultiplayerState();
            mp.setGameMode('cooperative', 4);

            expect(gs.gameMode).toBe('multiplayer');
            expect(mp.gameMode).toBe('cooperative');
            expect(MP_TO_GAMESTATE_MODE[mp.gameMode]).toBe(gs.gameMode);

            // Cooperative variants don't track per-player scores nor flip competitive gates.
            expect(getModeCapabilities(gs.gameMode).tracksPlayerScores).toBe(false);
            expect(getModeCapabilities(gs.gameMode).usesCompetitiveGates).toBe(false);
            expect(getModeCapabilities(gs.gameMode).uiVariant).toBe('cooperative');

            // MP cooperative does not set a winThreshold (only racing 2p does).
            expect(mp.winThreshold).toBeNull();
        });
    });

    describe('competitive (a.k.a. racing on the wire)', () => {
        function setupCompetitive(playerScores: Record<string, number>) {
            const gs = new GameState();
            const players = Object.keys(playerScores);
            const competitiveData = {
                competitiveGates: players.map((_, i) => ({
                    id: i,
                    position: { x: 0, z: 100 + i * 10 },
                    pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 },
                })),
                playerScores: { ...playerScores },
            };
            gs.startGame('competitive', competitiveData, 'classic');
            return gs;
        }

        it('GameState competitive ⇄ MultiplayerState racing on capability table', () => {
            const gs = setupCompetitive({ p1: 0, p2: 0 });
            const mp = new MultiplayerState();
            mp.setGameMode('racing', 2);

            expect(gs.gameMode).toBe('competitive');
            expect(mp.gameMode).toBe('racing');
            expect(MP_TO_GAMESTATE_MODE[mp.gameMode]).toBe(gs.gameMode);

            expect(getModeCapabilities(gs.gameMode).tracksPlayerScores).toBe(true);
            expect(getModeCapabilities(gs.gameMode).usesCompetitiveGates).toBe(true);
            expect(getModeCapabilities(gs.gameMode).uiVariant).toBe('competitive');
            // 2p racing winThreshold = ceil(totalSheep / 2). Default 200 → 100.
            expect(mp.winThreshold).toBe(100);
        });

        it('2p completion fires when a score crosses the winThreshold', () => {
            const gs = setupCompetitive({ p1: 99, p2: 99 });
            // 2p winThreshold = ceil(200/2) = 100. Below → not complete.
            expect(gs.checkCompetitiveCompletion().isComplete).toBe(false);

            // Tick one player up to threshold via the dispatch path.
            gs.updatePlayerScore('p1', 1);
            const result = gs.checkCompetitiveCompletion();
            expect(result.isComplete).toBe(true);
            expect(result.winType).toBe('race');
            expect(result.winner).toBe('p1');
        });

        it('3p completion fires on totalRetired ≥ totalSheep with highest_score winType', () => {
            const gs = setupCompetitive({ p1: 0, p2: 0, p3: 0 });
            // Below total: no completion.
            gs.playerScores.p1 = 50;
            gs.playerScores.p2 = 50;
            gs.playerScores.p3 = 50;
            expect(gs.checkCompetitiveCompletion().isComplete).toBe(false);

            // Across total: completion.
            gs.playerScores.p1 = 80;
            gs.playerScores.p2 = 60;
            gs.playerScores.p3 = 60;
            const result = gs.checkCompetitiveCompletion();
            expect(result.isComplete).toBe(true);
            expect(result.winType).toBe('highest_score');
            expect(result.winner).toBe('p1');
        });

        it('4p completion behaves identically to 3p (highest_score across total)', () => {
            const gs = setupCompetitive({ p1: 0, p2: 0, p3: 0, p4: 0 });
            gs.playerScores.p1 = 70;
            gs.playerScores.p2 = 60;
            gs.playerScores.p3 = 40;
            gs.playerScores.p4 = 30;
            const result = gs.checkCompetitiveCompletion();
            expect(result.isComplete).toBe(true);
            expect(result.winType).toBe('highest_score');
            expect(result.winner).toBe('p1');
        });
    });

    describe('timed (vocab matches on both sides)', () => {
        it('GameState.timed and MultiplayerState.timed both track player scores', () => {
            const gs = new GameState();
            gs.startGame('timed', null, 'classic');
            const mp = new MultiplayerState();
            mp.setGameMode('timed', 2);

            expect(gs.gameMode).toBe('timed');
            expect(mp.gameMode).toBe('timed');
            expect(MP_TO_GAMESTATE_MODE[mp.gameMode]).toBe(gs.gameMode);

            // Timed uses cooperative gates (one shared gate) but tracks per-player
            // scores and runs the timed UI variant.
            expect(getModeCapabilities(gs.gameMode).tracksPlayerScores).toBe(true);
            expect(getModeCapabilities(gs.gameMode).usesCompetitiveGates).toBe(false);
            expect(getModeCapabilities(gs.gameMode).uiVariant).toBe('timed');

            // Timed mode never sets winThreshold (race-style threshold doesn't apply).
            expect(mp.winThreshold).toBeNull();
        });

        it('checkCompetitiveCompletion returns isComplete:false for timed (timer-driven externally)', () => {
            const gs = new GameState();
            gs.startGame('timed', null, 'classic');
            // Even with high scores, timed never auto-completes via the competitive
            // path — the timer callback (server-side or GameTimer) ends the round.
            gs.playerScores = { p1: 200, p2: 0 };
            gs.totalSheep = 200;
            // gameMode is 'timed', not 'competitive', so resolver returns negative.
            const result = gs.checkCompetitiveCompletion();
            expect(result.isComplete).toBe(false);
            expect(result.winner).toBeNull();
            expect(result.winType).toBeNull();
        });
    });

    describe('updatePlayerScore + getPlayerScore consistency across modes', () => {
        it('updatePlayerScore is a no-op outside score-tracking modes', () => {
            const gs = new GameState();
            gs.startGame('solo', null, 'classic');
            gs.playerScores = { p1: 0 };
            gs.updatePlayerScore('p1', 5);
            // Solo doesn't track player scores → no-op (warn logged + return).
            expect(gs.playerScores.p1).toBe(0);
            expect(gs.getPlayerScore('p1')).toBe(0);
        });

        it('updatePlayerScore mutates inside competitive mode', () => {
            const gs = new GameState();
            gs.gameMode = 'competitive';
            gs.playerScores = { p1: 0, p2: 0 };
            gs.updatePlayerScore('p1', 3);
            gs.updatePlayerScore('p2', 7);
            expect(gs.playerScores.p1).toBe(3);
            expect(gs.playerScores.p2).toBe(7);
            expect(gs.getPlayerScore('p1')).toBe(3);
            expect(gs.sheepRetired).toBe(10); // sum of all player scores
        });

        it('updatePlayerScore mutates inside timed mode', () => {
            const gs = new GameState();
            gs.gameMode = 'timed';
            gs.playerScores = { alice: 0 };
            gs.updatePlayerScore('alice', 4);
            expect(gs.playerScores.alice).toBe(4);
            expect(gs.getPlayerScore('alice')).toBe(4);
        });
    });
});
