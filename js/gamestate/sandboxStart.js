// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Sandbox-game application — Cycle 29 Stream B6.
 *
 * Pulls the body of GameState.startSandboxGame into a single
 * `applySandboxConfig(state, sandboxConfig)` function. Mutates `state`
 * in place (matches the original `this`-based behavior; constructing a
 * new state object would break the wider GameState contract).
 *
 * The sandbox-start flow has two distinct branches:
 *
 *   1. **Island-scene sandbox** (sceneId !== 'field'). The scene's
 *      heightfield + island boundary are authoritative. We only override
 *      sheep count + behavior params + rules; we don't rebuild bounds,
 *      gate, fences, or borderPoints. Custom fences are intentionally
 *      not supported on island heightfields (Q3 carry-over from C8).
 *
 *   2. **Field sandbox** (sceneId === 'field' or undefined). Full
 *      configuration override: bounds, gate, pasture, borderPoints,
 *      params, rules, custom fences — plus a fresh fence-collision
 *      system rebuild and a sheep flock reset with the polygon-aware
 *      spawn config.
 */

import { FieldConfig } from '../FieldConfig.js';
import { resetFenceCollisionSystem } from '../FenceCollisionSystem.js';
import { calculatePolygonSpawnConfig } from './polygonSpawn.js';

/**
 * Apply a SandboxConfig to a GameState-like target. Mutates `state`.
 *
 * @param {object} state  GameState instance (mutated in place)
 * @param {object} sandboxConfig  SandboxConfig with .sceneId, .sheep,
 *                                 .rules, .useExtremeBoids, and a
 *                                 toGameStateFormat() helper for the
 *                                 field branch.
 * @returns {void}
 */
export function applySandboxConfig(state, sandboxConfig) {
    state.gameMode = 'sandbox';
    state.singlePlayerMode = 'sandbox';
    state.gameActive = true;
    state.gameCompleted = false;
    state.sheepRetired = 0;
    state.isPaused = false;
    state.sandboxConfig = sandboxConfig;

    // Cycle 8 Phase 4: island-scene sandbox path. Scene's heightfield +
    // island boundary are authoritative — only sheep count + params + rules
    // are overrideable. Custom fences not supported on island terrain.
    const islandScene = sandboxConfig.sceneId && sandboxConfig.sceneId !== 'field';
    if (islandScene) {
        const previousSheepCount = state.totalSheep;
        state.totalSheep = sandboxConfig.sheep?.count ?? state.totalSheep;
        state.params = sandboxConfig.sheep?.behavior || state.params;
        state.useExtremeBoids = sandboxConfig.useExtremeBoids === true;
        state.sandboxRules = {
            timerEnabled: sandboxConfig.rules?.timerEnabled ?? false,
            timerMode: sandboxConfig.rules?.timerMode || 'countup',
            timeLimit: sandboxConfig.rules?.timeLimit || 180,
            winCondition: sandboxConfig.rules?.winCondition || 'all',
            winPercentage: sandboxConfig.rules?.winPercentage || 100,
            trackBestTime: sandboxConfig.rules?.trackBestTime ?? true,
        };
        state.customFences = [];
        // Force recreation if count changed; the scene-driven sceneSpawnDef
        // (already wired via setSheepSpawn at scene init) is the spawn
        // source. recreateSheepFlock pulls it through createSheepFlock.
        if (previousSheepCount !== state.totalSheep && state.optimizedSheepSystem) {
            state.needsFlockRecreation = true;
        }
        console.log(`[SANDBOX] Island scene ${sandboxConfig.sceneId}: ${state.totalSheep} sheep, extremeBoids=${state.useExtremeBoids}, rules=`, state.sandboxRules);
        return;
    }

    // Field sandbox: full reconfiguration.
    const gameStateConfig = sandboxConfig.toGameStateFormat();

    state.bounds = gameStateConfig.bounds;
    state.fieldShape = gameStateConfig.fieldShape || 'square';
    state.borderPoints = gameStateConfig.borderPoints || null;
    state.gate = gameStateConfig.gate;
    state.pasture = gameStateConfig.pasture;

    // Sync FieldConfig so other components get notified
    FieldConfig.setBounds(state.bounds, state.gate, state.pasture);

    const previousSheepCount = state.totalSheep;
    state.totalSheep = gameStateConfig.totalSheep;
    state.params = gameStateConfig.params;
    state.customFences = gameStateConfig.customFences || [];
    state.sandboxRules = gameStateConfig.rules;
    state.useExtremeBoids = sandboxConfig.useExtremeBoids === true;

    if (previousSheepCount !== state.totalSheep && state.optimizedSheepSystem) {
        console.log(`[SANDBOX] Sheep count changed from ${previousSheepCount} to ${state.totalSheep} - needs recreation`);
        state.needsFlockRecreation = true;
    }

    // Calculate spawn config BEFORE resetting sheep positions.
    const spawnConfig = computeSandboxSpawnConfig(state);

    if (state.optimizedSheepSystem) {
        state.optimizedSheepSystem.setSpawnConfig(spawnConfig);
        state.optimizedSheepSystem.resetAllSheep();
        state.sheep.forEach((sheep) => {
            sheep.setBounds(state.bounds);
            if (state.boundary) sheep.setBoundary(state.boundary);
            if (state.borderPoints && state.borderPoints.length >= 3) {
                sheep.setBorderPoints(state.borderPoints);
            }
        });
        state.optimizedSheepSystem.setUseExtremeBoids(state.useExtremeBoids, state.bounds);
    }

    // Rebuild fence collision system. Polygon border if borderPoints
    // available; otherwise rectangular.
    const fenceSystem = resetFenceCollisionSystem();
    if (state.borderPoints && state.borderPoints.length >= 3) {
        fenceSystem.addPolygonBorder(state.borderPoints, state.gate);
    } else {
        fenceSystem.addBorderFences(state.bounds, state.gate);
    }
    if (state.customFences && state.customFences.length > 0) {
        fenceSystem.addCustomFences(state.customFences);
    }
    console.log(`[SANDBOX] Fence collision system (shape: ${state.fieldShape}):`, fenceSystem.getStats());

    console.log(`[SANDBOX] Game started with ${state.totalSheep} sheep`);
    console.log(`[SANDBOX] Bounds:`, state.bounds);
    console.log(`[SANDBOX] Gate:`, { position: state.gate.position, width: state.gate.width, passageZone: state.gate.passageZone });
    console.log(`[SANDBOX] Pasture:`, state.pasture);
    console.log(`[SANDBOX] Custom fences: ${state.customFences.length}, Rules:`, state.sandboxRules);
    console.log(`[SANDBOX] Extreme boid optimization: ${state.useExtremeBoids ? 'ENABLED' : 'disabled'}`);
}

/**
 * Build the spawn config for a field-sandbox state. Polygon-aware via
 * calculatePolygonSpawnConfig when borderPoints is set; otherwise
 * derives from rectangular bounds with the standard 0.2 spread + 0.15
 * south-of-center bias.
 *
 * @param {object} state
 * @returns {{centerX: number, centerZ: number, spreadRadius: number, borderPoints?: Array<{x: number, z: number}>}}
 */
function computeSandboxSpawnConfig(state) {
    if (state.borderPoints && state.borderPoints.length >= 3) {
        const cfg = calculatePolygonSpawnConfig({
            borderPoints: state.borderPoints,
            bounds: state.bounds,
            gate: state.gate,
        });
        cfg.borderPoints = state.borderPoints;
        console.log(`[SANDBOX] Polygon spawn config: center(${cfg.centerX.toFixed(1)}, ${cfg.centerZ.toFixed(1)}), radius=${cfg.spreadRadius.toFixed(1)}, points=${state.borderPoints.length}`);
        return cfg;
    }
    const fieldCenterX = (state.bounds.minX + state.bounds.maxX) / 2;
    const fieldCenterZ = (state.bounds.minZ + state.bounds.maxZ) / 2;
    const spawnCenterZ = fieldCenterZ - (state.bounds.maxZ - state.bounds.minZ) * 0.15;
    const fieldWidth = state.bounds.maxX - state.bounds.minX;
    const fieldHeight = state.bounds.maxZ - state.bounds.minZ;
    const spreadRadius = Math.min(fieldWidth, fieldHeight) * 0.2;
    const cfg = {
        centerX: fieldCenterX,
        centerZ: spawnCenterZ,
        spreadRadius,
    };
    console.log(`[SANDBOX] Rect spawn config: center(${cfg.centerX.toFixed(1)}, ${cfg.centerZ.toFixed(1)}), radius=${cfg.spreadRadius.toFixed(1)}`);
    return cfg;
}
