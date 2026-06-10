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
 * Cycle 61 P2: the two inline (non-React) overlays were restyled onto the
 * pastoral design language (was the emerald/amber/red/blue tech palette).
 * Literal pastoral hex is used because the inline cssText/innerHTML strings
 * read more reliably than var(--token) here, mirroring the literal-hex
 * MEDAL_COLORS precedent in CompletionScreen.tsx. The pastoral values match the
 * tokens: cream #f7f1e6, ink-soft #6b5f4f, meadow #5e9e6e, gold #e0a458, warm
 * scrim rgba(40,28,18,*), warm glass border rgba(255,244,224,0.22). Behavior is
 * unchanged: same buttons, handlers, scores, and result text strings.
 */

import { Z } from '../ui/zIndex.js';

// Cycle 61 P2: pastoral palette literals for the inline overlays (mirror of the
// `pastoral` tokens; inline cssText can't share the var()-driven tokens.ts).
const PASTORAL_SCRIM = 'rgba(40, 28, 18, 0.72)'; // warm scrim, full-screen cover
const PASTORAL_CREAM = '#f7f1e6'; // warm off-white text on the dark scrim
const PASTORAL_CREAM_SOFT = 'rgba(247, 241, 230, 0.55)'; // muted secondary text
const PASTORAL_GLASS_BORDER = 'rgba(255, 244, 224, 0.22)'; // warm hairline
const PASTORAL_GOLD = '#e0a458'; // low-sun gold, runner-up / tie
const PASTORAL_DUSK = '#d99a8f'; // dusty rose, the second-player accent
// Warm cream card backgrounds, low-opacity over the scrim (replaces the
// emerald/amber/red/blue 0.2-alpha tech tints).
const PASTORAL_WIN_BG = 'linear-gradient(135deg, rgba(94, 158, 110, 0.20), rgba(224, 164, 88, 0.10))';
const PASTORAL_GOLD_BG = 'linear-gradient(135deg, rgba(224, 164, 88, 0.20), rgba(217, 154, 143, 0.10))';
// Primary "Play Again" button: warm meadow gradient (was solid #10b981).
const PASTORAL_BTN = 'linear-gradient(135deg, #5e9e6e, #4d8159)';

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

    // [P3-ACHIEVE-DATA] Achievement seam: a completed non-sandbox solo round
    // (practice included; it still pens a full flock). Fire-and-forget so the
    // achievements module can never delay or break the completion UI.
    if (mode === 'single' && data.finalTime && game.gameMode !== 'sandbox' && game.singlePlayerMode !== 'sandbox') {
        import('../achievements/index.js').then(({ recordEvent }) => {
            recordEvent('solo-complete', {
                sceneId: game.gameState?.sceneId
                    || game.gameState?.sceneSpawnDef?.sceneId
                    || (typeof window !== 'undefined' && window.__currentSceneId)
                    || 'field',
                mode: game.singlePlayerMode,
                gameMode: game.gameMode,
                dog: game.getSelectedDog?.() || null,
                finalTime: data.finalTime,
                totalSheep: game.gameState?.totalSheep ?? 0,
            });
        }).catch((err) => console.warn('[ACHIEVEMENTS] solo-complete record failed:', err));
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
            background: ${PASTORAL_SCRIM};
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: ${Z.critical};
            font-family: system-ui, sans-serif;
            color: ${PASTORAL_CREAM};
            text-align: center;
        `;

        const timeStr = data.finalTime ? game.formatTime(data.finalTime) : 'Unknown';
        overlay.innerHTML = `
            <div style="padding: 40px; background: ${PASTORAL_WIN_BG}; border-radius: 20px; border: 1px solid ${PASTORAL_GLASS_BORDER};">
                <h1 style="font-size: 36px; margin: 0 0 20px 0;">Victory!</h1>
                <p style="font-size: 18px; margin: 0 0 30px 0;">Time: ${timeStr}</p>
                <button onclick="window.gameInstance?.restartSameMode()" style="padding: 14px 28px; font-size: 16px; background: ${PASTORAL_BTN}; color: ${PASTORAL_CREAM}; border: none; border-radius: 12px; cursor: pointer; font-weight: 600;">
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
        background: ${PASTORAL_SCRIM};
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: ${Z.critical};
        font-family: system-ui, sans-serif;
        color: ${PASTORAL_CREAM};
        text-align: center;
    `;

    // Cycle 61 P2: pastoral result tints (was emerald/amber/red/blue). Co-op win
    // reads warm meadow; tie + either-player win read warm gold. The two players
    // keep a distinguishable warm pair (gold / dusty rose) for their score
    // labels (were #ff4444 / #4444ff). Text strings + winner branches unchanged.
    let winnerText = '';
    let bgColor = PASTORAL_WIN_BG;

    if (result.winner === 'coop') {
        winnerText = 'Victory! You herded all sheep together!';
    } else if (result.winner === 'tie') {
        winnerText = "It's a Tie!";
        bgColor = PASTORAL_GOLD_BG;
    } else if (result.winner === 'player1') {
        winnerText = 'Player 1 Wins!';
        bgColor = PASTORAL_GOLD_BG;
    } else if (result.winner === 'player2') {
        winnerText = 'Player 2 Wins!';
        bgColor = PASTORAL_GOLD_BG;
    }

    overlay.innerHTML = `
        <div style="padding: 40px; background: ${bgColor}; border-radius: 20px; border: 1px solid ${PASTORAL_GLASS_BORDER}; min-width: 300px;">
            <h1 style="font-size: 32px; margin: 0 0 20px 0;">${winnerText}</h1>
            <div style="display: flex; justify-content: center; gap: 40px; margin-bottom: 30px;">
                <div>
                    <div style="font-size: 14px; color: ${PASTORAL_GOLD}; margin-bottom: 5px;">Player 1</div>
                    <div style="font-size: 36px; font-weight: bold;">${result.player1Score}</div>
                </div>
                <div>
                    <div style="font-size: 14px; color: ${PASTORAL_DUSK}; margin-bottom: 5px;">Player 2</div>
                    <div style="font-size: 36px; font-weight: bold;">${result.player2Score}</div>
                </div>
            </div>
            <p style="color: ${PASTORAL_CREAM_SOFT}; font-size: 12px; margin-bottom: 20px;">Local mode - scores not submitted to leaderboard</p>
            <button onclick="window.gameInstance?.restartToMenu()" style="padding: 14px 28px; font-size: 16px; background: ${PASTORAL_BTN}; color: ${PASTORAL_CREAM}; border: none; border-radius: 12px; cursor: pointer; font-weight: 600;">
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
