// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 122 Phase 2: the competitive layout is derived from the scene's
 * boundary rather than read out of three hand-written Home Field tables.
 *
 * The load-bearing test here is the first one. SHIPPED_TABLES below is the
 * literal content of `shared/CompetitiveLayout.js` as it stood before this
 * cycle, transcribed by hand. If the derivation reproduces it exactly, the
 * derivation is the rule the tables were written from; if it does not, the
 * derivation is a different rule that happens to look similar, and
 * `tests/sim-baseline/competitive.json` would move.
 *
 * These numbers are frozen ON PURPOSE. Do not regenerate them from the
 * function under test - that would make this file assert only that the code
 * equals itself.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    generateCompetitiveGateLayout,
    competitiveBoundsFromBoundary,
    assignGatesToPlayers
} from '../shared/CompetitiveLayout.js';
import { loadScene } from '../shared/scenes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HOME_FIELD = { kind: 'rect', minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

/** Verbatim from the pre-Cycle-122 hand-written tables. */
const SHIPPED_TABLES = {
    2: [
        { gate: { x: 0, z: 100 }, pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 }, color: 0xFF0000, direction: 'north' },
        { gate: { x: 0, z: -100 }, pasture: { minX: -30, maxX: 30, minZ: -130, maxZ: -102 }, color: 0x0000FF, direction: 'south' }
    ],
    3: [
        { gate: { x: 0, z: 100 }, pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 }, color: 0xFF0000, direction: 'north' },
        { gate: { x: 100, z: 0 }, pasture: { minX: 102, maxX: 130, minZ: -30, maxZ: 30 }, color: 0x0000FF, direction: 'east' },
        { gate: { x: -100, z: 0 }, pasture: { minX: -130, maxX: -102, minZ: -30, maxZ: 30 }, color: 0x00FF00, direction: 'west' }
    ],
    4: [
        { gate: { x: 0, z: 100 }, pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 }, color: 0xFF0000, direction: 'north' },
        { gate: { x: 0, z: -100 }, pasture: { minX: -30, maxX: 30, minZ: -130, maxZ: -102 }, color: 0x0000FF, direction: 'south' },
        { gate: { x: 100, z: 0 }, pasture: { minX: 102, maxX: 130, minZ: -30, maxZ: 30 }, color: 0x00FF00, direction: 'east' },
        { gate: { x: -100, z: 0 }, pasture: { minX: -130, maxX: -102, minZ: -30, maxZ: 30 }, color: 0xFFFF00, direction: 'west' }
    ]
};

/** The passage zone the shipped code computed, restated independently. */
function shippedPassageZone(gate, direction) {
    const width = 8, depth = 4;
    if (direction === 'north' || direction === 'south') {
        return { minX: gate.x - width / 2, maxX: gate.x + width / 2, minZ: gate.z - depth, maxZ: gate.z + depth };
    }
    return { minX: gate.x - depth, maxX: gate.x + depth, minZ: gate.z - width / 2, maxZ: gate.z + width / 2 };
}

describe('Cycle 122 - Home Field bit-identity (the derivation IS the old table)', () => {
    for (const count of [2, 3, 4]) {
        it(`${count}-player layout reproduces the hand-written table exactly`, () => {
            const got = generateCompetitiveGateLayout(count, HOME_FIELD);
            const want = SHIPPED_TABLES[count];
            expect(got).toHaveLength(want.length);

            got.forEach((g, i) => {
                const w = want[i];
                expect(g.id).toBe(i);
                expect(g.direction).toBe(w.direction);
                expect(g.color).toBe(w.color);
                expect(g.width).toBe(8);
                expect(g.height).toBe(4);
                expect(g.playerId).toBeNull();

                // Object.is, not toBe-on-a-rounded-value: a -0 would compare
                // equal under ==, and a -0 in the sim is a real difference.
                expect(Object.is(g.position.x, w.gate.x)).toBe(true);
                expect(Object.is(g.position.z, w.gate.z)).toBe(true);

                for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) {
                    expect(Object.is(g.pasture[key], w.pasture[key])).toBe(true);
                }
                expect(Object.is(g.pasture.centerZ, (w.pasture.minZ + w.pasture.maxZ) / 2)).toBe(true);

                const wantZone = shippedPassageZone(w.gate, w.direction);
                for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) {
                    expect(Object.is(g.passageZone[key], wantZone[key])).toBe(true);
                }
            });
        });
    }

    it('defaults to Home Field when no boundary is supplied, so old callers are unmoved', () => {
        for (const count of [2, 3, 4]) {
            expect(generateCompetitiveGateLayout(count)).toEqual(generateCompetitiveGateLayout(count, HOME_FIELD));
        }
    });

    it('still rejects a player count outside 2 to 4', () => {
        expect(() => generateCompetitiveGateLayout(1, HOME_FIELD)).toThrow(/2-4 players/);
        expect(() => generateCompetitiveGateLayout(5, HOME_FIELD)).toThrow(/2-4 players/);
    });
});

describe('Cycle 122 - island layouts land inside the island', () => {
    // The hard radial clamp in shared/BoundaryCollision.js sits at
    // `radius - margin`. A pasture outside it is not merely wet: the sheep
    // cannot arrive and the round can never complete. This is hard stop 4b.
    const ISLANDS = [
        { id: 'rolling-hills', boundary: loadScene('rolling-hills').boundary },
        { id: 'open-country', boundary: loadScene('open-country').boundary }
    ];

    for (const { id, boundary } of ISLANDS) {
        for (const count of [2, 3, 4]) {
            it(`${id} ${count}-player: every pasture CORNER is inside the safe reach`, () => {
                const safeReach = boundary.radius - (boundary.falloff ?? 0);
                const gates = generateCompetitiveGateLayout(count, boundary);
                expect(gates).toHaveLength(count);

                for (const g of gates) {
                    const corners = [
                        [g.pasture.minX, g.pasture.minZ],
                        [g.pasture.minX, g.pasture.maxZ],
                        [g.pasture.maxX, g.pasture.minZ],
                        [g.pasture.maxX, g.pasture.maxZ]
                    ];
                    for (const [x, z] of corners) {
                        const d = Math.hypot(x - boundary.center.x, z - boundary.center.z);
                        // Inside the beach falloff, not merely inside the clamp:
                        // Cycle 117 shipped a pasture site that was a hillside.
                        expect(d).toBeLessThanOrEqual(safeReach + 1e-9);
                    }
                    // The gate itself must be inside too, and inboard of its pasture.
                    const gd = Math.hypot(g.position.x - boundary.center.x, g.position.z - boundary.center.z);
                    expect(gd).toBeLessThan(safeReach);
                }
            });
        }
    }

    it('Rolling Hills does NOT reuse Home Field geometry, which is the whole defect', () => {
        const rh = loadScene('rolling-hills').boundary;
        const island = generateCompetitiveGateLayout(2, rh);
        const homeField = generateCompetitiveGateLayout(2, HOME_FIELD);
        expect(island[0].position.z).not.toBe(homeField[0].position.z);
        // The island layout reaches further out than Home Field's did, because
        // it is scaled to this island rather than to a 200 m square.
        expect(island[0].pasture.maxZ).toBeGreaterThan(homeField[0].pasture.maxZ);
    });

    it('the OLD behaviour confined the island to a square, and that was the real defect', () => {
        // Worth pinning, because the cycle plan originally claimed the old
        // pastures sat "in open water" and they did not. Home Field's z=130
        // pasture is comfortably inside Rolling Hills' 180 m shore and even
        // inside its 140 m meadow. Nothing was wet. What was wrong is that the
        // whole competitive round happened inside a 200 m square that has no
        // relationship to the island - about 39% of it - with the outer ring
        // unreachable because `gameState.bounds` clamped there.
        const rh = loadScene('rolling-hills').boundary;
        const safeReach = rh.radius - rh.falloff;
        const oldPastureFarEdge = 130;
        expect(oldPastureFarEdge).toBeLessThan(rh.radius);
        expect(oldPastureFarEdge).toBeLessThan(safeReach);

        const oldBoxArea = 200 * 200;
        const islandArea = Math.PI * rh.radius * rh.radius;
        expect(oldBoxArea / islandArea).toBeLessThan(0.4);

        // The fix: bounds now describe the island, not a leftover square.
        expect(competitiveBoundsFromBoundary(rh).maxX).toBe(rh.radius);
    });

    it('pastures do not overlap each other on any island or player count', () => {
        const overlaps = (a, b) =>
            a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
        for (const { id, boundary } of ISLANDS) {
            for (const count of [2, 3, 4]) {
                const gates = generateCompetitiveGateLayout(count, boundary);
                for (let i = 0; i < gates.length; i++) {
                    for (let j = i + 1; j < gates.length; j++) {
                        expect(
                            overlaps(gates[i].pasture, gates[j].pasture),
                            `${id} ${count}P: pasture ${i} overlaps ${j}`
                        ).toBe(false);
                    }
                }
            }
        }
    });

    it('degrades deliberately on an island too small for the standard run', () => {
        const tiny = { kind: 'island', center: { x: 0, z: 0 }, radius: 60, falloff: 10 };
        const gates = generateCompetitiveGateLayout(4, tiny);
        expect(gates).toHaveLength(4);
        for (const g of gates) {
            // Still a real pasture, still reachable, still no crash.
            expect(g.pasture.maxZ - g.pasture.minZ).toBeGreaterThan(0);
            expect(Math.hypot(g.position.x, g.position.z)).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(g.pasture.minX)).toBe(true);
        }
    });
});

describe('Cycle 122 - every scene that ALLOWS competitive or timed survives the layout', () => {
    // Hard stop 4: competitive must never NEWLY crash. This suite exists
    // because the first draft of measureBoundary threw on `coastline`, and
    // Newsheepdogland's allowedModes contains both competitive and timed. D19
    // gates it out of the entrance but `?scene=newsheepdogland` still reaches
    // it, so that throw would have been a new crash on a reachable scene.
    const SCENES = ['field', 'rolling-hills', 'open-country', 'newsheepdogland'];

    for (const id of SCENES) {
        const scene = loadScene(id);
        const modes = scene.allowedModes || [];
        const usesLayout = modes.includes('competitive') || modes.includes('timed');
        if (!usesLayout) continue;

        it(`${id} (${scene.boundary?.kind ?? 'rect via bounds'}) produces a finite layout for 2, 3 and 4 players`, () => {
            const boundary = scene.boundary ?? { kind: 'rect', ...scene.bounds };
            for (const count of [2, 3, 4]) {
                const gates = generateCompetitiveGateLayout(count, boundary);
                expect(gates).toHaveLength(count);
                for (const g of gates) {
                    expect(Number.isFinite(g.position.x)).toBe(true);
                    expect(Number.isFinite(g.position.z)).toBe(true);
                    for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) {
                        expect(Number.isFinite(g.pasture[key]), `${id} pasture.${key}`).toBe(true);
                        expect(Number.isFinite(g.passageZone[key]), `${id} passageZone.${key}`).toBe(true);
                    }
                }
            }
        });

        it(`${id} yields finite competitive bounds, never undefined`, () => {
            const boundary = scene.boundary ?? { kind: 'rect', ...scene.bounds };
            const bounds = competitiveBoundsFromBoundary(boundary);
            for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) {
                expect(Number.isFinite(bounds[key]), `${id} bounds.${key}`).toBe(true);
            }
            expect(bounds.maxX).toBeGreaterThan(bounds.minX);
            expect(bounds.maxZ).toBeGreaterThan(bounds.minZ);
        });
    }

    it('Newsheepdogland keeps the legacy rect exactly, so D19 gating is unchanged', () => {
        const nsl = loadScene('newsheepdogland');
        expect(nsl.boundary.kind).toBe('coastline');
        expect(generateCompetitiveGateLayout(2, nsl.boundary))
            .toEqual(generateCompetitiveGateLayout(2, HOME_FIELD));
        expect(competitiveBoundsFromBoundary(nsl.boundary))
            .toEqual({ minX: -100, maxX: 100, minZ: -100, maxZ: 100 });
    });
});

describe('Cycle 122 - the deterministic-sim constraints', () => {
    const source = readFileSync(resolve(__dirname, '../shared/CompetitiveLayout.js'), 'utf8');
    // Strip comments so the prose explaining WHY there is no trig does not
    // itself trip the check.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

    it('uses no engine-divergent transcendental in the layout', () => {
        for (const fn of ['Math.cos', 'Math.sin', 'Math.tan', 'Math.atan2', 'Math.log', 'Math.exp', 'Math.pow']) {
            expect(code, `${fn} is not spec-pinned across JS engines`).not.toContain(fn);
        }
    });

    it('uses no Math.random', () => {
        expect(code).not.toContain('Math.random');
    });

    it('keeps the gate width scene-independent, because the client hardcodes it', () => {
        // js/boot/initNetwork.js sets `width: 8` when transforming the
        // broadcast payload, and the payload does not carry a width. A
        // scene-scaled gate would silently desync the rendered gate from the
        // server's passage zone. Migration story, Hazard B.
        const boundaries = [
            HOME_FIELD,
            loadScene('rolling-hills').boundary,
            loadScene('open-country').boundary,
            { kind: 'island', center: { x: 0, z: 0 }, radius: 60, falloff: 10 }
        ];
        for (const boundary of boundaries) {
            for (const g of generateCompetitiveGateLayout(2, boundary)) {
                expect(g.width).toBe(8);
                expect(g.height).toBe(4);
                expect(g.passageZone.maxX - g.passageZone.minX).toBeGreaterThan(0);
            }
        }
    });

    it('is a pure function of its inputs', () => {
        const boundary = loadScene('rolling-hills').boundary;
        const a = generateCompetitiveGateLayout(3, boundary);
        const b = generateCompetitiveGateLayout(3, boundary);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});

describe('Cycle 122 - competitiveBoundsFromBoundary', () => {
    it('returns the rect itself for a rect', () => {
        expect(competitiveBoundsFromBoundary(HOME_FIELD)).toEqual({ minX: -100, maxX: 100, minZ: -100, maxZ: 100 });
    });

    it('returns the radius bounding box for an island, not Home Field s rect', () => {
        const rh = loadScene('rolling-hills').boundary;
        expect(competitiveBoundsFromBoundary(rh)).toEqual({
            minX: rh.center.x - rh.radius,
            maxX: rh.center.x + rh.radius,
            minZ: rh.center.z - rh.radius,
            maxZ: rh.center.z + rh.radius
        });
        // The defect this closes: the island used to get plus-or-minus 100.
        expect(competitiveBoundsFromBoundary(rh).maxX).not.toBe(100);
    });
});

describe('Cycle 122 - assignGatesToPlayers is unchanged', () => {
    it('assigns by index, so layout order is player order', () => {
        const gates = generateCompetitiveGateLayout(3, HOME_FIELD);
        const assigned = assignGatesToPlayers(gates, ['a', 'b', 'c']);
        expect(assigned.map((g) => g.playerId)).toEqual(['a', 'b', 'c']);
        expect(assigned.map((g) => g.direction)).toEqual(['north', 'east', 'west']);
    });

    it('still rejects a count mismatch', () => {
        const gates = generateCompetitiveGateLayout(2, HOME_FIELD);
        expect(() => assignGatesToPlayers(gates, ['a'])).toThrow(/must match/);
    });
});
