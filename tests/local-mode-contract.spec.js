// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { FenceConfigBuilder } from '../js/FencePresets.js';
import { getModeCapabilities } from '../js/gamestate/modes.js';

describe('local two-player contracts', () => {
    it('never auto-completes or submits local rounds to solo leaderboards', () => {
        expect(getModeCapabilities('local')).toMatchObject({
            submitsToLeaderboard: false,
            autoCompletes: false,
        });
    });

    it('builds west/east gate openings for the local versus layout', () => {
        const presets = {
            createBorderWithGate: vi.fn(() => new THREE.Group()),
            createBorderSegment: vi.fn(() => new THREE.Group()),
            createPenStructure: vi.fn(() => new THREE.Group()),
        };
        const bounds = { minX: -100, maxX: 100, minZ: -80, maxZ: 80 };
        const pasture = (minX, maxX) => ({ minX, maxX, minZ: -30, maxZ: 30 });
        const gates = [
            { direction: 'west', width: 8, position: { x: -100, z: 0 }, pasture: pasture(-160, -105) },
            { direction: 'east', width: 8, position: { x: 100, z: 0 }, pasture: pasture(105, 160) },
        ];

        const group = new FenceConfigBuilder(presets).build2PlayerFences(bounds, gates);

        expect(presets.createBorderWithGate).toHaveBeenCalledTimes(2);
        expect(presets.createBorderWithGate.mock.calls.map((call) => call.slice(0, 4))).toEqual([
            [160, 8, 0, 'vertical'],
            [160, 8, 0, 'vertical'],
        ]);
        expect(group.children.slice(0, 2).map((child) => child.position.x)).toEqual([-100, 100]);
        expect(presets.createBorderSegment.mock.calls.map((call) => call.slice(0, 2))).toEqual([
            [200, 'horizontal'],
            [200, 'horizontal'],
        ]);
    });
});
