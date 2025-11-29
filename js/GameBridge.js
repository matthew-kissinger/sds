/**
 * GameBridge - Central access point for game instance and subsystems
 *
 * This module provides a clean interface for React components and other modules
 * to access game functionality without relying on window.gameInstance global.
 *
 * Usage:
 *   import { getGameInstance, getNetworkManager, getAudioManager } from './GameBridge.js';
 *
 *   // In React components or other modules:
 *   const nm = getNetworkManager();
 *   if (nm) nm.connect();
 */

let gameInstance = null;

/**
 * Set the game instance (called once during initialization)
 * @param {Object} instance - The main game instance
 */
export function setGameInstance(instance) {
    gameInstance = instance;
    // Also set on window for backwards compatibility during migration
    if (typeof window !== 'undefined') {
        window.gameInstance = instance;
    }
}

/**
 * Get the main game instance
 * @returns {Object|null} - The game instance or null if not initialized
 */
export function getGameInstance() {
    return gameInstance;
}

/**
 * Get the network manager
 * @returns {Object|null} - NetworkManager instance or null
 */
export function getNetworkManager() {
    return gameInstance?.networkManager || null;
}

/**
 * Get the audio manager
 * @returns {Object|null} - AudioManager instance or null
 */
export function getAudioManager() {
    return gameInstance?.audioManager || null;
}

/**
 * Get the terrain builder
 * @returns {Object|null} - TerrainBuilder instance or null
 */
export function getTerrainBuilder() {
    return gameInstance?.terrainBuilder || null;
}

/**
 * Get the scene manager
 * @returns {Object|null} - SceneManager instance or null
 */
export function getSceneManager() {
    return gameInstance?.sceneManager || null;
}

/**
 * Get the game state manager
 * @returns {Object|null} - GameState instance or null
 */
export function getGameState() {
    return gameInstance?.gameState || null;
}

/**
 * Get the game timer
 * @returns {Object|null} - GameTimer instance or null
 */
export function getGameTimer() {
    return gameInstance?.gameTimer || null;
}

/**
 * Get the input handler
 * @returns {Object|null} - InputHandler instance or null
 */
export function getInputHandler() {
    return gameInstance?.inputHandler || null;
}

/**
 * Get the mobile controls
 * @returns {Object|null} - MobileControls instance or null
 */
export function getMobileControls() {
    return gameInstance?.mobileControls || null;
}

/**
 * Get the performance monitor
 * @returns {Object|null} - PerformanceMonitor instance or null
 */
export function getPerformanceMonitor() {
    return gameInstance?.performanceMonitor || null;
}

/**
 * Get the sheepdog instance
 * @returns {Object|null} - Sheepdog instance or null
 */
export function getSheepdog() {
    return gameInstance?.sheepdog || null;
}

/**
 * Get the start screen
 * @returns {Object|null} - StartScreen instance or null
 */
export function getStartScreen() {
    return gameInstance?.startScreen || null;
}

/**
 * Get the multiplayer UI
 * @returns {Object|null} - MultiplayerUI instance or null
 */
export function getMultiplayerUI() {
    return gameInstance?.multiplayerUI || null;
}

// Game action methods - these call methods on the game instance

/**
 * Start a solo game
 * @param {string} dogType - The selected dog type
 * @param {string} mode - The game mode ('classic', 'time_attack', 'extreme')
 */
export function startSoloGame(dogType, mode = 'classic') {
    if (gameInstance?.startSoloGame) {
        gameInstance.startSoloGame(dogType, mode);
    }
}

/**
 * Start a sandbox game with custom configuration
 * @param {string} dogType - The selected dog type
 * @param {Object} sandboxConfig - The sandbox configuration object
 */
export function startSandboxGame(dogType, sandboxConfig) {
    if (gameInstance?.startSandboxGame) {
        gameInstance.startSandboxGame(dogType, sandboxConfig);
    }
}

/**
 * Select a dog type
 * @param {string} dogType - The dog type to select
 */
export function selectDog(dogType) {
    if (gameInstance?.selectDog) {
        gameInstance.selectDog(dogType);
    }
}

/**
 * Get the currently selected dog
 * @returns {string|null} - The selected dog type or null
 */
export function getSelectedDog() {
    return gameInstance?.getSelectedDog?.() || null;
}

/**
 * Start a multiplayer game (when host starts the match)
 */
export function startMultiplayerGame() {
    if (gameInstance?.startMultiplayerGame) {
        gameInstance.startMultiplayerGame();
    }
}

/**
 * Create a multiplayer room
 * @param {string} playerName - Player's display name
 * @param {Object} settings - Room settings
 * @param {string} dogType - Selected dog type
 * @returns {Promise} - Resolves when room is created
 */
export async function createRoom(playerName, settings, dogType) {
    if (gameInstance?.createRoom) {
        return gameInstance.createRoom(playerName, settings, dogType);
    }
    throw new Error('Game not initialized');
}

/**
 * Join a multiplayer room
 * @param {string} roomCode - The room code to join
 * @param {string} playerName - Player's display name
 * @param {string} dogType - Selected dog type
 * @returns {Promise} - Resolves when joined
 */
export async function joinRoom(roomCode, playerName, dogType) {
    if (gameInstance?.joinRoom) {
        return gameInstance.joinRoom(roomCode, playerName, dogType);
    }
    throw new Error('Game not initialized');
}

/**
 * Quick match - find and join an available room
 * @param {string} playerName - Player's display name
 * @param {string} dogType - Selected dog type
 * @returns {Promise} - Resolves when matched
 */
export async function quickMatch(playerName, dogType) {
    if (gameInstance?.quickMatch) {
        return gameInstance.quickMatch(playerName, dogType);
    }
    throw new Error('Game not initialized');
}

/**
 * Leave the current multiplayer room
 */
export function leaveRoom() {
    if (gameInstance?.leaveRoom) {
        gameInstance.leaveRoom();
    }
}

/**
 * Get the current room info
 * @returns {Object|null} - Current room or null
 */
export function getCurrentRoom() {
    return gameInstance?.getCurrentRoom?.() || null;
}

/**
 * Check if current player is the host
 * @returns {boolean} - True if host
 */
export function isCurrentHost() {
    return gameInstance?.isCurrentHost?.() || false;
}

/**
 * Check if game is currently active
 * @returns {boolean} - True if game is active
 */
export function isGameActive() {
    return gameInstance?.gameState?.isGameActive?.() || false;
}

// Expose on window for backwards compatibility during gradual migration
if (typeof window !== 'undefined') {
    window.gameBridge = {
        setGameInstance,
        getGameInstance,
        getNetworkManager,
        getAudioManager,
        getTerrainBuilder,
        getSceneManager,
        getGameState,
        getGameTimer,
        getInputHandler,
        getMobileControls,
        getPerformanceMonitor,
        getSheepdog,
        getStartScreen,
        getMultiplayerUI,
        startSoloGame,
        startSandboxGame,
        selectDog,
        getSelectedDog,
        startMultiplayerGame,
        createRoom,
        joinRoom,
        quickMatch,
        leaveRoom,
        getCurrentRoom,
        isCurrentHost,
        isGameActive
    };
}
