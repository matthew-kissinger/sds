// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * MultiplayerState
 *
 * Tracks per-session multiplayer state (players, scores, connection, ping).
 * React reads these fields via `getMultiplayerState()` in GameBridge.
 *
 * Previously named MultiplayerUI. All DOM-rendering methods were removed in
 * Cycle 3: their target elements (#multiplayer-hud, #connection-icon, etc.)
 * were hidden by CSS, and the React HUD owns the visible UI.
 */
export class MultiplayerState {
    constructor() {
        this.currentPlayers = [];
        this.connectionState = 'disconnected';
        this.currentPing = null;
        this.playerId = null;

        this.gameMode = 'cooperative';
        this.playerScores = {};
        this.currentLeader = null;
        this.winThreshold = null;
        this.winCondition = null;
        this.totalSheep = 200;

        this.pingHistory = [];
        this.maxPingHistory = 10;
    }

    // No-ops preserved so existing main.js call sites keep working during Track 2;
    // remove once React no longer needs a show/hide hook here.
    show() {}
    hide() {}

    setGameMode(gameMode, playerCount = 0) {
        this.gameMode = gameMode;
        if (gameMode === 'racing' && playerCount === 2) {
            this.winThreshold = Math.ceil(this.totalSheep / 2);
        } else {
            this.winThreshold = null;
        }
    }

    updatePlayers(players, currentPlayerId = null) {
        this.currentPlayers = players || [];
        this.playerId = currentPlayerId;
    }

    updateConnectionStatus(state) {
        this.connectionState = state;
    }

    updatePing(pingMs) {
        if (typeof pingMs !== 'number' || isNaN(pingMs)) return;
        this.currentPing = pingMs;
        this.pingHistory.push(pingMs);
        if (this.pingHistory.length > this.maxPingHistory) {
            this.pingHistory.shift();
        }
    }

    updatePlayerScores(playerScores) {
        if (this.gameMode !== 'racing' && this.gameMode !== 'timed') return;
        this.playerScores = { ...playerScores };

        this.currentLeader = null;
        let maxScore = -1;
        for (const [playerId, score] of Object.entries(playerScores)) {
            if (score > maxScore) {
                maxScore = score;
                this.currentLeader = playerId;
            }
        }
    }

    updateWinProgress(winCondition) {
        if ((this.gameMode !== 'racing' && this.gameMode !== 'timed') || !winCondition) return;
        if (winCondition.type === 'race' && winCondition.threshold) {
            this.winThreshold = winCondition.threshold;
        }
        this.winCondition = winCondition;
    }

    addPlayer(player) {
        const idx = this.currentPlayers.findIndex(p => p.id === player.id);
        if (idx >= 0) {
            this.currentPlayers[idx] = { ...this.currentPlayers[idx], ...player };
        } else {
            this.currentPlayers.push(player);
        }
    }

    removePlayer(playerId) {
        this.currentPlayers = this.currentPlayers.filter(p => p.id !== playerId);
    }
}
