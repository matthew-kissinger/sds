// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Player Identity Management
 * Handles localStorage persistence and server registration of player identity
 */
import { getNetworkManager, emitGameEvent } from '../../GameBridge.js';

// Get stored player identity from localStorage
export function getPlayerIdentity() {
    try {
        const identity = localStorage.getItem('playerIdentity');
        return identity ? JSON.parse(identity) : null;
    } catch (error) {
        console.error('[PLAYER] Error loading player identity:', error);
        return null;
    }
}

// Save player identity to localStorage
export function savePlayerIdentity(identity) {
    try {
        localStorage.setItem('playerIdentity', JSON.stringify(identity));
    } catch (error) {
        console.error('[PLAYER] Error saving player identity:', error);
    }
}

// Generate a persistent player ID
export function generatePersistentId() {
    return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Submit game score to server
export async function submitGameScore(gameMode, score, additionalData = {}) {
    // Cycle 57 P6: surface the submit outcome (it was fully silent before, which
    // is how the leaderboard-hiding bug went unnoticed). The completion screen
    // subscribes to 'leaderboard-submit-result' and reads window.__sdsLastSubmit.
    const report = (ok, reason) => {
        try {
            if (typeof window !== 'undefined') window.__sdsLastSubmit = { ok, reason: reason || null };
        } catch {}
        try { emitGameEvent('leaderboard-submit-result'); } catch {}
    };

    const identity = getPlayerIdentity();
    if (!identity) {
        console.warn('[SCORE] No player identity found for score submission');
        report(false, 'no-identity');
        return;
    }

    const networkManager = getNetworkManager();
    if (!networkManager) {
        console.warn('[SCORE] NetworkManager not available for score submission');
        report(false, 'offline');
        return;
    }

    console.log(`[SCORE] Submission debug: NetworkManager available, connected: ${networkManager.isConnected()}`);
    console.log(`[SCORE] Current session ID: ${networkManager.channel?.id || 'no-session'}`);

    try {
        // Always ensure we have a connection for leaderboard operations
        if (!networkManager.isConnected()) {
            console.log('[SCORE] Not connected, establishing connection for score submission...');
            await networkManager.connectForLeaderboard();
            console.log('[SCORE] Connection established for score submission');
        } else {
            console.log('[SCORE] Using existing connection for score submission');
        }

        // Always ensure player is registered in the current session
        console.log('[SCORE] Ensuring player registration in current session...');
        try {
            // P-SEC-1: pass the stored authSecret so the worker recognizes this
            // returning device. A persistent_id without its secret is rejected.
            const registrationResult = await networkManager.registerPlayer(
                identity.persistentId,
                identity.displayName,
                identity.nameType || 'custom',
                identity.authSecret || null
            );
            console.log('[SCORE] Player registered/re-registered for score submission:', registrationResult);

            // Update identity to mark as registered. Capture a freshly-issued
            // secret (trust-on-first-use bind of a pre-auth legacy row) and any
            // canonical persistent_id the worker assigned.
            identity.isRegistered = true;
            if (registrationResult?.authSecret) identity.authSecret = registrationResult.authSecret;
            if (registrationResult?.persistentId) identity.persistentId = registrationResult.persistentId;
            // Cycle 57: keep the local name fields in sync with the worker's
            // canonical row so Settings can show name#discriminator offline.
            const profile = registrationResult?.playerProfile;
            if (profile?.displayName) identity.displayName = profile.displayName;
            if (profile?.fullName) identity.fullName = profile.fullName;
            if (profile?.discriminator) identity.discriminator = profile.discriminator;
            savePlayerIdentity(identity);
        } catch (regError) {
            console.warn('[SCORE] Player registration failed:', regError);
            throw new Error('Player registration failed: ' + regError.message);
        }

        // Now submit the score using the same session
        console.log('[SCORE] Submitting score in current session...');
        const result = await networkManager.submitScore(gameMode, score, additionalData);
        console.log('[SCORE] Score submitted successfully:', result);

        if (result.isNewRecord) {
            console.log('[SCORE] NEW RECORD!');
        }

        report(result.success !== false);

    } catch (error) {
        console.error('[SCORE] Score submission failed:', error);
        report(false, error?.message);
        console.log('[SCORE] Score will not be submitted - server may be unavailable');
        console.log('[SCORE] Score would have been submitted:', {
            gameMode,
            score,
            playerName: identity.displayName,
            additionalData
        });

        // Cycle 35 Phase 3: client-side telemetry on submission failure so
        // the next regression shows up as data instead of silence. Mirrors
        // the fire-and-forget pattern from gamestate/completion.js.
        try {
            import('../../telemetry.js').then(({ emitEvent }) => {
                emitEvent('score_submission_failed', {
                    reason: error?.message?.slice(0, 200) || 'unknown',
                    gameMode,
                    score: typeof score === 'number' ? Math.round(score * 100) / 100 : 0,
                    sceneId: additionalData?.sceneId || null,
                });
            });
        } catch {}
    }
}

// Expose score submission function globally for GameState integration
window.submitGameScore = submitGameScore;
