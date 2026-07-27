// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';

import { ownsSurvivalDayLoop } from '../js/boot/initWorld.js';
import { listScenes, loadScene } from '../shared/scenes/index.js';

describe('survival day-loop UI ownership', () => {
    it('keeps the survival HUD and skip-to-dusk off every non-survival scene', () => {
        const owners = listScenes().filter(ownsSurvivalDayLoop).map((scene) => scene.id);

        expect(owners).toEqual(['newsheepdogland']);
    });

    it('lets Home Field animate its sun without inheriting Survival systems', () => {
        const field = loadScene('field');

        expect(field.dayNight?.enabled).toBe(true);
        expect(field.dayNight?.dayLoop).toBe(true);
        expect(field.survival).toBeUndefined();
        expect(ownsSurvivalDayLoop(field)).toBe(false);
    });
});
