// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Completion + leaderboard delegate — Cycle 29 Stream B5.
 *
 * Pre-Cycle-29 GameState held a stack of React-delegating UI stubs and
 * the meaty submitScoreToLeaderboard body. This module is now the home
 * for completion-flow logic; GameState's methods are 1-line delegates
 * for the external callers (main.js, completionOverlay.js).
 *
 * Pure-ish: side effects are scoped to window.submitGameScore /
 * localStorage / console / dynamic telemetry import. Each is wrapped
 * in defensive checks so a node-env or pre-boot caller doesn't crash.
 */

import { getModeCapabilities, SOLO_MODE_TO_LEADERBOARD } from './modes.js';

/**
 * Format mm:ss for display. External callers (completionOverlay.js)
 * still go through GameState's method shim which delegates here.
 *
 * @param {number} timeInSeconds
 * @returns {string}
 */
export function formatTime(timeInSeconds) {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Resolve the leaderboard slug for the score-submission payload.
 * Solo runs partition by singlePlayerMode (Cycle 8 Phase 2b);
 * multiplayer collapses to 'cooperative'; competitive/timed pass through.
 *
 * @param {{gameMode: string, singlePlayerMode?: string}} state
 * @param {string | null} explicit  caller-provided override
 * @returns {string}
 */
function resolveLeaderboardMode(state, explicit) {
    if (explicit) return explicit;
    if (state.gameMode === 'solo') {
        return SOLO_MODE_TO_LEADERBOARD[state.singlePlayerMode] || 'soloClassic';
    }
    if (state.gameMode === 'multiplayer') return 'cooperative';
    return state.gameMode;
}

/**
 * Submit a score to the leaderboard. Pure-function over a GameState-like
 * `state` so it's harness-friendly. Side effects:
 *
 *   - window.submitGameScore(leaderboardMode, score, payload) — global
 *     score-submission entry point installed by initNetwork.
 *   - dynamic import('../telemetry.js') for fire-and-forget event emit.
 *
 * Gating:
 *   - MODE_CAPABILITIES.submitsToLeaderboard === false → block (sandbox).
 *   - state.singlePlayerMode === 'practice' → block (Cycle 26).
 *   - Resolved leaderboardMode contains 'sandbox' → defensive block.
 *
 * @param {object} state
 * @param {number} score
 * @param {string | null} [gameMode]  caller-provided override
 * @returns {void}
 */
export function submitScoreToLeaderboard(state, score, gameMode = null) {
    if (!getModeCapabilities(state.gameMode).submitsToLeaderboard) {
        console.log(`[GAME] ${state.gameMode} mode does not submit to leaderboard - blocked`);
        return;
    }
    // Cycle 26 v2.1.0: Practice Paddock is a no-pressure mode — never
    // submit to leaderboard regardless of the score path that calls in.
    if (state.singlePlayerMode === 'practice') {
        console.log('[GAME] Practice mode - score submission blocked');
        return;
    }

    const leaderboardMode = resolveLeaderboardMode(state, gameMode);

    // Defensive: catch any sandbox-related modes that slip through.
    if (leaderboardMode === 'sandbox' || leaderboardMode?.includes?.('sandbox')) {
        console.log('[GAME] Sandbox mode detected in leaderboardMode - score submission blocked');
        return;
    }

    // Cycle 8 Phase 3: include sceneId + sheepCount so the worker can
    // lift them into score_submissions columns for partitioned leaderboards.
    const sceneId = state.sceneId
        || state.sceneSpawnDef?.sceneId
        || (typeof window !== 'undefined' && window.__currentSceneId)
        || 'field';

    console.log(`[GAME] Submitting score to leaderboard: ${score} for mode: ${leaderboardMode}, scene: ${sceneId}, sheep: ${state.totalSheep}`);

    if (typeof window !== 'undefined' && window.submitGameScore) {
        window.submitGameScore(leaderboardMode, score, {
            gameMode: state.gameMode,
            singlePlayerMode: state.singlePlayerMode,
            sceneId,
            sheepCount: state.totalSheep,
            totalSheep: state.totalSheep,
            timestamp: Date.now(),
            // Cycle 10 Phase 6: client wall-clock window. Worker compares
            // (clientFinishedAt - clientStartedAt) against the claimed
            // score (= duration in seconds for time modes); >10s skew
            // flags a score_anomalies row.
            clientStartedAt: state._clientStartedAt || null,
            clientFinishedAt: Date.now(),
        });
    } else {
        console.warn('Score submission function not available');
    }

    // Cycle 11 Phase 5: telemetry — fire-and-forget, never blocks UX.
    try {
        import('../telemetry.js').then(({ emitEvent }) => {
            emitEvent('game_completed', {
                mode: leaderboardMode,
                sceneId,
                sheepCount: state.totalSheep,
                score: typeof score === 'number' ? Math.round(score * 100) / 100 : 0,
            });
        });
    } catch {}
}

/**
 * Process a completed competitive/timed match. Submits the score to the
 * appropriate leaderboard and tracks the timed-mode best-score in
 * localStorage. Called by showCompletionMessage when the server-supplied
 * competitiveData indicates completion.
 *
 * @param {object} state
 * @param {{isComplete: boolean, winner: string | null, winType: string | null, finalScores: Record<string, number>}} competitiveData
 * @returns {void}
 */
export function processCompetitiveCompletion(state, competitiveData) {
    if (!competitiveData?.isComplete) {
        console.warn('processCompetitiveCompletion called but game not complete');
        return;
    }

    const { winner, winType, finalScores } = competitiveData;
    const myPlayerId = state.currentPlayerId || null;
    const myScore = finalScores?.[myPlayerId] || 0;
    const isTimedMode = winType === 'timeout' || winType === 'timed';

    if (isTimedMode) {
        submitScoreToLeaderboard(state, myScore, 'timed');
    } else if (winner === myPlayerId) {
        submitScoreToLeaderboard(state, 1, 'competitive');
    }

    if (isTimedMode) {
        try {
            const previousBest = localStorage.getItem('timedModeBestScore');
            const prevBestNum = previousBest ? parseInt(previousBest) : 0;
            if (myScore > prevBestNum) {
                localStorage.setItem('timedModeBestScore', myScore.toString());
                console.log('[GAME] New best score saved:', myScore);
            }
        } catch (e) {
            console.warn('Could not check best score:', e);
        }
    }
}

/**
 * Top-level showCompletionMessage orchestrator. Routes to either the
 * competitive flow (server data indicates a winner) or the cooperative
 * flow (just submits the finalTime to the leaderboard).
 *
 * Visible UI is owned by React (CompletionScreen.js + completionOverlay.js).
 * This function is the data-side handler that fires the score submission.
 *
 * @param {object} state
 * @param {number | null | undefined} finalTime
 * @param {boolean | null | undefined} _isNewRecord  unused; preserved for API stability
 * @param {object | null} [competitiveData]
 * @returns {void}
 */
export function showCompletionMessage(state, finalTime, _isNewRecord, competitiveData = null) {
    console.log('showCompletionMessage called with:', {
        gameMode: state.gameMode,
        hasCompetitiveData: !!competitiveData,
        competitiveData,
    });
    if (competitiveData && (competitiveData.isComplete || competitiveData.winner)) {
        processCompetitiveCompletion(state, competitiveData);
    } else {
        submitScoreToLeaderboard(state, finalTime);
    }
}
