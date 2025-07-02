/**
 * GameBridge - Communication layer between React UI and existing game
 * Provides event-based communication without modifying game logic
 */
class GameBridge {
  constructor() {
    this.gameInstance = null;
    this.listeners = {};
    this.uiCallbacks = {};
    
    // UI state
    this.uiState = {
      gameStarted: false,
      currentScreen: 'start', // 'start', 'game', 'pause', 'complete'
      selectedDog: 'jep',
      platform: this.detectPlatform(),
      inputMethod: 'mouse'
    };
    
    // Multiplayer state
    this.multiplayerState = {
      enabled: false,
      players: [],
      currentPlayerId: null,
      connectionStatus: 'disconnected',
      ping: null,
      gameMode: 'cooperative',
      scores: {},
      winCondition: null
    };
  }
  
  // Initialize with game instance
  setGameInstance(instance) {
    this.gameInstance = instance;
    this.setupGameListeners();
  }
  
  // Cleanup method
  cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  // Platform detection
  detectPlatform() {
    const ua = navigator.userAgent;
    const hasTouch = 'ontouchstart' in window;
    const width = window.innerWidth;
    
    if (/iPhone|iPad|iPod|Android/i.test(ua)) {
      return 'mobile';
    } else if (hasTouch && width < 1024) {
      return 'tablet';
    } else {
      return 'desktop';
    }
  }
  
  // React → Game communication
  emit(event, data) {
    switch (event) {
      case 'start-game':
        this.startGame(data);
        break;
      case 'pause-game':
        this.gameInstance?.pauseGame?.(data.paused);
        break;
      case 'select-dog':
        this.uiState.selectedDog = data.dogId;
        this.notify('dog-selected', data);
        break;
      case 'set-input-method':
        this.uiState.inputMethod = data.method;
        break;
      default:
        console.warn('Unknown event:', event);
    }
  }
  
  // Game → React communication
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }
  
  // Notify React components
  notify(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
  
  // Start game with selected options
  startGame(options = {}) {
    if (!this.gameInstance) {
      console.error('Game instance not set');
      return;
    }
    
    this.uiState.gameStarted = true;
    this.uiState.currentScreen = 'game';
    
    // Hide start screen, show game
    const startScreenEl = document.getElementById('start-screen');
    if (startScreenEl) {
      startScreenEl.style.display = 'none';
    }
    
    // Show game UI
    const gameUIs = document.querySelectorAll('.game-ui');
    gameUIs.forEach(el => el.style.display = 'block');
    
    // Hide the original multiplayer HUD if React is handling it
    const originalMultiplayerHUD = document.getElementById('multiplayer-hud');
    if (originalMultiplayerHUD && this.gameInstance.multiplayerUI) {
      originalMultiplayerHUD.style.display = 'none';
      // Add class to body to indicate React is handling multiplayer
      document.body.classList.add('react-multiplayer');
    }
    
    // Start the game with selected dog
    this.gameInstance.startGame?.(this.uiState.selectedDog, options);
    
    this.notify('game-started', {
      dog: this.uiState.selectedDog,
      ...options
    });
    
    // Notify UI state change
    this.notify('ui-state-changed', this.uiState);
  }
  
  // Setup listeners for game events
  setupGameListeners() {
    if (!this.gameInstance) return;
    
    // Hook into multiplayerUI showCompetitiveCompletion method
    if (this.gameInstance.multiplayerUI && this.gameInstance.multiplayerUI.showCompetitiveCompletion) {
      const originalMethod = this.gameInstance.multiplayerUI.showCompetitiveCompletion;
      this.gameInstance.multiplayerUI.showCompetitiveCompletion = (data) => {
        // Call original method
        originalMethod.call(this.gameInstance.multiplayerUI, data);
        // Also notify React
        this.showCompetitionComplete(data);
      };
    }
    
    // Create a periodic update function to poll game state
    this.updateInterval = setInterval(() => {
      if (this.gameInstance.gameState && this.gameInstance.gameState.isGameActive()) {
        // Get stamina from the sheepdog
        const stamina = this.gameInstance.sheepdog?.stamina || 100;
        
        // Get sheep count based on game mode
        let sheepCount = 0;
        if (this.gameInstance.gameState.gameMode === 'competitive' || this.gameInstance.gameState.gameMode === 'timed') {
          // In competitive/timed mode, show player's score
          const playerId = this.gameInstance.networkManager?.getPlayerId();
          sheepCount = this.gameInstance.gameState.getPlayerScore(playerId) || 0;
        } else {
          // In cooperative mode, show total retired sheep
          sheepCount = this.gameInstance.gameState.sheepRetired || 0;
        }
        
        // Get game time
        const gameTime = this.gameInstance.gameTimer?.getGameTime?.() || 0;
        const totalSheep = this.gameInstance.gameState.totalSheep || 200;
        
        // Get max stamina for percentage calculation
        const maxStamina = this.gameInstance.sheepdog?.maxStamina || 100;
        const staminaPercentage = Math.round((stamina / maxStamina) * 100);
        
        const updateData = {
          stamina: stamina,
          maxStamina: maxStamina,
          staminaPercentage: staminaPercentage,
          sheepCount: sheepCount,
          totalSheep: totalSheep,
          gameTime: Math.floor(gameTime)
        };
        
        // Check for multiplayer data updates
        if (this.gameInstance.multiplayerUI) {
          const multiplayerUI = this.gameInstance.multiplayerUI;
          this.updateMultiplayerState({
            enabled: true,
            players: multiplayerUI.getPlayers(),
            currentPlayerId: multiplayerUI.playerId,
            connectionStatus: multiplayerUI.getConnectionState(),
            ping: multiplayerUI.getCurrentPing(),
            gameMode: multiplayerUI.gameMode,
            scores: multiplayerUI.playerScores,
            winCondition: multiplayerUI.winCondition
          });
          
          // Ensure original multiplayer HUD is hidden
          const originalHUD = document.getElementById('multiplayer-hud');
          if (originalHUD && originalHUD.style.display !== 'none') {
            originalHUD.style.display = 'none';
            document.body.classList.add('react-multiplayer');
          }
        }
        
        // Debug logging
        if (Math.floor(gameTime) % 5 === 0 && Math.floor(gameTime) !== this.lastLoggedTime) {
          console.log('🎮 Game Update:', updateData);
          this.lastLoggedTime = Math.floor(gameTime);
        }
        
        this.notify('game-update', updateData);
      }
    }, 100); // Update every 100ms for smooth UI updates
  }
  
  // Get current UI state
  getUIState() {
    return { ...this.uiState };
  }
  
  // Update UI state
  updateUIState(updates) {
    this.uiState = { ...this.uiState, ...updates };
    this.notify('ui-state-changed', this.uiState);
  }
  
  // Multiplayer methods
  updateMultiplayerState(updates) {
    const hasChanged = JSON.stringify(this.multiplayerState) !== JSON.stringify({...this.multiplayerState, ...updates});
    
    if (hasChanged) {
      this.multiplayerState = { ...this.multiplayerState, ...updates };
      this.notify('multiplayer-update', this.multiplayerState);
    }
  }
  
  getMultiplayerState() {
    return { ...this.multiplayerState };
  }
  
  // Handle competition completion
  showCompetitionComplete(data) {
    this.notify('competition-complete', data);
  }
}

// Singleton instance
export const gameBridge = new GameBridge();
export default gameBridge;