/**
 * Game Settings Management
 * Handles loading, saving, and applying game settings
 */
import { getTerrainBuilder, getAudioManager, getPerformanceMonitor, getSceneManager, getGrassSystem } from '../../GameBridge.js';

// Default key bindings
export const DEFAULT_KEY_BINDINGS = {
    moveUp: 'KeyW',
    moveDown: 'KeyS',
    moveLeft: 'KeyA',
    moveRight: 'KeyD',
    sprint: 'ShiftLeft',
    pause: 'Escape'
};

// Key display names
export const KEY_DISPLAY_NAMES = {
    'KeyW': 'W', 'KeyA': 'A', 'KeyS': 'S', 'KeyD': 'D',
    'KeyQ': 'Q', 'KeyE': 'E', 'KeyR': 'R', 'KeyF': 'F',
    'KeyZ': 'Z', 'KeyX': 'X', 'KeyC': 'C', 'KeyV': 'V',
    'ArrowUp': '\u2191', 'ArrowDown': '\u2193', 'ArrowLeft': '\u2190', 'ArrowRight': '\u2192',
    'ShiftLeft': 'L.Shift', 'ShiftRight': 'R.Shift',
    'ControlLeft': 'L.Ctrl', 'ControlRight': 'R.Ctrl',
    'AltLeft': 'L.Alt', 'AltRight': 'R.Alt',
    'Space': 'Space', 'Enter': 'Enter', 'Escape': 'Esc', 'Tab': 'Tab',
    'Backspace': 'Backspace', 'Delete': 'Delete',
    'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4', 'Digit5': '5',
    'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9', 'Digit0': '0'
};

// Get display name for a key code
export function getKeyDisplayName(code) {
    return KEY_DISPLAY_NAMES[code] || code.replace('Key', '').replace('Digit', '');
}

// Performance presets with actual values
export const PERFORMANCE_PRESETS = {
    performance: {
        shadows: false,
        shadowQuality: 'off',
        grassDensity: 0.3,
        grassDistance: 100,
        pixelRatio: 1,
        antialias: false,
        fogDistance: 300,
        lodDistances: { near: 30, mid: 80, far: 150, horizon: 200 }
    },
    balanced: {
        shadows: true,
        shadowQuality: 'medium',
        grassDensity: 0.7,
        grassDistance: 180,
        pixelRatio: 1.5,
        antialias: true,
        fogDistance: 450,
        lodDistances: { near: 50, mid: 150, far: 300, horizon: 500 }
    },
    quality: {
        shadows: true,
        shadowQuality: 'high',
        grassDensity: 1.0,
        grassDistance: 280,
        pixelRatio: 2,
        antialias: true,
        fogDistance: 600,
        lodDistances: { near: 80, mid: 200, far: 400, horizon: 600 }
    }
};

// Default settings
export function getDefaultSettings() {
    return {
        // Graphics
        performanceMode: 'balanced',
        shadows: true,
        shadowQuality: 'medium',  // off, low, medium, high
        grassDensity: 0.7,        // 0.3-1.0
        pixelRatio: 1.5,          // 1-2
        antialias: true,

        // Audio
        audioEnabled: true,
        audioVolume: 70,

        // Controls
        keyBindings: { ...DEFAULT_KEY_BINDINGS },
        mouseSensitivity: 1.0,

        // Debug
        showStats: false
    };
}

// Load settings from localStorage
export function loadSettings() {
    try {
        const saved = localStorage.getItem('sds-settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge with defaults to ensure all keys exist
            const settings = { ...getDefaultSettings(), ...parsed };
            // Ensure keyBindings has all keys
            settings.keyBindings = { ...DEFAULT_KEY_BINDINGS, ...parsed.keyBindings };
            return settings;
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

// Apply a performance preset
export function applyPerformancePreset(presetName, currentSettings) {
    const preset = PERFORMANCE_PRESETS[presetName];
    if (!preset) return currentSettings;

    return {
        ...currentSettings,
        performanceMode: presetName,
        shadows: preset.shadows,
        shadowQuality: preset.shadowQuality,
        grassDensity: preset.grassDensity,
        pixelRatio: preset.pixelRatio,
        antialias: preset.antialias
    };
}

// Apply settings to the game instance
export function applySettingsToGame(settings) {
    console.log('[SETTINGS] Applying settings to game:', settings);

    // Apply performance mode settings
    const sceneManager = getSceneManager();
    if (sceneManager) {
        // Apply shadow settings
        const renderer = sceneManager.renderer;
        if (renderer) {
            // Shadow toggle
            if (settings.shadows !== undefined) {
                renderer.shadowMap.enabled = settings.shadows;
                console.log(`[SETTINGS] Shadows: ${settings.shadows ? 'enabled' : 'disabled'}`);
            }

            // Shadow quality
            if (settings.shadowQuality && settings.shadows) {
                const THREE = window.THREE;
                if (THREE) {
                    switch (settings.shadowQuality) {
                        case 'low':
                            renderer.shadowMap.type = THREE.BasicShadowMap;
                            break;
                        case 'medium':
                            renderer.shadowMap.type = THREE.PCFShadowMap;
                            break;
                        case 'high':
                            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                            break;
                    }
                    console.log(`[SETTINGS] Shadow quality: ${settings.shadowQuality}`);
                }
            }

            // Pixel ratio
            if (settings.pixelRatio !== undefined) {
                const targetRatio = Math.min(settings.pixelRatio, window.devicePixelRatio);
                renderer.setPixelRatio(targetRatio);
                console.log(`[SETTINGS] Pixel ratio: ${targetRatio}`);
            }
        }
    }

    // Apply terrain LOD settings
    const terrain = getTerrainBuilder();
    if (terrain && settings.performanceMode) {
        const preset = PERFORMANCE_PRESETS[settings.performanceMode];
        if (preset && preset.lodDistances) {
            terrain.lodDistances = preset.lodDistances;
            console.log(`[SETTINGS] Applied ${settings.performanceMode} LOD distances`);
        }
    }

    // Apply grass settings
    const grassSystem = getGrassSystem();
    if (grassSystem && settings.grassDensity !== undefined) {
        // GrassSystem density is controlled during initialization,
        // but we can update LOD distances for visible range
        if (grassSystem.config) {
            const preset = PERFORMANCE_PRESETS[settings.performanceMode];
            if (preset) {
                grassSystem.config.lodFar = preset.grassDistance;
                console.log(`[SETTINGS] Grass distance: ${preset.grassDistance}`);
            }
        }
    }

    // Apply audio settings
    const audioManager = getAudioManager();
    if (audioManager) {
        if (settings.audioVolume !== undefined) {
            audioManager.setMasterVolume(settings.audioVolume / 100);
            console.log(`[SETTINGS] Audio volume: ${settings.audioVolume}%`);
        }

        if (settings.audioEnabled !== undefined) {
            audioManager.setMuted(!settings.audioEnabled);
            console.log(`[SETTINGS] Audio enabled: ${settings.audioEnabled}`);
        }
    }

    // Apply performance stats toggle
    const perfMonitor = getPerformanceMonitor();
    if (perfMonitor && settings.showStats !== undefined) {
        if (settings.showStats) {
            perfMonitor.show();
            console.log('[SETTINGS] Performance stats enabled');
        } else {
            perfMonitor.hide();
            console.log('[SETTINGS] Performance stats disabled');
        }
    }

    // Dispatch event for other systems to react
    window.dispatchEvent(new CustomEvent('settings-changed', { detail: settings }));
}

// Get current key bindings
export function getKeyBindings() {
    const settings = loadSettings();
    return settings.keyBindings || DEFAULT_KEY_BINDINGS;
}

// Update a single key binding
export function updateKeyBinding(action, keyCode) {
    const settings = loadSettings();
    settings.keyBindings = settings.keyBindings || { ...DEFAULT_KEY_BINDINGS };
    settings.keyBindings[action] = keyCode;
    saveSettings(settings);

    // Dispatch event for InputHandler to update
    window.dispatchEvent(new CustomEvent('keybindings-changed', {
        detail: settings.keyBindings
    }));

    return settings;
}

// Check if a key is already bound to another action
export function isKeyAlreadyBound(keyCode, excludeAction) {
    const bindings = getKeyBindings();
    for (const [action, code] of Object.entries(bindings)) {
        if (action !== excludeAction && code === keyCode) {
            return action;
        }
    }
    return null;
}
