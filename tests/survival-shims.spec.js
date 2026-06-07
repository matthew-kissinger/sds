// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 67 P1: the survival cores moved to `shared/survival/*` and the old
 * `js/gamestate/*` files became re-export shims. This spec proves the shims
 * forward the exact same symbols, so every existing solo client import keeps
 * working unchanged (the "behaves exactly as Cycle 66" acceptance).
 */
import { describe, it, expect } from 'vitest';

import * as runShim from '../js/gamestate/survivalRun.js';
import * as runShared from '../shared/survival/run.js';
import * as behShim from '../js/gamestate/wolfBehavior.js';
import * as behShared from '../shared/survival/wolfBehavior.js';
import * as penShim from '../js/gamestate/penContainment.js';
import * as penShared from '../shared/survival/pen.js';

describe('Cycle 67 P1 shim parity (js/gamestate -> shared/survival)', () => {
    it('survivalRun shim re-exports the shared SurvivalRun + SurvivalState', () => {
        expect(runShim.SurvivalRun).toBe(runShared.SurvivalRun);
        expect(runShim.SurvivalState).toBe(runShared.SurvivalState);
    });

    it('wolfBehavior shim re-exports every shared helper', () => {
        expect(behShim.spawnCountForDay).toBe(behShared.spawnCountForDay);
        expect(behShim.nearestHuntableIndex).toBe(behShared.nearestHuntableIndex);
        expect(behShim.stepToward).toBe(behShared.stepToward);
        expect(behShim.stepAway).toBe(behShared.stepAway);
    });

    it('penContainment shim re-exports the shared PenContainment', () => {
        expect(penShim.PenContainment).toBe(penShared.PenContainment);
    });
});
