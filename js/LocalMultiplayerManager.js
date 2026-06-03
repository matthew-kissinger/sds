// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2D } from './Vector2D.js';

/**
 * LocalMultiplayerManager - Manages local 2-player game state
 * Handles co-op, versus (1v1), and timed modes without server
 *
 * IMPORTANT: This mode does NOT submit scores to any leaderboard
 */
export class LocalMultiplayerManager {
    constructor() {
        // Game mode: 'coop', 'versus', 'timed'
        this.localGameMode = null;

        // Player data
        this.player1 = {
            id: 'player1',
            name: 'Player 1',
            score: 0,
            dogType: 'jep',
            color: 0xFF4444, // Red
            sheepdog: null
        };

        this.player2 = {
            id: 'player2',
            name: 'Player 2',
            score: 0,
            dogType: 'pip',
            color: 0x4444FF, // Blue
            sheepdog: null
        };

        // Game state
        this.isActive = false;
        this.gameCompleted = false;
        this.winner = null;
        this.totalSheep = 200;

        // Versus mode settings
        this.versusTargetScore = 100; // First to 100 wins

        // Co-op mode settings
        this.coopTargetScore = 200; // All sheep together

        // Timed mode settings
        this.timedDuration = 3 * 60 * 1000; // 3 minutes in ms
        this.timedStartTime = null;

        // Gates for versus mode
        this.player1Gate = null;
        this.player2Gate = null;

        // Callbacks
        this.onScoreUpdate = null;
        this.onGameComplete = null;
    }

    /**
     * Initialize a local multiplayer game
     * @param {string} mode - 'coop', 'versus', or 'endless'
     * @param {Object} options - Game options
     */
    initialize(mode, options = {}) {
        this.localGameMode = mode;
        this.isActive = true;
        this.gameCompleted = false;
        this.winner = null;

        // Reset scores
        this.player1.score = 0;
        this.player2.score = 0;

        // Apply options
        if (options.player1Dog) this.player1.dogType = options.player1Dog;
        if (options.player2Dog) this.player2.dogType = options.player2Dog;
        if (options.totalSheep) this.totalSheep = options.totalSheep;
        if (options.versusTarget) this.versusTargetScore = options.versusTarget;

        // Start timer for timed mode
        if (mode === 'timed') {
            this.timedStartTime = Date.now();
        }

        console.log(`[LOCAL MP] Initialized ${mode} mode - P1: ${this.player1.dogType}, P2: ${this.player2.dogType}`);

        return {
            mode: this.localGameMode,
            player1: this.player1,
            player2: this.player2,
            totalSheep: this.totalSheep
        };
    }

    /**
     * Set player sheepdogs
     */
    setSheepdogs(sheepdog1, sheepdog2) {
        this.player1.sheepdog = sheepdog1;
        this.player2.sheepdog = sheepdog2;

        // Set player info for icons
        if (sheepdog1) {
            sheepdog1.setPlayerInfo(this.player1.id, this.player1.color);
        }
        if (sheepdog2) {
            sheepdog2.setPlayerInfo(this.player2.id, this.player2.color);
        }
    }

    /**
     * Configure gates for versus mode
     */
    setupVersusGates(bounds) {
        // Player 1 gate on the left (west)
        this.player1Gate = {
            id: 'p1gate',
            playerId: this.player1.id,
            position: { x: bounds.minX, z: 0 },
            direction: 'west',
            width: 8,
            color: this.player1.color,
            pasture: {
                minX: bounds.minX - 60,
                maxX: bounds.minX - 5,
                minZ: -30,
                maxZ: 30
            },
            passageZone: {
                minX: bounds.minX - 4,
                maxX: bounds.minX + 4,
                minZ: -4,
                maxZ: 4
            }
        };

        // Player 2 gate on the right (east)
        this.player2Gate = {
            id: 'p2gate',
            playerId: this.player2.id,
            position: { x: bounds.maxX, z: 0 },
            direction: 'east',
            width: 8,
            color: this.player2.color,
            pasture: {
                minX: bounds.maxX + 5,
                maxX: bounds.maxX + 60,
                minZ: -30,
                maxZ: 30
            },
            passageZone: {
                minX: bounds.maxX - 4,
                maxX: bounds.maxX + 4,
                minZ: -4,
                maxZ: 4
            }
        };

        return [this.player1Gate, this.player2Gate];
    }

    /**
     * Record a sheep entering a player's gate (versus mode)
     */
    recordSheepScored(playerId) {
        if (!this.isActive || this.gameCompleted) return;

        if (playerId === this.player1.id) {
            this.player1.score++;
        } else if (playerId === this.player2.id) {
            this.player2.score++;
        }

        // Notify score update
        if (this.onScoreUpdate) {
            this.onScoreUpdate(this.player1.score, this.player2.score);
        }

        // Check win condition for versus mode
        if (this.localGameMode === 'versus') {
            this.checkVersusWinCondition();
        }
    }

    /**
     * Record a sheep entering the shared gate (co-op mode)
     */
    recordCoopSheepScored() {
        if (!this.isActive || this.gameCompleted) return;

        // In co-op, both players share the score
        this.player1.score++;
        this.player2.score++;

        // Notify score update (score is shared, so both are same)
        if (this.onScoreUpdate) {
            this.onScoreUpdate(this.player1.score, this.player2.score);
        }

        // Check win condition
        if (this.localGameMode === 'coop') {
            this.checkCoopWinCondition();
        }
    }

    /**
     * Check versus mode win condition
     */
    checkVersusWinCondition() {
        if (this.player1.score >= this.versusTargetScore) {
            this.completeGame(this.player1.id);
        } else if (this.player2.score >= this.versusTargetScore) {
            this.completeGame(this.player2.id);
        }
    }

    /**
     * Check co-op win condition
     */
    checkCoopWinCondition() {
        // Co-op uses shared score (player1.score === player2.score)
        if (this.player1.score >= this.coopTargetScore) {
            this.completeGame('coop'); // Both win
        }
    }

    /**
     * Get time remaining in timed mode (in seconds)
     */
    getTimeRemaining() {
        if (this.localGameMode !== 'timed' || !this.timedStartTime) {
            return 0;
        }
        const elapsed = Date.now() - this.timedStartTime;
        const remaining = Math.max(0, this.timedDuration - elapsed);
        return Math.ceil(remaining / 1000);
    }

    /**
     * Check if timed mode has ended
     */
    checkTimedModeEnd() {
        if (this.localGameMode !== 'timed' || !this.timedStartTime) {
            return false;
        }
        if (this.getTimeRemaining() <= 0) {
            // Determine winner based on scores
            let winner;
            if (this.player1.score > this.player2.score) {
                winner = this.player1.id;
            } else if (this.player2.score > this.player1.score) {
                winner = this.player2.id;
            } else {
                winner = 'tie';
            }
            this.completeGame(winner);
            return true;
        }
        return false;
    }

    /**
     * Record score for timed mode (both players compete for same sheep)
     */
    recordTimedScore(playerId) {
        if (!this.isActive || this.gameCompleted) return;

        if (playerId === this.player1.id) {
            this.player1.score++;
        } else if (playerId === this.player2.id) {
            this.player2.score++;
        }

        // Notify score update
        if (this.onScoreUpdate) {
            this.onScoreUpdate(this.player1.score, this.player2.score);
        }
    }

    /**
     * Complete the game
     */
    completeGame(winnerId) {
        if (this.gameCompleted) return;

        this.gameCompleted = true;
        this.winner = winnerId;
        this.isActive = false;

        console.log(`[LOCAL MP] Game completed! Winner: ${winnerId}`);
        console.log(`[LOCAL MP] Final scores - P1: ${this.player1.score}, P2: ${this.player2.score}`);
        console.log(`[LOCAL MP] NOTE: Scores NOT submitted to leaderboard (local multiplayer mode)`);

        // Notify completion
        if (this.onGameComplete) {
            this.onGameComplete({
                winner: winnerId,
                player1Score: this.player1.score,
                player2Score: this.player2.score,
                mode: this.localGameMode
            });
        }
    }

    /**
     * Get current game state
     */
    getGameState() {
        return {
            mode: this.localGameMode,
            isActive: this.isActive,
            gameCompleted: this.gameCompleted,
            winner: this.winner,
            player1: {
                ...this.player1,
                sheepdog: null // Don't include full object
            },
            player2: {
                ...this.player2,
                sheepdog: null
            },
            totalSheep: this.totalSheep
        };
    }

    /**
     * Get gates for versus mode
     */
    getVersusGates() {
        if (this.localGameMode !== 'versus') return null;
        return [this.player1Gate, this.player2Gate];
    }

    /**
     * Check which player's gate a position is near (for versus mode)
     * Returns player ID or null
     */
    checkGateProximity(x, z) {
        if (this.localGameMode !== 'versus') return null;

        // Check player 1 gate
        if (this.player1Gate) {
            const pz = this.player1Gate.passageZone;
            if (x >= pz.minX && x <= pz.maxX && z >= pz.minZ && z <= pz.maxZ) {
                return this.player1.id;
            }
        }

        // Check player 2 gate
        if (this.player2Gate) {
            const pz = this.player2Gate.passageZone;
            if (x >= pz.minX && x <= pz.maxX && z >= pz.minZ && z <= pz.maxZ) {
                return this.player2.id;
            }
        }

        return null;
    }

    /**
     * Get the pasture for a specific player (versus mode)
     */
    getPlayerPasture(playerId) {
        if (playerId === this.player1.id && this.player1Gate) {
            return this.player1Gate.pasture;
        }
        if (playerId === this.player2.id && this.player2Gate) {
            return this.player2Gate.pasture;
        }
        return null;
    }

    /**
     * Reset the manager
     */
    reset() {
        this.localGameMode = null;
        this.isActive = false;
        this.gameCompleted = false;
        this.winner = null;
        this.player1.score = 0;
        this.player2.score = 0;
        this.player1.sheepdog = null;
        this.player2.sheepdog = null;
        this.player1Gate = null;
        this.player2Gate = null;
        this.timedStartTime = null;
    }

    /**
     * Check if this is an active local multiplayer session
     */
    isLocalMultiplayerActive() {
        return this.isActive && this.localGameMode !== null;
    }

    /**
     * Get mode display name
     */
    getModeDisplayName() {
        switch (this.localGameMode) {
            case 'coop': return 'Local Co-op';
            case 'versus': return 'Local 1v1';
            case 'timed': return 'Local Timed';
            default: return 'Local Multiplayer';
        }
    }
}
