// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Multiplayer coordination extracted from `main.js` ([P3-MP-COORD]).
 *
 * Owns the remote-dog lifecycle (`updateOtherPlayer` / `removeOtherPlayer`)
 * and the local-dog server reconciliation (`reconcileWithServerState` +
 * `getServerSprintState`). Bodies are a verbatim move from main.js; only
 * the `this.<member>` references were rebound to the injected game facade.
 *
 * The facade is the live game instance (or, in tests, any plain object with
 * the same members), read per call so members the game reassigns over its
 * lifetime (sheepdog per game start, serverDogPosition per server broadcast,
 * terrainBuilder/networkManager later in the game constructor) stay current.
 * The coordinator reads exactly:
 *
 * - `otherPlayers`        Map<playerId, Sheepdog>, shared with main.js's
 *                         per-frame interpolation loop, the grass interaction
 *                         gather, competitive icon assignment, and
 *                         boot/loadScene teardown.
 * - `sceneManager`        `.add(mesh)` / `.remove(mesh)` for remote dogs.
 * - `terrainBuilder`      `.models.animals[dogType]`, `.loadAnimal(dogType)`.
 * - `gameState`           `.gameMode`, `.competitiveGates` (racing icons).
 * - `networkManager`      `.lastServerState`, `.getPlayerId()`.
 * - `sheepdog`            local predicted dog (position/velocity/stamina/mesh).
 * - `serverDogPosition`   latest authoritative {x, z} from initNetwork.
 * - `interpolationSpeed`  reconciliation lerp base rate.
 *
 * Sheepdog construction is injected as `createRemoteDog` (closes over the
 * game's heightfield in main.js), so this module imports no Three.js and the
 * unit suite runs without booting the game.
 */
import { Vector2D } from '../Vector2D.js';

export class MultiplayerCoordinator {
    /**
     * @param {object} game - game facade (see module doc for the surface read)
     * @param {(x: number, z: number, dogType: string) => object} createRemoteDog
     */
    constructor(game, createRemoteDog) {
        this.game = game;
        this.createRemoteDog = createRemoteDog;
        // Per-player guard against duplicate on-demand rig loads (created
        // lazily in updateOtherPlayer, same as the pre-extraction code).
        this._remoteDogLoading = null;
    }

    updateOtherPlayer(dogData) {
        const game = this.game;
        const playerId = dogData.playerId;
        let remoteDog = game.otherPlayers.get(playerId);

        // 1. Create the Sheepdog instance if it's a new player
        if (!remoteDog) {
            // Use dog type from server data, or fall back to 'jep'.
            const dogType = dogData.dogType || 'jep';

            // Dogs other than jep load on demand (Cycle 45 Phase 3). startGame
            // warms every rig in the background for multiplayer, but if this
            // one isn't ready yet, kick a load and skip this update — the dog
            // constructs on the next server tick once the model arrives. A
            // per-player guard stops duplicate loads/dogs across the gap. This
            // is visual-only: the authoritative DO sim and the local predictor
            // never depend on a remote dog's mesh existing, so a rig arriving a
            // frame or two late cannot desync anything.
            if (!game.terrainBuilder.models.animals[dogType]) {
                if (!this._remoteDogLoading) this._remoteDogLoading = new Set();
                if (!this._remoteDogLoading.has(playerId)) {
                    this._remoteDogLoading.add(playerId);
                    game.terrainBuilder.loadAnimal(dogType).finally(() => {
                        this._remoteDogLoading.delete(playerId);
                    });
                }
                return;
            }

            console.log(`[DOG] Creating visualization for new player ${playerId}`);
            console.log(`Creating remote dog with type: ${dogType} for player ${playerId}`);
            remoteDog = this.createRemoteDog(dogData.x, dogData.z, dogType);

            // Enable 2x speeds for multiplayer
            remoteDog.setMultiplayerSpeeds(true);

            // Create its 3D mesh and add it to the scene
            const dogMesh = remoteDog.createMesh();
            game.sceneManager.add(dogMesh);

            // Add player icon for racing mode
            if (game.gameState.gameMode === 'racing' && game.gameState.competitiveGates) {
                const playerGate = game.gameState.competitiveGates.find(gate => gate.playerId === playerId);
                if (playerGate) {
                    remoteDog.setPlayerInfo(playerId, playerGate.color);
                    console.log(`[GAME] Added player icon for ${playerId} with gate color: 0x${playerGate.color.toString(16).toUpperCase()}`);
                }
            }

            // Add properties for interpolation
            remoteDog.targetPosition = new Vector2D(dogData.x, dogData.z);
            remoteDog.targetRotation = dogData.rotation;

            // Store the full Sheepdog object in our map
            game.otherPlayers.set(playerId, remoteDog);
        }

        // 2. Update the target state for interpolation from server data
        remoteDog.targetPosition.set(dogData.x, dogData.z);
        remoteDog.targetRotation = dogData.rotation;

        // When the server flags that it is catching up to the remote player's
        // stopped position, run a fixed 8-frame blend from where this client
        // currently shows the dog toward the authoritative stop point. If a
        // blend is already active, keep blending toward the latest target.
        if (dogData.interpolatingToClient) {
            const BLEND_FRAMES = 8;
            if (!remoteDog._blendFramesRemaining || remoteDog._blendFramesRemaining <= 0) {
                remoteDog._blendStartPos = {
                    x: remoteDog.position.x,
                    z: remoteDog.position.z
                };
                remoteDog._blendTotalFrames = BLEND_FRAMES;
                remoteDog._blendFramesRemaining = BLEND_FRAMES;
            }
            // Always keep targetPosition current (already updated above); the
            // per-frame blend pass will lerp toward it.
        } else if (remoteDog._blendFramesRemaining) {
            // Server resumed normal updates; drop any lingering blend state.
            remoteDog._blendFramesRemaining = 0;
        }

        // 3. Update animation-driving properties directly
        // This data will be used by remoteDog.animate() in the main loop
        remoteDog.velocity.set(dogData.vx, dogData.vz);
        remoteDog.isSprinting = dogData.sprinting;
        remoteDog.isMoving = remoteDog.velocity.magnitude() > 0.5;
    }

    getServerSprintState() {
        // Get the server's authoritative sprint state for prediction
        const { networkManager } = this.game;
        if (networkManager?.lastServerState?.sheepdogs) {
            const mySheepdogData = networkManager.lastServerState.sheepdogs.find(
                dog => dog.playerId === networkManager.getPlayerId()
            );
            return mySheepdogData?.sprinting ?? null;
        }
        return null;
    }

    reconcileWithServerState(deltaTime) {
        const game = this.game;
        const sheepdog = game.sheepdog;
        if (!sheepdog || !game.serverDogPosition) return;

        // Get the authoritative position from the server state
        const serverPos = game.serverDogPosition;
        const clientPos = sheepdog.position;

        if (serverPos.x === undefined) return;

        // Calculate distance between client prediction and server authority
        const distance = Math.sqrt(
            (clientPos.x - serverPos.x) ** 2 +
            (clientPos.z - serverPos.z) ** 2
        );

        // Sprint-aware reconciliation to handle speed mismatches
        const serverSprintState = this.getServerSprintState();
        const clientSprintState = sheepdog.isSprinting;
        const sprintMismatch = serverSprintState !== null && serverSprintState !== clientSprintState;

        // Adjust threshold based on sprint state mismatch
        const reconciliationThreshold = sprintMismatch ? 0.2 : 0.05; // Higher threshold when sprint states differ

        if (distance > reconciliationThreshold) {
            // If the distance is very large (e.g., after major lag), snap to the server position
            if (distance > 8.0) { // Higher snap threshold to account for sprint speed differences
                clientPos.x = serverPos.x;
                clientPos.z = serverPos.z;
                console.log('[SYNC] Large correction applied - snapping to server position', { distance, sprintMismatch });
            } else {
                // Use adaptive interpolation speed based on distance and movement state
                const isMoving = sheepdog.velocity.magnitude() > 0.1;

                // Faster correction when stopped or when sprint states mismatch
                let baseInterpolationSpeed = isMoving ? game.interpolationSpeed : game.interpolationSpeed * 3;
                if (sprintMismatch) {
                    baseInterpolationSpeed *= 2; // Faster correction for sprint mismatches
                }

                // Scale interpolation speed by distance (closer = faster correction)
                const distanceScale = Math.min(distance / 2.0, 1.0);
                const adaptiveSpeed = baseInterpolationSpeed * (1 + distanceScale);

                const interpolationFactor = Math.min(adaptiveSpeed * deltaTime, 0.5); // Increased max factor
                clientPos.x += (serverPos.x - clientPos.x) * interpolationFactor;
                clientPos.z += (serverPos.z - clientPos.z) * interpolationFactor;
            }

            // Update mesh position to match corrected logical position
            sheepdog.mesh.position.x = clientPos.x;
            sheepdog.mesh.position.z = clientPos.z;
        }

        // Server is also authoritative on stamina
        const { networkManager } = game;
        if (networkManager.lastServerState?.sheepdogs) {
            const mySheepdogData = networkManager.lastServerState.sheepdogs.find(
                dog => dog.playerId === networkManager.getPlayerId()
            );
            if (mySheepdogData?.stamina !== undefined) {
                // Directly set stamina, as prediction for this is less critical than position
                sheepdog.stamina = mySheepdogData.stamina;
            }
            if (mySheepdogData?.sprinting !== undefined) {
                sheepdog.isSprinting = mySheepdogData.sprinting;
            }
        }
    }

    removeOtherPlayer(playerId) {
        const game = this.game;
        const remoteDog = game.otherPlayers.get(playerId);
        if (remoteDog) {
            // Remove player icon if present
            remoteDog.removePlayerIcon();

            // Remove the dog's mesh from the scene
            if (remoteDog.mesh) {
                game.sceneManager.remove(remoteDog.mesh);
            }
            // Delete the player from our map
            game.otherPlayers.delete(playerId);
            console.log(`[DOG] Removed visualization for player ${playerId}`);
        }
    }
}
