// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * GameBridge — façade over the game instance so React + other modules don't
 * reach into window.gameInstance directly. Accessors return null when the
 * game hasn't booted yet; action methods no-op unless the instance supports
 * the requested method.
 *
 * Also hosts the per-frame event bus: main.animate() emits 'frame' after
 * each render; useGameState subscribes so HUD reads are rAF-aligned and
 * auto-throttle when the tab is backgrounded.
 */

let gameInstance = null;

const gameEvents = new EventTarget();

export function emitGameEvent(name) {
    gameEvents.dispatchEvent(new Event(name));
}

export function subscribeGameEvent(name, handler) {
    gameEvents.addEventListener(name, handler);
    return () => gameEvents.removeEventListener(name, handler);
}

export function setGameInstance(instance) {
    gameInstance = instance;
}

export const getGameInstance = () => gameInstance;

// Subsystem accessors — each returns null when the instance isn't ready.
export const getNetworkManager     = () => gameInstance?.networkManager     ?? null;
export const getAudioManager       = () => gameInstance?.audioManager       ?? null;
export const getTerrainBuilder     = () => gameInstance?.terrainBuilder     ?? null;
export const getGrassSystem        = () => gameInstance?.terrainBuilder?.grassSystem ?? null;
export const getSceneManager       = () => gameInstance?.sceneManager       ?? null;
export const getGameState          = () => gameInstance?.gameState          ?? null;
export const getGameTimer          = () => gameInstance?.gameTimer          ?? null;
export const getInputHandler       = () => gameInstance?.inputHandler       ?? null;
export const getMobileControls     = () => gameInstance?.mobileControls     ?? null;
export const getPerformanceMonitor = () => gameInstance?.performanceMonitor ?? null;
export const getSheepdog           = () => gameInstance?.sheepdog           ?? null;
export const getMenuController     = () => gameInstance?.menuController     ?? null;
export const getMultiplayerState   = () => gameInstance?.multiplayerState   ?? null;

// Status queries.
export const isGameActive   = () => gameInstance?.gameState?.isGameActive?.() ?? false;
export const isCurrentHost  = () => gameInstance?.isCurrentHost?.() ?? false;
export const getCurrentRoom = () => gameInstance?.getCurrentRoom?.() ?? null;
export const getSelectedDog = () => gameInstance?.getSelectedDog?.() ?? null;

// Action methods. Delegate to the instance; no-op (or reject, for async) when not booted.
export function startSoloGame(dogType, mode = 'classic') {
    gameInstance?.startSoloGame?.(dogType, mode);
}

export function startSandboxGame(dogType, sandboxConfig) {
    gameInstance?.startSandboxGame?.(dogType, sandboxConfig);
}

export function selectDog(dogType) {
    gameInstance?.selectDog?.(dogType);
}

export function startMultiplayerGame() {
    gameInstance?.startMultiplayerGame?.();
}

export function leaveRoom() {
    gameInstance?.leaveRoom?.();
}

export async function createRoom(playerName, settings, dogType) {
    if (!gameInstance?.createRoom) throw new Error('Game not initialized');
    return gameInstance.createRoom(playerName, settings, dogType);
}

export async function joinRoom(roomCode, playerName, dogType) {
    if (!gameInstance?.joinRoom) throw new Error('Game not initialized');
    return gameInstance.joinRoom(roomCode, playerName, dogType);
}

export async function quickMatch(playerName, dogType) {
    if (!gameInstance?.quickMatch) throw new Error('Game not initialized');
    return gameInstance.quickMatch(playerName, dogType);
}
