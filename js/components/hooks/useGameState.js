import { useState, useEffect } from 'react';
import {
    getGameState,
    getGameTimer,
    getNetworkManager,
    getMultiplayerState,
    getSheepdog,
    getSceneManager,
    subscribeGameEvent,
} from '../../GameBridge.js';

/**
 * Reactive game-state hook for HUD components.
 *
 * Subscribes to the per-frame 'frame' event emitted by the animate loop
 * (see `main.js` → `emitGameEvent('frame')`). Previously this was a
 * `setInterval(..., 16)` poll across five managers; the subscription keeps
 * the same cadence but unsubscribes cleanly on unmount and doesn't tick
 * when the page is backgrounded (rAF-driven).
 */
export function useGameState() {
    const [gameData, setGameData] = useState({
        stamina: 100,
        sheepCount: 0,
        totalSheep: 200,
        gameTime: 0,
        isComplete: false,
        isPaused: false,
        gameMode: 'solo',
        cameraMode: 'classic',
        players: [],
        myPlayerId: null,
        scores: {},
        gates: {},
        timeLimit: 0,
    });

    useEffect(() => {
        function readGameState() {
            const gameState = getGameState();
            const gameTimer = getGameTimer();
            if (!gameState || !gameTimer) return;

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

            const newData = {
                stamina: currentStamina,
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
            };

            if (networkManager?.currentRoom) {
                newData.players = multiplayerState?.currentPlayers || [];
                newData.myPlayerId = networkManager.getPlayerId();
                newData.scores = gameState.playerScores || {};
                newData.gates = gameState.competitiveGates || {};
                newData.gameMode = gameState.gameMode || multiplayerState?.gameMode || networkManager?.currentRoom?.gameMode || 'cooperative';
                newData.timeLimit = newData.gameMode === 'timed' ? 180 : 0;
            }

            setGameData(newData);
        }

        // Prime once on mount so the HUD has a value before the first frame event.
        readGameState();

        return subscribeGameEvent('frame', readGameState);
    }, []);

    return gameData;
}
