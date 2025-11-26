/**
 * UI Components Entry Point
 *
 * This is the main entry point for all game UI components.
 * It initializes the React overlay and mounts the App component.
 *
 * Directory Structure:
 * - hooks/       - Custom React hooks (usePlatform, useGameState)
 * - shared/      - Shared utilities (playerIdentity, settings)
 * - StartScreen/ - Start screen components (ModeSelection, DogSelection, etc.)
 * - GameHUD/     - In-game HUD components (GameTimer, SheepCounter, MobileHUD, etc.)
 * - Multiplayer/ - Multiplayer UI (Lobby, Leaderboard, Scoreboard, etc.)
 * - App.js       - Main App component that orchestrates everything
 */

import { initReactUI } from './App.js';

// Export the initialization function
export { initReactUI };

// Auto-initialize when DOM is ready (if this script is loaded directly)
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReactUI);
    } else {
        // DOM already loaded, initialize immediately
        initReactUI();
    }
}
