/**
 * UI Components Entry Point
 *
 * Cycle 27 Phase C: lazy-load App.js out of the critical-path bundle.
 * Three.js + WebGL bootstrap is the user-perceivable cold-start; the
 * React overlay can mount one idle tick later without anyone noticing.
 *
 * Directory Structure:
 * - hooks/       - Custom React hooks (usePlatform, useGameState)
 * - shared/      - Shared utilities (playerIdentity, settings)
 * - StartScreen/ - Start screen components (ModeSelection, DogSelection, etc.)
 * - GameHUD/     - In-game HUD components (GameTimer, SheepCounter, MobileHUD, etc.)
 * - Multiplayer/ - Multiplayer UI (Lobby, Leaderboard, Scoreboard, etc.)
 * - App.js       - Main App component (now in its own lazy chunk).
 */

// requestIdleCallback was the first cut, but Chromium can starve idle
// callbacks when the WebGL boot keeps the main thread busy — even with
// a timeout — so the React overlay never mounted in headless smoke
// runs. setTimeout(0) is the reliable path: yields one task to let
// main.js's imports settle, then loads the App chunk.
function bootReactUI() {
    import('./App.js')
        .then(({ initReactUI }) => initReactUI())
        .catch((err) => {
            console.error('[UI] Failed to load React overlay:', err);
        });
}

if (typeof document !== 'undefined' && !window.__sdsG?.r) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(bootReactUI, 0));
    } else {
        setTimeout(bootReactUI, 0);
    }
}
