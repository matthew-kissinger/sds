/**
 * Game Settings Management
 * Handles loading, saving, and applying game settings
 */
import { getTerrainBuilder, getAudioManager, getPerformanceMonitor } from '../../GameBridge.js';

// Default settings
export function getDefaultSettings() {
    return {
        performanceMode: 'balanced',  // performance, balanced, quality
        audioEnabled: true,           // true/false
        audioVolume: 70,             // 0-100
        showStats: false             // true/false
    };
}

// Load settings from localStorage
export function loadSettings() {
    try {
        const saved = localStorage.getItem('sds-settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            return { ...getDefaultSettings(), ...parsed };
        }
    } catch (error) {
        console.warn('[SETTINGS] Failed to load settings:', error);
    }
    return getDefaultSettings();
}

// Save settings to localStorage
export function saveSettings(settings) {
    try {
        localStorage.setItem('sds-settings', JSON.stringify(settings));
        console.log('[SETTINGS] Settings saved:', settings);
    } catch (error) {
        console.warn('[SETTINGS] Failed to save settings:', error);
    }
}

// Apply settings to the game instance
export function applySettingsToGame(settings) {
    console.log('[SETTINGS] Applying settings to game:', settings);

    const defaults = getDefaultSettings();

    // Apply performance mode settings only if changed from default
    const terrain = getTerrainBuilder();
    if (settings.performanceMode !== defaults.performanceMode && terrain) {
        const lodSettings = {
            performance: { near: 30, mid: 80, far: 150, horizon: 200 },
            balanced: { near: 50, mid: 150, far: 300, horizon: 500 },
            quality: { near: 80, mid: 200, far: 400, horizon: 600 }
        };

        const lodDistances = lodSettings[settings.performanceMode];
        if (lodDistances) {
            terrain.lodDistances = lodDistances;
            console.log(`[SETTINGS] Applied ${settings.performanceMode} performance mode`);
        }
    }

    // Apply audio settings only if changed from defaults
    const audioManager = getAudioManager();
    if (audioManager) {

        if (settings.audioVolume !== defaults.audioVolume) {
            audioManager.setMasterVolume(settings.audioVolume / 100);
            console.log(`[SETTINGS] Applied audio volume: ${settings.audioVolume}%`);
        }

        if (settings.audioEnabled !== defaults.audioEnabled) {
            audioManager.setMuted(!settings.audioEnabled);
            console.log(`[SETTINGS] Applied audio enabled: ${settings.audioEnabled}`);
        }
    }

    // Apply performance stats toggle only if changed from default
    const perfMonitor = getPerformanceMonitor();
    if (settings.showStats !== defaults.showStats && perfMonitor) {
        if (settings.showStats) {
            perfMonitor.show();
            console.log('[SETTINGS] Performance stats enabled');
        } else {
            perfMonitor.hide();
            console.log('[SETTINGS] Performance stats disabled');
        }
    }
}
