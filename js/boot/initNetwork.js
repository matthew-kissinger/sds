/**
 * Multiplayer event-handler wiring + per-broadcast state hand-off
 * extracted from `main.js` in Cycle 28 Stream B1.
 *
 * `installMpEventHandlers` runs once when the game enters multiplayer
 * mode; binds NetworkManager's lifecycle callbacks onto the game
 * instance's state-mutation methods.
 *
 * `handleMultiplayerGameState` runs on every server broadcast (received
 * via WebSocket — event-driven, not part of the per-frame `update()`
 * loop). Mutates the client's GameState + sheep + sheepdog state from
 * the authoritative server payload.
 *
 * Behavior is unchanged from the original inline methods — same
 * callback shapes, same console logs, same branches.
 */

import { Vector2D } from '../Vector2D.js';

/**
 * @param {object} game SheepDogSimulation instance.
 */
export function installMpEventHandlers(game) {
    // Game state updates
    game.networkManager.onGameStateUpdate = (gameState) => {
        game.handleMultiplayerGameState(gameState);
    };

    // Connection state changes
    game.networkManager.onConnectionStateChange = (state) => {
        game.multiplayerState.updateConnectionStatus(state);

        if (state === 'disconnected') {
            // Handle disconnection - could show reconnection message
            console.log('Lost connection to server');
        }
    };

    // Room/player updates
    game.networkManager.onRoomUpdate = (room) => {
        if (room && room.players) {
            game.multiplayerState.updatePlayers(room.players, game.networkManager.getPlayerId());

            // Configure racing/timed mode if room has that setting
            if ((room.gameMode === 'racing' || room.gameMode === 'timed') && game.multiplayerState.gameMode !== room.gameMode) {
                console.log(`Configuring ${room.gameMode} mode from room update`);
                game.multiplayerState.setGameMode(room.gameMode, room.players.length);
                game.gameState.setGameMode(room.gameMode);
                game.gameState.setCurrentPlayerId(game.networkManager.getPlayerId());
            }
        }
    };

    game.networkManager.onPlayerUpdate = (update) => {
        if (update.type === 'joined' && update.player) {
            game.multiplayerState.addPlayer(update.player);
        } else if (update.type === 'left' && update.player) {
            game.multiplayerState.removePlayer(update.player.id);
            // Remove the player's 3D visualization
            game.removeOtherPlayer(update.player.id);
        } else if (update.type === 'gameComplete' && update.data) {
            // Handle game completion in multiplayer
            console.log('[GAME] Game completed! Final state:', update.data);
            console.log('Current gameState.sheepRetired:', game.gameState.sheepRetired);
            console.log('Current gameState.gameCompleted:', game.gameState.gameCompleted);

            // Handle racing/timed vs cooperative completion
            if ((update.data.isCompetitive || update.data.isTimedMode) && update.data.competitive) {
                // Racing/timed mode completion
                const modeName = update.data.isTimedMode ? 'timed' : 'racing';
                console.log(`Triggering ${modeName} completion UI...`);
                console.log(`${modeName} completion data:`, update.data.competitive);

                game.gameState.gameCompleted = true;
                const finalTime = game.gameTimer.stop();

                // Play appropriate completion sound
                const currentPlayerId = game.networkManager?.getPlayerId();
                const isWinner = update.data.competitive.winner === currentPlayerId;

                // Save best score for timed mode
                if (update.data.isTimedMode && currentPlayerId) {
                    const myScore = update.data.competitive.finalScores[currentPlayerId] || 0;
                    const isNewRecord = game.saveTimedModeScore(myScore);
                    if (isNewRecord) {
                        console.log(`[GAME] New best score in timed mode: ${myScore} sheep!`);
                    }
                }

                if (isWinner) {
                    game.audioManager.playVictorySound();
                    console.log('[GAME] Victory sound played');
                } else {
                    game.audioManager.playLossSound();
                    console.log('[GAME] Loss sound played');
                }

                // Show competitive/timed completion overlay
                const mode = update.data.isTimedMode ? 'timed' : 'racing';
                game.showCompletionOverlay(mode, {
                    finalTime,
                    competitive: update.data.competitive,
                    isWinner,
                    myScore: update.data.competitive.finalScores[currentPlayerId] || 0
                });

                game.mobileControls.disable();
            } else {
                // Cooperative mode completion
                // Force final sheep count update
                if (update.data.sheepRetired !== undefined) {
                    console.log('Updating sheep count from', game.gameState.sheepRetired, 'to', update.data.sheepRetired);
                    game.gameState.sheepRetired = update.data.sheepRetired;
                }

                // Trigger game completion
                if (update.data.gameCompleted) {
                    console.log('Triggering cooperative completion UI...');
                    game.gameState.gameCompleted = true;
                    const finalTime = game.gameTimer.stop();

                    game.showCompletionOverlay('cooperative', {
                        finalTime,
                        sheepCount: game.gameState.sheepRetired,
                        totalSheep: game.gameState.sheep.length
                    });
                    game.mobileControls.disable();
                } else {
                    console.log('Game completion data received but gameCompleted flag is', update.data.gameCompleted);
                }
            }
        } else if (update.type === 'competitiveStateRestored') {
            // Handle competitive state restoration after reconnection
            console.log('[GAME] Restoring competitive state after reconnection:', update.data);

            if (game.multiplayerState.gameMode === 'racing' || game.multiplayerState.gameMode === 'timed') {
                // Show the completion overlay using the React CompletionScreen
                const currentPlayerId = game.networkManager.getPlayerId();
                const isWinner = update.data.winner === currentPlayerId;
                const mode = update.data.isTimedMode ? 'timed' : 'racing';

                game.showCompletionOverlay(mode, {
                    finalTime: update.data.finalTime || 0,
                    competitive: update.data,
                    isWinner,
                    myScore: update.data.finalScores?.[currentPlayerId] || 0
                });
            }
        }

        // Update current room data
        if (game.networkManager.getCurrentRoom()) {
            const room = game.networkManager.getCurrentRoom();
            game.multiplayerState.updatePlayers(room.players, game.networkManager.getPlayerId());
        }
    };

    // Error handling
    game.networkManager.onError = (message) => {
        console.error('Multiplayer error:', message);
        // Could show error notification in UI
    };

    // Ping updates
    game.networkManager.onPingUpdate = (pingMs) => {
        game.multiplayerState.updatePing(pingMs);
    };
}

/**
 * Per-broadcast server-state hand-off. Mutates the client's GameState,
 * sheep, sheepdog, and competitive-mode state from the authoritative
 * server payload. Wired via `installMpEventHandlers` →
 * `networkManager.onGameStateUpdate`.
 *
 * @param {object} game SheepDogSimulation instance.
 * @param {object} serverState Decoded MP packet from the worker DO.
 */
export function handleMultiplayerGameState(game, serverState) {
    if (!game.isMultiplayer || !serverState) return;

    // Store server state for sprint state prediction
    if (game.networkManager) {
        game.networkManager.lastServerState = serverState;
    }

    // Update sheep positions from server with frame-based movement
    if (serverState.sheep && game.gameState.getSheep()) {
        const clientSheep = game.gameState.getSheep();

        for (let i = 0; i < Math.min(serverState.sheep.length, clientSheep.length); i++) {
            const serverSheepData = serverState.sheep[i];
            const clientSheepEntity = clientSheep[i];

            if (serverSheepData && clientSheepEntity) {
                if (serverSheepData.state !== undefined) {
                    clientSheepEntity.state = serverSheepData.state;
                }

                if (serverSheepData.hasPassedGate !== undefined) {
                    clientSheepEntity.hasPassedGate = serverSheepData.hasPassedGate;
                }
                if (serverSheepData.isRetiring !== undefined) {
                    clientSheepEntity.isRetiring = serverSheepData.isRetiring;
                }

                if (serverSheepData.assignedGate !== undefined) {
                    clientSheepEntity.assignedGate = serverSheepData.assignedGate;
                }

                // Only update positions for active sheep (not retiring or grazing)
                if (!clientSheepEntity.isRetiring && clientSheepEntity.state !== 2) {
                    clientSheepEntity.position.x = serverSheepData.x;
                    clientSheepEntity.position.z = serverSheepData.z;

                    if (serverSheepData.vx !== undefined && serverSheepData.vz !== undefined) {
                        clientSheepEntity.velocity.x = serverSheepData.vx;
                        clientSheepEntity.velocity.z = serverSheepData.vz;
                    }

                    // Snapshot for velocity-based extrapolation between packets.
                    // Late packets predict forward from this base using vx/vz so
                    // sheep keep moving smoothly instead of freezing.
                    clientSheepEntity._netBaseX = serverSheepData.x;
                    clientSheepEntity._netBaseZ = serverSheepData.z;
                    clientSheepEntity._netVx = serverSheepData.vx || 0;
                    clientSheepEntity._netVz = serverSheepData.vz || 0;
                    clientSheepEntity._netBaseTs = performance.now();
                } else {
                    // Retiring/grazing sheep: disable extrapolation.
                    clientSheepEntity._netBaseTs = 0;
                }

                if (serverSheepData.targetX !== undefined && serverSheepData.targetZ !== undefined) {
                    if (!clientSheepEntity.retirementTarget) {
                        clientSheepEntity.retirementTarget = new Vector2D(0, 0);
                    }
                    clientSheepEntity.retirementTarget.x = serverSheepData.targetX;
                    clientSheepEntity.retirementTarget.z = serverSheepData.targetZ;
                } else if (clientSheepEntity.isRetiring && serverSheepData.state === 2) {
                    clientSheepEntity.retirementTarget = null;
                }
                if (serverSheepData.facing !== undefined) {
                    clientSheepEntity.facingDirection = serverSheepData.facing;
                }
            }
        }

        // Force visual update of sheep positions in multiplayer mode
        if (game.gameState.optimizedSheepSystem &&
            typeof game.gameState.optimizedSheepSystem.forceUpdateSheepPositions === 'function') {
            game.gameState.optimizedSheepSystem.forceUpdateSheepPositions();
        } else {
            console.warn('optimizedSheepSystem not available or method missing');
        }
    }

    // Update sheepdog positions from server
    if (serverState.sheepdogs && game.sheepdog) {
        const currentPlayerId = game.networkManager.getPlayerId();
        const mySheepdogData = serverState.sheepdogs.find(dog => dog.playerId === currentPlayerId);

        if (mySheepdogData) {
            // Just store the server's authoritative state — the reconciliation
            // logic handles position correction.
            game.serverDogPosition = { x: mySheepdogData.x, z: mySheepdogData.z };
            game.lastServerUpdate = performance.now();
            game.serverIsInterpolatingToClient = mySheepdogData.interpolatingToClient || false;
        }

        // Other players' sheepdogs with full animation data
        for (const dogData of serverState.sheepdogs) {
            if (dogData.playerId !== currentPlayerId) {
                game.updateOtherPlayer(dogData);
            }
        }
    }

    // Update game state based on mode
    if (serverState.competitive && serverState.competitive.playerScores) {
        const competitiveData = serverState.competitive;
        const previousScores = game.gameState.playerScores || {};
        const currentPlayerId = game.networkManager?.getPlayerId();

        // Detect scoring events
        if (Object.keys(previousScores).length > 0) {
            for (const [playerId, currentScore] of Object.entries(competitiveData.playerScores)) {
                const previousScore = previousScores[playerId] || 0;
                if (currentScore > previousScore) {
                    if (playerId === currentPlayerId) {
                        game.audioManager.playScoreSound();
                        console.log('[GAME] You scored!');
                    } else {
                        game.audioManager.playOpponentScoreSound();
                        console.log('[GAME] Opponent scored');
                    }
                }
            }
        }

        game.gameState.playerScores = { ...competitiveData.playerScores };
        game.gameState.sheepRetired = Object.values(competitiveData.playerScores).reduce((sum, score) => sum + score, 0);

        // Update competitive gates information if available
        if (competitiveData.gates) {
            // Transform server gate data format to client format
            const transformedGates = competitiveData.gates.map(serverGate => ({
                position: {
                    x: serverGate.x || 0,
                    z: serverGate.z || 0
                },
                width: 8,
                height: 4,
                id: serverGate.id,
                playerId: serverGate.playerId,
                color: serverGate.color,
                direction: serverGate.direction,
                pasture: serverGate.pasture,
                passageZone: {
                    minX: (serverGate.x || 0) - 4,
                    maxX: (serverGate.x || 0) + 4,
                    minZ: (serverGate.z || 0) - 2,
                    maxZ: (serverGate.z || 0) + 2
                }
            }));

            game.gameState.competitiveGates = transformedGates;

            if (Object.keys(game.gameState.playerScores).length === 0 && competitiveData.playerScores) {
                console.log('[GAME] Initializing competitive mode in GameState');
                game.gameState.initializeCompetitiveMode({
                    competitiveGates: transformedGates,
                    playerScores: competitiveData.playerScores
                });
            }

            if (!game.competitiveStructuresCreated) {
                console.log('[BUILD] Building competitive structures for the first time...');
                game.createCompetitiveStructures(transformedGates);
                game.competitiveStructuresCreated = true;
            }
        }

        if (competitiveData.winCondition) {
            game.gameState.winCondition = competitiveData.winCondition;
            game.checkRacingEndgameMusic(competitiveData.winCondition);
        }

        if (game.multiplayerState.gameMode === 'competitive' || game.multiplayerState.gameMode === 'timed') {
            game.multiplayerState.updatePlayerScores(competitiveData.playerScores);

            if (competitiveData.winCondition) {
                game.multiplayerState.updateWinProgress(competitiveData.winCondition);
            }
        }

        console.log('Updated competitive scores:', competitiveData.playerScores);
        if (competitiveData.winCondition) {
            console.log('Win progress:', competitiveData.winCondition);
        }
    } else if (serverState.sheepRetired !== undefined) {
        game.gameState.sheepRetired = serverState.sheepRetired;
    }

    // Handle timed mode data
    if (serverState.timedMode) {
        const { timeRemaining, gameDuration } = serverState.timedMode;

        if (game.gameTimer.isCountdown) {
            const elapsedMs = gameDuration - timeRemaining;
            game.gameTimer.currentTime = elapsedMs / 1000;
            game.gameTimer.updateTimerDisplay();
        }

        if (timeRemaining < 30000 && !game.endgameMusicPlaying) {
            game.audioManager.playCompetitiveEndgameMusic();
            game.endgameMusicPlaying = true;
        }
    }
}
