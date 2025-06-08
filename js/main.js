import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { GameState } from './GameState.js';
import { GameTimer } from './GameTimer.js';
import { TerrainBuilder } from './TerrainBuilder.js';
import { StructureBuilder } from './StructureBuilder.js';
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
        this.structureBuilder = new StructureBuilder(this.sceneManager.getScene());
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
            this.organizeMobileUIContainers();
        }
        
        // Connect mobile controls to input handler and scene manager
        this.inputHandler.setMobileControls(this.mobileControls);
        this.sceneManager.setMobileControls(this.mobileControls);
        
        // Connect performance monitor and game state to input handler
        this.inputHandler.setPerformanceMonitor(this.performanceMonitor);
        
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
        this.networkManager = null;
        this.isMultiplayer = false;
        this.otherPlayers = new Map(); // playerId -> Sheepdog instance
        this.playerWasMoving = false; // Track movement state from previous frame
        this.serverIsInterpolatingToClient = false; // Track when server is interpolating to our position
        
        // Client-side prediction and interpolation for multiplayer
        this.serverDogPosition = { x: 0, z: 0 };
        this.serverDogRotation = 0;
        this.lastServerUpdate = 0;
        this.interpolationSpeed = 2.5; // Reduced for smoother movement
        
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
        
        // Create structures
        this.structureBuilder.createFieldBoundaryFence(
            this.gameState.getBounds(), 
            this.gameState.getGate()
        );
        this.structureBuilder.createGateAndPasture(
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
        
        // Start the game state (pass mode for future multiplayer handling)
        this.gameState.startGame(mode);
        
        // Reset timer and stamina
        this.gameTimer.reset();
        this.staminaUI.reset();
        this.staminaUI.show();
        
        // Initialize multiplayer if needed
        if (mode === 'multiplayer' && roomData) {
            console.log(`Multiplayer room: ${roomData.roomCode || roomData.code || 'unknown'} with ${roomData.players?.length || 0} players`);
            // Enable 2x speeds for multiplayer
            this.sheepdog.setMultiplayerSpeeds(true);
            this.setupMultiplayer();
            
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
            
            // Send dog type to server
            if (this.networkManager) {
                console.log(`Sending dog type to server: ${selectedDogType}`);
                this.networkManager.sendDogType(selectedDogType);
            }
        } else {
            // Hide multiplayer UI for solo mode
            this.multiplayerUI.hide();
        }
    }
    
    setupMultiplayer() {
        // Get NetworkManager from StartScreen
        this.networkManager = this.startScreen.networkManager;
        
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
                
                // Force final sheep count update
                if (update.data.sheepRetired !== undefined) {
                    console.log('Updating sheep count from', this.gameState.sheepRetired, 'to', update.data.sheepRetired);
                    this.gameState.sheepRetired = update.data.sheepRetired;
                }
                
                // Trigger game completion
                if (update.data.gameCompleted) {
                    console.log('Triggering game completion UI...');
                    this.gameState.gameCompleted = true;
                    const finalTime = this.gameTimer.stop();
                    const isNewRecord = this.gameTimer.getBestTime() !== null && 
                                       finalTime <= this.gameTimer.getBestTime();
                    
                    this.gameState.showCompletionMessage(finalTime, isNewRecord);
                    this.mobileControls.disable();
                } else {
                    console.log('Game completion data received but gameCompleted flag is', update.data.gameCompleted);
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
                    // Trust server positions directly to avoid conflicts
                    // Server already applies proper boundary and gate constraints
                    clientSheepEntity.position.x = serverSheepData.x;
                    clientSheepEntity.position.z = serverSheepData.z;
                    
                    // Update velocity for animation purposes
                    if (serverSheepData.vx !== undefined && serverSheepData.vz !== undefined) {
                        clientSheepEntity.velocity.x = serverSheepData.vx;
                        clientSheepEntity.velocity.z = serverSheepData.vz;
                    }
                    
                    // Update sheep state properties from server
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
        
        // Update game state
        if (serverState.sheepRetired !== undefined) {
            this.gameState.sheepRetired = serverState.sheepRetired;
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
            const movementDirection = this.inputHandler.getMovementDirection();
            const wantsSprint = this.inputHandler.isSprinting();
            const sheepdog = this.gameState.getSheepdog();
            
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
        if (!isPaused && !this.isMultiplayer && this.gameState.checkCompletion()) {
            const finalTime = this.gameTimer.stop();
            const isNewRecord = this.gameTimer.getBestTime() !== null && 
                               finalTime <= this.gameTimer.getBestTime();
            
            this.gameState.showCompletionMessage(finalTime, isNewRecord);
            
            // Disable mobile controls when game completes
            this.mobileControls.disable();
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
    
    organizeMobileUIContainers() {
        // Wait a moment for mobile controls to be created
        setTimeout(() => {
            // Organize left stack (just joystick) for portrait mode
            // Sprint button stays independent for bottom-right positioning
            const leftStack = document.getElementById('mobile-left-stack');
            const joystick = document.getElementById('mobile-joystick');
            
            if (leftStack && joystick) {
                leftStack.appendChild(joystick);
            }
            
            // Organize right HUD cluster (timer + stamina) for landscape fullscreen
            const hudRight = document.getElementById('mobile-hud-right');
            const combinedUI = document.getElementById('mobile-combined-ui');
            const staminaBar = document.getElementById('stamina-bar');
            
            if (hudRight && combinedUI) {
                hudRight.appendChild(combinedUI);
            }
            if (hudRight && staminaBar) {
                hudRight.appendChild(staminaBar);
            }
        }, 100);
    }
    
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
            // Remove the dog's mesh from the scene
            if (remoteDog.mesh) {
                this.sceneManager.remove(remoteDog.mesh);
            }
            // Delete the player from our map
            this.otherPlayers.delete(playerId);
            console.log(`🐕 Removed visualization for player ${playerId}`);
        }
    }
}

// Start simulation when page loads
window.addEventListener('DOMContentLoaded', () => {
    new SheepDogSimulation();
}); 