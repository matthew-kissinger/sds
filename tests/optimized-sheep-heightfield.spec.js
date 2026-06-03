// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { GameState } from '../js/GameState.js';
import { OptimizedSheepSystem } from '../js/OptimizedSheep.js';

function matrixY(instancedMesh, index = 0) {
    return instancedMesh.instanceMatrix.array[index * 16 + 13];
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
        } finally {
            sheep.dispose();
        }
    });
});
