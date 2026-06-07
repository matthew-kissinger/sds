// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 67 P2: the wolf state machine, extracted to shared/survival/wolves.js so
 * the Worker can run it authoritatively for co-op. These tests pin the AI:
 * seeded spawn, hunt/kill selection, the pen protecting penned sheep, the bark
 * repel, dawn retreat + despawn, and (the co-op-critical property) reproducibility
 * for a fixed (seed, day). Pure Node - no Three.js.
 */
import { describe, it, expect } from 'vitest';
import { WolfSim, WolfState } from '../shared/survival/wolves.js';

function makeSheep(x, z, extra = {}) {
    return {
        state: 0,
        penned: false,
        killed: false,
        position: { x, z },
        velocity: { x: 0, z: 0, set(a, b) { this.x = a; this.z = b; } },
        ...extra,
    };
}

// A minimal pen: a 20x20 box centred at origin, no-op keep-out.
function makePen() {
    return {
        cx: 0, cz: 0,
        _isInside: (x, z) => x > -10 && x < 10 && z > -10 && z < 10,
        _keepOut: () => 0,
    };
}

describe('WolfSim spawn', () => {
    it('spawns the escalating per-day count', () => {
        const sim = new WolfSim({ seed: 1 });
        sim.spawnNight(1, [makeSheep(0, 0)]);
        expect(sim.count).toBe(2);
        sim.spawnNight(3, [makeSheep(0, 0)]);
        expect(sim.count).toBe(4); // base 2 + (3-1)*1
    });

    it('honours tuning for the pack size + ceiling', () => {
        const sim = new WolfSim({ seed: 1, tuning: { base: 1, perDay: 2, max: 5 } });
        sim.spawnNight(10, [makeSheep(0, 0)]);
        expect(sim.count).toBe(5);
    });

    it('never stacks two nights of wolves', () => {
        const sim = new WolfSim({ seed: 1 });
        sim.spawnNight(2, [makeSheep(0, 0)]);
        const first = sim.count;
        sim.spawnNight(2, [makeSheep(0, 0)]);
        expect(sim.count).toBe(first); // cleared, not stacked
    });
});

describe('WolfSim hunt + kill', () => {
    it('kills a huntable sheep on contact and fires onKill once', () => {
        let kills = 0;
        const sim = new WolfSim({ seed: 1, onKill: () => kills++, tuning: { base: 1, perDay: 0, max: 1 } });
        const sheep = [makeSheep(0, 0)];
        sim.spawnNight(1, sheep);
        expect(sim.count).toBe(1);
        // Drop the sheep onto the wolf so a kill is guaranteed next tick.
        const w = sim.wolves[0];
        sheep[0].position.x = w.x;
        sheep[0].position.z = w.z;
        sim.update(0.1, sheep, null);
        expect(sheep[0].killed).toBe(true);
        expect(sheep[0].state).toBe(2);
        expect(kills).toBe(1);
        expect(sim.wolves[0].justKilled).toBe(true);
        // The transient clears next tick.
        sim.update(0.1, sheep, null);
        expect(sim.wolves[0].justKilled).toBe(false);
    });

    it('moves toward its target each tick', () => {
        const sim = new WolfSim({ seed: 2, tuning: { base: 1, perDay: 0, max: 1 } });
        const sheep = [makeSheep(0, 0)];
        sim.spawnNight(1, sheep);
        const w = sim.wolves[0];
        const before = Math.hypot(w.x, w.z);
        sim.update(0.05, sheep, null);
        const after = Math.hypot(sim.wolves[0].x, sim.wolves[0].z);
        expect(after).toBeLessThan(before); // closed distance to the sheep at origin
        expect(sim.wolves[0].moved).toBeGreaterThan(0);
    });
});

describe('WolfSim pen protection', () => {
    it('treats a sheep inside the closed pen as not huntable', () => {
        const sim = new WolfSim({ seed: 1, pen: makePen() });
        const inside = makeSheep(0, 0);
        expect(sim._isHuntable(inside)).toBe(false);
        const outside = makeSheep(50, 0);
        expect(sim._isHuntable(outside)).toBe(true);
    });

    it('never lets a wolf kill a penned sheep', () => {
        let kills = 0;
        const sim = new WolfSim({ seed: 1, pen: makePen(), onKill: () => kills++, tuning: { base: 1, perDay: 0, max: 1 } });
        const sheep = [makeSheep(0, 0)]; // sitting inside the pen
        sim.spawnNight(1, sheep);
        for (let i = 0; i < 100; i++) sim.update(0.05, sheep, null);
        expect(kills).toBe(0);
        expect(sheep[0].killed).toBe(false);
    });
});

describe('WolfSim repel + retreat', () => {
    it('flips wolves within range to FLEE on a bark', () => {
        const sim = new WolfSim({ seed: 1, tuning: { base: 2, perDay: 0, max: 2 } });
        const sheep = [makeSheep(0, 0)];
        sim.spawnNight(1, sheep);
        // Park both wolves at a known point, then bark on top of them.
        for (const w of sim.wolves) { w.x = 5; w.z = 0; }
        const n = sim.repel(5, 0, 22, 1.6);
        expect(n).toBe(2);
        expect(sim.wolves.every((w) => w.state === WolfState.FLEE)).toBe(true);
    });

    it('retreats and despawns the whole pack by dawn', () => {
        const sim = new WolfSim({ seed: 3 });
        sim.spawnNight(2, [makeSheep(0, 0)]);
        expect(sim.count).toBeGreaterThan(0);
        sim.retreatAll();
        expect(sim.wolves.every((w) => w.state === WolfState.RETREAT)).toBe(true);
        for (let i = 0; i < 400 && sim.count > 0; i++) sim.update(0.05, [], null);
        expect(sim.count).toBe(0);
    });
});

describe('WolfSim determinism (co-op critical)', () => {
    it('produces identical wolf positions for a fixed (seed, day)', () => {
        const sheepA = [makeSheep(0, 0)];
        const sheepB = [makeSheep(0, 0)];
        const a = new WolfSim({ seed: 42 });
        const b = new WolfSim({ seed: 42 });
        a.spawnNight(3, sheepA);
        b.spawnNight(3, sheepB);
        for (let i = 0; i < 20; i++) {
            a.update(0.05, sheepA, null);
            b.update(0.05, sheepB, null);
        }
        expect(a.count).toBe(b.count);
        for (let i = 0; i < a.count; i++) {
            expect(a.wolves[i].x).toBe(b.wolves[i].x);
            expect(a.wolves[i].z).toBe(b.wolves[i].z);
        }
    });
});

describe('WolfSim snapshot (wire shape)', () => {
    it('emits a lean id/x/z/state array', () => {
        const sim = new WolfSim({ seed: 1, tuning: { base: 2, perDay: 0, max: 2 } });
        sim.spawnNight(1, [makeSheep(0, 0)]);
        const snap = sim.snapshot();
        expect(snap).toHaveLength(2);
        for (const w of snap) {
            expect(Object.keys(w).sort()).toEqual(['id', 'state', 'x', 'z']);
            expect(typeof w.id).toBe('number');
            expect(typeof w.state).toBe('string');
        }
    });
});
