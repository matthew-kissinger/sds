import { useState, useEffect } from 'react';
import { getGameState, getGameTimer, getNetworkManager, getMultiplayerUI, getSheepdog } from '../../GameBridge.js';

/**
 * Game state polling hook
 * Provides reactive access to game state for HUD components
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
        players: [],
        myPlayerId: null,
        scores: {},
        gates: {},
        timeLimit: 0
    });

    useEffect(() => {
        // Poll game state at 60fps
        const pollInterval = setInterval(() => {
            const gameState = getGameState();
            const gameTimer = getGameTimer();
            const networkManager = getNetworkManager();
            const multiplayerUI = getMultiplayerUI();

            if (gameState && gameTimer) {
                const sheepdog = getSheepdog();

                // Get sheep count based on game mode and multiplayer status
                let sheepCount = 0;
                const isInMultiplayer = networkManager?.currentRoom;
                const actualGameMode = isInMultiplayer
                    ? (multiplayerUI?.gameMode || networkManager?.currentRoom?.gameMode || 'cooperative')
                    : 'solo';

                if (isInMultiplayer && (actualGameMode === 'competitive' || actualGameMode === 'timed')) {
                    // In multiplayer racing/timed mode, show player's individual score
                    const playerId = networkManager?.getPlayerId();
                    sheepCount = gameState.getPlayerScore(playerId) || 0;
                } else if (isInMultiplayer && actualGameMode === 'cooperative') {
                    // In cooperative multiplayer mode, show total sheep collected by all players
                    sheepCount = gameState.sheepRetired || 0;
                } else {
                    // In single player mode, show sheep retired
                    sheepCount = gameState.sheepRetired || 0;
                }

                // Calculate stamina percentage based on dog's max stamina
                const currentStamina = sheepdog?.stamina || 100;
                const maxStamina = sheepdog?.maxStamina || 100;
                const staminaPercentage = Math.round((currentStamina / maxStamina) * 100);

                const newData = {
                    stamina: currentStamina,
                    maxStamina: maxStamina,
                    staminaPercentage: staminaPercentage,
                    sheepCount: sheepCount,
                    totalSheep: gameState.totalSheep || 200,
                    gameTime: gameTimer.getGameTime ? gameTimer.getGameTime() : 0,
                    isComplete: gameState.isComplete || false,
                    isPaused: gameState.paused || false,
                    gameMode: actualGameMode,
                    singlePlayerMode: gameState.singlePlayerMode || 'classic'
                };

                // Add multiplayer data if available
                if (networkManager?.currentRoom) {
                    newData.players = multiplayerUI?.currentPlayers || [];
                    newData.myPlayerId = networkManager.getPlayerId();
                    newData.scores = gameState.playerScores || {};
                    newData.gates = gameState.competitiveGates || {};
                    newData.gameMode = gameState.gameMode || multiplayerUI?.gameMode || networkManager?.currentRoom?.gameMode || 'cooperative';
                    newData.timeLimit = newData.gameMode === 'timed' ? 180 : 0;
                }

                setGameData(newData);
            }
        }, 16); // 60fps

        return () => clearInterval(pollInterval);
    }, []);

    return gameData;
}
