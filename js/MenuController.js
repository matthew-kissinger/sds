// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import { NetworkManager } from './NetworkManager.js';
import { COUNTING_GAME_MODE } from '../shared/countingModes.js';

/**
 * MenuController - Modernized game logic controller for React UI integration
 * Provides clean API methods for React components to call
 */
export class MenuController {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.isActive = true;
        this.gameStarted = false;
        this.audioManager = null;
        
        // Initialize NetworkManager
        console.log('MenuController: Creating NetworkManager...');
        this.networkManager = new NetworkManager();
        console.log('MenuController: NetworkManager created:', !!this.networkManager);
        this.setupNetworkHandlers();
        
        // Cinematic camera settings
        this.cinematicCamera = {
            angle: 0,
            radius: 120,
            height: 80,
            speed: 0.05,
            centerX: 0,
            centerZ: 0
        };
        
        // Game state management
        this.selectedMode = null; // 'solo' or 'multiplayer'
        this.selectedDog = 'jep'; // Default dog selection
        this.isHost = false;
        this.currentRoom = null;
        this.initialGameState = null;
        
        // Load saved dog selection
        this.loadDogSelection();
        
        // Initialize cinematic camera
        this.setupCinematicCamera();
    }
    
    setupNetworkHandlers() {
        // Connection state changes
        this.networkManager.onConnectionStateChange = (state) => {
            console.log('Connection state changed:', state);
            if (state === 'connected') {
                // Connection successful, continue with current flow
            } else if (state === 'disconnected') {
                console.log('Connection lost');
            }
        };
        
        // Room updates
        this.networkManager.onRoomUpdate = (room) => {
            console.log('Room updated:', room);
            this.currentRoom = room;
            this.isHost = this.networkManager.isCurrentHost();
        };
        
        // Player events
        this.networkManager.onPlayerUpdate = (update) => {
            console.log('Player update:', update);
            
            if (update.type === 'gameStarted') {
                // Game started by host
                this.selectedMode = 'multiplayer';
                
                // Store the initial game state if provided
                if (update.gameState) {
                    this.initialGameState = update.gameState;
                }
                
                this.startGame();
            } else if (update.type === 'hostChanged') {
                this.isHost = this.networkManager.isCurrentHost();
            }
        };
        
        // Error handling
        this.networkManager.onError = (message) => {
            console.error('Network error:', message);
        };
    }
    
    // API Methods for React UI to call
    
    async createRoom(playerName, settings, dogType) {
        this.selectedDog = dogType;
        this.playUIClick();
        
        try {
            // Connect to server first
            await this.networkManager.connect();
            
            // Create room
            const roomName = this.generateRandomRoomName();
            await this.networkManager.createRoom(playerName, {
                roomName: roomName,
                maxPlayers: settings.maxPlayers,
                isPublic: true,
                gameMode: settings.gameMode,
                // Cycle 9 Phase 1: forward host-picked sheep count. Without this
                // the worker silently defaults to 200 even if RoomCreation showed
                // 250/500/1000.
                ...(typeof settings.sheepCount === 'number' ? { sheepCount: settings.sheepCount } : {}),
            }, dogType);
            
            return { success: true };
        } catch (error) {
            console.error('Failed to create room:', error);
            throw error;
        }
    }
    
    async joinRoom(roomCode, playerName, dogType) {
        this.selectedDog = dogType;
        this.playUIClick();
        
        if (roomCode.length !== 6) {
            throw new Error('Room code must be 6 characters');
        }
        
        try {
            // Connect to server first
            await this.networkManager.connect();
            
            // Join room
            await this.networkManager.joinRoom(roomCode, playerName, dogType);
            
            return { success: true };
        } catch (error) {
            console.error('Failed to join room:', error);
            throw error;
        }
    }
    
    async quickMatch(playerName, dogType) {
        this.selectedDog = dogType;
        this.playUIClick();
        
        try {
            // Connect to server first
            await this.networkManager.connect();
            
            // Quick match
            await this.networkManager.quickMatch(playerName, dogType);
            
            return { success: true };
        } catch (error) {
            console.error('Failed to find room:', error);
            throw error;
        }
    }
    
    leaveRoom() {
        this.networkManager.leaveRoom();
        this.isHost = false;
        this.currentRoom = null;
    }
    
    startMultiplayerGame() {
        console.log('[START] MenuController.startMultiplayerGame isHost=', this.isHost, 'room=', this.currentRoom?.roomCode);
        if (!this.isHost) {
            console.warn('[START] aborting: this.isHost is false');
            return;
        }
        this.playUIClick();
        this.networkManager.startGame();
    }
    
    selectSolo(dogType, singlePlayerMode = 'classic') {
        console.log('[GAME] MenuController.selectSolo called with dogType:', dogType, 'singlePlayerMode:', singlePlayerMode);
        this.selectedDog = dogType;
        this.selectedMode = 'solo';
        this.singlePlayerMode = singlePlayerMode;
        this.playUIClick();
        console.log('[GAME] MenuController.selectSolo calling startGame()');
        return this.startGame();
    }

    /**
     * Cycle 59 (Counting Sheep): arm a counting run. The curve
     * ('incremental' | 'exponential') rides as singlePlayerMode, mirroring how
     * selectSolo passes the difficulty. selectedMode = 'counting' makes
     * startGame dispatch onGameStart('counting', null, curve), which
     * SheepDogSimulation.startGame routes through its solo-style branch.
     */
    selectCounting(dogType, curve = 'incremental') {
        console.log('[GAME] MenuController.selectCounting called with dogType:', dogType, 'curve:', curve);
        this.selectedDog = dogType;
        this.selectedMode = COUNTING_GAME_MODE;
        this.singlePlayerMode = curve;
        this.playUIClick();
        return this.startGame();
    }

    /**
     * Start a local 2-player game
     * @param {Object} config - Local game configuration
     * @param {string} config.mode - 'coop', 'versus', or 'timed'
     * @param {string} config.player1Dog - Dog type for player 1
     * @param {string} config.player2Dog - Dog type for player 2
     */
    selectLocal(config) {
        console.log('[GAME] MenuController.selectLocal called with config:', config);
        this.selectedMode = 'local';
        this.localConfig = config;
        this.playUIClick();
        this.startGame();
    }
    
    // Dog selection methods
    selectDog(dogType) {
        this.selectedDog = dogType;
        this.playUIClick();
        
        // Store selection in localStorage for persistence
        localStorage.setItem('selectedDog', dogType);
        
        console.log(`Selected dog: ${dogType}`);
    }
    
    getSelectedDog() {
        return this.selectedDog;
    }
    
    // Load dog selection from localStorage if available
    loadDogSelection() {
        const savedDog = localStorage.getItem('selectedDog') || localStorage.getItem('sds.last-dog');
        if (savedDog && ['jep', 'pip', 'sally', 'shiloh', 'george_washington'].includes(savedDog)) {
            this.selectedDog = savedDog;
        }
    }
    
    // Utility methods
    generateRandomRoomName() {
        const adjectives = ['Happy', 'Fluffy', 'Swift', 'Clever', 'Playful', 'Brave', 'Gentle', 'Mighty', 'Lucky', 'Wise'];
        const nouns = ['Shepherd', 'Pasture', 'Meadow', 'Hills', 'Valley', 'Field', 'Farm', 'Ranch', 'Prairie', 'Haven'];
        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const number = Math.floor(Math.random() * 100);
        return `${adjective} ${noun} ${number}`;
    }
    
    playUIClick() {
        if (this.audioManager) {
            this.audioManager.playUIClick();
        }
    }
    
    // Camera and scene methods
    setupCinematicCamera() {
        const camera = this.sceneManager.getCamera();
        camera.position.set(
            this.cinematicCamera.centerX + this.cinematicCamera.radius,
            this.cinematicCamera.height,
            this.cinematicCamera.centerZ
        );
        camera.lookAt(this.cinematicCamera.centerX, 0, this.cinematicCamera.centerZ);
    }
    
    updateCinematicCamera() {
        if (!this.isActive) return;
        
        this.cinematicCamera.angle += this.cinematicCamera.speed * 0.016;
        
        const camera = this.sceneManager.getCamera();
        const x = this.cinematicCamera.centerX + Math.cos(this.cinematicCamera.angle) * this.cinematicCamera.radius;
        const z = this.cinematicCamera.centerZ + Math.sin(this.cinematicCamera.angle) * this.cinematicCamera.radius;
        
        const targetPosition = new THREE.Vector3(x, this.cinematicCamera.height, z);
        camera.position.lerp(targetPosition, 0.02);
        
        const lookAtTarget = new THREE.Vector3(this.cinematicCamera.centerX, 0, this.cinematicCamera.centerZ);
        const currentLookAt = new THREE.Vector3();
        camera.getWorldDirection(currentLookAt);
        currentLookAt.multiplyScalar(-1).add(camera.position);
        currentLookAt.lerp(lookAtTarget, 0.02);
        camera.lookAt(currentLookAt);
    }
    
    async startGame() {
        if (!this.isActive) return;
        
        if (this.audioManager) {
            this.audioManager.fadeOutCurrentMusic(800);
            setTimeout(() => {
                this.audioManager.playGameplayMusic();
            }, 900);
        }
        
        this.isActive = false;
        this.gameStarted = true;
        
        if (this.onGameStart) {
            // Ensure we have room data for multiplayer mode
            let roomData = this.currentRoom;
            if (this.selectedMode === 'multiplayer' && !roomData) {
                roomData = this.networkManager.getCurrentRoom();
            }

            // For local mode, pass localConfig instead of roomData
            if (this.selectedMode === 'local') {
                console.log('[GAME] Starting local game:', {
                    mode: 'local',
                    localMode: this.localConfig?.mode,
                    player1Dog: this.localConfig?.player1Dog,
                    player2Dog: this.localConfig?.player2Dog
                });
                await this.onGameStart('local', this.localConfig, null);
                return;
            }

            console.log('[GAME] Starting game:', {
                mode: this.selectedMode || 'solo',
                room: roomData ? roomData.roomCode : 'none',
                players: roomData ? roomData.players?.length : 0,
                hasInitialState: !!this.initialGameState
            });

            // Include initial game state in room data if available
            if (roomData && this.initialGameState) {
                roomData.initialGameState = this.initialGameState;
            }

            await this.onGameStart(this.selectedMode || 'solo', roomData, this.singlePlayerMode);
        }
    }
    
    // Public API methods
    setGameStartCallback(callback) {
        this.onGameStart = callback;
    }
    
    setAudioManager(audioManager) {
        this.audioManager = audioManager;
    }
    
    isMenuActive() {
        return this.isActive;
    }
    
    hasGameStarted() {
        return this.gameStarted;
    }
    
    getSelectedMode() {
        return this.selectedMode;
    }
    
    isMultiplayerMode() {
        return this.selectedMode === 'multiplayer';
    }

    isSoloMode() {
        return this.selectedMode === 'solo';
    }

    isLocalMode() {
        return this.selectedMode === 'local';
    }

    getLocalConfig() {
        return this.localConfig;
    }
    
    getCurrentRoom() {
        return this.currentRoom;
    }
    
    isCurrentHost() {
        return this.isHost;
    }
    
    reset() {
        this.isActive = true;
        this.gameStarted = false;
        this.selectedMode = null;
        this.isHost = false;
        this.currentRoom = null;
        this.initialGameState = null;
        this.localConfig = null;

        this.cinematicCamera.angle = 0;
        this.setupCinematicCamera();
    }
}
