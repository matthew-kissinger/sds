// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { GameState } from '../js/GameState.js';
import { OptimizedSheepSystem } from '../js/OptimizedSheep.js';

function matrixY(instancedMesh, index = 0) {
    return instancedMesh.instanceMatrix.array[index * 16 + 13];
}

function firstInstanceSpeed(sheepSystem) {
    return sheepSystem.mergedGeometry.attributes.instanceData.array[1];
}

function firstInstanceBounce(sheepSystem) {
    return sheepSystem.mergedGeometry.attributes.instanceAnimation.array[1];
}

describe('optimized sheep heightfield placement', () => {
    it('writes first-frame sheep matrices at terrain surface when constructed by GameState', () => {
        const scene = new THREE.Scene();
        const heightfield = {
            surfaceY: (x, z) => 12 + x - z,
            sample: () => -999,
        };
        const state = new GameState();
        state.heightfield = heightfield;
        state.totalSheep = 1;
        state.sceneSpawnDef = {
            centerX: 5,
            centerZ: -2,
            spreadRadius: 0,
            count: 1,
        };

        state.createSheepFlock(scene);

        try {
            expect(matrixY(state.optimizedSheepSystem.instancedMesh)).toBeCloseTo(19);
        } finally {
            state.optimizedSheepSystem.dispose();
        }
    });

    it('seeds first-frame sheep animation attributes before the first update tick', () => {
        const scene = new THREE.Scene();
        const sheep = new OptimizedSheepSystem(scene, 1, {
            centerX: 4,
            centerZ: 6,
            spreadRadius: 0,
            defaultCount: 1,
        });

        try {
            expect(firstInstanceSpeed(sheep)).toBeGreaterThan(0);
            expect(firstInstanceBounce(sheep)).toBeGreaterThan(0);
        } finally {
            sheep.dispose();
        }
    });

    it('keeps paused reset matrices aligned to terrain surface', () => {
        const scene = new THREE.Scene();
        const heightfield = {
            surfaceY: (x, z) => 3 + x * 0.5 + z * 2,
            sample: () => -999,
        };
        const sheep = new OptimizedSheepSystem(scene, 1, {
            centerX: 4,
            centerZ: 6,
            spreadRadius: 0,
            defaultCount: 1,
        }, false, { heightfield });

        try {
            sheep.setSpawnConfig({
                centerX: -8,
                centerZ: 10,
                spreadRadius: 0,
                defaultCount: 1,
            });
            sheep.resetAllSheep();

            expect(matrixY(sheep.instancedMesh)).toBeCloseTo(19);
            expect(firstInstanceSpeed(sheep)).toBeGreaterThan(0);
            expect(firstInstanceBounce(sheep)).toBeGreaterThan(0);
        } finally {
            sheep.dispose();
        }
    });

    it('resets same-count starts and skips visible reset only when recreation is required', () => {
        const state = new GameState();
        let setSpawnConfigCalls = 0;
        let resetCalls = 0;
        let setUseExtremeBoidsCalls = 0;
        state.optimizedSheepSystem = {
            instancedMesh: {},
            setSpawnConfig: () => { setSpawnConfigCalls += 1; },
            resetAllSheep: () => { resetCalls += 1; },
            setUseExtremeBoids: () => { setUseExtremeBoidsCalls += 1; },
        };
        state.sheep = [{ setBorderPoints: () => {} }];

        state.startGame('solo', null, 'classic');

        expect(state.needsFlockRecreation).toBe(false);
        expect(setSpawnConfigCalls).toBe(1);
        expect(resetCalls).toBe(1);
        expect(setUseExtremeBoidsCalls).toBe(1);

        state.needsFlockRecreation = false;
        state.startGame('solo', null, 'classic', { skipVisibleFlockReset: true });

        expect(state.needsFlockRecreation).toBe(false);
        expect(setSpawnConfigCalls).toBe(2);
        expect(resetCalls).toBe(2);
        expect(setUseExtremeBoidsCalls).toBe(2);

        state.totalSheep = 30;
        state.needsFlockRecreation = false;
        state.startGame('solo', null, 'classic', { skipVisibleFlockReset: true });

        expect(state.needsFlockRecreation).toBe(true);
        expect(setSpawnConfigCalls).toBe(2);
        expect(resetCalls).toBe(2);
        expect(setUseExtremeBoidsCalls).toBe(2);
    });
});
