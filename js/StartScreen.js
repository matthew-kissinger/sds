import * as THREE from 'three';
import { NetworkManager } from './NetworkManager.js';

/**
 * StartScreen - Modernized game logic controller for React UI integration
 * Provides clean API methods for React components to call
 */
export class StartScreen {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.isActive = true;
        this.gameStarted = false;
        this.audioManager = null;
        
        // Initialize NetworkManager
        console.log('StartScreen: Creating NetworkManager...');
        this.networkManager = new NetworkManager();
        console.log('StartScreen: NetworkManager created:', !!this.networkManager);
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
                gameMode: settings.gameMode
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
        if (!this.isHost) return;
        
        this.playUIClick();
        this.networkManager.startGame();
        // Game start will be handled by network events
    }
    
    selectSolo(dogType, singlePlayerMode = 'classic') {
        console.log('[GAME] StartScreen.selectSolo called with dogType:', dogType, 'singlePlayerMode:', singlePlayerMode);
        this.selectedDog = dogType;
        this.selectedMode = 'solo';
        this.singlePlayerMode = singlePlayerMode;
        this.playUIClick();
        console.log('[GAME] StartScreen.selectSolo calling startGame()');
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
        const savedDog = localStorage.getItem('selectedDog');
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
    
    startGame() {
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
            
            this.onGameStart(this.selectedMode || 'solo', roomData, this.singlePlayerMode);
        }
    }
    
    // Public API methods
    setGameStartCallback(callback) {
        this.onGameStart = callback;
    }
    
    setAudioManager(audioManager) {
        this.audioManager = audioManager;
    }
    
    isStartScreenActive() {
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
        
        this.cinematicCamera.angle = 0;
        this.setupCinematicCamera();
    }
}
