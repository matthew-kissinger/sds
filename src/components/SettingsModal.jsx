import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gameBridge from '../utils/GameBridge.js';
import { useGameData } from '../hooks/useGameBridge.js';

const SettingsModal = ({ isOpen, onClose }) => {
  const gameData = useGameData();
  const [settings, setSettings] = useState({
    gameMode: 'normal',
    performanceMode: 'balanced',
    showStats: false,
    audioEnabled: true,
    audioVolume: 70,
    grassDensity: 'medium',
    renderDistance: 'medium'
  });

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('sds-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.warn('Failed to parse saved settings:', e);
      }
    }
  }, []);

  // Save settings to localStorage and apply to game
  const updateSetting = (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    // Save to localStorage
    localStorage.setItem('sds-settings', JSON.stringify(newSettings));
    
    // Apply settings to game instance
    applySettingsToGame(newSettings);
  };

  const applySettingsToGame = (newSettings) => {
    // Only apply settings if they differ from defaults
    // This ensures we don't interfere with existing game behavior
    
    // Apply performance settings only if explicitly changed from default
    if (newSettings.performanceMode !== 'balanced' && window.gameInstance?.terrainBuilder) {
      const terrain = window.gameInstance.terrainBuilder;
      
      switch (newSettings.performanceMode) {
        case 'performance':
          terrain.lodDistances = {
            near: 30,
            mid: 80,
            far: 150,
            horizon: 200
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
    }

    // Apply game mode settings only if explicitly changed from default
    if (newSettings.gameMode !== 'normal' && window.gameInstance?.gameState) {
      switch (newSettings.gameMode) {
        case 'easy':
          window.gameInstance.gameState.sheepSpeed = 0.8;
          window.gameInstance.gameState.dogSpeed = 1.2;
          break;
        case 'hard':
          window.gameInstance.gameState.sheepSpeed = 1.3;
          window.gameInstance.gameState.dogSpeed = 0.9;
          break;
        case 'extreme':
          window.gameInstance.gameState.sheepSpeed = 1.5;
          window.gameInstance.gameState.dogSpeed = 0.8;
          break;
      }
    }

    // Apply audio settings only if explicitly changed from defaults
    if (window.gameInstance?.audioManager) {
      if (newSettings.audioVolume !== 70) {
        window.gameInstance.audioManager.setMasterVolume(newSettings.audioVolume / 100);
      }
      if (newSettings.audioEnabled !== true) {
        window.gameInstance.audioManager.setEnabled(newSettings.audioEnabled);
      }
    }

    // Notify game bridge about settings changes
    gameBridge.emit('settings-changed', newSettings);
  };

  const resetToDefaults = () => {
    const defaultSettings = {
      gameMode: 'normal',
      performanceMode: 'balanced',
      showStats: false,
      audioEnabled: true,
      audioVolume: 70,
      grassDensity: 'medium',
      renderDistance: 'medium'
    };
    setSettings(defaultSettings);
    localStorage.setItem('sds-settings', JSON.stringify(defaultSettings));
    applySettingsToGame(defaultSettings);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        
        {/* Modal */}
        <motion.div
          className="relative w-full max-w-md mx-4 bg-gray-900/90 backdrop-blur-xl border border-gray-700 rounded-2xl p-6 shadow-2xl"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">⚙️ Settings</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Settings Content */}
          <div className="space-y-6">
            {/* Game Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                🎮 Game Mode
              </label>
              <select
                value={settings.gameMode}
                onChange={(e) => updateSetting('gameMode', e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="easy">Easy - Slower sheep, faster dog</option>
                <option value="normal">Normal - Balanced gameplay</option>
                <option value="hard">Hard - Faster sheep, slower dog</option>
                <option value="extreme">Extreme - Maximum challenge</option>
              </select>
            </div>

            {/* Performance Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                ⚡ Performance Mode
              </label>
              <select
                value={settings.performanceMode}
                onChange={(e) => updateSetting('performanceMode', e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="performance">Performance - Maximum FPS</option>
                <option value="balanced">Balanced - Default settings</option>
                <option value="quality">Quality - Best visuals</option>
              </select>
            </div>

            {/* Show Stats */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">
                📊 Show Performance Stats
              </label>
              <button
                onClick={() => updateSetting('showStats', !settings.showStats)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.showStats ? 'bg-blue-500' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.showStats ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Audio Enable */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">
                🔊 Audio Enabled
              </label>
              <button
                onClick={() => updateSetting('audioEnabled', !settings.audioEnabled)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.audioEnabled ? 'bg-blue-500' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.audioEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Audio Volume */}
            {settings.audioEnabled && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  🔉 Audio Volume ({settings.audioVolume}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.audioVolume}
                  onChange={(e) => updateSetting('audioVolume', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>
            )}

            {/* Performance Stats Display */}
            {settings.showStats && (
              <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-3">📊 Live Performance Stats</h3>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                  <div>FPS: <span className="text-white">{gameData.fps || '--'}</span></div>
                  <div>Triangles: <span className="text-white">{gameData.triangles || '--'}</span></div>
                  <div>Grass: <span className="text-white">{gameData.grassVisible || '--'}</span></div>
                  <div>Draw Calls: <span className="text-white">{gameData.drawCalls || '--'}</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 mt-8">
            <button
              onClick={resetToDefaults}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors"
            >
              Reset to Defaults
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SettingsModal;
