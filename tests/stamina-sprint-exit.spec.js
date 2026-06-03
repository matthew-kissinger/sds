// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Cycle 23 Phase B — stamina sprint-exit lock-out.
 *
 * Tests the pure stamina state machine in isolation by binding
 * Sheepdog.prototype.updateStamina to a hand-crafted `this` object.
 * The Sheepdog class itself is heavyweight (THREE.Scene + GLTF + skeleton
 * cloning), so we exercise just the function's contract.
 *
 * The bug v1.3.0 surfaced: holding Shift past depletion produced a
 * ~0.83s stutter cycle (0.33s sprint / 0.5s walk) that read as
 * continuous sprint. The fix re-adds the release-shift lock removed in
 * Cycle 8, while preserving the canStartSprint vs canContinueSprint
 * separation per Cycle 7 settled decision.
 */

// Lazy import so the heavy three-y Sheepdog module only loads once across runs.
import { Sheepdog } from '../js/Sheepdog.js';

const updateStamina = Sheepdog.prototype.updateStamina;

function makeDogState({
    stamina = 100,
    maxStamina = 100,
    minStaminaToSprint = 10,
    staminaDrainRate = 30,
    staminaRegenRate = 20,
    velocityMag = 5,
} = {}) {
    return {
        stamina,
        maxStamina,
        minStaminaToSprint,
        staminaDrainRate,
        staminaRegenRate,
        isSprinting: false,
        _sprintLockOut: false,
        velocity: { magnitude: () => velocityMag }
    };
}

describe('Sheepdog.updateStamina', () => {
    let dog;
    const dt = 1 / 60; // 60Hz tick

    beforeEach(() => {
        dog = makeDogState();
    });

    it('engages sprint when wantsSprint + moving + canStartSprint', () => {
        updateStamina.call(dog, true, dt);
        expect(dog.isSprinting).toBe(true);
        expect(dog.stamina).toBeLessThan(100); // drained one frame
    });

    it('does NOT engage sprint when not moving (idle dog)', () => {
        dog.velocity = { magnitude: () => 0 };
        updateStamina.call(dog, true, dt);
        expect(dog.isSprinting).toBe(false);
    });

    it('exits sprint and locks out when stamina depletes mid-sprint', () => {
        // Pre-sprint at very low stamina so one tick depletes.
        dog.stamina = 0.1;
        dog.isSprinting = true;
        updateStamina.call(dog, true, dt);
        expect(dog.stamina).toBe(0);
        expect(dog.isSprinting).toBe(false);
        expect(dog._sprintLockOut).toBe(true);
    });

    it('stays exited even if Shift held and stamina recovers above threshold', () => {
        dog.stamina = 0;
        dog.isSprinting = false;
        dog._sprintLockOut = true;

        // Simulate ~1s of regen with Shift still held — old behavior
        // would re-engage at stamina === minStaminaToSprint after ~0.5s.
        for (let i = 0; i < 60; i++) updateStamina.call(dog, true, dt);

        expect(dog.stamina).toBeGreaterThan(dog.minStaminaToSprint);
        expect(dog.isSprinting).toBe(false);
        expect(dog._sprintLockOut).toBe(true);
    });

    it('clears lock-out when Shift is released (wantsSprint=false)', () => {
        dog._sprintLockOut = true;
        updateStamina.call(dog, false, dt);
        expect(dog._sprintLockOut).toBe(false);
    });

    it('re-engages sprint after release-then-press once stamina is sufficient', () => {
        dog.stamina = 50;
        dog._sprintLockOut = true;

        // 1) release shift → unlock
        updateStamina.call(dog, false, dt);
        expect(dog._sprintLockOut).toBe(false);

        // 2) press shift again
        updateStamina.call(dog, true, dt);
        expect(dog.isSprinting).toBe(true);
    });

    it('does NOT re-engage at stamina === minStaminaToSprint - 1 (boundary)', () => {
        // Confirms the two gates remain separate per Cycle 7 settled decision.
        // canStartSprint requires stamina >= minStaminaToSprint, so 9 < 10 is
        // never enough to START even after release-shift unlock.
        dog.stamina = dog.minStaminaToSprint - 1; // 9
        dog.isSprinting = false;
        dog._sprintLockOut = false;
        updateStamina.call(dog, true, dt);
        expect(dog.isSprinting).toBe(false);
    });

    it('continues sprint mid-drain when stamina is between 0 and minStaminaToSprint', () => {
        // canContinueSprint is the lifeline: once sprinting, stamina > 0
        // is enough to keep going (until depletion latches the lock-out).
        dog.stamina = 5;
        dog.isSprinting = true;
        dog._sprintLockOut = false;
        updateStamina.call(dog, true, dt);
        expect(dog.isSprinting).toBe(true);
    });

    it('regenerates faster when idle than when moving', () => {
        const moving = makeDogState({ stamina: 50, velocityMag: 5 });
        const idle = makeDogState({ stamina: 50, velocityMag: 0 });
        // wantsSprint=false → else branch → regen
        updateStamina.call(moving, false, dt);
        updateStamina.call(idle, false, dt);
        expect(idle.stamina).toBeGreaterThan(moving.stamina);
    });
});
