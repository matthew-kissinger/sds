// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';

import { ExtremeBoidSystem } from '../js/ExtremeBoidSystem.js';

describe('ExtremeBoidSystem fused neighbor pass', () => {
    it('preserves flock forces while collecting and accumulating neighbors once', () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const source = [
            [0, 0, 0.1, 0],
            [1, 0, 0, 0.1],
            [0, 2, -0.1, 0],
            [20, 20, 0, 0],
        ];
        const sheep = source.map(([x, z, vx, vz]) => ({
            position: { x, z },
            velocity: { x: vx, z: vz },
            forceAccumulator: { x: 0, z: 0 },
            state: 0,
        }));
        const system = new ExtremeBoidSystem({ maxBoids: 8 });
        system.enable(sheep, { minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
        system.setParams({
            perception: 7,
            separationDistance: 3,
            speed: 0.35,
            cohesion: 0.5,
            separationWeight: 2.2,
            alignmentWeight: 0.6,
        });

        system.update(sheep, 1 / 60);

        expect(sheep.map(({ forceAccumulator }) => forceAccumulator)).toEqual([
            { x: -1.0889389514923096, z: -0.03933728486299515 },
            { x: 0.6067424416542053, z: -0.38975170254707336 },
            { x: 0.3538997173309326, z: 0.7303815484046936 },
            { x: 0, z: 0 },
        ]);
    });
});
