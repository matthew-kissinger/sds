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
    console.log('🔥 GameBridge.emit called with event:', event, 'data:', data);
    
    switch (event) {
      case 'start-game':
        console.log('📢 GameBridge.emit: Handling start-game event');
        this.startGame(data);
        break;
      case 'pause-game':
        this.gameInstance?.pauseGame?.(data.paused);
        break;
      case 'select-dog':
        this.uiState.selectedDog = data.dogId;
        if (window.gameInstance) {
          window.gameInstance.selectDog(data.dogId);
        }
        this.notify('dog-selected', data);
        break;
      case 'set-input-method':
        this.uiState.inputMethod = data.method;
        break;
      case 'settings-changed':
        this.handleSettingsChanged(data);
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
    console.log('🎮 GameBridge.startGame called with options:', options);
    
    // Use the window.gameInstance which has the exposed methods
    if (!window.gameInstance) {
      console.error('Game instance not available on window');
      return;
    }
    
    console.log('✅ window.gameInstance found:', !!window.gameInstance);
    console.log('✅ window.gameInstance.startSoloGame:', typeof window.gameInstance.startSoloGame);
    
    this.uiState.gameStarted = true;
    this.uiState.currentScreen = 'game';
    
    // Update selected dog state
    if (options.dog) {
      this.uiState.selectedDog = options.dog;
      console.log('🐕 Setting selected dog:', options.dog);
      window.gameInstance.selectDog(options.dog);
    }
    
    // Start the appropriate game mode
    if (options.mode === 'solo') {
      console.log('🚀 Starting solo game with dog:', this.uiState.selectedDog);
      window.gameInstance.startSoloGame(this.uiState.selectedDog);
    }
    // Multiplayer handled differently - through room creation/joining
    
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
        
        // Get performance stats for mobile
        let performanceStats = {};
        if (this.gameInstance.performanceMonitor) {
          const mobileStats = this.gameInstance.performanceMonitor.getMobileStats();
          performanceStats = {
            fps: mobileStats.fps,
            grassVisible: mobileStats.grassVisible,
            treesVisible: mobileStats.treesVisible,
            drawCalls: mobileStats.drawCalls,
            triangles: mobileStats.triangles
          };
        }
        
        const updateData = {
          stamina: stamina,
          maxStamina: maxStamina,
          staminaPercentage: staminaPercentage,
          sheepCount: sheepCount,
          totalSheep: totalSheep,
          gameTime: Math.floor(gameTime),
          ...performanceStats
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
  
  // Handle settings changes
  handleSettingsChanged(settings) {
    console.log('⚙️ Settings changed:', settings);
    
    // Apply performance settings to terrain
    if (window.gameInstance?.terrainBuilder && settings.performanceMode) {
      const terrain = window.gameInstance.terrainBuilder;
      
      switch (settings.performanceMode) {
        case 'performance':
          terrain.lodDistances = {
            near: 30,
            mid: 80,
            far: 150,
            horizon: 200
          };
          break;
        case 'balanced':
          terrain.lodDistances = {
            near: 50,
            mid: 150,
            far: 300,
            horizon: 500
          };
          break;
        case 'quality':
          terrain.lodDistances = {
            near: 80,
            mid: 200,
            far: 400,
            horizon: 600
          };
          break;
      }
      
      // Force LOD update
      if (terrain.updateSimpleLOD && window.gameInstance.sheepdog) {
        terrain.updateSimpleLOD(window.gameInstance.sheepdog.getPosition());
      }
    }

    // Apply game mode settings
    if (window.gameInstance?.gameState && settings.gameMode) {
      const gameState = window.gameInstance.gameState;
      
      switch (settings.gameMode) {
        case 'normal':
          if (gameState.sheepSpeed !== undefined) gameState.sheepSpeed = 1.0;
          if (gameState.dogSpeed !== undefined) gameState.dogSpeed = 1.0;
          break;
        case 'easy':
          if (gameState.sheepSpeed !== undefined) gameState.sheepSpeed = 0.8;
          if (gameState.dogSpeed !== undefined) gameState.dogSpeed = 1.2;
          break;
        case 'hard':
          if (gameState.sheepSpeed !== undefined) gameState.sheepSpeed = 1.3;
          if (gameState.dogSpeed !== undefined) gameState.dogSpeed = 0.9;
          break;
        case 'extreme':
          if (gameState.sheepSpeed !== undefined) gameState.sheepSpeed = 1.5;
          if (gameState.dogSpeed !== undefined) gameState.dogSpeed = 0.8;
          break;
      }
    }

    // Apply audio settings
    if (window.gameInstance?.audioManager) {
      const audioManager = window.gameInstance.audioManager;
      
      if (settings.audioVolume !== undefined) {
        audioManager.setMasterVolume(settings.audioVolume / 100);
      }
      
      if (settings.audioEnabled !== undefined) {
        audioManager.setEnabled(settings.audioEnabled);
      }
    }

    // Store settings globally for other components to access
    window.gameSettings = settings;
    
    // Notify other components about settings change
    this.notify('settings-updated', settings);
  }
}

// Singleton instance
export const gameBridge = new GameBridge();
export default gameBridge;
