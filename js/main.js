import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { GameState } from './GameState.js';
import { GameTimer } from './GameTimer.js';
import { TerrainBuilder } from './TerrainBuilder.js';
import { StructureBuilderV2 } from './StructureBuilderV2.js';
import { InputHandler } from './InputHandler.js';
import { MobileControls } from './MobileControls.js';
import { Sheepdog } from './Sheepdog.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';
import { StartScreen } from './StartScreen.js';
import { StaminaUI } from './StaminaUI.js';
import { AudioManager } from './AudioManager.js';
import { NetworkManager } from './NetworkManager.js';
import { MultiplayerUI } from './MultiplayerUI.js';
import { Vector2D } from './Vector2D.js';

/**
 * Main simulation controller - Enhanced with mobile controls support
 * Uses separate modules for different responsibilities
 */
class SheepDogSimulation {
    constructor() {
        // Initialize all modules
        this.sceneManager = new SceneManager();
        this.gameState = new GameState();
        this.gameTimer = new GameTimer();
        this.terrainBuilder = new TerrainBuilder(this.sceneManager.getScene());
        this.structureBuilder = new StructureBuilderV2(this.sceneManager.getScene());
        this.inputHandler = new InputHandler();
        this.performanceMonitor = new PerformanceMonitor();
        this.startScreen = new StartScreen(this.sceneManager);
        this.staminaUI = new StaminaUI();
        this.audioManager = new AudioManager(this.sceneManager.getCamera());
        this.multiplayerUI = new MultiplayerUI();
        
        // Create mobile controls with sceneManager and audioManager
        this.mobileControls = new MobileControls(this.sceneManager, this.audioManager);
        
        // Add mobile class to body if touch device detected
        if (this.mobileControls.getIsTouchDevice()) {
            document.body.classList.add('is-mobile');
            // Mobile UI now handled by React components
        }
        
        // Connect mobile controls to input handler and scene manager
        this.inputHandler.setMobileControls(this.mobileControls);
        this.sceneManager.setMobileControls(this.mobileControls);
        
        // Connect performance monitor and game state to input handler
        this.inputHandler.setPerformanceMonitor(this.performanceMonitor);
        
        // Set up debug completion callback for testing (with error handling)
        try {
            this.inputHandler.setDebugCompleteCallback(() => {
                this.debugInstantComplete();
            });
        } catch (e) {
            console.warn('Could not set debug completion callback:', e);
        }
        
        // Expose debug method to window for console access
        window.debugComplete = () => this.debugInstantComplete();
        
        // Set up pause functionality
        this.setupPauseHandling();
        
        // Set up start screen callback
        this.startScreen.setGameStartCallback((mode, roomData) => {
            this.startGame(mode, roomData);
        });
        
        // Pass audio manager to modules that need it
        this.gameState.setAudioManager(this.audioManager);
        this.startScreen.setAudioManager(this.audioManager);
        
        // Animation timing
        this.lastTime = performance.now();
        
        // Multiplayer state
        // Get NetworkManager from StartScreen (it creates one in its constructor)
        this.networkManager = this.startScreen.networkManager;
        this.isMultiplayer = false;
        this.otherPlayers = new Map(); // playerId -> Sheepdog instance
        this.playerWasMoving = false; // Track movement state from previous frame
        this.serverIsInterpolatingToClient = false; // Track when server is interpolating to our position
        this.competitiveStructuresCreated = false; // Track if we've built competitive structures
        
        // Client-side prediction and interpolation for multiplayer
        this.serverDogPosition = { x: 0, z: 0 };
        this.serverDogRotation = 0;
        this.lastServerUpdate = 0;
        this.interpolationSpeed = 2.5; // Reduced for smoother movement
        
        // Competitive mode audio state
        this.endgameMusicPlaying = false;
        
        // Initialize the simulation
        this.init();
        this.animate();
    }
    
    setupPauseHandling() {
        // Register pause callback with input handler
        this.inputHandler.onPauseToggle((isPaused) => {
            // Propagate pause state to timer
            this.gameTimer.setPaused(isPaused);
            
            // Propagate pause state to game state
            this.gameState.setPaused(isPaused);
        });
    }
    
    init() {
        // Create terrain and environment
        this.terrainBuilder.createTerrain();
        this.terrainBuilder.createGrass();
        this.terrainBuilder.createTrees();
        this.terrainBuilder.addEnvironmentDetails();
        
        // Create structures using new modular system
        this.structureBuilder.buildSinglePlayerStructures(
            this.gameState.getBounds(),
            this.gameState.getGate(),
            this.gameState.getPasture()
        );
        
        // Create sheepdog (but don't add to scene yet in pre-game state)
        // Note: We'll update speeds when entering multiplayer mode
        // Default to 'jep' for now, will be updated when game starts
        const sheepdog = new Sheepdog(0, -30, 'jep');
        this.sheepdog = sheepdog;
        this.sheepdogMesh = sheepdog.createMesh();
        this.gameState.setSheepdog(sheepdog);
        
        // Connect audio manager to sheepdog
        sheepdog.setAudioManager(this.audioManager);
        
        // Create optimized sheep flock (visible during start screen)
        this.gameState.createSheepFlock(this.sceneManager.getScene());
        
        // Setup controls
        this.sceneManager.setupMouseControls();
        
        // Set grass instance count for performance monitoring
        this.performanceMonitor.setGrassInstanceCount(this.terrainBuilder.getGrassInstanceCount());
    }
    
    startGame(mode = 'solo', roomData = null) {
        console.log(`Starting game in ${mode} mode`, {
            roomCode: roomData?.roomCode || 'none',
            playerCount: roomData?.players?.length || 0,
            roomData: roomData
        });
        
        // Store mode for future reference
        this.gameMode = mode;
        this.roomData = roomData;
        this.isMultiplayer = mode === 'multiplayer';
        
        // Get the selected dog type from the start screen
        const selectedDogType = this.startScreen.getSelectedDog();
        console.log(`Selected dog type: ${selectedDogType}`);
        
        // Remove the old sheepdog from scene if it exists
        if (this.sheepdogMesh) {
            this.sceneManager.remove(this.sheepdogMesh);
        }
        
        // Create new sheepdog with selected type
        const sheepdog = new Sheepdog(0, -30, selectedDogType);
        this.sheepdog = sheepdog;
        this.sheepdogMesh = sheepdog.createMesh();
        this.gameState.setSheepdog(sheepdog);
        
        // Connect audio manager to new sheepdog
        sheepdog.setAudioManager(this.audioManager);
        
        // Add new sheepdog to scene when game starts
        this.sceneManager.add(this.sheepdogMesh);
        
        // Enable mobile controls if on touch device
        if (this.mobileControls.getIsTouchDevice()) {
            this.mobileControls.enable();
        }
        
        // Start the game state
        // For multiplayer games, we'll set the specific game mode (competitive/timed) later when we have the data
        this.gameState.startGame(mode, null);
        
        // Store the intended game mode for later use
        if (roomData?.gameMode) {
            this.gameState.setGameMode(roomData.gameMode);
        }
        
        // Reset timer and stamina
        this.gameTimer.reset();
        this.staminaUI.reset();
        
        // Start countdown timer for timed mode
        if (roomData?.gameMode === 'timed') {
            this.gameTimer.startCountdown(3 * 60 * 1000); // 3 minutes
            console.log('⏱️ Started 3-minute countdown for timed mode');
            
            // Hide the "/ 200" stats display for timed mode
            const statsDiv = document.getElementById('stats');
            if (statsDiv) {
                statsDiv.style.display = 'none';
            }
            
            // Replace best time with best score for timed mode
            const bestTimeElement = document.getElementById('best-time');
            const mobileBestTimeElement = document.getElementById('mobile-best-time');
            if (bestTimeElement) {
                bestTimeElement.textContent = this.getBestScoreText();
            }
            if (mobileBestTimeElement) {
                mobileBestTimeElement.textContent = this.getBestScoreText();
            }
            
            // Initialize best score display
            this.updateBestScoreDisplay();
        } else {
            // Show stats for other modes
            const statsDiv = document.getElementById('stats');
            if (statsDiv) {
                statsDiv.style.display = 'block';
            }
            
            // Show best time for non-timed modes
            const bestTimeElement = document.getElementById('best-time');
            const mobileBestTimeElement = document.getElementById('mobile-best-time');
            if (bestTimeElement) {
                bestTimeElement.style.display = 'block';
            }
            if (mobileBestTimeElement) {
                mobileBestTimeElement.style.display = 'block';
            }
        }
        this.staminaUI.show();
        
        // Reset competitive audio state
        this.endgameMusicPlaying = false;
        
        // Start appropriate gameplay music
        if (this.audioManager.isMusicReady()) {
            this.audioManager.playGameplayMusic();
        }
        
        // Initialize multiplayer if needed
        if (mode === 'multiplayer' && roomData) {
            console.log(`Multiplayer room: ${roomData.roomCode || roomData.code || 'unknown'} with ${roomData.players?.length || 0} players`);
            // Enable 2x speeds for multiplayer
            this.sheepdog.setMultiplayerSpeeds(true);
            this.setupMultiplayer();
            
            // Configure UI for racing/timed mode if needed
            if (roomData.gameMode === 'racing' || roomData.gameMode === 'timed') {
                console.log(`Setting up ${roomData.gameMode} mode UI`);
                this.multiplayerUI.setGameMode(roomData.gameMode, roomData.players?.length || 0);
                this.gameState.setGameMode(roomData.gameMode);
                this.gameState.setCurrentPlayerId(this.networkManager?.getPlayerId());
                
                // Set timer mode for timed games
                if (roomData.gameMode === 'timed') {
                    this.gameTimer.setCountdownMode(true, 180); // 3 minutes = 180 seconds
                    console.log('⏱️ Timer set to countdown mode (3 minutes)');
                }
                
                // Set audio manager to competitive mode (also for timed)
                this.audioManager.setGameMode('competitive');
                const modeEmoji = roomData.gameMode === 'timed' ? '⏱️' : '🏆';
                console.log(`${modeEmoji} Audio manager set to competitive mode`);
                
                // Process initial game state if provided (contains competitive gates, etc.)
                if (roomData.initialGameState) {
                    console.log(`${modeEmoji} Processing initial game state for ${roomData.gameMode} mode`);
                    this.handleMultiplayerGameState(roomData.initialGameState);
                }
            } else {
                this.audioManager.setGameMode('multiplayer');
                
                // Reset camera to default position for cooperative multiplayer
                this.sceneManager.resetCameraToDefault();
            }
            
            // Send dog type to server
            if (this.networkManager) {
                console.log(`Sending dog type to server: ${selectedDogType}`);
                this.networkManager.sendDogType(selectedDogType);
            }
        } else if (mode === 'multiplayer') {
            console.log('Multiplayer mode but no room data available');
            // Enable 2x speeds for multiplayer
            this.sheepdog.setMultiplayerSpeeds(true);
            this.setupMultiplayer();
            
            // Set audio to multiplayer mode
            this.audioManager.setGameMode('multiplayer');
            
            // Reset camera to default position (cooperative mode assumption)
            this.sceneManager.resetCameraToDefault();
            
            // Send dog type to server
            if (this.networkManager) {
                console.log(`Sending dog type to server: ${selectedDogType}`);
                this.networkManager.sendDogType(selectedDogType);
            }
        } else {
            // Hide multiplayer UI for solo mode
            this.multiplayerUI.hide();
            this.audioManager.setGameMode('solo');
            
            // Reset camera to default position for solo mode
            this.sceneManager.resetCameraToDefault();
        }
    }
    
    setupMultiplayer() {
        // NetworkManager already available from constructor
        if (!this.networkManager) {
            console.error('NetworkManager not available');
            return;
        }
        
        // Show multiplayer UI
        this.multiplayerUI.show();
        
        // Set up network event handlers
        this.setupMultiplayerEventHandlers();
        
        // Initialize multiplayer UI with current room data
        if (this.roomData && this.roomData.players) {
            this.multiplayerUI.updatePlayers(this.roomData.players, this.networkManager.getPlayerId());
        }
        
        console.log('Multiplayer mode initialized');
    }
    
    setupMultiplayerEventHandlers() {
        // Game state updates
        this.networkManager.onGameStateUpdate = (gameState) => {
            this.handleMultiplayerGameState(gameState);
        };
        
        // Connection state changes
        this.networkManager.onConnectionStateChange = (state) => {
            this.multiplayerUI.updateConnectionStatus(state);
            
            if (state === 'disconnected') {
                // Handle disconnection - could show reconnection message
                console.log('Lost connection to server');
            }
        };
        
        // Room/player updates
        this.networkManager.onRoomUpdate = (room) => {
            if (room && room.players) {
                this.multiplayerUI.updatePlayers(room.players, this.networkManager.getPlayerId());
                
                // Configure racing/timed mode if room has that setting
                if ((room.gameMode === 'racing' || room.gameMode === 'timed') && this.multiplayerUI.gameMode !== room.gameMode) {
                    console.log(`Configuring ${room.gameMode} mode from room update`);
                    this.multiplayerUI.setGameMode(room.gameMode, room.players.length);
                    this.gameState.setGameMode(room.gameMode);
                    this.gameState.setCurrentPlayerId(this.networkManager.getPlayerId());
                }
            }
        };
        
        this.networkManager.onPlayerUpdate = (update) => {
            if (update.type === 'joined' && update.player) {
                this.multiplayerUI.addPlayer(update.player);
            } else if (update.type === 'left' && update.player) {
                this.multiplayerUI.removePlayer(update.player.id);
                // Remove the player's 3D visualization
                this.removeOtherPlayer(update.player.id);
            } else if (update.type === 'gameComplete' && update.data) {
                // Handle game completion in multiplayer
                console.log('🎉 Game completed! Final state:', update.data);
                console.log('Current gameState.sheepRetired:', this.gameState.sheepRetired);
                console.log('Current gameState.gameCompleted:', this.gameState.gameCompleted);
                
                // Handle racing/timed vs cooperative completion
                if ((update.data.isCompetitive || update.data.isTimedMode) && update.data.competitive) {
                    // Racing/timed mode completion
                    const modeName = update.data.isTimedMode ? 'timed' : 'racing';
                    console.log(`Triggering ${modeName} completion UI...`);
                    console.log(`${modeName} completion data:`, update.data.competitive);
                    
                    this.gameState.gameCompleted = true;
                    const finalTime = this.gameTimer.stop();
                    
                    // Play appropriate completion sound
                    const currentPlayerId = this.networkManager?.getPlayerId();
                    const isWinner = update.data.competitive.winner === currentPlayerId;
                    
                    // Save best score for timed mode
                    if (update.data.isTimedMode && currentPlayerId) {
                        const myScore = update.data.competitive.finalScores[currentPlayerId] || 0;
                        const isNewRecord = this.saveTimedModeScore(myScore);
                        if (isNewRecord) {
                            console.log(`🏆 New best score in timed mode: ${myScore} sheep!`);
                        }
                    }
                    
                    if (isWinner) {
                        this.audioManager.playVictorySound();
                        console.log('🏆 Victory sound played');
                    } else {
                        this.audioManager.playLossSound();
                        console.log('😔 Loss sound played');
                    }
                    
                    // Show competitive/timed completion overlay
                    const mode = update.data.isTimedMode ? 'timed' : 'racing';
                    this.showCompletionOverlay(mode, {
                        finalTime,
                        competitive: update.data.competitive,
                        isWinner,
                        myScore: update.data.competitive.finalScores[currentPlayerId] || 0
                    });
                    
                    this.mobileControls.disable();
                } else {
                    // Cooperative mode completion
                    // Force final sheep count update
                    if (update.data.sheepRetired !== undefined) {
                        console.log('Updating sheep count from', this.gameState.sheepRetired, 'to', update.data.sheepRetired);
                        this.gameState.sheepRetired = update.data.sheepRetired;
                    }
                    
                    // Trigger game completion
                    if (update.data.gameCompleted) {
                        console.log('Triggering cooperative completion UI...');
                        this.gameState.gameCompleted = true;
                        const finalTime = this.gameTimer.stop();
                        
                        this.showCompletionOverlay('cooperative', {
                            finalTime,
                            sheepCount: this.gameState.sheepRetired,
                            totalSheep: this.gameState.sheep.length
                        });
                        this.mobileControls.disable();
                    } else {
                        console.log('Game completion data received but gameCompleted flag is', update.data.gameCompleted);
                    }
                }
            } else if (update.type === 'competitiveStateRestored') {
                // Handle competitive state restoration after reconnection
                console.log('🏆 Restoring competitive state after reconnection:', update.data);
                
                                    if (this.multiplayerUI.gameMode === 'racing') {
                        // Show the racing completion overlay again
                        this.multiplayerUI.showCompetitiveCompletion(update.data);
                }
            }
            
            // Update current room data
            if (this.networkManager.getCurrentRoom()) {
                const room = this.networkManager.getCurrentRoom();
                this.multiplayerUI.updatePlayers(room.players, this.networkManager.getPlayerId());
            }
        };
        
        // Error handling
        this.networkManager.onError = (message) => {
            console.error('Multiplayer error:', message);
            // Could show error notification in UI
        };
        
        // Ping updates
        this.networkManager.onPingUpdate = (pingMs) => {
            this.multiplayerUI.updatePing(pingMs);
        };
    }
    
    handleMultiplayerGameState(serverState) {
        if (!this.isMultiplayer || !serverState) return;
        
        // Store server state for sprint state prediction
        if (this.networkManager) {
            this.networkManager.lastServerState = serverState;
        }
        
        // Update sheep positions from server with frame-based movement
        if (serverState.sheep && this.gameState.getSheep()) {
            const clientSheep = this.gameState.getSheep();
            const bounds = this.gameState.getBounds();
            const gate = this.gameState.getGate();
            
            for (let i = 0; i < Math.min(serverState.sheep.length, clientSheep.length); i++) {
                const serverSheepData = serverState.sheep[i];
                const clientSheepEntity = clientSheep[i];
                
                if (serverSheepData && clientSheepEntity) {
                    // Update sheep state properties from server first
                    if (serverSheepData.state !== undefined) {
                        clientSheepEntity.state = serverSheepData.state;
                    }
                    
                    // Update gate and retirement status directly from server
                    if (serverSheepData.hasPassedGate !== undefined) {
                        clientSheepEntity.hasPassedGate = serverSheepData.hasPassedGate;
                    }
                    if (serverSheepData.isRetiring !== undefined) {
                        clientSheepEntity.isRetiring = serverSheepData.isRetiring;
                    }
                    
                    // Only update positions for active sheep (not retiring or grazing)
                    if (!clientSheepEntity.isRetiring && clientSheepEntity.state !== 2) {
                        // Trust server positions for active sheep
                        clientSheepEntity.position.x = serverSheepData.x;
                        clientSheepEntity.position.z = serverSheepData.z;
                        
                        // Update velocity for animation purposes
                        if (serverSheepData.vx !== undefined && serverSheepData.vz !== undefined) {
                            clientSheepEntity.velocity.x = serverSheepData.vx;
                            clientSheepEntity.velocity.z = serverSheepData.vz;
                        }
                    }
                    
                    // Update retirement target if provided
                    if (serverSheepData.targetX !== undefined && serverSheepData.targetZ !== undefined) {
                        if (!clientSheepEntity.retirementTarget) {
                            clientSheepEntity.retirementTarget = new Vector2D(0, 0);
                        }
                        clientSheepEntity.retirementTarget.x = serverSheepData.targetX;
                        clientSheepEntity.retirementTarget.z = serverSheepData.targetZ;
                    } else if (clientSheepEntity.isRetiring && serverSheepData.state === 2) {
                        // Grazing sheep should have no retirement target
                        clientSheepEntity.retirementTarget = null;
                    }
                    if (serverSheepData.facing !== undefined) {
                        clientSheepEntity.facingDirection = serverSheepData.facing;
                    }
                }
            }
            
            // Force visual update of sheep positions in multiplayer mode
            if (this.gameState.optimizedSheepSystem && 
                typeof this.gameState.optimizedSheepSystem.forceUpdateSheepPositions === 'function') {
                this.gameState.optimizedSheepSystem.forceUpdateSheepPositions();
            } else {
                console.warn('optimizedSheepSystem not available or method missing');
            }
        }
        
        // Update sheepdog positions from server
        if (serverState.sheepdogs && this.sheepdog) {
            const currentPlayerId = this.networkManager.getPlayerId();
            
            // Find my sheepdog data
            const mySheepdogData = serverState.sheepdogs.find(dog => dog.playerId === currentPlayerId);
            
            if (mySheepdogData) {
                // JUST STORE the server's authoritative state
                // The reconciliation logic will handle position correction
                this.serverDogPosition = { x: mySheepdogData.x, z: mySheepdogData.z };
                this.lastServerUpdate = performance.now();
                
                // Check if server is interpolating to our position
                this.serverIsInterpolatingToClient = mySheepdogData.interpolatingToClient || false;
                
                // Note: Stamina and sprinting state will be handled in reconciliation
            }
            
            // Handle other players' sheepdogs with full animation data
            for (const dogData of serverState.sheepdogs) {
                if (dogData.playerId !== currentPlayerId) {
                    // Pass the entire dogData object for full animation support
                    this.updateOtherPlayer(dogData);
                }
            }
        }
        
        // Update game state based on mode
        if (serverState.competitive && serverState.competitive.playerScores) {
            // Competitive mode: update player scores and progress
            const competitiveData = serverState.competitive;
            
            // Check for score changes to play appropriate sounds
            const previousScores = this.gameState.playerScores || {};
            const currentPlayerId = this.networkManager?.getPlayerId();
            
            // Detect scoring events
            if (Object.keys(previousScores).length > 0) {
                for (const [playerId, currentScore] of Object.entries(competitiveData.playerScores)) {
                    const previousScore = previousScores[playerId] || 0;
                    if (currentScore > previousScore) {
                        // Someone scored!
                        if (playerId === currentPlayerId) {
                            // Player scored
                            this.audioManager.playScoreSound();
                            console.log('🎯 You scored!');
                        } else {
                            // Opponent scored
                            this.audioManager.playOpponentScoreSound();
                            console.log('🎯 Opponent scored');
                        }
                    }
                }
            }
            
            // Update player scores in game state
            this.gameState.playerScores = { ...competitiveData.playerScores };
            
            // Update total sheep retired for UI
            this.gameState.sheepRetired = Object.values(competitiveData.playerScores).reduce((sum, score) => sum + score, 0);
            
            // Update competitive gates information if available
            if (competitiveData.gates) {
                // Transform server gate data format to client format FIRST
                const transformedGates = competitiveData.gates.map(serverGate => ({
                    // Transform flattened server format to nested client format
                    position: {
                        x: serverGate.x || 0,
                        z: serverGate.z || 0
                    },
                    width: 8, // Default gate width
                    height: 4, // Default gate height
                    id: serverGate.id,
                    playerId: serverGate.playerId,
                    color: serverGate.color,
                    direction: serverGate.direction,
                    pasture: serverGate.pasture,
                    // Add passage zone for gate detection
                    passageZone: {
                        minX: (serverGate.x || 0) - 4,
                        maxX: (serverGate.x || 0) + 4,
                        minZ: (serverGate.z || 0) - 2,
                        maxZ: (serverGate.z || 0) + 2
                    }
                }));
                
                // Set the transformed gates in GameState
                this.gameState.competitiveGates = transformedGates;
                
                // Initialize competitive mode in game state if not already done
                if (Object.keys(this.gameState.playerScores).length === 0 && competitiveData.playerScores) {
                    console.log('🎮 Initializing competitive mode in GameState');
                    this.gameState.initializeCompetitiveMode({
                        competitiveGates: transformedGates,
                        playerScores: competitiveData.playerScores
                    });
                }
                
                // Build competitive structures if this is the first time receiving competitive data
                if (!this.competitiveStructuresCreated) {
                    console.log('🏗️ Building competitive structures for the first time...');
                    this.createCompetitiveStructures(transformedGates);
                    this.competitiveStructuresCreated = true;
                }
            }
            
            // Update win condition progress
            if (competitiveData.winCondition) {
                this.gameState.winCondition = competitiveData.winCondition;
                
                // Check if we're in endgame phase for tension music
                this.checkRacingEndgameMusic(competitiveData.winCondition);
            }
            
            // Update multiplayer UI with all competitive data
            if (this.multiplayerUI.gameMode === 'competitive' || this.multiplayerUI.gameMode === 'timed') {
                this.multiplayerUI.updatePlayerScores(competitiveData.playerScores);
                
                // Update win progress if available
                if (competitiveData.winCondition) {
                    this.multiplayerUI.updateWinProgress(competitiveData.winCondition);
                }
            }
            
            console.log('Updated competitive scores:', competitiveData.playerScores);
            if (competitiveData.winCondition) {
                console.log('Win progress:', competitiveData.winCondition);
            }
        } else if (serverState.sheepRetired !== undefined) {
            // Cooperative mode: update total sheep count
            this.gameState.sheepRetired = serverState.sheepRetired;
        }
        
        // Handle timed mode data
        if (serverState.timedMode) {
            const { timeRemaining, gameDuration } = serverState.timedMode;
            
            // Update the game timer if it's in countdown mode
            if (this.gameTimer.isCountdown) {
                // Force timer update with server's authoritative time
                const elapsedMs = gameDuration - timeRemaining;
                this.gameTimer.currentTime = elapsedMs / 1000; // Convert to seconds
                this.gameTimer.updateTimerDisplay();
            }
            
            // Check if time is running out for audio cue
            if (timeRemaining < 30000 && !this.endgameMusicPlaying) { // 30 seconds left
                this.audioManager.playCompetitiveEndgameMusic();
                this.endgameMusicPlaying = true;
            }
        }
    }
    
    update(deltaTime) {
        // Check if game is paused
        const isPaused = this.inputHandler.isPausedState();
        
        // Update start screen camera if active
        if (this.startScreen.isStartScreenActive()) {
            this.startScreen.updateCinematicCamera();
        } else if (!isPaused) {
            // Handle input only when game is active and not paused
            let movementDirection = this.inputHandler.getMovementDirection();
            const wantsSprint = this.inputHandler.isSprinting();
            const sheepdog = this.gameState.getSheepdog();
            
            // Store original direction for debugging
            const originalDirection = { x: movementDirection.x, z: movementDirection.z };
            
            // Transform movement direction for competitive mode camera orientation
            movementDirection = this.sceneManager.transformMovementForCompetitive(movementDirection);
            
            // Debug log transformation in competitive mode
            if (this.sceneManager.competitiveCameraDirection && movementDirection.magnitude() > 0) {
                console.log(`🎮 Input transform: original(${originalDirection.x.toFixed(2)}, ${originalDirection.z.toFixed(2)}) → transformed(${movementDirection.x.toFixed(2)}, ${movementDirection.z.toFixed(2)}) for ${this.sceneManager.competitiveCameraDirection} camera`);
            }
            
            // Update sheepdog's awareness of nearby sheep for barking
            sheepdog.updateNearSheepStatus(this.gameState.getSheep());
            
            // Handle input based on mode
            if (this.isMultiplayer && this.networkManager) {
                // --- MULTIPLAYER LOGIC WITH CLIENT-SIDE PREDICTION ---
                
                // Use server's authoritative sprint state for prediction when available
                const serverSprintState = this.getServerSprintState();
                const actualSprintState = serverSprintState !== null ? serverSprintState : wantsSprint;
                
                // 1. PREDICT: Run local simulation for our dog for instant feedback
                sheepdog.move(movementDirection, this.gameState.getBounds(), deltaTime, actualSprintState);
                
                const isMovingNow = movementDirection.magnitude() > 0 || wantsSprint;

                // 2. SEND: Send input if moving now, OR if we just stopped moving
                if (isMovingNow || this.playerWasMoving) {
                    this.networkManager.sendPlayerInput({
                        direction: {
                            x: movementDirection.x,
                            z: movementDirection.z
                        },
                        sprint: wantsSprint,
                        timestamp: performance.now(),
                        // Send client position when stopping for server reconciliation
                        clientPosition: !isMovingNow && this.playerWasMoving ? {
                            x: sheepdog.position.x,
                            z: sheepdog.position.z
                        } : null
                    });
                }
                
                // Update the state for the next frame
                this.playerWasMoving = isMovingNow;

                // 3. RECONCILE: Skip reconciliation only when server is interpolating to our position
                if (!this.serverIsInterpolatingToClient) {
                    this.reconcileWithServerState(deltaTime);
                }
                
                // In multiplayer, server controls sheep behavior
                // Client only handles rendering
            } else {
                // --- SINGLE-PLAYER LOGIC (Unchanged) ---
                sheepdog.move(movementDirection, this.gameState.getBounds(), deltaTime, wantsSprint);
            }
            
            // Start timer on first actual movement
            if (movementDirection.magnitude() > 0 && !this.gameTimer.isRunning()) {
                this.gameTimer.start();
            }
            
            // Update camera to follow sheepdog
            this.sceneManager.updateCamera(sheepdog);
        }
        
        // Update other players with interpolation for smooth movement
        if (this.isMultiplayer && !isPaused) {
            for (const remoteDog of this.otherPlayers.values()) {
                const interpolationFactor = Math.min(this.interpolationSpeed * 2 * deltaTime, 1.0);

                // Interpolate position
                remoteDog.position.x += (remoteDog.targetPosition.x - remoteDog.position.x) * interpolationFactor;
                remoteDog.position.z += (remoteDog.targetPosition.z - remoteDog.position.z) * interpolationFactor;
                
                // Interpolate rotation
                let rotationDiff = remoteDog.targetRotation - remoteDog.currentRotation;
                while (rotationDiff > Math.PI) rotationDiff -= 2 * Math.PI;
                while (rotationDiff < -Math.PI) rotationDiff += 2 * Math.PI;
                remoteDog.currentRotation += rotationDiff * remoteDog.turnSpeed * deltaTime;

                // Update the 3D mesh with the interpolated values
                if (remoteDog.mesh) {
                    remoteDog.mesh.position.set(remoteDog.position.x, 0, remoteDog.position.z);
                    remoteDog.mesh.rotation.y = remoteDog.currentRotation;
                }

                // Run the dog's internal animation logic
                remoteDog.animate(deltaTime);
            }
        }
        
        // Update timer (respects pause state internally)
        this.gameTimer.update();
        
        // Update sheep behaviors (only if not paused)
        // In multiplayer mode, this handles visual behavior based on server state
        if (!isPaused) {
            this.gameState.updateSheepBehaviors(deltaTime);
        }
        
        // Update UI (only when game is active and not paused)
        if (!isPaused) {
            this.gameState.updateUI();
            
            // Update stamina UI if game is active
            if (!this.startScreen.isStartScreenActive()) {
                const sheepdog = this.gameState.getSheepdog();
                if (sheepdog) {
                    this.staminaUI.update(sheepdog.getStaminaInfo());
                }
            }
        }
        
        // Check for game completion (only when game is active and not paused)
        // In multiplayer mode, rely on server completion events instead of client-side checking
        if (!isPaused && !this.isMultiplayer && !this.gameState.gameCompleted) {
            if (this.gameState.checkCompletion()) {
                console.log('✅ Single player completion confirmed! Showing completion overlay...');
                const finalTime = this.gameTimer.stop();
                this.showCompletionOverlay('single', { finalTime });
                this.mobileControls.disable();
            }
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Calculate delta time
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;
        
        // Check if game is paused
        const isPaused = this.inputHandler.isPausedState();
        
        // Update grass animation (only if not paused)
        if (!isPaused) {
            this.terrainBuilder.updateGrassAnimation();
        }
        
        // Update game logic with deltaTime
        this.update(deltaTime);
        
        // Update performance monitoring (always update for monitoring purposes)
        this.performanceMonitor.updateMetrics(this.gameState, this.sceneManager.getRenderer());
        
        // Render the scene (always render to show pause indicator)
        this.sceneManager.render();
    }
    
    // Legacy mobile UI organization removed - all mobile UI now handled by React components
    
    updateOtherPlayer(dogData) {
        const playerId = dogData.playerId;
        let remoteDog = this.otherPlayers.get(playerId);

        // 1. Create the Sheepdog instance if it's a new player
        if (!remoteDog) {
            console.log(`🐕 Creating visualization for new player ${playerId}`);
            // Create a new Sheepdog instance at the initial position
            // Use dog type from server data, or fall back to 'jep'
            const dogType = dogData.dogType || 'jep';
            console.log(`Creating remote dog with type: ${dogType} for player ${playerId}`);
            remoteDog = new Sheepdog(dogData.x, dogData.z, dogType);
            
            // Enable 2x speeds for multiplayer
            remoteDog.setMultiplayerSpeeds(true);
            
            // Create its 3D mesh and add it to the scene
            const dogMesh = remoteDog.createMesh();
            this.sceneManager.add(dogMesh);
            
                            // Add player icon for racing mode
                if (this.gameState.gameMode === 'racing' && this.gameState.competitiveGates) {
                const playerGate = this.gameState.competitiveGates.find(gate => gate.playerId === playerId);
                if (playerGate) {
                    remoteDog.setPlayerInfo(playerId, playerGate.color);
                    console.log(`🎯 Added player icon for ${playerId} with gate color: 0x${playerGate.color.toString(16).toUpperCase()}`);
                }
            }
            
            // Add properties for interpolation
            remoteDog.targetPosition = new Vector2D(dogData.x, dogData.z);
            remoteDog.targetRotation = dogData.rotation;

            // Store the full Sheepdog object in our map
            this.otherPlayers.set(playerId, remoteDog);
        }
        
        // 2. Update the target state for interpolation from server data
        remoteDog.targetPosition.set(dogData.x, dogData.z);
        remoteDog.targetRotation = dogData.rotation;

        // 3. Update animation-driving properties directly
        // This data will be used by remoteDog.animate() in the main loop
        remoteDog.velocity.set(dogData.vx, dogData.vz);
        remoteDog.isSprinting = dogData.sprinting;
        remoteDog.isMoving = remoteDog.velocity.magnitude() > 0.5;
    }
    
    getServerSprintState() {
        // Get the server's authoritative sprint state for prediction
        if (this.networkManager?.lastServerState?.sheepdogs) {
            const mySheepdogData = this.networkManager.lastServerState.sheepdogs.find(
                dog => dog.playerId === this.networkManager.getPlayerId()
            );
            return mySheepdogData?.sprinting ?? null;
        }
        return null;
    }
    
    reconcileWithServerState(deltaTime) {
        if (!this.sheepdog || !this.serverDogPosition) return;

        // Get the authoritative position from the server state
        const serverPos = this.serverDogPosition;
        const clientPos = this.sheepdog.position;

        if (serverPos.x === undefined) return;

        // Calculate distance between client prediction and server authority
        const distance = Math.sqrt(
            (clientPos.x - serverPos.x) ** 2 + 
            (clientPos.z - serverPos.z) ** 2
        );

        // Sprint-aware reconciliation to handle speed mismatches
        const serverSprintState = this.getServerSprintState();
        const clientSprintState = this.sheepdog.isSprinting;
        const sprintMismatch = serverSprintState !== null && serverSprintState !== clientSprintState;
        
        // Adjust threshold based on sprint state mismatch
        const reconciliationThreshold = sprintMismatch ? 0.2 : 0.05; // Higher threshold when sprint states differ
        
        if (distance > reconciliationThreshold) {
            // If the distance is very large (e.g., after major lag), snap to the server position
            if (distance > 8.0) { // Higher snap threshold to account for sprint speed differences
                clientPos.x = serverPos.x;
                clientPos.z = serverPos.z;
                console.log('🔧 Large correction applied - snapping to server position', { distance, sprintMismatch });
            } else {
                // Use adaptive interpolation speed based on distance and movement state
                const isMoving = this.sheepdog.velocity.magnitude() > 0.1;
                
                // Faster correction when stopped or when sprint states mismatch
                let baseInterpolationSpeed = isMoving ? this.interpolationSpeed : this.interpolationSpeed * 3;
                if (sprintMismatch) {
                    baseInterpolationSpeed *= 2; // Faster correction for sprint mismatches
                }
                
                // Scale interpolation speed by distance (closer = faster correction)
                const distanceScale = Math.min(distance / 2.0, 1.0);
                const adaptiveSpeed = baseInterpolationSpeed * (1 + distanceScale);
                
                const interpolationFactor = Math.min(adaptiveSpeed * deltaTime, 0.5); // Increased max factor
                clientPos.x += (serverPos.x - clientPos.x) * interpolationFactor;
                clientPos.z += (serverPos.z - clientPos.z) * interpolationFactor;
            }
            
            // Update mesh position to match corrected logical position
            this.sheepdog.mesh.position.x = clientPos.x;
            this.sheepdog.mesh.position.z = clientPos.z;
        }

        // Server is also authoritative on stamina
        if (this.networkManager.lastServerState?.sheepdogs) {
            const mySheepdogData = this.networkManager.lastServerState.sheepdogs.find(
                dog => dog.playerId === this.networkManager.getPlayerId()
            );
            if (mySheepdogData?.stamina !== undefined) {
                // Directly set stamina, as prediction for this is less critical than position
                this.sheepdog.stamina = mySheepdogData.stamina;
            }
            if (mySheepdogData?.sprinting !== undefined) {
                this.sheepdog.isSprinting = mySheepdogData.sprinting;
            }
        }
    }
    
    removeOtherPlayer(playerId) {
        const remoteDog = this.otherPlayers.get(playerId);
        if (remoteDog) {
            // Remove player icon if present
            remoteDog.removePlayerIcon();
            
            // Remove the dog's mesh from the scene
            if (remoteDog.mesh) {
                this.sceneManager.remove(remoteDog.mesh);
            }
            // Delete the player from our map
            this.otherPlayers.delete(playerId);
            console.log(`🐕 Removed visualization for player ${playerId}`);
        }
    }
    
    checkRacingEndgameMusic(winCondition) {
        if (!winCondition || this.gameMode !== 'racing') return;
        
        let shouldPlayEndgameMusic = false;
        
        if (winCondition.type === 'race') {
            // 2-player race: play endgame music when someone is 80% to win threshold
            const endgameThreshold = winCondition.threshold * 0.8; // 80% of win threshold
            shouldPlayEndgameMusic = winCondition.maxScore >= endgameThreshold;
        } else if (winCondition.type === 'highest_score') {
            // 3-4 player mode: play endgame music when 90% of sheep are collected
            shouldPlayEndgameMusic = winCondition.progress >= 0.9;
        }
        
        if (shouldPlayEndgameMusic && !this.endgameMusicPlaying) {
            this.audioManager.playCompetitiveEndgameMusic();
            this.endgameMusicPlaying = true;
            console.log('🎵 Competitive endgame music started');
        }
    }
    
    createCompetitiveStructures(competitiveGates) {
        console.log('🏗️ Creating competitive structures with gates:', competitiveGates);
        
        // Don't override the game mode - it's already set correctly (could be 'competitive' or 'timed')
        // this.gameState.setGameMode('competitive');
        
        // Build competitive structures using new modular system
        this.structureBuilder.buildCompetitiveStructures(
            this.gameState.getBounds(),
            competitiveGates
        );
        
        // Recreate trees to avoid competitive pastures
        // Extract pasture areas from competitive gates
        const competitivePastures = competitiveGates.map(gate => gate.pasture);
        console.log('🌳 Recreating trees to avoid competitive pastures:', competitivePastures);
        this.terrainBuilder.clearTrees();
        this.terrainBuilder.createTrees(competitivePastures);
        
        // Apply player colors to gates based on current player
        const currentPlayerId = this.networkManager?.getPlayerId();
        if (currentPlayerId) {
            this.sceneManager.initializePlayerColors(competitiveGates, currentPlayerId);
        }
        
        // Add player icons to all sheepdogs (local and remote) for competitive mode
        this.addCompetitivePlayerIcons(competitiveGates);
        
        console.log(`✅ Created ${competitiveGates.length} competitive gates and pastures`);
    }
    
    /**
     * Add colored player icons to all sheepdogs in competitive mode
     * @param {Array} competitiveGates - Array of competitive gate configurations
     */
    addCompetitivePlayerIcons(competitiveGates) {
        if (!competitiveGates || competitiveGates.length === 0) return;
        
        const currentPlayerId = this.networkManager?.getPlayerId();
        
        // Add icon for local player and set competitive camera position
        if (this.sheepdog && currentPlayerId) {
            const playerGate = competitiveGates.find(gate => gate.playerId === currentPlayerId);
            if (playerGate) {
                this.sheepdog.setPlayerInfo(currentPlayerId, playerGate.color);
                console.log(`🎯 Added player icon for local player ${currentPlayerId} with gate color: 0x${playerGate.color.toString(16).toUpperCase()}`);
                
                // Set camera position based on player's assigned gate
                this.sceneManager.setCompetitiveCameraPosition(playerGate);
            }
        }
        
        // Add icons for all remote players
        for (const [playerId, remoteDog] of this.otherPlayers.entries()) {
            const playerGate = competitiveGates.find(gate => gate.playerId === playerId);
            if (playerGate && remoteDog) {
                remoteDog.setPlayerInfo(playerId, playerGate.color);
                console.log(`🎯 Added player icon for remote player ${playerId} with gate color: 0x${playerGate.color.toString(16).toUpperCase()}`);
            }
        }
    }
    
    // DEBUG: Instant completion for testing
    debugInstantComplete() {
        console.log('\n🚀 === DEBUG COMPLETION STARTING ===');
        
        if (!this.gameState) {
            console.log('🚫 ERROR: Game state not found');
            return;
        }
        
        if (this.gameState.gameCompleted) {
            console.log('🚫 ERROR: Game already completed');
            return;
        }
        
        if (this.isMultiplayer) {
            console.log('🚫 ERROR: Debug completion not available in multiplayer mode');
            return;
        }
        
        console.log('✅ All checks passed. Setting sheep to completed...');
        
        // Instantly set all sheep to retired status
        const sheep = this.gameState.getSheep();
        if (sheep && sheep.length > 0) {
            console.log(`📊 Before: ${this.gameState.sheepRetired}/${sheep.length} sheep retired`);
            
            for (let i = 0; i < sheep.length; i++) {
                sheep[i].hasPassedGate = true;
                sheep[i].isRetiring = false; // Set to false so they count as retired
                sheep[i].state = 2; // Set to grazing state
            }
            
            // Force update sheep retired count
            this.gameState.sheepRetired = sheep.length;
            
            console.log(`📊 After: ${this.gameState.sheepRetired}/${sheep.length} sheep retired`);
            console.log('✅ Debug completion applied. Win condition should trigger next frame!');
        } else {
            console.log('🚫 ERROR: No sheep found');
        }
        
        console.log('🚀 === DEBUG COMPLETION FINISHED ===\n');
    }
    
    // Universal completion overlay that works for all game modes
    showCompletionOverlay(mode, data = {}) {
        console.log('🎉 Creating completion overlay for mode:', mode, data);
        
        // Remove any existing overlay
        const existing = document.getElementById('game-completion-overlay');
        if (existing) existing.remove();
        
        // Create bulletproof overlay (always on top, blocks everything)
        const overlay = document.createElement('div');
        overlay.id = 'game-completion-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            font-family: Arial, sans-serif;
            color: white;
            text-align: center;
        `;
        
        // Create content based on mode
        let content = '';
        
        if (mode === 'single') {
            // Single Player: Time and completion
            const timeStr = data.finalTime ? this.formatTime(data.finalTime) : 'Unknown';
            content = `
                <div style="padding: 40px; background: rgba(0,100,0,0.3); border-radius: 20px; border: 2px solid #4CAF50;">
                    <h1 style="font-size: 48px; margin: 0 0 20px 0;">🎉 VICTORY! 🎉</h1>
                    <p style="font-size: 24px; margin: 0 0 10px 0;">All 200 sheep herded successfully!</p>
                    <p style="font-size: 18px; margin: 0 0 30px 0;">Time: ${timeStr}</p>
                    <button onclick="location.reload()" style="padding: 15px 30px; font-size: 18px; background: #4CAF50; color: white; border: none; border-radius: 10px; cursor: pointer;">
                        Play Again
                    </button>
                </div>
            `;
        } else if (mode === 'racing') {
            // Racing Mode: Winner/loser, scores, race results
            const competitive = data.competitive || {};
            const isWinner = data.isWinner;
            const myScore = data.myScore || 0;
            const timeStr = data.finalTime ? this.formatTime(data.finalTime) : 'Unknown';
            
            const bgColor = isWinner ? 'rgba(0,150,0,0.3)' : 'rgba(150,100,0,0.3)';
            const borderColor = isWinner ? '#4CAF50' : '#FF9800';
            const title = isWinner ? '🏆 VICTORY! 🏆' : '🥈 GAME COMPLETE';
            const subtitle = isWinner ? 'You won the race!' : `Player ${competitive.winner} won!`;
            
            // Build scores list
            let scoresHtml = '';
            if (competitive.finalScores) {
                const sortedScores = Object.entries(competitive.finalScores).sort(([,a], [,b]) => b - a);
                scoresHtml = sortedScores.map(([playerId, score], index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
                    const isMe = score === myScore ? ' (You)' : '';
                    return `<div>${medal} Player ${playerId}${isMe}: ${score} sheep</div>`;
                }).join('');
            }
            
            content = `
                <div style="padding: 40px; background: ${bgColor}; border-radius: 20px; border: 2px solid ${borderColor};">
                    <h1 style="font-size: 48px; margin: 0 0 20px 0;">${title}</h1>
                    <p style="font-size: 24px; margin: 0 0 10px 0;">${subtitle}</p>
                    <p style="font-size: 18px; margin: 0 0 20px 0;">Your Score: ${myScore} sheep</p>
                    <p style="font-size: 16px; margin: 0 0 20px 0;">Race Time: ${timeStr}</p>
                    <div style="font-size: 14px; margin: 0 0 30px 0; text-align: left;">
                        <strong>Final Scores:</strong><br>
                        ${scoresHtml}
                    </div>
                    <button onclick="location.reload()" style="padding: 15px 30px; font-size: 18px; background: ${borderColor}; color: white; border: none; border-radius: 10px; cursor: pointer;">
                        Play Again
                    </button>
                </div>
            `;
        } else if (mode === 'timed') {
            // Timed Mode: Winner/loser, scores, time's up, personal best
            const competitive = data.competitive || {};
            const isWinner = data.isWinner;
            const myScore = data.myScore || 0;
            
            // Check for personal best
            const previousBest = this.loadBestScore();
            const isNewBest = previousBest === null || myScore > previousBest;
            
            const bgColor = isWinner ? 'rgba(0,150,0,0.3)' : 'rgba(150,100,0,0.3)';
            const borderColor = isWinner ? '#4CAF50' : '#FF9800';
            const title = isWinner ? '⏱️ TIME\'S UP - VICTORY! 🏆' : '⏱️ TIME\'S UP';
            const subtitle = isWinner ? 'You collected the most sheep!' : `Player ${competitive.winner} collected the most!`;
            
            // Build scores list
            let scoresHtml = '';
            if (competitive.finalScores) {
                const sortedScores = Object.entries(competitive.finalScores).sort(([,a], [,b]) => b - a);
                scoresHtml = sortedScores.map(([playerId, score], index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
                    const isMe = score === myScore ? ' (You)' : '';
                    return `<div>${medal} Player ${playerId}${isMe}: ${score} sheep</div>`;
                }).join('');
            }
            
            content = `
                <div style="padding: 40px; background: ${bgColor}; border-radius: 20px; border: 2px solid ${borderColor};">
                    <h1 style="font-size: 48px; margin: 0 0 20px 0;">${title}</h1>
                    <p style="font-size: 24px; margin: 0 0 10px 0;">${subtitle}</p>
                    <p style="font-size: 18px; margin: 0 0 10px 0;">Your Score: ${myScore} sheep</p>
                    <p style="font-size: 16px; margin: 0 0 20px 0;">Duration: 3:00</p>
                    ${isNewBest ? '<p style="font-size: 20px; color: #FFD700; margin: 0 0 20px 0;">🎉 NEW PERSONAL BEST! 🎉</p>' : ''}
                    <div style="font-size: 14px; margin: 0 0 30px 0; text-align: left;">
                        <strong>Final Scores:</strong><br>
                        ${scoresHtml}
                    </div>
                    <button onclick="location.reload()" style="padding: 15px 30px; font-size: 18px; background: ${borderColor}; color: white; border: none; border-radius: 10px; cursor: pointer;">
                        Play Again
                    </button>
                </div>
            `;
        } else if (mode === 'cooperative') {
            // Cooperative Mode: Team success, collective effort
            const timeStr = data.finalTime ? this.formatTime(data.finalTime) : 'Unknown';
            const sheepCount = data.sheepCount || 200;
            const totalSheep = data.totalSheep || 200;
            
            content = `
                <div style="padding: 40px; background: rgba(0,100,150,0.3); border-radius: 20px; border: 2px solid #2196F3;">
                    <h1 style="font-size: 48px; margin: 0 0 20px 0;">🌐 TEAM VICTORY! 🎉</h1>
                    <p style="font-size: 24px; margin: 0 0 10px 0;">Working together, you herded all the sheep!</p>
                    <p style="font-size: 18px; margin: 0 0 10px 0;">Sheep Collected: ${sheepCount} / ${totalSheep}</p>
                    <p style="font-size: 18px; margin: 0 0 30px 0;">Team Time: ${timeStr}</p>
                    <p style="font-size: 16px; margin: 0 0 30px 0; font-style: italic;">🤝 Great teamwork!</p>
                    <button onclick="location.reload()" style="padding: 15px 30px; font-size: 18px; background: #2196F3; color: white; border: none; border-radius: 10px; cursor: pointer;">
                        Play Again
                    </button>
                </div>
            `;
        }
        
        overlay.innerHTML = content;
        document.body.appendChild(overlay);
        
        console.log('✅ Completion overlay created and displayed!');
    }
    
    // Format time helper
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Best score tracking for timed mode
    loadBestScore() {
        try {
            const savedScore = localStorage.getItem('timedModeBestScore');
            return savedScore ? parseInt(savedScore) : null;
        } catch (e) {
            console.warn('Could not load best score from localStorage:', e);
            return null;
        }
    }
    
    saveBestScore(score) {
        try {
            const currentBest = this.loadBestScore();
            if (currentBest === null || score > currentBest) {
                localStorage.setItem('timedModeBestScore', score.toString());
                return true; // New record
            }
            return false;
        } catch (e) {
            console.warn('Could not save best score to localStorage:', e);
            return false;
        }
    }
    
    saveTimedModeScore(score) {
        try {
            const currentBest = this.loadBestScore();
            if (currentBest === null || score > currentBest) {
                localStorage.setItem('timedModeBestScore', score.toString());
                console.log(`🏆 New timed mode best score: ${score} sheep!`);
                return true; // New record
            }
            return false;
        } catch (e) {
            console.warn('Could not save best score to localStorage:', e);
            return false;
        }
    }
    
    getBestScoreText() {
        const bestScore = this.loadBestScore();
        return bestScore !== null ? `Best: ${bestScore} sheep` : 'Best: --';
    }
    
    updateBestScoreDisplay() {
        if (this.roomData?.gameMode !== 'timed') return;
        
        // Update every second to show current score vs best
        setInterval(() => {
            const currentScore = this.gameState.getPlayerScore(this.networkManager?.getPlayerId()) || 0;
            const bestScore = this.loadBestScore();
            
            const bestTimeElement = document.getElementById('best-time');
            const mobileBestTimeElement = document.getElementById('mobile-best-time');
            
            if (bestTimeElement) {
                bestTimeElement.textContent = this.getBestScoreText();
                // Add visual indicator if beating best score
                if (bestScore !== null && currentScore > bestScore) {
                    bestTimeElement.style.color = '#4CAF50'; // Green
                } else {
                    bestTimeElement.style.color = ''; // Default
                }
            }
            
            if (mobileBestTimeElement) {
                mobileBestTimeElement.textContent = this.getBestScoreText();
                if (bestScore !== null && currentScore > bestScore) {
                    mobileBestTimeElement.style.color = '#4CAF50';
                } else {
                    mobileBestTimeElement.style.color = '';
                }
            }
        }, 1000);
    }
}

// Start simulation when page loads
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded - Creating game instance...');
    const gameInstance = new SheepDogSimulation();
    // Expose to global scope for React integration
    window.gameInstance = gameInstance;
    console.log('Game instance created, NetworkManager available:', !!gameInstance.networkManager);
}); 