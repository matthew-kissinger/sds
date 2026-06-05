// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Completion-overlay builders extracted from `main.js` in Cycle 28
 * Stream B1.
 *
 * `showCompletionOverlay` is the canonical post-game UI: tries the React
 * `CompletionScreen` if present, falls back to a plain HTML overlay.
 * `showLocalCompletionOverlay` is the 2-player split-screen variant.
 *
 * Behaviors are unchanged from the original inline methods — same
 * cssText, same React render, same fallback markup.
 */

/**
 * The completion overlay mounts in its OWN React root appended to <body>,
 * outside the main app tree, so React's StartScreen remount cannot unmount
 * it. We hold the root here (Cycle 57 P2) so return-to-menu can tear it down
 * properly; otherwise the menu opens UNDER a stale overlay and the orphaned
 * root leaks. Null while the fallback (non-React) overlay is up.
 */
let completionRoot = null;

/**
 * Tear down the completion overlay: unmount its React root (if any) and
 * remove the DOM node. Safe to call when nothing is mounted (no-op). Called
 * by restartToMenu so every menu-return path clears the overlay.
 */
export function disposeCompletionOverlay() {
    if (completionRoot) {
        try {
            completionRoot.unmount();
        } catch (err) {
            console.warn('[GAME] completion overlay unmount failed:', err);
        }
        completionRoot = null;
    }
    const node = document.getElementById('game-completion-overlay');
    if (node) node.remove();
}

/**
 * @param {object} game SheepDogSimulation instance.
 * @param {string} mode One of: 'single', 'cooperative', 'racing', 'timed'.
 * @param {object} [data]
 */
export async function showCompletionOverlay(game, mode, data = {}) {
    console.log('[GAME] Creating completion overlay for mode:', mode, data);

    // Remove any existing overlay (unmount its root too, not just the node).
    disposeCompletionOverlay();

    // Cycle 57 P6: clear the prior submit-status so a non-submitting mode (or a
    // fresh run) starts blank; the submit path (window.submitGameScore) sets it.
    if (typeof window !== 'undefined') window.__sdsLastSubmit = null;

    // Explicit local developer capture only. Normal players should never
    // see a download affordance on the completion screen.
    const replayBlobUrl = await game._stopReplay();

    // Submit score to leaderboard for all single-player solo modes
    // (classic / extreme / insane / chaos), NOT sandbox or practice.
    if (mode === 'counting') {
        // Cycle 59 (Counting Sheep): submit the banked counted total. The
        // leaderboard mode (counting-incremental / counting-exponential) is
        // resolved from the run's curve inside submitScoreToLeaderboard.
        console.log(`[GAME] Submitting counted total to leaderboard: ${data.counted}`);
        game.gameState.submitScoreToLeaderboard(data.counted);
    } else if (mode === 'single' && data.finalTime && game.gameMode !== 'sandbox' && game.singlePlayerMode !== 'sandbox' && game.singlePlayerMode !== 'practice') {
        console.log(`[GAME] Submitting score to leaderboard: ${data.finalTime} seconds (mode=${game.singlePlayerMode})`);
        game.gameState.submitScoreToLeaderboard(data.finalTime);
    } else if (mode === 'single' && game.gameMode === 'sandbox') {
        console.log('[GAME] Sandbox mode - score not submitted to leaderboard');
    } else if (mode === 'single' && game.singlePlayerMode === 'practice') {
        console.log('[GAME] Practice mode - score not submitted to leaderboard');
    }

    // Check if React CompletionScreen is available
    if (window.CompletionScreen) {
        const container = document.createElement('div');
        container.id = 'game-completion-overlay';
        document.body.appendChild(container);

        const screenData = {
            finalTime: data.finalTime,
            totalSheep: game.gameState?.totalSheep || data.totalSheep || 20,
            myScore: data.myScore || 0,
            isWinner: data.isWinner,
            winnerName: data.competitive?.winner ? `Player ${data.competitive.winner}` : null,
            isNewBest: mode === 'timed' ? (game.loadBestScore() === null || data.myScore > game.loadBestScore()) : false,
            sheepCount: data.sheepCount || game.gameState?.sheepInPenCount || 0,
            scores: [],
            replayBlobUrl,
            // Cycle 59 (Counting Sheep): the banked counted total + round reached.
            counted: data.counted || 0,
            round: data.round || 0,
        };

        // Build scores array for multiplayer modes
        if (data.competitive?.finalScores) {
            const sortedScores = Object.entries(data.competitive.finalScores).sort(([, a], [, b]) => b - a);
            screenData.scores = sortedScores.map(([playerId, score]) => ({
                id: playerId,
                name: `Player ${playerId}`,
                score: score,
                isMe: score === data.myScore
            }));
        }

        // Render React component (React pulled in lazily — see Phase C note).
        Promise.all([import('react'), import('react-dom/client')]).then(
            ([{ createElement }, { createRoot }]) => {
                completionRoot = createRoot(container);
                completionRoot.render(createElement(window.CompletionScreen, {
                    mode: mode,
                    data: screenData,
                    // Cycle 10 P1+2 + Cycle 57 P3: route through the game so
                    // menu-return tears this overlay down. Play Again replays
                    // the same mode in place; Main Menu returns to the start
                    // screen. Both go through methods that call
                    // disposeCompletionOverlay() first.
                    onPlayAgain: () => game.restartSameMode(),
                    onMainMenu: () => game.restartToMenu()
                }));
                console.log('[GAME] React completion overlay rendered!');
            },
        );
    } else {
        // Fallback to simple overlay if React not available
        console.log('[GAME] React not available, using fallback overlay');
        const overlay = document.createElement('div');
        overlay.id = 'game-completion-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            font-family: system-ui, sans-serif;
            color: white;
            text-align: center;
        `;

        const timeStr = data.finalTime ? game.formatTime(data.finalTime) : 'Unknown';
        overlay.innerHTML = `
            <div style="padding: 40px; background: rgba(16, 185, 129, 0.2); border-radius: 20px; border: 1px solid rgba(16, 185, 129, 0.4);">
                <h1 style="font-size: 36px; margin: 0 0 20px 0;">Victory!</h1>
                <p style="font-size: 18px; margin: 0 0 30px 0;">Time: ${timeStr}</p>
                <button onclick="window.gameInstance?.restartSameMode()" style="padding: 14px 28px; font-size: 16px; background: #10b981; color: white; border: none; border-radius: 12px; cursor: pointer; font-weight: 600;">
                    Play Again
                </button>
            </div>
        `;
        document.body.appendChild(overlay);
    }
}

/**
 * 2-player split-screen completion overlay.
 *
 * @param {object} game SheepDogSimulation instance.
 * @param {{ winner: string, player1Score: number, player2Score: number }} result
 */
export function showLocalCompletionOverlay(game, result) {
    console.log('[LOCAL] Showing completion overlay:', result);

    disposeCompletionOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'game-completion-overlay';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        font-family: system-ui, sans-serif;
        color: white;
        text-align: center;
    `;

    let winnerText = '';
    let bgColor = 'rgba(16, 185, 129, 0.2)';
    let borderColor = 'rgba(16, 185, 129, 0.4)';

    if (result.winner === 'coop') {
        winnerText = 'Victory! You herded all sheep together!';
    } else if (result.winner === 'tie') {
        winnerText = "It's a Tie!";
        bgColor = 'rgba(251, 191, 36, 0.2)';
        borderColor = 'rgba(251, 191, 36, 0.4)';
    } else if (result.winner === 'player1') {
        winnerText = 'Player 1 Wins!';
        bgColor = 'rgba(255, 68, 68, 0.2)';
        borderColor = 'rgba(255, 68, 68, 0.4)';
    } else if (result.winner === 'player2') {
        winnerText = 'Player 2 Wins!';
        bgColor = 'rgba(68, 68, 255, 0.2)';
        borderColor = 'rgba(68, 68, 255, 0.4)';
    }

    overlay.innerHTML = `
        <div style="padding: 40px; background: ${bgColor}; border-radius: 20px; border: 1px solid ${borderColor}; min-width: 300px;">
            <h1 style="font-size: 32px; margin: 0 0 20px 0;">${winnerText}</h1>
            <div style="display: flex; justify-content: center; gap: 40px; margin-bottom: 30px;">
                <div>
                    <div style="font-size: 14px; color: #ff4444; margin-bottom: 5px;">Player 1</div>
                    <div style="font-size: 36px; font-weight: bold;">${result.player1Score}</div>
                </div>
                <div>
                    <div style="font-size: 14px; color: #4444ff; margin-bottom: 5px;">Player 2</div>
                    <div style="font-size: 36px; font-weight: bold;">${result.player2Score}</div>
                </div>
            </div>
            <p style="color: rgba(255,255,255,0.5); font-size: 12px; margin-bottom: 20px;">Local mode - scores not submitted to leaderboard</p>
            <button onclick="window.gameInstance?.restartToMenu()" style="padding: 14px 28px; font-size: 16px; background: #10b981; color: white; border: none; border-radius: 12px; cursor: pointer; font-weight: 600;">
                Play Again
            </button>
        </div>
    `;
    document.body.appendChild(overlay);

    // Disable controls
    if (game.mobileControls) {
        game.mobileControls.disable();
    }
}
