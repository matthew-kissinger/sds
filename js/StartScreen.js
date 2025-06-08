import * as THREE from 'three';
import { NetworkManager } from './NetworkManager.js';

/**
 * StartScreen - Manages the enhanced start screen with room-based multiplayer
 */
export class StartScreen {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.isActive = true;
        this.gameStarted = false;
        this.audioManager = null;
        
        // Initialize NetworkManager
        this.networkManager = new NetworkManager();
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
        
        // UI state management
        this.currentScreen = 'main'; // 'main', 'online', 'create', 'join', 'lobby', 'connecting'
        this.selectedMode = null; // 'solo' or 'multiplayer'
        this.selectedDog = 'jep'; // Default dog selection
        this.isConnecting = false;
        this.isHost = false;
        this.currentRoom = null;
        
        // UI elements
        this.startScreenElement = document.getElementById('start-screen');
        this.gameUIElements = document.querySelectorAll('.game-ui');
        this.musicNote = document.getElementById('music-note');
        
        // Main mode selection
        this.modeSelection = document.getElementById('mode-selection');
        this.soloButton = document.getElementById('solo-button');
        this.onlineButton = document.getElementById('online-button');
        
        // Online options
        this.onlineOptions = document.getElementById('online-options');
        this.createRoomButton = document.getElementById('create-room-button');
        this.joinRoomButton = document.getElementById('join-room-button');
        this.quickMatchButton = document.getElementById('quick-match-button');
        this.backToMainButton = document.getElementById('back-to-main-button');
        
        // Room creation
        this.roomCreation = document.getElementById('room-creation');
        this.roomNameInput = document.getElementById('room-name');
        this.maxPlayersSelect = document.getElementById('max-players');
        this.privateRoomCheckbox = document.getElementById('private-room');
        this.createRoomConfirm = document.getElementById('create-room-confirm');
        this.backToOnlineButton = document.getElementById('back-to-online-button');
        
        // Room joining
        this.roomJoining = document.getElementById('room-joining');
        this.roomCodeInput = document.getElementById('room-code');
        this.codeError = document.getElementById('code-error');
        this.joinRoomConfirm = document.getElementById('join-room-confirm');
        this.backToOnlineButton2 = document.getElementById('back-to-online-button2');
        
        // Lobby
        this.lobbyScreen = document.getElementById('lobby-screen');
        this.lobbyRoomName = document.getElementById('lobby-room-name');
        this.currentRoomCode = document.getElementById('current-room-code');
        this.copyRoomCodeButton = document.getElementById('copy-room-code');
        this.playerCount = document.getElementById('player-count');
        this.maxPlayerCount = document.getElementById('max-player-count');
        this.playersContainer = document.getElementById('players-container');
        this.startGameButton = document.getElementById('start-game-button');
        this.leaveRoomButton = document.getElementById('leave-room-button');
        this.lobbyMessage = document.getElementById('lobby-message');
        
        // Connection status
        this.connectionStatus = document.getElementById('connection-status');
        this.connectionMessage = document.getElementById('connection-message');
        this.backToMenuButton = document.getElementById('back-to-menu-button');
        
        // Dog selection
        this.dogCards = document.querySelectorAll('.dog-card');
        
        this.init();
    }
    
    setupNetworkHandlers() {
        // Connection state changes
        this.networkManager.onConnectionStateChange = (state) => {
            console.log('Connection state changed:', state);
            if (state === 'connected') {
                // Connection successful, continue with current flow
            } else if (state === 'disconnected') {
                this.showConnectionError('Connection lost');
            }
        };
        
        // Room updates
        this.networkManager.onRoomUpdate = (room) => {
            console.log('Room updated:', room);
            this.currentRoom = room;
            this.isHost = this.networkManager.isCurrentHost();
            
            // If we're in connecting state (creating/joining room), transition to lobby
            if (this.currentScreen === 'connecting') {
                this.showLobby(room);
            } else if (this.currentScreen === 'lobby') {
                this.updateLobbyDisplay(room);
            }
        };
        
        // Player events
        this.networkManager.onPlayerUpdate = (update) => {
            console.log('Player update:', update);
            
            if (update.type === 'gameStarted') {
                // Game started by host
                this.selectedMode = 'multiplayer';
                this.startGame();
            } else if (update.type === 'hostChanged') {
                this.isHost = this.networkManager.isCurrentHost();
                if (this.currentScreen === 'lobby' && this.currentRoom) {
                    this.updateLobbyDisplay(this.currentRoom);
                }
            }
            
            // Update lobby if currently shown
            if (this.currentScreen === 'lobby' && this.currentRoom) {
                this.updateLobbyDisplay(this.currentRoom);
            }
        };
        
        // Error handling
        this.networkManager.onError = (message) => {
            console.error('Network error:', message);
            this.showConnectionError(message);
        };
    }
    
    init() {
        // Main mode selection
        this.soloButton.addEventListener('click', () => this.selectSolo());
        this.onlineButton.addEventListener('click', () => this.showOnlineOptions());
        
        // Online options
        this.createRoomButton.addEventListener('click', () => this.showCreateRoom());
        this.joinRoomButton.addEventListener('click', () => this.showJoinRoom());
        this.quickMatchButton.addEventListener('click', () => this.quickMatch());
        this.backToMainButton.addEventListener('click', () => this.showMainMenu());
        
        // Room creation
        this.createRoomConfirm.addEventListener('click', () => this.createRoom());
        this.backToOnlineButton.addEventListener('click', () => this.showOnlineOptions());
        
        // Room joining
        this.joinRoomConfirm.addEventListener('click', () => this.joinRoom());
        this.backToOnlineButton2.addEventListener('click', () => this.showOnlineOptions());
        
        // Room code input handling
        this.roomCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            this.hideCodeError();
        });
        
        // Lobby controls
        this.copyRoomCodeButton.addEventListener('click', () => this.copyRoomCode());
        this.startGameButton.addEventListener('click', () => this.startMultiplayerGame());
        this.leaveRoomButton.addEventListener('click', () => this.leaveRoom());
        
        // Connection status
        this.backToMenuButton.addEventListener('click', () => this.showMainMenu());
        
        // Dog selection
        this.dogCards.forEach(card => {
            card.addEventListener('click', () => this.selectDog(card.dataset.dog));
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            if (!this.isActive) return;
            
            if (event.code === 'Enter') {
                if (this.currentScreen === 'main') {
                    this.selectSolo();
                } else if (this.currentScreen === 'join' && this.roomCodeInput.value.length === 6) {
                    this.joinRoom();
                }
            } else if (event.code === 'Escape') {
                if (this.currentScreen !== 'main') {
                    this.goBack();
                }
            }
        });
        
        // Set up mute button and music activation
        this.setupMuteButton();
        this.setupMusicActivation();
        
        // Load saved dog selection
        this.loadDogSelection();
        
        // Initialize cinematic camera
        this.setupCinematicCamera();
    }
    
    // Navigation methods
    showMainMenu() {
        this.currentScreen = 'main';
        this.hideAllScreens();
        this.modeSelection.style.display = 'flex';
    }
    
    showOnlineOptions() {
        this.currentScreen = 'online';
        this.hideAllScreens();
        this.onlineOptions.style.display = 'flex';
    }
    
    showCreateRoom() {
        this.currentScreen = 'create';
        this.hideAllScreens();
        this.roomCreation.style.display = 'block';
        this.roomNameInput.focus();
    }
    
    showJoinRoom() {
        this.currentScreen = 'join';
        this.hideAllScreens();
        this.roomJoining.style.display = 'block';
        this.roomCodeInput.focus();
    }
    
    showLobby(roomData) {
        this.currentScreen = 'lobby';
        this.hideAllScreens();
        this.lobbyScreen.style.display = 'block';
        this.updateLobbyDisplay(roomData);
    }
    
    showConnecting(message) {
        this.currentScreen = 'connecting';
        this.hideAllScreens();
        this.connectionStatus.style.display = 'block';
        this.connectionMessage.textContent = message;
    }
    
    hideAllScreens() {
        this.modeSelection.style.display = 'none';
        this.onlineOptions.style.display = 'none';
        this.roomCreation.style.display = 'none';
        this.roomJoining.style.display = 'none';
        this.lobbyScreen.style.display = 'none';
        this.connectionStatus.style.display = 'none';
        this.hideCodeError();
    }
    
    goBack() {
        if (this.currentScreen === 'online') {
            this.showMainMenu();
        } else if (this.currentScreen === 'create' || this.currentScreen === 'join') {
            this.showOnlineOptions();
        } else if (this.currentScreen === 'lobby') {
            this.leaveRoom();
        } else if (this.currentScreen === 'connecting') {
            this.showMainMenu();
        }
    }
    
    // Game mode selection
    selectSolo() {
        this.selectedMode = 'solo';
        this.playUIClick();
        this.startGame();
    }
    
    // Room management methods
    async createRoom() {
        const roomName = this.roomNameInput.value.trim() || 'Sheep Herding Room';
        const maxPlayers = parseInt(this.maxPlayersSelect.value);
        const isPrivate = this.privateRoomCheckbox.checked;
        const playerName = 'Player'; // TODO: Get from input or localStorage
        
        this.playUIClick();
        this.showConnecting('Connecting to server...');
        
        try {
            // Connect to server first
            await this.networkManager.connect();
            
            this.showConnecting('Creating room...');
            
            // Create room
            await this.networkManager.createRoom(playerName, {
                roomName: roomName,
                maxPlayers: maxPlayers,
                isPublic: !isPrivate
            }, this.selectedDog);
            
            // Room creation success - lobby transition handled by onRoomUpdate callback
            
        } catch (error) {
            console.error('Failed to create room:', error);
            this.showConnectionError('Failed to create room. Please try again.');
        }
    }
    
    async joinRoom() {
        console.log('🔍 DEBUG: joinRoom called');
        console.log('🔍 DEBUG: this.roomCodeInput:', this.roomCodeInput);
        console.log('🔍 DEBUG: this.roomCodeInput.value:', this.roomCodeInput?.value);
        
        const roomCode = this.roomCodeInput.value.trim();
        console.log('🔍 DEBUG: roomCode after trim:', `"${roomCode}"`);
        
        if (roomCode.length !== 6) {
            this.showCodeError('Room code must be 6 characters');
            return;
        }
        
        const playerName = 'Player'; // TODO: Get from input or localStorage
        
        this.playUIClick();
        this.showConnecting('Connecting to server...');
        
        try {
            // Connect to server first
            await this.networkManager.connect();
            
            this.showConnecting('Joining room...');
            
            // Join room
            await this.networkManager.joinRoom(roomCode, playerName, this.selectedDog);
            
            // Room join success - lobby transition handled by onRoomUpdate callback
            
        } catch (error) {
            console.error('Failed to join room:', error);
            if (error.message.includes('not found')) {
                this.showCodeError('Room not found');
            } else {
                this.showConnectionError('Failed to join room. Please try again.');
            }
        }
    }
    
    async quickMatch() {
        const playerName = 'Player'; // TODO: Get from input or localStorage
        
        this.playUIClick();
        this.showConnecting('Connecting to server...');
        
        try {
            // Connect to server first
            await this.networkManager.connect();
            
            this.showConnecting('Finding available room...');
            
            // Quick match
            await this.networkManager.quickMatch(playerName, this.selectedDog);
            
            // Quick match success - lobby transition handled by onRoomUpdate callback
            
        } catch (error) {
            console.error('Failed to find room:', error);
            this.showConnectionError('No available rooms found. Try creating one!');
        }
    }
    
    leaveRoom() {
        this.networkManager.leaveRoom();
        this.isHost = false;
        this.currentRoom = null;
        this.showOnlineOptions();
    }
    
    startMultiplayerGame() {
        if (!this.isHost) return;
        
        this.playUIClick();
        this.networkManager.startGame();
        // Game start will be handled by network events
    }
    
    // Utility methods
    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    copyRoomCode() {
        if (this.currentRoom) {
            navigator.clipboard.writeText(this.currentRoom.roomCode).then(() => {
                // Visual feedback
                const originalText = this.copyRoomCodeButton.textContent;
                this.copyRoomCodeButton.textContent = '✓ Copied!';
                this.copyRoomCodeButton.style.background = '#4CAF50';
                
                setTimeout(() => {
                    this.copyRoomCodeButton.textContent = originalText;
                    this.copyRoomCodeButton.style.background = '';
                }, 1500);
            }).catch(() => {
                // Fallback for older browsers
                this.copyRoomCodeButton.textContent = this.currentRoom.roomCode + ' (Copy manually)';
                setTimeout(() => {
                    this.copyRoomCodeButton.textContent = '📋 Copy';
                }, 3000);
            });
        }
    }
    
    updateLobbyDisplay(roomData) {
        this.lobbyRoomName.textContent = `Room: ${roomData.name || 'Sheep Herding Room'}`;
        this.currentRoomCode.textContent = roomData.roomCode;
        this.playerCount.textContent = roomData.players.length;
        this.maxPlayerCount.textContent = roomData.maxPlayers || 4;
        
        // Update player list
        this.playersContainer.innerHTML = '';
        roomData.players.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = `player-item ${player.isHost ? 'player-host' : ''}`;
            playerDiv.innerHTML = `
                <span class="player-name">${player.name}</span>
                <span class="player-status">Ready</span>
            `;
            this.playersContainer.appendChild(playerDiv);
        });
        
        // Show/hide host controls
        if (this.isHost) {
            this.lobbyScreen.classList.add('is-host');
            this.startGameButton.style.display = 'block';
            this.lobbyMessage.textContent = 'Click Start Game when ready!';
        } else {
            this.lobbyScreen.classList.remove('is-host');
            this.startGameButton.style.display = 'none';
            this.lobbyMessage.textContent = 'Waiting for host to start the game...';
        }
    }
    
    showCodeError(message) {
        this.codeError.textContent = message;
        this.codeError.style.display = 'block';
        this.roomCodeInput.style.borderColor = '#F44336';
    }
    
    hideCodeError() {
        this.codeError.style.display = 'none';
        this.roomCodeInput.style.borderColor = '';
    }
    
    showConnectionError(message) {
        this.connectionMessage.textContent = message + ' Click back to return to menu.';
    }
    
    playUIClick() {
        if (this.audioManager) {
            this.audioManager.playUIClick();
        }
    }
    
    // Dog selection methods
    selectDog(dogType) {
        this.selectedDog = dogType;
        this.playUIClick();
        
        // Update UI
        this.dogCards.forEach(card => {
            card.classList.remove('active');
            if (card.dataset.dog === dogType) {
                card.classList.add('active');
            }
        });
        
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
        if (savedDog && ['jep', 'rory', 'pip'].includes(savedDog)) {
            this.selectDog(savedDog);
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
        
        this.startScreenElement.style.transition = 'opacity 0.8s ease-out';
        this.startScreenElement.style.opacity = '0';
        
        setTimeout(() => {
            this.startScreenElement.style.display = 'none';
            this.gameUIElements.forEach(element => {
                element.classList.add('visible');
            });
        }, 800);
        
        if (this.onGameStart) {
            // Ensure we have room data for multiplayer mode
            let roomData = this.currentRoom;
            if (this.selectedMode === 'multiplayer' && !roomData) {
                roomData = this.networkManager.getCurrentRoom();
            }
            
            console.log('🎮 Starting game:', {
                mode: this.selectedMode || 'solo',
                room: roomData ? roomData.roomCode : 'none',
                players: roomData ? roomData.players?.length : 0
            });
            
            this.onGameStart(this.selectedMode || 'solo', roomData);
        }
    }
    
    // Audio setup methods
    setupMuteButton() {
        this.muteToggle = document.getElementById('mute-toggle');
        if (this.muteToggle) {
            this.muteToggle.addEventListener('click', () => {
                if (this.audioManager) {
                    this.audioManager.toggleMute();
                    this.updateMuteButton();
                }
            });
        }
    }
    
    updateMuteButton() {
        if (!this.muteToggle || !this.audioManager) return;
        
        const isMuted = this.audioManager.isMutedState();
        const icon = isMuted ? '🔇' : '🔊';
        this.muteToggle.innerHTML = `${icon} <strong>Click</strong> - Toggle Sound`;
        this.muteToggle.title = isMuted ? 'Click to unmute sound' : 'Click to mute sound';
        
        if (isMuted) {
            this.muteToggle.classList.add('muted');
        } else {
            this.muteToggle.classList.remove('muted');
        }
    }
    
    setupMusicActivation() {
        const handleStartScreenClick = (event) => {
            // Don't trigger music if clicking buttons
            if (event.target.closest('button') || event.target.closest('input') || event.target.closest('select')) {
                return;
            }
            
            if (this.audioManager && this.isActive) {
                this.audioManager.triggerStartMusic();
                if (this.musicNote) {
                    this.musicNote.style.display = 'none';
                }
            }
        };
        
        if (this.startScreenElement) {
            this.startScreenElement.addEventListener('click', handleStartScreenClick);
        }
    }
    
    // Public API methods
    setGameStartCallback(callback) {
        this.onGameStart = callback;
    }
    
    setAudioManager(audioManager) {
        this.audioManager = audioManager;
        this.updateMuteButton();
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
    
    reset() {
        this.isActive = true;
        this.gameStarted = false;
        this.selectedMode = null;
        this.isConnecting = false;
        this.isHost = false;
        this.currentRoom = null;
        
        this.startScreenElement.style.display = 'flex';
        this.startScreenElement.style.opacity = '1';
        this.startScreenElement.style.transition = 'none';
        
        this.showMainMenu();
        
        this.gameUIElements.forEach(element => {
            element.classList.remove('visible');
        });
        
        // Reset form inputs
        this.roomNameInput.value = '';
        this.roomCodeInput.value = '';
        this.maxPlayersSelect.value = '3';
        this.privateRoomCheckbox.checked = false;
        
        this.cinematicCamera.angle = 0;
        this.setupCinematicCamera();
    }
} 