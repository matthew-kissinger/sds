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
        this.startScreen.setGameStartCallback(() => {
            this.startGame();
        });
        
        // Pass audio manager to modules that need it
        this.gameState.setAudioManager(this.audioManager);
        this.startScreen.setAudioManager(this.audioManager);
        
        // Animation timing
        this.lastTime = performance.now();
        
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
        const sheepdog = new Sheepdog(0, -30);
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
    
    startGame() {
        // Add sheepdog to scene when game starts
        this.sceneManager.add(this.sheepdogMesh);
        
        // Enable mobile controls if on touch device
        if (this.mobileControls.getIsTouchDevice()) {
            this.mobileControls.enable();
        }
        
        // Start the game state
        this.gameState.startGame();
        
        // Reset timer and stamina
        this.gameTimer.reset();
        this.staminaUI.reset();
        this.staminaUI.show();
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
            
            // Always call move to update position, stamina, and animations
            sheepdog.move(movementDirection, this.gameState.getBounds(), deltaTime, wantsSprint);
            
            // Start timer on first actual movement
            if (movementDirection.magnitude() > 0 && !this.gameTimer.isRunning()) {
                this.gameTimer.start();
            }
            
            // Update camera to follow sheepdog
            this.sceneManager.updateCamera(sheepdog);
        }
        
        // Update timer (respects pause state internally)
        this.gameTimer.update();
        
        // Update sheep behaviors (only if not paused)
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
        if (!isPaused && this.gameState.checkCompletion()) {
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
            // Organize left stack (sprint + joystick) for portrait mode
            const leftStack = document.getElementById('mobile-left-stack');
            const sprintButton = document.getElementById('mobile-sprint');
            const joystick = document.getElementById('mobile-joystick');
            
            if (leftStack && sprintButton) {
                leftStack.appendChild(sprintButton);
            }
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
}

// Start simulation when page loads
window.addEventListener('DOMContentLoaded', () => {
    new SheepDogSimulation();
}); 