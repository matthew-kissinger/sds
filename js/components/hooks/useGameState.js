// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { useSyncExternalStore } from 'react';
import {
    getGameState,
    getGameTimer,
    getNetworkManager,
    getMultiplayerState,
    getSheepdog,
    getSceneManager,
    subscribeGameEvent,
} from '../../GameBridge.js';
import { getModeCapabilities } from '../../gamestate/modes.js';

/**
 * Reactive game-state store for HUD components.
 *
 * Cycle 47 P6: this used to be a per-component `useState` that called
 * `setGameData(newData)` with a fresh object on every 'frame' event, forcing a
 * full HUD reconciliation 60 times a second even when nothing visible changed.
 * It is now a single module-level store fed by `useSyncExternalStore`:
 *
 *   - One ref-counted 'frame' subscription shared across every HUD consumer
 *     (replaces N subscriptions for N components).
 *   - The snapshot reference is change-gated: a new object is only minted (and
 *     listeners only notified) when a HUD-relevant value actually changes.
 *     `getSnapshot()` returns the same reference across frames whose displayed
 *     values are identical, so React skips the re-render.
 *
 * The underlying GameBridge reads are unchanged from the previous poll, so the
 * multiplayer scoreboard and timer behave identically (see cycle-47 hard-stop
 * #4: snapshot-gate only, no GameBridge read changes).
 */

function makeInitialSnapshot() {
    return {
        stamina: 100,
        maxStamina: 100,
        staminaPercentage: 100,
        sheepCount: 0,
        totalSheep: 200,
        gameTime: 0,
        isComplete: false,
        isPaused: false,
        gameMode: 'solo',
        singlePlayerMode: 'classic',
        cameraMode: 'classic',
        players: [],
        myPlayerId: null,
        scores: {},
        gates: {},
        timeLimit: 0,
        // Cycle 59 (Counting Sheep): round-based readout. roundBased gates the
        // counting HUD variant; round is the current round; counted is the
        // running banked-score total (= penned sheep).
        roundBased: false,
        round: 0,
        counted: 0,
    };
}

let snapshot = makeInitialSnapshot();
const listeners = new Set();
let frameUnsub = null;

/**
 * Read the live game state through the GameBridge accessors. Returns a fresh
 * plain object, or null when the game has not booted yet (so the store keeps
 * its previous snapshot — matching the old early-return behavior).
 *
 * Stamina is quantized to a whole integer here (the bars round it anyway) so
 * sub-integer drift does not churn the snapshot. gameTime is kept raw; the
 * change-gate quantizes it to whole seconds, but the raw value is what the
 * countdown subtracts from `timeLimit`, so storing a floored value would shift
 * the timed-mode display by one second.
 */
function readGameState() {
    const gameState = getGameState();
    const gameTimer = getGameTimer();
    if (!gameState || !gameTimer) return null;

    const networkManager = getNetworkManager();
    const multiplayerState = getMultiplayerState();
    const sheepdog = getSheepdog();

    const isInMultiplayer = networkManager?.currentRoom;
    const actualGameMode = isInMultiplayer
        ? (multiplayerState?.gameMode || networkManager?.currentRoom?.gameMode || 'cooperative')
        : 'solo';

    let sheepCount;
    if (isInMultiplayer && (actualGameMode === 'competitive' || actualGameMode === 'timed')) {
        const playerId = networkManager?.getPlayerId();
        sheepCount = gameState.getPlayerScore(playerId) || 0;
    } else {
        sheepCount = gameState.sheepRetired || 0;
    }

    const currentStamina = sheepdog?.stamina || 100;
    const maxStamina = sheepdog?.maxStamina || 100;
    const staminaPercentage = Math.round((currentStamina / maxStamina) * 100);

    const cameraMode = getSceneManager()?.getCameraController?.()?.getMode?.() ?? 'classic';

    // Cycle 59: read the real (unforced) mode's capability to drive the counting
    // HUD variant. gameMode below stays forced to 'solo' for non-MP runs (lots of
    // HUD code keys on that), so roundBased is the single counting signal.
    const roundBased = getModeCapabilities(gameState.gameMode).roundBased === true;

    const newData = {
        stamina: Math.round(currentStamina),
        maxStamina,
        staminaPercentage,
        sheepCount,
        totalSheep: gameState.totalSheep || 200,
        gameTime: gameTimer.getGameTime ? gameTimer.getGameTime() : 0,
        isComplete: gameState.isComplete || false,
        isPaused: gameState.paused || false,
        gameMode: actualGameMode,
        singlePlayerMode: gameState.singlePlayerMode || 'classic',
        cameraMode,
        players: [],
        myPlayerId: null,
        scores: {},
        gates: {},
        timeLimit: 0,
        roundBased,
        round: gameState.countingState?.round ?? 0,
        counted: roundBased ? (gameState.sheepRetired || 0) : 0,
    };

    if (networkManager?.currentRoom) {
        newData.players = multiplayerState?.currentPlayers || [];
        newData.myPlayerId = networkManager.getPlayerId();
        newData.scores = gameState.playerScores || {};
        newData.gates = gameState.competitiveGates || {};
        newData.gameMode = gameState.gameMode || multiplayerState?.gameMode || networkManager?.currentRoom?.gameMode || 'cooperative';
        newData.timeLimit = newData.gameMode === 'timed' ? 180 : 0;
    }

    return newData;
}

/**
 * Whether two snapshots are equal for HUD-display purposes. gameTime is
 * compared at whole-second granularity (the timer renders MM:SS); the
 * multiplayer collections are small (<= 4 players) so a stringify compare is
 * cheap and avoids a desync from a missed scoreboard update.
 */
function hudEqual(a, b) {
    return (
        Math.floor(a.gameTime) === Math.floor(b.gameTime) &&
        a.stamina === b.stamina &&
        a.maxStamina === b.maxStamina &&
        a.staminaPercentage === b.staminaPercentage &&
        a.sheepCount === b.sheepCount &&
        a.totalSheep === b.totalSheep &&
        a.isComplete === b.isComplete &&
        a.isPaused === b.isPaused &&
        a.gameMode === b.gameMode &&
        a.singlePlayerMode === b.singlePlayerMode &&
        a.cameraMode === b.cameraMode &&
        a.myPlayerId === b.myPlayerId &&
        a.timeLimit === b.timeLimit &&
        a.roundBased === b.roundBased &&
        a.round === b.round &&
        a.counted === b.counted &&
        JSON.stringify(a.players) === JSON.stringify(b.players) &&
        JSON.stringify(a.scores) === JSON.stringify(b.scores) &&
        JSON.stringify(a.gates) === JSON.stringify(b.gates)
    );
}

function onFrame() {
    const next = readGameState();
    if (next && !hudEqual(snapshot, next)) {
        snapshot = next;
        for (const listener of listeners) listener();
    }
}

function subscribe(listener) {
    listeners.add(listener);
    if (listeners.size === 1) {
        // First consumer: prime the snapshot and attach the shared 'frame' bus.
        const primed = readGameState();
        if (primed) snapshot = primed;
        frameUnsub = subscribeGameEvent('frame', onFrame);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            if (frameUnsub) {
                frameUnsub();
                frameUnsub = null;
            }
            // Reset so a fresh game does not flash the prior round's HUD before
            // the first frame primes (matches the old per-mount useState reset).
            snapshot = makeInitialSnapshot();
        }
    };
}

function getSnapshot() {
    return snapshot;
}

/**
 * Test/advanced accessor for the module store. Components use the hook below;
 * the store is exposed so the change-gate can be exercised without mounting
 * React (see tests/ui/useGameState.store.spec.ts).
 */
export const gameStateStore = { subscribe, getSnapshot };

export function useGameState() {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
