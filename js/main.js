import * as THREE from 'three';
import React, { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SceneManager } from './SceneManager.js';
import { GameState } from './GameState.js';
import { GameTimer } from './GameTimer.js';
import { TerrainBuilder } from './TerrainBuilder.js';
import { StructureBuilder } from './StructureBuilder.js';
import { InputHandler } from './InputHandler.js';
import { MobileControls } from './MobileControls.js';
import { Sheepdog } from './Sheepdog.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';
import { MenuController } from './MenuController.js';
import { AudioManager } from './AudioManager.js';
import { GameAssetLoader } from './GameAssetLoader.js';
import { NetworkManager } from './NetworkManager.js';
import { MultiplayerState } from './MultiplayerState.js';
import { Vector2D } from './Vector2D.js';
import { setGameInstance, emitGameEvent } from './GameBridge.js';
import { loadScene, listScenes, DEFAULT_SCENE_ID } from '../shared/scenes/index.js';
import { Heightfield } from '../shared/terrain/Heightfield.js';
import { Atmosphere } from './atmosphere/index.js';
import { screenshotCapture } from './utils/ScreenshotCapture.js';
import { LocalInputHandler } from './LocalInputHandler.js';
import { LocalMultiplayerManager } from './LocalMultiplayerManager.js';
import { TwoPlayerCamera } from './TwoPlayerCamera.js';

/**
 * Core Web Vitals monitoring for SEO performance tracking
 */
class WebVitalsMonitor {
    constructor() {
        this.vitals = {
            LCP: null,
            FID: null,
            CLS: null,
            INP: null
        };
        this.observers = [];
        this.initializeWebVitals();
    }

    initializeWebVitals() {
        // Largest Contentful Paint (LCP)
        this.observeLCP();
        
        // First Input Delay (FID) 
        this.observeFID();
        
        // Cumulative Layout Shift (CLS)
        this.observeCLS();
        
        // Interaction to Next Paint (INP)
        this.observeINP();
        
        // Report vitals when page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.reportVitals();
            }
        });
    }

    observeLCP() {
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                this.vitals.LCP = Math.round(lastEntry.startTime);
                console.log('[PERF] LCP (Largest Contentful Paint):', this.vitals.LCP + 'ms');
            });
            observer.observe({ entryTypes: ['largest-contentful-paint'] });
            this.observers.push(observer);
        }
    }

    observeFID() {
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    this.vitals.FID = Math.round(entry.processingStart - entry.startTime);
                    console.log('[PERF] FID (First Input Delay):', this.vitals.FID + 'ms');
                });
            });
            observer.observe({ entryTypes: ['first-input'] });
            this.observers.push(observer);
        }
    }

    observeCLS() {
        let clsValue = 0;
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                        this.vitals.CLS = Math.round(clsValue * 10000) / 10000;
                        console.log('[PERF] CLS (Cumulative Layout Shift):', this.vitals.CLS);
                    }
                });
            });
            observer.observe({ entryTypes: ['layout-shift'] });
            this.observers.push(observer);
        }
    }

    observeINP() {
        let interactions = [];
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    const duration = entry.processingEnd - entry.startTime;
                    interactions.push(duration);
                    
                    // Keep only the worst 10 interactions for INP calculation
                    interactions.sort((a, b) => b - a);
                    if (interactions.length > 10) {
                        interactions = interactions.slice(0, 10);
                    }
                    
                    // INP is the 98th percentile (or worst interaction if < 50 interactions)
                    const inp = interactions.length >= 50 
                        ? interactions[Math.floor(interactions.length * 0.02)]
                        : interactions[0];
                    
                    this.vitals.INP = Math.round(inp);
                    console.log('[PERF] INP (Interaction to Next Paint):', this.vitals.INP + 'ms');
                });
            });
            observer.observe({ entryTypes: ['event'] });
            this.observers.push(observer);
        }
    }

    reportVitals() {
        console.log('[PERF] Core Web Vitals Summary:', {
            LCP: this.vitals.LCP ? `${this.vitals.LCP}ms ${this.vitals.LCP <= 2500 ? '[OK]' : '[ERROR]'}` : 'Not measured',
            FID: this.vitals.FID ? `${this.vitals.FID}ms ${this.vitals.FID <= 100 ? '[OK]' : '[ERROR]'}` : 'Not measured', 
            CLS: this.vitals.CLS ? `${this.vitals.CLS} ${this.vitals.CLS <= 0.1 ? '[OK]' : '[ERROR]'}` : 'Not measured',
            INP: this.vitals.INP ? `${this.vitals.INP}ms ${this.vitals.INP <= 200 ? '[OK]' : '[ERROR]'}` : 'Not measured'
        });
        
        // Future: Send to analytics service
        // this.sendToAnalytics(this.vitals);
    }

    sendToAnalytics(vitals) {
        // Placeholder for future analytics integration
        // Could send to Google Analytics, custom endpoint, etc.
        console.log('[ANALYTICS] Would send to analytics:', vitals);
    }

    disconnect() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
    }
}
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
        // Scene selection: ?scene=<id> URL param (pre-UI). Invalid ids fall back to default.
        const requestedSceneId = new URLSearchParams(location.search).get('scene');
        const validSceneIds = listScenes().map(s => s.id);
        const activeSceneId = requestedSceneId && validSceneIds.includes(requestedSceneId)
            ? requestedSceneId
            : DEFAULT_SCENE_ID;
        this.currentScene = loadScene(activeSceneId);
        if (activeSceneId !== DEFAULT_SCENE_ID) {
            console.log(`[SCENE] Loaded "${this.currentScene.name}" (${activeSceneId}) from URL param`);
        }
        // Cycle 5+: propagate discriminated boundary if the scene declares one.
        // Field stays on legacy bounds; Rolling Hills + Open Country migrate
        // to island in Phases 2/3.
        if (this.currentScene.boundary) {
            this.gameState.setBoundary(this.currentScene.boundary);
        }
        // Cycle 5+: apply scene-specific flocking override if present (Phase 1.5).
        if (this.currentScene.flocking) {
            this.gameState.setFlockingOverride(this.currentScene.flocking);
        }
        // Cycle 5+: corral replaces gate+pasture for island scenes that have one.
        if (this.currentScene.corral) {
            this.gameState.setCorral(this.currentScene.corral);
        }
        this.heightfield = null; // Loaded async in init() before createTerrain.

        // Atmosphere takes over scene.fog + adds a Hosek-Wilkie sky dome.
        // Construction MUST happen after SceneManager so the scene exists; the
        // initial preset comes from the loaded scene def.
        const initialPreset = this.currentScene.sky?.preset ?? 'pastoral-noon';
        this.atmosphere = new Atmosphere(this.sceneManager.getScene(), {
            initialPreset,
            enableClouds: true,
            enableDayNight: false
        });
        this.atmosphere.bindAmbientLight(this.sceneManager.ambientLight);

        this.terrainBuilder = new TerrainBuilder(this.sceneManager.getScene(), this.sceneManager.isMobile, this.currentScene);
        this.structureBuilder = new StructureBuilder(this.sceneManager.getScene());
        this.inputHandler = new InputHandler();
        this.performanceMonitor = new PerformanceMonitor();
        this.webVitalsMonitor = new WebVitalsMonitor();
        this.gameAssetLoader = new GameAssetLoader();
        this.menuController = new MenuController(this.sceneManager);
        this.audioManager = new AudioManager(this.sceneManager.getCamera());
        this.multiplayerState = new MultiplayerState();
        
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

        // Connect gamepad manager to scene manager
        this.sceneManager.setGamepadManager(this.inputHandler.getGamepadManager());

        // Wire camera controller to all input sources + restore persisted mode.
        this.cameraController = this.sceneManager.getCameraController();
        this.inputHandler.setCameraController(this.cameraController);
        this.mobileControls.setCameraController(this.cameraController);
        try {
            const savedMode = localStorage.getItem('camera-mode');
            if (savedMode) {
                // User preference wins
                this.cameraController.setMode(savedMode);
            } else if (this.currentScene.defaultCamera) {
                // Cycle 5+: scene-suggested default (Rolling Hills + Open Country use 'follow')
                this.cameraController.setMode(this.currentScene.defaultCamera);
            }
        } catch (_) { /* localStorage may be unavailable */ }
        window.addEventListener('camera-mode-set', (e) => {
            if (e?.detail) this.cameraController.setMode(e.detail);
        });
        
        // Connect performance monitor and game state to input handler
        this.inputHandler.setPerformanceMonitor(this.performanceMonitor);
        

        
        // Set up pause functionality
        this.setupPauseHandling();
        
        // Set up start screen callback
        this.menuController.setGameStartCallback((mode, roomData, singlePlayerMode) => {
            if (mode === 'local') {
                // roomData is actually localConfig for local mode
                this.startLocalGame(roomData);
            } else {
                this.startGame(mode, roomData, singlePlayerMode);
            }
        });
        
        // Pass audio manager to modules that need it
        this.gameState.setAudioManager(this.audioManager);
        this.menuController.setAudioManager(this.audioManager);
        
        // Animation timing
        this.lastTime = performance.now();
        
        // Multiplayer state
        // Get NetworkManager from MenuController (it creates one in its constructor)
        this.networkManager = this.menuController.networkManager;
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

        // Local 2-player mode
        this.isLocalMultiplayer = false;
        this.localInputHandler = null;
        this.localMultiplayerManager = null;
        this.twoPlayerCamera = null;
        this.sheepdog2 = null;
        this.sheepdogMesh2 = null;

        // Set game instance BEFORE init() so GameBridge works during initialization
        // This is critical - Sheepdog needs getTerrainBuilder() during init()
        setGameInstance(this);
        console.log('[GAME] GameBridge initialized early in constructor');

        // Initialize the simulation
        this.isInitialized = false;
        this.init().then(() => {
            this.isInitialized = true;
            console.log('[GAME] Game initialization complete, starting animation loop');
        });
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

    /**
     * Wait for game initialization to complete (models loaded, terrain built)
     * Critical for iOS Safari where asset loading is slower
     */
    waitForInitialization() {
        return new Promise((resolve) => {
            if (this.isInitialized) {
                resolve();
                return;
            }

            // Poll every 100ms until initialized
            const checkInterval = setInterval(() => {
                if (this.isInitialized) {
                    clearInterval(checkInterval);
                    console.log('[GAME] Initialization complete, proceeding with game start');
                    resolve();
                }
            }, 100);
        });
    }

    async init() {
        const logStep = (step, details = '') => {
            console.log(`[INIT] ${step}${details ? ': ' + details : ''}`);
        };

        try {
            logStep('Starting initialization', `mobile=${this.sceneManager.isMobile}`);

            // Start progressive asset loading for SEO performance
            logStep('Loading critical assets');
            await this.gameAssetLoader.loadCriticalAssets();

            // Load all 3D models first
            logStep('Loading 3D models');
            await this.terrainBuilder.loadModels();

            // Verify critical models loaded (especially on iOS)
            const animalModels = Object.keys(this.terrainBuilder.models.animals || {})
                .filter(k => !k.endsWith('_animations'));
            logStep('Models loaded', `animals: ${animalModels.join(', ') || 'NONE'}`);

            if (animalModels.length === 0) {
                throw new Error('No animal models loaded! Check model paths and network.');
            }

            // Load heightfield (if scene declares one) BEFORE building terrain so
            // displacement and downstream y-clamps share the same instance.
            const heightmapUrl = this.currentScene.terrain?.heightmapUrl;
            if (heightmapUrl) {
                logStep('Loading heightfield', heightmapUrl);
                try {
                    this.heightfield = await Heightfield.load(heightmapUrl);
                    console.log(`[TERRAIN] Heightfield loaded: ${this.heightfield.width}x${this.heightfield.height}, peakHeight=${this.heightfield.peakHeight}m`);
                } catch (err) {
                    console.warn('[TERRAIN] Heightfield load failed; falling back to flat terrain:', err);
                    this.heightfield = null;
                }
            }
            this.terrainBuilder.setHeightfield(this.heightfield);
            // GameState propagates heightfield to OptimizedSheepSystem when the flock spawns.
            this.gameState.heightfield = this.heightfield;
            // Camera controller also samples the heightfield for Follow/Free clamps.
            if (this.cameraController?.setHeightfield) {
                this.cameraController.setHeightfield(this.heightfield);
            }
            // Structure builder surfaces fences/gates/flags onto the terrain
            // so they don't sit at y=0 (buried in heightmapped scenes).
            if (this.structureBuilder?.setHeightfield) {
                this.structureBuilder.setHeightfield(this.heightfield);
            }

            // Create terrain and environment
            logStep('Creating terrain');
            this.terrainBuilder.createTerrain();

            logStep('Creating grass');
            await this.terrainBuilder.createGrass();

            // Rocks BEFORE trees so the tree placer can read rockPositions
            // and reject candidates that would spawn on top of a formation.
            logStep('Adding environment details');
            await this.terrainBuilder.addEnvironmentDetails();

            logStep('Creating trees');
            await this.terrainBuilder.createTrees();

            // Cycle 6 Phase 2: build the SceneObstacles bundle once trees +
            // rocks have been placed. Attached to gameState so sheep + dog
            // can query it per-tick. Field has no obstacles (rect-scene path
            // skips island trees) so the empty-set guard preserves baseline.
            {
                const { buildSceneObstacles } = await import('../shared/SceneObstacles.js');
                const treeInstances = this.terrainBuilder.treeInstances || [];
                const rockPositions = this.terrainBuilder.rockPositions || [];
                const trees = treeInstances.map(t => ({ x: t.x, z: t.z, radiusXZ: t.radiusXZ }));
                const rocks = rockPositions
                    .filter(r => r.isObstacle)
                    .map(r => ({ x: r.x, z: r.z, radiusXZ: r.colliderRadius }));
                this.gameState.obstacles = buildSceneObstacles({ trees, rocks, buildings: [] });
                console.log(`[OBSTACLES] ${trees.length} trees, ${rocks.length} rocks (filtered from ${rockPositions.length})`);
            }

            logStep('Adding mountains');
            await this.terrainBuilder.addMountains();

            // Add farm house
            logStep('Adding farm house');
            await this.terrainBuilder.addFarmHouse();

            // Load fence GLB models before building structures
            logStep('Loading fence models');
            await this.structureBuilder.loadModels();

            // Create structures using new modular system. Scenes can opt
            // out of the perimeter fence (e.g. Open Country) — flag lives
            // on the scene def.
            logStep('Building structures');
            this.structureBuilder.buildSinglePlayerStructures(
                this.gameState.getBounds(),
                this.gameState.getGate(),
                this.gameState.getPasture(),
                {
                    perimeterFence: this.currentScene.perimeterFence !== false,
                    corral: this.currentScene.corral || null
                }
            );

            // Cycle 5+: corral retirement effect. Listens for 'corral-retired'
            // events dispatched by GameState's retirement loop. Cycle 6 Phase 4
            // adds the persistent 'portal' variant for Open Country.
            if (this.currentScene.corral) {
                const corral = this.currentScene.corral;
                if (corral.effect === 'portal') {
                    const { PortalEffect } = await import('./effects/PortalEffect.js');
                    const groundY = this.terrainBuilder._groundY
                        ? this.terrainBuilder._groundY(corral.center.x, corral.center.z)
                        : 0;
                    this._portalEffect = new PortalEffect(
                        this.sceneManager.getScene(),
                        corral.center,
                        groundY
                    );
                    window.addEventListener('corral-retired', () => {
                        if (this._portalEffect) this._portalEffect.pulse();
                    });
                } else {
                    const { CorralZapEffectPool } = await import('./effects/CorralZapEffect.js');
                    this._corralZapPool = new CorralZapEffectPool(this.sceneManager.getScene());
                    window.addEventListener('corral-retired', (e) => {
                        if (e?.detail && this._corralZapPool) {
                            this._corralZapPool.fire(e.detail);
                        }
                    });
                }
            }

            // Cycle 5+: anime water + depth pre-pass for island scenes.
            // Built after structures so the depth target sees the same
            // geometry the main pass will. Hidden in non-island scenes.
            if (this.currentScene.boundary?.kind === 'island') {
                logStep('Building anime water');
                const { DepthPrePass } = await import('./water/DepthPrePass.js');
                const { createAnimeWater } = await import('./water/AnimeWater.js');
                const renderer = this.sceneManager.getRenderer();
                const camera = this.sceneManager.getCamera();
                const scene = this.sceneManager.getScene();

                const depthPrePass = new DepthPrePass({
                    renderer,
                    scene,
                    camera,
                    isMobile: this.sceneManager.isMobile,
                });
                const water = createAnimeWater({
                    renderer,
                    camera,
                    depthTexture: depthPrePass.texture,
                    size: this.sceneManager.isMobile ? 3200 : 4000,
                    y: -0.05,
                    segments: this.sceneManager.isMobile ? 32 : 64,
                });
                scene.add(water.mesh);
                this.sceneManager.setWater({
                    mesh: water.mesh,
                    depthPrePass,
                    water,
                });
                this._animeWater = water;  // for per-frame uTime updates
            }

            // Verify jep model before creating sheepdog
            if (!this.terrainBuilder.models.animals['jep']) {
                throw new Error('Jep model not available - cannot create sheepdog');
            }

            // Create sheepdog (but don't add to scene yet in pre-game state)
            logStep('Creating sheepdog');
            const sheepdog = new Sheepdog(0, -30, 'jep', this.heightfield);
            this.sheepdog = sheepdog;
            this.sheepdogMesh = sheepdog.createMesh();
            this.gameState.setSheepdog(sheepdog);

            // Connect audio manager to sheepdog
            sheepdog.setAudioManager(this.audioManager);

            // Set as local player and create distance indicator (after mesh is created)
            sheepdog.setAsLocalPlayer();

            // Create optimized sheep flock (visible during start screen)
            logStep('Creating sheep flock');
            this.gameState.createSheepFlock(this.sceneManager.getScene());

            // Setup controls
            logStep('Setting up controls');
            this.sceneManager.setupMouseControls();

            // Set grass instance count for performance monitoring
            this.performanceMonitor.setGrassInstanceCount(this.terrainBuilder.getGrassInstanceCount());

            // Register per-system triangle estimates for the PERF overlay.
            // Static totals (instance count x per-instance tris) computed once
            // post-init; drives the "PER-SYSTEM TRIANGLES" section, no behavior.
            this.registerSystemTriangleCounts();

            logStep('Initialization complete!');

        } catch (error) {
            console.error('[INIT] Fatal error during initialization:', error);
            throw error;
        }
    }

    /**
     * One-shot: ask each system for its triangle estimate and push it
     * into PerformanceMonitor. Called at the end of init; safe to call
     * again after a terrain/grass rebuild (values overwrite by name).
     * Display-only, so failures are swallowed.
     */
    registerSystemTriangleCounts() {
        try {
            const perf = this.performanceMonitor;
            const { Terrain, Trees, Rocks, Mountains } = this.terrainBuilder.getTriangleBreakdown();
            perf.addSystemTriangles('Terrain', Terrain);
            perf.addSystemTriangles('Trees', Trees);
            perf.addSystemTriangles('Rocks', Rocks);
            perf.addSystemTriangles('Mountains', Mountains);

            const grassSystem = this.terrainBuilder.grassSystem;
            if (grassSystem) {
                perf.addSystemTriangles('Grass', grassSystem.getTotalTriangleEstimate());
            }

            perf.addSystemTriangles('Structures', this.structureBuilder.getTotalTriangleEstimate());

            const sheepSystem = this.gameState.optimizedSheepSystem;
            if (sheepSystem) {
                perf.addSystemTriangles('Sheep', sheepSystem.getTotalTriangleEstimate());
            }
        } catch (error) {
            console.warn('[PERF] Failed to register system triangle counts:', error);
        }
    }
    
    async startGame(mode = 'solo', roomData = null, singlePlayerMode = 'classic') {
        // Wait for initialization to complete (critical for iOS Safari)
        if (!this.isInitialized) {
            console.log('[GAME] Waiting for initialization to complete...');
            await this.waitForInitialization();
        }

        console.log(`Starting game in ${mode} mode`, {
            roomCode: roomData?.roomCode || 'none',
            playerCount: roomData?.players?.length || 0,
            roomData: roomData,
            singlePlayerMode: singlePlayerMode
        });

        // Store mode for future reference
        this.gameMode = mode;
        this.roomData = roomData;
        this.isMultiplayer = mode === 'multiplayer';
        this.singlePlayerMode = singlePlayerMode;
        
        // Get the selected dog type from the start screen
        const selectedDogType = this.menuController.getSelectedDog();
        console.log(`Selected dog type: ${selectedDogType}`);
        
        // Remove the old sheepdog and its indicator from scene if it exists
        if (this.sheepdog) {
            this.sheepdog.removeDistanceIndicator();
        }
        if (this.sheepdogMesh) {
            this.sceneManager.remove(this.sheepdogMesh);
        }

        // Create new sheepdog with selected type
        const sheepdog = new Sheepdog(0, -30, selectedDogType, this.heightfield);
        this.sheepdog = sheepdog;
        this.sheepdogMesh = sheepdog.createMesh();
        this.gameState.setSheepdog(sheepdog);

        // Connect audio manager to new sheepdog
        sheepdog.setAudioManager(this.audioManager);

        // Set as local player and create distance indicator
        sheepdog.setAsLocalPlayer();

        // Add new sheepdog to scene when game starts
        this.sceneManager.add(this.sheepdogMesh);
        
        // Enable mobile controls if on touch device
        if (this.mobileControls.getIsTouchDevice()) {
            this.mobileControls.enable();
        }
        
        // Start the game state (this will set the correct sheep count)
        // For multiplayer games, we'll set the specific game mode (competitive/timed) later when we have the data
        this.gameState.startGame(mode, null, singlePlayerMode);

        // Reset terrain builder to default bounds (in case switching from sandbox)
        if (this.terrainBuilder) {
            this.terrainBuilder.setDynamicBounds(
                this.gameState.bounds,
                this.gameState.pasture
            );
        }

        // Check if we need to recreate the sheep flock due to count change
        if (this.gameState.needsFlockRecreation) {
            console.log(`Recreating sheep flock due to count change`);
            this.gameState.recreateSheepFlock(this.sceneManager.getScene());
            this.gameState.needsFlockRecreation = false; // Reset flag
            // Refresh sheep triangle estimate for the PERF overlay.
            this.registerSystemTriangleCounts();
        }

        // Store the intended game mode for later use
        if (roomData?.gameMode) {
            this.gameState.setGameMode(roomData.gameMode);
        }
        
        // Reset timer
        this.gameTimer.reset();
        
        // Start countdown timer for timed mode
        if (roomData?.gameMode === 'timed') {
            this.gameTimer.startCountdown(3 * 60 * 1000); // 3 minutes
            console.log('[TIMER] Started 3-minute countdown for timed mode');
            
            // UI updates for timed mode now handled by React components
            // Initialize best score display
            this.updateBestScoreDisplay();
        } else {
            // UI updates for other modes now handled by React components
        }
        
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
                this.multiplayerState.setGameMode(roomData.gameMode, roomData.players?.length || 0);
                this.gameState.setGameMode(roomData.gameMode);
                this.gameState.setCurrentPlayerId(this.networkManager?.getPlayerId());
                
                // Set timer mode for timed games
                if (roomData.gameMode === 'timed') {
                    this.gameTimer.setCountdownMode(true, 180); // 3 minutes = 180 seconds
                    console.log('[TIMER] Timer set to countdown mode (3 minutes)');
                }
                
                // Set audio manager to competitive mode (also for timed)
                this.audioManager.setGameMode('competitive');
                const modeLabel = roomData.gameMode === 'timed' ? '[TIMED]' : '[RACING]';
                console.log(`${modeLabel} Audio manager set to competitive mode`);

                // Process initial game state if provided (contains competitive gates, etc.)
                if (roomData.initialGameState) {
                    console.log(`${modeLabel} Processing initial game state for ${roomData.gameMode} mode`);
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
            this.multiplayerState.hide();
            this.audioManager.setGameMode('solo');

            // Reset camera to default position for solo mode
            this.sceneManager.resetCameraToDefault();
        }
    }

    /**
     * Start a sandbox game with custom configuration
     * @param {string} dogType - Selected dog type
     * @param {Object} sandboxConfig - SandboxConfig instance
     */
    async startSandboxGame(dogType, sandboxConfig) {
        // Wait for initialization to complete (critical for iOS Safari)
        if (!this.isInitialized) {
            console.log('[SANDBOX] Waiting for initialization to complete...');
            await this.waitForInitialization();
        }

        console.log('[SANDBOX] Starting sandbox game', {
            dogType,
            sheepCount: sandboxConfig.sheep?.count,
            fieldSize: sandboxConfig.field?.size,
            preset: sandboxConfig.preset,
            customFences: sandboxConfig.fences?.length || 0
        });

        // Store mode for future reference
        this.gameMode = 'sandbox';
        this.isMultiplayer = false;
        this.singlePlayerMode = 'sandbox';

        // Store sandbox config
        this.sandboxConfig = sandboxConfig;

        // Remove the old sheepdog and its indicator from scene if it exists
        if (this.sheepdog) {
            this.sheepdog.removeDistanceIndicator();
        }
        if (this.sheepdogMesh) {
            this.sceneManager.remove(this.sheepdogMesh);
        }

        // Get dog start position from config
        const dogStart = sandboxConfig.dog?.startPosition || { x: 0, z: -30 };

        // Create new sheepdog with selected type at configured position
        const sheepdog = new Sheepdog(dogStart.x, dogStart.z, dogType, this.heightfield);
        this.sheepdog = sheepdog;
        this.sheepdogMesh = sheepdog.createMesh();
        this.gameState.setSheepdog(sheepdog);

        // Connect audio manager to new sheepdog
        sheepdog.setAudioManager(this.audioManager);

        // Set as local player and create distance indicator
        sheepdog.setAsLocalPlayer();

        // Add new sheepdog to scene when game starts
        this.sceneManager.add(this.sheepdogMesh);

        // Enable mobile controls if on touch device
        if (this.mobileControls.getIsTouchDevice()) {
            this.mobileControls.enable();
        }

        // Start sandbox game state (this applies all the config)
        this.gameState.startSandboxGame(sandboxConfig);

        // Rebuild structures with sandbox configuration
        const bounds = this.gameState.bounds;
        const gate = this.gameState.gate;
        const pasture = this.gameState.pasture;
        const customFences = this.gameState.getCustomFences();
        const borderPoints = this.gameState.borderPoints;
        const fieldShape = this.gameState.fieldShape;

        console.log('[SANDBOX] Building structures with:', {
            bounds,
            fieldShape,
            borderPoints: borderPoints?.length || 0,
            gatePosition: gate.position,
            gateWidth: gate.width,
            pasture
        });

        // Clear and rebuild structures for sandbox
        this.structureBuilder.buildSandboxStructures(bounds, gate, pasture, customFences, borderPoints, fieldShape);

        // Update terrain builder with dynamic bounds AND rebuild trees/rocks
        // This ensures they respect the new field boundaries
        if (this.terrainBuilder) {
            await this.terrainBuilder.rebuildEnvironment(bounds, pasture);
        }

        // Check if we need to recreate the sheep flock due to count change
        if (this.gameState.needsFlockRecreation) {
            console.log('[SANDBOX] Recreating sheep flock due to count change');
            this.gameState.recreateSheepFlock(this.sceneManager.getScene());
            this.gameState.needsFlockRecreation = false;
        }
        // Terrain, structures and sheep may have been rebuilt - refresh PERF overlay.
        this.registerSystemTriangleCounts();

        // Reset timer based on sandbox rules
        this.gameTimer.reset();
        const rules = sandboxConfig.rules;

        if (rules?.timerEnabled) {
            if (rules.timerMode === 'countdown') {
                this.gameTimer.startCountdown(rules.timeLimit * 1000);
                console.log(`[SANDBOX] Started ${rules.timeLimit}s countdown timer`);
            } else {
                this.gameTimer.start();
                console.log('[SANDBOX] Started count-up timer');
            }
        } else {
            // No timer - still track time but don't display prominently
            this.gameTimer.start();
            console.log('[SANDBOX] Timer running (hidden)');
        }

        // Hide multiplayer UI
        this.multiplayerState.hide();
        this.audioManager.setGameMode('solo');

        // Reset camera to default position
        this.sceneManager.resetCameraToDefault();

        // Mark start screen as inactive (same pattern as normal game start)
        this.menuController.isActive = false;
        this.menuController.gameStarted = true;

        // Fade out menu music and start gameplay music
        if (this.audioManager) {
            this.audioManager.fadeOutCurrentMusic(800);
            setTimeout(() => {
                if (this.audioManager.isMusicReady()) {
                    this.audioManager.playGameplayMusic();
                }
            }, 900);
        }

        console.log('[SANDBOX] Game started successfully');
    }

    /**
     * Start a local 2-player game
     * @param {Object} localConfig - Configuration from LocalModeSetup
     */
    async startLocalGame(localConfig) {
        // Wait for initialization to complete
        if (!this.isInitialized) {
            console.log('[LOCAL] Waiting for initialization to complete...');
            await this.waitForInitialization();
        }

        console.log('[LOCAL] Starting local 2-player game:', localConfig);

        // Store mode
        this.gameMode = 'local';
        this.isMultiplayer = false;
        this.isLocalMultiplayer = true;

        // Initialize local multiplayer manager
        this.localMultiplayerManager = new LocalMultiplayerManager();
        this.localMultiplayerManager.initialize(localConfig.mode, {
            player1Dog: localConfig.player1Dog,
            player2Dog: localConfig.player2Dog,
            totalSheep: 200
        });

        // Create local input handler
        this.localInputHandler = new LocalInputHandler();
        this.localInputHandler.onPauseToggle((isPaused) => {
            this.gameTimer.setPaused(isPaused);
            this.gameState.setPaused(isPaused);
        });

        // Remove old sheepdog if exists
        if (this.sheepdog) {
            this.sheepdog.removeDistanceIndicator();
        }
        if (this.sheepdogMesh) {
            this.sceneManager.remove(this.sheepdogMesh);
        }
        if (this.sheepdog2) {
            this.sheepdog2.removeDistanceIndicator();
        }
        if (this.sheepdogMesh2) {
            this.sceneManager.remove(this.sheepdogMesh2);
        }

        // Create Player 1 sheepdog (WASD)
        const p1StartX = localConfig.mode === 'versus' ? -30 : -15;
        this.sheepdog = new Sheepdog(p1StartX, -30, localConfig.player1Dog, this.heightfield);
        this.sheepdogMesh = this.sheepdog.createMesh();
        this.sheepdog.setAudioManager(this.audioManager);
        this.sheepdog.setPlayerInfo('player1', this.localMultiplayerManager.player1.color);
        this.sceneManager.add(this.sheepdogMesh);
        this.gameState.setSheepdog(this.sheepdog);
        this.gameState.setSheepdog2(null); // Clear any previous second dog

        // Create Player 2 sheepdog (Arrow Keys)
        const p2StartX = localConfig.mode === 'versus' ? 30 : 15;
        this.sheepdog2 = new Sheepdog(p2StartX, -30, localConfig.player2Dog, this.heightfield);
        this.sheepdogMesh2 = this.sheepdog2.createMesh();
        this.sheepdog2.setAudioManager(this.audioManager);
        this.sheepdog2.setPlayerInfo('player2', this.localMultiplayerManager.player2.color);
        this.sceneManager.add(this.sheepdogMesh2);
        this.gameState.setSheepdog2(this.sheepdog2); // Set second dog for sheep behavior

        // Set sheepdogs in manager
        this.localMultiplayerManager.setSheepdogs(this.sheepdog, this.sheepdog2);

        // Make player icons larger and more visible for local mode
        if (this.sheepdog.playerIcon) {
            this.sheepdog.playerIcon.scale.set(2.5, 2.5, 2.5);
            this.sheepdog.playerIcon.position.y = 3.5; // Higher above dog
            this.sheepdog.playerIcon.userData.originalY = 3.5;
        }
        if (this.sheepdog2.playerIcon) {
            this.sheepdog2.playerIcon.scale.set(2.5, 2.5, 2.5);
            this.sheepdog2.playerIcon.position.y = 3.5;
            this.sheepdog2.playerIcon.userData.originalY = 3.5;
        }

        // Initialize two-player camera
        this.twoPlayerCamera = new TwoPlayerCamera(this.sceneManager.getCamera());
        this.twoPlayerCamera.setImmediate(this.sheepdog.position, this.sheepdog2.position);

        // Start game state
        this.gameState.startGame('solo', null, 'classic');
        this.gameState.gameMode = 'local';

        // Build structures based on mode
        if (localConfig.mode === 'versus') {
            // Versus mode: two gates on opposite sides
            const versusGates = this.localMultiplayerManager.setupVersusGates(this.gameState.getBounds());
            this.structureBuilder.buildCompetitiveStructures(
                this.gameState.getBounds(),
                versusGates
            );
            console.log('[LOCAL] Built versus structures with 2 gates');
        } else {
            // Co-op and Timed: single gate at north (or corral for Cycle 5+ island scenes)
            this.structureBuilder.buildSinglePlayerStructures(
                this.gameState.getBounds(),
                this.gameState.getGate(),
                this.gameState.getPasture(),
                {
                    perimeterFence: this.currentScene.perimeterFence !== false,
                    corral: this.currentScene.corral || null
                }
            );
        }

        // Reset timer
        this.gameTimer.reset();
        if (localConfig.mode === 'timed') {
            this.gameTimer.startCountdown(3 * 60 * 1000); // 3 minutes
            console.log('[LOCAL] Started 3-minute countdown for timed mode');
        }

        // Set up score callbacks
        this.localMultiplayerManager.onScoreUpdate = (p1Score, p2Score) => {
            console.log(`[LOCAL] Scores - P1: ${p1Score}, P2: ${p2Score}`);
        };

        this.localMultiplayerManager.onGameComplete = (result) => {
            console.log('[LOCAL] Game complete!', result);
            this.showLocalCompletionOverlay(result);
        };

        // Hide multiplayer UI
        this.multiplayerState.hide();
        this.audioManager.setGameMode('solo');

        // Mark start screen as inactive
        this.menuController.isActive = false;
        this.menuController.gameStarted = true;

        // Start music
        if (this.audioManager) {
            this.audioManager.fadeOutCurrentMusic(800);
            setTimeout(() => {
                if (this.audioManager.isMusicReady()) {
                    this.audioManager.playGameplayMusic();
                }
            }, 900);
        }

        console.log('[LOCAL] Game started successfully');
    }

    /**
     * Show completion overlay for local multiplayer
     */
    showLocalCompletionOverlay(result) {
        console.log('[LOCAL] Showing completion overlay:', result);

        // Remove any existing overlay
        const existing = document.getElementById('game-completion-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'game-completion-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            font-family: system-ui, sans-serif;
            color: white;
            text-align: center;
        `;

        let winnerText = '';
        let bgColor = 'rgba(16, 185, 129, 0.2)';
        let borderColor = 'rgba(16, 185, 129, 0.4)';

        if (result.winner === 'coop') {
            winnerText = 'Victory! You herded all sheep together!';
        } else if (result.winner === 'tie') {
            winnerText = "It's a Tie!";
            bgColor = 'rgba(251, 191, 36, 0.2)';
            borderColor = 'rgba(251, 191, 36, 0.4)';
        } else if (result.winner === 'player1') {
            winnerText = 'Player 1 Wins!';
            bgColor = 'rgba(255, 68, 68, 0.2)';
            borderColor = 'rgba(255, 68, 68, 0.4)';
        } else if (result.winner === 'player2') {
            winnerText = 'Player 2 Wins!';
            bgColor = 'rgba(68, 68, 255, 0.2)';
            borderColor = 'rgba(68, 68, 255, 0.4)';
        }

        overlay.innerHTML = `
            <div style="padding: 40px; background: ${bgColor}; border-radius: 20px; border: 1px solid ${borderColor}; min-width: 300px;">
                <h1 style="font-size: 32px; margin: 0 0 20px 0;">${winnerText}</h1>
                <div style="display: flex; justify-content: center; gap: 40px; margin-bottom: 30px;">
                    <div>
                        <div style="font-size: 14px; color: #ff4444; margin-bottom: 5px;">Player 1</div>
                        <div style="font-size: 36px; font-weight: bold;">${result.player1Score}</div>
                    </div>
                    <div>
                        <div style="font-size: 14px; color: #4444ff; margin-bottom: 5px;">Player 2</div>
                        <div style="font-size: 36px; font-weight: bold;">${result.player2Score}</div>
                    </div>
                </div>
                <p style="color: rgba(255,255,255,0.5); font-size: 12px; margin-bottom: 20px;">Local mode - scores not submitted to leaderboard</p>
                <button onclick="location.reload()" style="padding: 14px 28px; font-size: 16px; background: #10b981; color: white; border: none; border-radius: 12px; cursor: pointer; font-weight: 600;">
                    Play Again
                </button>
            </div>
        `;
        document.body.appendChild(overlay);

        // Disable controls
        if (this.mobileControls) {
            this.mobileControls.disable();
        }
    }

    setupMultiplayer() {
        // NetworkManager already available from constructor
        if (!this.networkManager) {
            console.error('NetworkManager not available');
            return;
        }
        
        // Show multiplayer UI
        this.multiplayerState.show();
        
        // Set up network event handlers
        this.setupMultiplayerEventHandlers();
        
        // Initialize multiplayer UI with current room data
        if (this.roomData && this.roomData.players) {
            this.multiplayerState.updatePlayers(this.roomData.players, this.networkManager.getPlayerId());
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
            this.multiplayerState.updateConnectionStatus(state);
            
            if (state === 'disconnected') {
                // Handle disconnection - could show reconnection message
                console.log('Lost connection to server');
            }
        };
        
        // Room/player updates
        this.networkManager.onRoomUpdate = (room) => {
            if (room && room.players) {
                this.multiplayerState.updatePlayers(room.players, this.networkManager.getPlayerId());
                
                // Configure racing/timed mode if room has that setting
                if ((room.gameMode === 'racing' || room.gameMode === 'timed') && this.multiplayerState.gameMode !== room.gameMode) {
                    console.log(`Configuring ${room.gameMode} mode from room update`);
                    this.multiplayerState.setGameMode(room.gameMode, room.players.length);
                    this.gameState.setGameMode(room.gameMode);
                    this.gameState.setCurrentPlayerId(this.networkManager.getPlayerId());
                }
            }
        };
        
        this.networkManager.onPlayerUpdate = (update) => {
            if (update.type === 'joined' && update.player) {
                this.multiplayerState.addPlayer(update.player);
            } else if (update.type === 'left' && update.player) {
                this.multiplayerState.removePlayer(update.player.id);
                // Remove the player's 3D visualization
                this.removeOtherPlayer(update.player.id);
            } else if (update.type === 'gameComplete' && update.data) {
                // Handle game completion in multiplayer
                console.log('[GAME] Game completed! Final state:', update.data);
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
                            console.log(`[GAME] New best score in timed mode: ${myScore} sheep!`);
                        }
                    }
                    
                    if (isWinner) {
                        this.audioManager.playVictorySound();
                        console.log('[GAME] Victory sound played');
                    } else {
                        this.audioManager.playLossSound();
                        console.log('[GAME] Loss sound played');
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
                console.log('[GAME] Restoring competitive state after reconnection:', update.data);

                if (this.multiplayerState.gameMode === 'racing' || this.multiplayerState.gameMode === 'timed') {
                    // Show the completion overlay using the React CompletionScreen
                    const currentPlayerId = this.networkManager.getPlayerId();
                    const isWinner = update.data.winner === currentPlayerId;
                    const mode = update.data.isTimedMode ? 'timed' : 'racing';

                    this.showCompletionOverlay(mode, {
                        finalTime: update.data.finalTime || 0,
                        competitive: update.data,
                        isWinner,
                        myScore: update.data.finalScores?.[currentPlayerId] || 0
                    });
                }
            }
            
            // Update current room data
            if (this.networkManager.getCurrentRoom()) {
                const room = this.networkManager.getCurrentRoom();
                this.multiplayerState.updatePlayers(room.players, this.networkManager.getPlayerId());
            }
        };
        
        // Error handling
        this.networkManager.onError = (message) => {
            console.error('Multiplayer error:', message);
            // Could show error notification in UI
        };
        
        // Ping updates
        this.networkManager.onPingUpdate = (pingMs) => {
            this.multiplayerState.updatePing(pingMs);
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
                    
                    // CRITICAL: Update assigned gate information from server
                    if (serverSheepData.assignedGate !== undefined) {
                        clientSheepEntity.assignedGate = serverSheepData.assignedGate;
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

                        // Record snapshot for velocity-based extrapolation between packets.
                        // When a packet is late, we predict forward from this base using vx/vz
                        // so sheep keep moving smoothly instead of freezing.
                        clientSheepEntity._netBaseX = serverSheepData.x;
                        clientSheepEntity._netBaseZ = serverSheepData.z;
                        clientSheepEntity._netVx = serverSheepData.vx || 0;
                        clientSheepEntity._netVz = serverSheepData.vz || 0;
                        clientSheepEntity._netBaseTs = performance.now();
                    } else {
                        // Retiring/grazing sheep: disable extrapolation (server drives target).
                        clientSheepEntity._netBaseTs = 0;
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
                            console.log('[GAME] You scored!');
                        } else {
                            // Opponent scored
                            this.audioManager.playOpponentScoreSound();
                            console.log('[GAME] Opponent scored');
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
                    console.log('[GAME] Initializing competitive mode in GameState');
                    this.gameState.initializeCompetitiveMode({
                        competitiveGates: transformedGates,
                        playerScores: competitiveData.playerScores
                    });
                }
                
                // Build competitive structures if this is the first time receiving competitive data
                if (!this.competitiveStructuresCreated) {
                    console.log('[BUILD] Building competitive structures for the first time...');
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
            if (this.multiplayerState.gameMode === 'competitive' || this.multiplayerState.gameMode === 'timed') {
                this.multiplayerState.updatePlayerScores(competitiveData.playerScores);
                
                // Update win progress if available
                if (competitiveData.winCondition) {
                    this.multiplayerState.updateWinProgress(competitiveData.winCondition);
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
        // Skip update if not initialized yet
        if (!this.isInitialized) {
            return;
        }
        
        // Check if game is paused
        const isPaused = this.inputHandler.isPausedState();
        
        // Handle gamepad pause input
        if (this.inputHandler.getGamepadManager().isPausePressed()) {
            this.inputHandler.togglePause();
        }
        
        // Update start screen camera if active
        if (this.menuController.isMenuActive()) {
            this.menuController.updateCinematicCamera();
        } else if (this.isLocalMultiplayer && this.localInputHandler && !this.localInputHandler.isPausedState()) {
            // --- LOCAL 2-PLAYER MODE ---
            this.updateLocalMultiplayer(deltaTime);
        } else if (!isPaused) {
            // Handle gamepad zoom controls
            this.sceneManager.handleGamepadZoom();

            // Right-stick X drives Free-mode camera yaw at gamepadYawScale rad/s.
            const gp = this.inputHandler.getGamepadManager();
            if (gp && gp.isConnected()) {
                const rx = gp.getRightStickX();
                if (rx !== 0) {
                    this.cameraController.applyYawDelta(rx * this.cameraController.gamepadYawScale * deltaTime);
                }
            }

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
                console.log(`[INPUT] Input transform: original(${originalDirection.x.toFixed(2)}, ${originalDirection.z.toFixed(2)}) -> transformed(${movementDirection.x.toFixed(2)}, ${movementDirection.z.toFixed(2)}) for ${this.sceneManager.competitiveCameraDirection} camera`);
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
                sheepdog.move(movementDirection, this.gameState.getBoundary(), deltaTime, actualSprintState);
                
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
                sheepdog.move(movementDirection, this.gameState.getBoundary(), deltaTime, wantsSprint);
            }
            
            // Start timer on first actual movement
            if (movementDirection.magnitude() > 0 && !this.gameTimer.isRunning()) {
                this.gameTimer.start();
            }
            
            // Update camera to follow sheepdog (pass render deltaTime for
            // frame-rate-independent smoothing - see SceneManager.updateCamera)
            this.sceneManager.updateCamera(sheepdog, deltaTime);

            // Drive atmosphere (sky + clouds + day/night, when enabled).
            // Camera position is synced AFTER the camera update so the sky
            // dome rides above whatever pose the controller settled on.
            if (this.atmosphere) {
                this.atmosphere.syncCamera(this.sceneManager.getCamera().position);
                this.atmosphere.update(deltaTime);
            }
        }
        
        // Update other players with interpolation for smooth movement
        if (this.isMultiplayer && !isPaused) {
            for (const remoteDog of this.otherPlayers.values()) {
                // When the server is interpolating toward this client's stop position,
                // blend over a fixed number of frames instead of reusing the normal
                // distance-proportional lerp (which can visually pop on a sudden stop).
                if (remoteDog._blendFramesRemaining && remoteDog._blendFramesRemaining > 0) {
                    const total = remoteDog._blendTotalFrames || 8;
                    const t = 1 - (remoteDog._blendFramesRemaining / total);
                    remoteDog.position.x = remoteDog._blendStartPos.x
                        + (remoteDog.targetPosition.x - remoteDog._blendStartPos.x) * t;
                    remoteDog.position.z = remoteDog._blendStartPos.z
                        + (remoteDog.targetPosition.z - remoteDog._blendStartPos.z) * t;
                    remoteDog._blendFramesRemaining--;
                } else {
                    const interpolationFactor = Math.min(this.interpolationSpeed * 2 * deltaTime, 1.0);

                    // Interpolate position
                    remoteDog.position.x += (remoteDog.targetPosition.x - remoteDog.position.x) * interpolationFactor;
                    remoteDog.position.z += (remoteDog.targetPosition.z - remoteDog.position.z) * interpolationFactor;
                }

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

                // Tick the skeletal animation mixer and state machine so the
                // remote dog cycles idle/walk/run clips based on its velocity.
                // `animate()` alone only handles the player-icon overlay.
                if (remoteDog.targetVelocity) remoteDog.targetVelocity.set(0, 0);
                remoteDog.updateAnimationSystem(deltaTime);
                remoteDog.animate(deltaTime);
            }
        }

        // Update timer (respects pause state internally)
        // Skip for local multiplayer - handled in updateLocalMultiplayer
        if (!this.isLocalMultiplayer) {
            this.gameTimer.update();
        }

        // Update sheep behaviors (only if not paused)
        // In multiplayer mode, this handles visual behavior based on server state
        // Skip for local multiplayer - handled in updateLocalMultiplayer
        if (!isPaused && !this.isLocalMultiplayer) {
            this.gameState.updateSheepBehaviors(deltaTime);
        }

        // Sheep velocity-based extrapolation (multiplayer only). After behaviors
        // have run, override active sheep positions with server_base + vx*elapsed
        // so late/dropped packets don't cause a backward snap or freeze. Runs
        // after updateSheepBehaviors so client-side flocking drift doesn't win.
        if (this.isMultiplayer && !isPaused) {
            const sheepList = this.gameState.getSheep();
            const sheepSystem = this.gameState.optimizedSheepSystem;
            if (sheepList && sheepSystem && typeof sheepSystem.forceUpdateSheepPositions === 'function') {
                const now = performance.now();
                const MAX_EXTRAP = 0.5; // seconds - cap to prevent runaway drift
                const THRESHOLD = 0.033; // seconds - ~1.5 frames at 20Hz server rate
                let anyExtrapolated = false;
                for (const sheep of sheepList) {
                    if (!sheep || sheep.isRetiring || sheep.state === 2) continue;
                    if (!sheep._netBaseTs) continue;
                    const elapsed = Math.min((now - sheep._netBaseTs) / 1000, MAX_EXTRAP);
                    if (elapsed > THRESHOLD) {
                        sheep.position.x = sheep._netBaseX + sheep._netVx * elapsed;
                        sheep.position.z = sheep._netBaseZ + sheep._netVz * elapsed;
                        anyExtrapolated = true;
                    }
                }
                if (anyExtrapolated) {
                    sheepSystem.forceUpdateSheepPositions();
                }
            }
        }
        
        // Update UI (only when game is active and not paused)
        if (!isPaused) {
            this.gameState.updateUI();
            
            // Stamina UI now handled by React components
        }
        
        // Check for game completion (only when game is active and not paused)
        // In multiplayer mode, rely on server completion events instead of client-side checking
        if (!isPaused && !this.isMultiplayer && !this.gameState.gameCompleted) {
            if (this.gameState.checkCompletion()) {
                console.log('[OK] Single player completion confirmed! Showing completion overlay...');
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
        
        // Update grass animation and LOD (only if not paused and initialized)
        if (!isPaused && this.isInitialized) {
            // Gather entities for grass interaction
            const interactionEntities = [];

            // Add player sheepdog. `currentRotation` (yaw) feeds the
            // grass shader's oriented body footprint so the bend zone follows
            // the dog's facing direction, not a world-axis ellipse.
            if (this.sheepdog && this.sheepdog.mesh) {
                interactionEntities.push({
                    position: this.sheepdog.mesh.position,
                    type: 'player',
                    currentRotation: this.sheepdog.currentRotation
                });
            }

            // Add sheep visible in scene (much larger range)
            if (this.gameState && this.gameState.sheep) {
                const camera = this.sceneManager.getCamera();
                const cameraPos = camera?.position;
                if (cameraPos) {
                    // Get all active sheep within camera view range (state 0 = active, 1 = retiring, 2 = retired)
                    // Sheep use Vector2D with .x and .z properties
                    const visibleSheep = this.gameState.sheep
                        .filter(s => s && s.position && s.state !== 2)
                        .filter(s => {
                            // Check if sheep is within reasonable view distance from camera
                            const dx = s.position.x - cameraPos.x;
                            const dz = s.position.z - cameraPos.z;
                            return dx * dx + dz * dz < 90000; // Within 300 units of camera
                        })
                        .slice(0, 200); // All sheep

                    visibleSheep.forEach(sheep => {
                        interactionEntities.push({
                            position: { x: sheep.position.x, y: 0, z: sheep.position.z },
                            type: 'sheep',
                            // Sheep facingDirection is a scalar angle (radians)
                            // matching the convention in OptimizedSheep.
                            facingDirection: sheep.renderFacingDirection ?? sheep.facingDirection ?? 0
                        });
                    });
                }
            }

            // Add other players' dogs in multiplayer (type: 'dog' for
            // elongated body footprint).
            if (this.otherPlayers) {
                for (const [playerId, remoteDog] of this.otherPlayers) {
                    if (remoteDog && remoteDog.mesh) {
                        interactionEntities.push({
                            position: remoteDog.mesh.position,
                            type: 'dog',
                            currentRotation: remoteDog.currentRotation
                        });
                    }
                }
            }

            // Update grass with full context
            const camera = this.sceneManager.getCamera();
            const playerPosition = this.sheepdog?.mesh?.position;

            this.terrainBuilder.updateGrassAnimation(
                deltaTime,
                camera,
                playerPosition,
                interactionEntities
            );

            // Simple LOD system for other objects on mobile only
            if (this.sceneManager.isMobile && playerPosition) {
                this.terrainBuilder.updateSimpleLOD(playerPosition);
            }

        }

        // Update game logic with deltaTime (this updates sheepdog position)
        this.update(deltaTime);

        // Update distance indicator for local player AFTER update so position is current
        if (this.sheepdog && this.sheepdog.isLocalPlayer) {
            const camera = this.sceneManager.getCamera();
            const playerPosition = this.sheepdog.mesh?.position;
            if (camera && playerPosition) {
                const cameraDistance = camera.position.distanceTo(playerPosition);
                this.sheepdog.updateDistanceIndicator(cameraDistance, deltaTime);
            }
        }

        // Update performance monitoring (always update for monitoring purposes)
        this.performanceMonitor.updateMetrics(this.gameState, this.sceneManager.getRenderer());

        // Cycle 5+: animate water uniforms (uTime drives ripples + foam noise)
        if (this._animeWater) {
            const sun = this.atmosphere?.getSunDirection?.();
            this._animeWater.update(performance.now() * 0.001, sun);
        }

        // Cycle 5+: corral lightning-zap pool / Cycle 6 portal
        if (this._corralZapPool) {
            this._corralZapPool.update(deltaTime);
        }
        if (this._portalEffect) {
            this._portalEffect.update(deltaTime);
        }

        // Render the scene (always render to show pause indicator)
        this.sceneManager.render();

        // Notify HUD subscribers (replaces setInterval polling in useGameState).
        emitGameEvent('frame');
    }
    
    // Legacy mobile UI organization removed - all mobile UI now handled by React components
    
    updateOtherPlayer(dogData) {
        const playerId = dogData.playerId;
        let remoteDog = this.otherPlayers.get(playerId);

        // 1. Create the Sheepdog instance if it's a new player
        if (!remoteDog) {
            console.log(`[DOG] Creating visualization for new player ${playerId}`);
            // Create a new Sheepdog instance at the initial position
            // Use dog type from server data, or fall back to 'jep'
            const dogType = dogData.dogType || 'jep';
            console.log(`Creating remote dog with type: ${dogType} for player ${playerId}`);
            remoteDog = new Sheepdog(dogData.x, dogData.z, dogType, this.heightfield);
            
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
                    console.log(`[GAME] Added player icon for ${playerId} with gate color: 0x${playerGate.color.toString(16).toUpperCase()}`);
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

        // When the server flags that it is catching up to the remote player's
        // stopped position, run a fixed 8-frame blend from where this client
        // currently shows the dog toward the authoritative stop point. If a
        // blend is already active, keep blending toward the latest target.
        if (dogData.interpolatingToClient) {
            const BLEND_FRAMES = 8;
            if (!remoteDog._blendFramesRemaining || remoteDog._blendFramesRemaining <= 0) {
                remoteDog._blendStartPos = {
                    x: remoteDog.position.x,
                    z: remoteDog.position.z
                };
                remoteDog._blendTotalFrames = BLEND_FRAMES;
                remoteDog._blendFramesRemaining = BLEND_FRAMES;
            }
            // Always keep targetPosition current (already updated above); the
            // per-frame blend pass will lerp toward it.
        } else if (remoteDog._blendFramesRemaining) {
            // Server resumed normal updates; drop any lingering blend state.
            remoteDog._blendFramesRemaining = 0;
        }

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
                console.log('[SYNC] Large correction applied - snapping to server position', { distance, sprintMismatch });
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
            console.log(`[DOG] Removed visualization for player ${playerId}`);
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
            console.log('[AUDIO] Competitive endgame music started');
        }
    }
    
    async createCompetitiveStructures(competitiveGates) {
        console.log('[BUILD] Creating competitive structures with gates:', competitiveGates);
        
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
        console.log('[TERRAIN] Recreating trees to avoid competitive pastures:', competitivePastures);
        this.terrainBuilder.clearTrees();
        await this.terrainBuilder.createTrees(competitivePastures);

        // Cycle 6 Phase 2: rebuild the obstacle bundle now that the tree
        // set has changed (different positions in competitive mode).
        {
            const { buildSceneObstacles } = await import('../shared/SceneObstacles.js');
            const treeInstances = this.terrainBuilder.treeInstances || [];
            const rockPositions = this.terrainBuilder.rockPositions || [];
            const trees = treeInstances.map(t => ({ x: t.x, z: t.z, radiusXZ: t.radiusXZ }));
            const rocks = rockPositions
                .filter(r => r.isObstacle)
                .map(r => ({ x: r.x, z: r.z, radiusXZ: r.colliderRadius }));
            this.gameState.obstacles = buildSceneObstacles({ trees, rocks, buildings: [] });
        }

        // Apply player colors to gates based on current player
        const currentPlayerId = this.networkManager?.getPlayerId();
        if (currentPlayerId) {
            this.sceneManager.initializePlayerColors(competitiveGates, currentPlayerId);
        }
        
        // Add player icons to all sheepdogs (local and remote) for competitive mode
        this.addCompetitivePlayerIcons(competitiveGates);
        
        console.log(`[OK] Created ${competitiveGates.length} competitive gates and pastures`);
    }
    
    /**
     * Update loop for local 2-player mode
     */
    updateLocalMultiplayer(deltaTime) {
        if (!this.localMultiplayerManager || !this.localInputHandler) return;

        const sheepdog1 = this.sheepdog;
        const sheepdog2 = this.sheepdog2;

        if (!sheepdog1 || !sheepdog2) return;

        // Get input for both players
        const p1Direction = this.localInputHandler.getPlayer1Direction();
        const p1Sprint = this.localInputHandler.isPlayer1Sprinting();
        const p2Direction = this.localInputHandler.getPlayer2Direction();
        const p2Sprint = this.localInputHandler.isPlayer2Sprinting();

        const bounds = this.gameState.getBoundary();

        // Get camera distance for distance indicators
        const cameraDistance = this.twoPlayerCamera ? this.twoPlayerCamera.getDistance() : 80;

        // Update Player 1 sheepdog
        sheepdog1.updateNearSheepStatus(this.gameState.getSheep());
        sheepdog1.move(p1Direction, bounds, deltaTime, p1Sprint);
        sheepdog1.animate(deltaTime, cameraDistance); // Animate player icon with camera distance for scaling
        if (sheepdog1.isLocalPlayer) {
            sheepdog1.updateDistanceIndicator(cameraDistance, deltaTime, true);
        }

        // Update Player 2 sheepdog
        sheepdog2.updateNearSheepStatus(this.gameState.getSheep());
        sheepdog2.move(p2Direction, bounds, deltaTime, p2Sprint);
        sheepdog2.animate(deltaTime, cameraDistance); // Animate player icon with camera distance for scaling
        if (sheepdog2.isLocalPlayer) {
            sheepdog2.updateDistanceIndicator(cameraDistance, deltaTime, true);
        }

        // Update two-player camera
        if (this.twoPlayerCamera) {
            this.twoPlayerCamera.update(sheepdog1.position, sheepdog2.position, deltaTime);
        }

        // Update sheep behaviors - pass both dogs for combined scaring
        const sheepState = this.gameState.updateSheepBehaviors(deltaTime);

        // Make sheep react to both dogs
        const sheep = this.gameState.getSheep();
        for (const s of sheep) {
            // Check distance to both dogs and use the closer one for fleeing
            const dist1 = Math.sqrt(
                Math.pow(s.position.x - sheepdog1.position.x, 2) +
                Math.pow(s.position.z - sheepdog1.position.z, 2)
            );
            const dist2 = Math.sqrt(
                Math.pow(s.position.x - sheepdog2.position.x, 2) +
                Math.pow(s.position.z - sheepdog2.position.z, 2)
            );

            // Update the effective dog position for this sheep based on which is closer
            if (dist2 < dist1) {
                s.dogPosition = sheepdog2.position;
            } else {
                s.dogPosition = sheepdog1.position;
            }
        }

        // Handle scoring based on local game mode
        const localMode = this.localMultiplayerManager.localGameMode;

        if (localMode === 'coop') {
            // Co-op: shared gate, count sheep retired
            if (this.gameState.sheepRetired > 0) {
                const currentRetired = this.localMultiplayerManager.player1.score;
                const newlyRetired = this.gameState.sheepRetired - currentRetired;
                for (let i = 0; i < newlyRetired; i++) {
                    this.localMultiplayerManager.recordCoopSheepScored();
                }
            }
        } else if (localMode === 'versus') {
            // Versus: attribute retired sheep to the player whose gate they passed
            const sheep = this.gameState.optimizedSheepSystem?.sheep;
            const mgr = this.localMultiplayerManager;
            if (sheep && mgr.player1Gate && mgr.player2Gate) {
                if (!this._versusCountedSheep) this._versusCountedSheep = new Set();
                for (let i = 0; i < sheep.length; i++) {
                    const s = sheep[i];
                    if ((s.hasPassedGate || s.state === 2) && !this._versusCountedSheep.has(i)) {
                        this._versusCountedSheep.add(i);
                        // Attribute to player based on which pasture the sheep is in
                        const sx = s.position?.x ?? 0;
                        const p1pz = mgr.player1Gate.pasture;
                        const p2pz = mgr.player2Gate.pasture;
                        if (sx >= p1pz.minX && sx <= p1pz.maxX) {
                            mgr.recordSheepScored(mgr.player1.id);
                        } else if (sx >= p2pz.minX && sx <= p2pz.maxX) {
                            mgr.recordSheepScored(mgr.player2.id);
                        } else {
                            // Nearest gate wins the attribution
                            const d1 = Math.abs(sx - mgr.player1Gate.position.x);
                            const d2 = Math.abs(sx - mgr.player2Gate.position.x);
                            mgr.recordSheepScored(d1 <= d2 ? mgr.player1.id : mgr.player2.id);
                        }
                    }
                }
            }
        } else if (localMode === 'timed') {
            // Timed: check time remaining and shared scoring
            this.localMultiplayerManager.checkTimedModeEnd();

            // Update shared score from game state
            if (this.gameState.sheepRetired > 0) {
                const currentScore = this.localMultiplayerManager.player1.score + this.localMultiplayerManager.player2.score;
                const diff = this.gameState.sheepRetired - currentScore;
                if (diff > 0) {
                    // Split new sheep evenly between players for display
                    // (In reality timed mode just shows total)
                    this.localMultiplayerManager.player1.score = Math.floor(this.gameState.sheepRetired / 2);
                    this.localMultiplayerManager.player2.score = Math.ceil(this.gameState.sheepRetired / 2);
                }
            }
        }

        // Check for co-op completion
        if (localMode === 'coop' && this.gameState.sheepRetired >= this.gameState.totalSheep) {
            if (!this.localMultiplayerManager.gameCompleted) {
                this.localMultiplayerManager.completeGame('coop');
            }
        }

        // Update timer display
        this.gameTimer.update(deltaTime);
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
                console.log(`[GAME] Added player icon for local player ${currentPlayerId} with gate color: 0x${playerGate.color.toString(16).toUpperCase()}`);
                
                // Set camera position based on player's assigned gate
                this.sceneManager.setCompetitiveCameraPosition(playerGate);
            }
        }
        
        // Add icons for all remote players
        for (const [playerId, remoteDog] of this.otherPlayers.entries()) {
            const playerGate = competitiveGates.find(gate => gate.playerId === playerId);
            if (playerGate && remoteDog) {
                remoteDog.setPlayerInfo(playerId, playerGate.color);
                console.log(`[GAME] Added player icon for remote player ${playerId} with gate color: 0x${playerGate.color.toString(16).toUpperCase()}`);
            }
        }
    }
    

    
    // Universal completion overlay that works for all game modes
    showCompletionOverlay(mode, data = {}) {
        console.log('[GAME] Creating completion overlay for mode:', mode, data);

        // Remove any existing overlay
        const existing = document.getElementById('game-completion-overlay');
        if (existing) existing.remove();

        // Submit score to leaderboard for single player games (classic/extreme only, NOT sandbox)
        if (mode === 'single' && data.finalTime && this.gameMode !== 'sandbox' && this.singlePlayerMode !== 'sandbox') {
            console.log(`[GAME] Submitting score to leaderboard: ${data.finalTime} seconds for ${this.singlePlayerMode === 'extreme' ? 'soloExtreme' : 'soloClassic'} mode`);
            this.gameState.submitScoreToLeaderboard(data.finalTime);
        } else if (mode === 'single' && this.gameMode === 'sandbox') {
            console.log('[GAME] Sandbox mode - score not submitted to leaderboard');
        }

        // Check if React CompletionScreen is available
        if (window.CompletionScreen) {

            // Create container for React component
            const container = document.createElement('div');
            container.id = 'game-completion-overlay';
            document.body.appendChild(container);

            // Prepare data for CompletionScreen
            const screenData = {
                finalTime: data.finalTime,
                totalSheep: this.gameState?.totalSheep || data.totalSheep || 20,
                myScore: data.myScore || 0,
                isWinner: data.isWinner,
                winnerName: data.competitive?.winner ? `Player ${data.competitive.winner}` : null,
                isNewBest: mode === 'timed' ? (this.loadBestScore() === null || data.myScore > this.loadBestScore()) : false,
                sheepCount: data.sheepCount || this.gameState?.sheepInPenCount || 0,
                scores: []
            };

            // Build scores array for multiplayer modes
            if (data.competitive?.finalScores) {
                const sortedScores = Object.entries(data.competitive.finalScores).sort(([,a], [,b]) => b - a);
                screenData.scores = sortedScores.map(([playerId, score]) => ({
                    id: playerId,
                    name: `Player ${playerId}`,
                    score: score,
                    isMe: score === data.myScore
                }));
            }

            // Render React component
            const root = createRoot(container);
            root.render(createElement(window.CompletionScreen, {
                mode: mode,
                data: screenData,
                onPlayAgain: () => location.reload(),
                onMainMenu: () => location.reload()
            }));

            console.log('[GAME] React completion overlay rendered!');
        } else {
            // Fallback to simple overlay if React not available
            console.log('[GAME] React not available, using fallback overlay');
            const overlay = document.createElement('div');
            overlay.id = 'game-completion-overlay';
            overlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 99999;
                font-family: system-ui, sans-serif;
                color: white;
                text-align: center;
            `;

            const timeStr = data.finalTime ? this.formatTime(data.finalTime) : 'Unknown';
            overlay.innerHTML = `
                <div style="padding: 40px; background: rgba(16, 185, 129, 0.2); border-radius: 20px; border: 1px solid rgba(16, 185, 129, 0.4);">
                    <h1 style="font-size: 36px; margin: 0 0 20px 0;">Victory!</h1>
                    <p style="font-size: 18px; margin: 0 0 30px 0;">Time: ${timeStr}</p>
                    <button onclick="location.reload()" style="padding: 14px 28px; font-size: 16px; background: #10b981; color: white; border: none; border-radius: 12px; cursor: pointer; font-weight: 600;">
                        Play Again
                    </button>
                </div>
            `;
            document.body.appendChild(overlay);
        }
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
                console.log(`[GAME] New timed mode best score: ${score} sheep!`);
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
        // Best score display now handled by React components
        // This method preserved for backward compatibility but functionality moved to React
        if (this.roomData?.gameMode !== 'timed') return;
        console.log('[GAME] Best score tracking active for timed mode - UI handled by React');
    }
}

// Start simulation when page loads
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded - Creating game instance...');
    const gameInstance = new SheepDogSimulation();

    // Delegate menu/network flows from gameInstance to menuController for GameBridge
    gameInstance.startSoloGame = (dogType, singlePlayerMode = 'classic') => {
        gameInstance.menuController.selectSolo(dogType, singlePlayerMode);
    };

    // Note: startSandboxGame is already defined on the class, no need to override

    gameInstance.createRoom = async (playerName, settings, dogType) => {
        return await gameInstance.menuController.createRoom(playerName, settings, dogType);
    };

    gameInstance.joinRoom = async (roomCode, playerName, dogType) => {
        return await gameInstance.menuController.joinRoom(roomCode, playerName, dogType);
    };

    gameInstance.quickMatch = async (playerName, dogType) => {
        return await gameInstance.menuController.quickMatch(playerName, dogType);
    };

    gameInstance.leaveRoom = () => {
        gameInstance.menuController.leaveRoom();
    };

    gameInstance.startMultiplayerGame = () => {
        gameInstance.menuController.startMultiplayerGame();
    };

    gameInstance.selectDog = (dogType) => {
        gameInstance.menuController.selectDog(dogType);
    };

    gameInstance.getSelectedDog = () => {
        return gameInstance.menuController.getSelectedDog();
    };

    gameInstance.getCurrentRoom = () => {
        return gameInstance.menuController.getCurrentRoom();
    };

    gameInstance.isCurrentHost = () => {
        return gameInstance.menuController.isCurrentHost();
    };

    // GameBridge already initialized in constructor (setGameInstance called there)
    // This ensures Sheepdog can access terrainBuilder during init()
    console.log('[GAME] GameBridge was initialized in constructor');

    console.log('[GAME] Game instance created, NetworkManager available:', !!gameInstance.networkManager);
});
