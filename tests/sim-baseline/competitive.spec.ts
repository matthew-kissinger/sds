// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P0-DETTEST: sim-baseline trace of a deterministic 2-player competitive race.
 *
 * Scenario: a 12-sheep flock split into two clusters, one parked just south
 * of the north gate (owned by 'alpha', 8 sheep) and one just north of the
 * south gate (owned by 'bravo', 4 sheep). A stationary dog behind each
 * cluster pushes it through its gate via the flee force. The 2-player win
 * threshold is ceil(12 / 2) = 6, so 'alpha' wins the race once its sixth
 * sheep retires; 'bravo' scores along the way. The trace therefore includes
 * per-gate retirements, both players' scores climbing, and a completion with
 * winType 'race'.
 *
 * Determinism: the flock layout is a fixed grid (no PRNG), and the only
 * randomness in the competitive tick (retirement-target placement inside the
 * pasture) is driven by a mulberry32 PRNG with a fixed seed, exactly like the
 * Worker's per-game seeded rng. The spec generates the trace twice and
 * asserts run-to-run equality before comparing against the committed fixture.
 *
 * Fixture: tests/sim-baseline/competitive.json. The phase plan
 * (docs/hardening/phase-0-foundation.md [P0-DETTEST]) names this exact path,
 * so unlike the legacy fixtures it lives at the directory root rather than
 * in __fixtures__/.
 *
 * Regenerate (only with an explicit acceptance decision, per
 * .claude/rules/shared-sim.md):
 *   UPDATE_FIXTURES=true npx vitest run tests/sim-baseline/competitive.spec.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-expect-error - harness is plain JS, no types
import {
    makeSheep,
    makeSheepdog,
    makeCompetitiveGameState,
    tickSheepCompetitive,
    mulberry32,
    round4
} from './harness.js';
// @ts-expect-error - shared module, no types
import { checkCompetitiveCompletion } from '../../shared/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, 'competitive.json');
const UPDATE = process.env.UPDATE_FIXTURES === 'true';

function loadOrWriteFixture(data: unknown): unknown {
    if (UPDATE || !existsSync(FIXTURE_PATH)) {
        writeFileSync(FIXTURE_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
        return data;
    }
    return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

const SEED = 0x12345678;
const PLAYERS = ['alpha', 'bravo'];
const TOTAL_SHEEP = 12; // 2p race threshold = ceil(12 / 2) = 6
const TICK_RATE = 60;
const DT = 1 / TICK_RATE;
const MAX_TICKS = 240; // 4s budget; completion lands well inside it

interface TraceRow {
    tick: number;
    scores: Record<string, number>;
    totalRetired: number;
    isComplete: boolean;
    winner: string | null;
    winType: string | null;
    sample: Array<{ id: number; x: number; z: number; retired: boolean }>;
}

function runScenario(): { trace: TraceRow[]; completedAt: number } {
    const rng = mulberry32(SEED);
    const state = makeCompetitiveGameState(PLAYERS, TOTAL_SHEEP);
    // createCompetitiveGameState leaves the retired counter to the sim loop
    // (GameSim sets it per tick from the retirement result); start it at 0.
    state.sheepRetired = 0;

    // Gate 0 is north (+Z) owned by 'alpha'; gate 1 is south (-Z) owned by
    // 'bravo' (assignGatesToPlayers assigns by index).
    const sheep: any[] = [];
    // North cluster: 8 sheep on a 3-column grid centered at (0, 91.5). The
    // north passage zone is x in [-4, 4], z in [96, 104].
    for (let i = 0; i < 8; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        sheep.push(makeSheep(i, (col - 1) * 0.8, 91.5 + (row - 1) * 0.8));
    }
    // South cluster: 4 sheep on a 2x2 grid centered at (0, -91.5).
    for (let i = 0; i < 4; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        sheep.push(makeSheep(8 + i, (col - 0.5) * 0.8, -91.5 - (row - 0.5) * 0.8));
    }
    state.sheep = sheep;

    // Stationary dogs behind each cluster (inside the 8m fleeRadius) drive
    // the clusters gate-ward via the flee force alone.
    const dogs = [
        makeSheepdog('alpha', 0, 85.5),
        makeSheepdog('bravo', 0, -85.5)
    ];

    const sampleIds = [0, 4, 8, 11];
    const trace: TraceRow[] = [];
    let completedAt = -1;

    const snap = (tick: number, completion: { isComplete: boolean; winner: string | null; winType: string | null }) => {
        trace.push({
            tick,
            scores: { alpha: state.playerScores.alpha, bravo: state.playerScores.bravo },
            totalRetired: state.sheepRetired,
            isComplete: completion.isComplete,
            winner: completion.winner ?? null,
            winType: completion.winType ?? null,
            sample: sampleIds.map(id => {
                const s = sheep[id];
                return {
                    id,
                    x: round4(s.position.x),
                    z: round4(s.position.z),
                    retired: !!(s.hasPassedGate || s.isRetiring)
                };
            })
        });
    };

    snap(0, { isComplete: false, winner: null, winType: null });
    for (let t = 1; t <= MAX_TICKS; t++) {
        tickSheepCompetitive(sheep, dogs, state, DT, rng);
        const completion = checkCompetitiveCompletion(
            state.playerScores,
            PLAYERS.length,
            state.totalSheep
        );
        snap(t, completion);
        if (completion.isComplete) {
            completedAt = t;
            break;
        }
    }

    return { trace, completedAt };
}

describe('sim-baseline: 2-player competitive race', () => {
    it('traces a deterministic race with retirements and a race completion', () => {
        const runA = runScenario();
        const runB = runScenario();

        // Run-to-run determinism under the same seed, before any fixture
        // comparison: two fresh builds of the scenario must trace identically.
        expect(runB.trace).toEqual(runA.trace);
        expect(runB.completedAt).toBe(runA.completedAt);

        const { trace, completedAt } = runA;
        const last = trace[trace.length - 1];

        // Sanity: the race actually completed within the tick budget.
        expect(completedAt).toBeGreaterThan(0);
        expect(last.isComplete).toBe(true);
        expect(last.winType).toBe('race');
        // North cluster (8 sheep) wins the race to 6 for 'alpha'.
        expect(last.winner).toBe('alpha');
        expect(last.scores.alpha).toBeGreaterThanOrEqual(6);

        // Sanity: both gates scored (retirements at both ends of the field).
        expect(last.scores.bravo).toBeGreaterThan(0);
        // Scores never exceed what retired in total.
        expect(last.scores.alpha + last.scores.bravo).toBe(last.totalRetired);

        // Sanity: scores and totalRetired are monotonically non-decreasing,
        // and completion latches only on the final row.
        for (let i = 1; i < trace.length; i++) {
            expect(trace[i].scores.alpha).toBeGreaterThanOrEqual(trace[i - 1].scores.alpha);
            expect(trace[i].scores.bravo).toBeGreaterThanOrEqual(trace[i - 1].scores.bravo);
            expect(trace[i].totalRetired).toBeGreaterThanOrEqual(trace[i - 1].totalRetired);
            if (i < trace.length - 1) {
                expect(trace[i].isComplete).toBe(false);
            }
        }

        // Snapshot match against the committed fixture.
        const expected = loadOrWriteFixture(trace) as TraceRow[];
        expect(trace).toEqual(expected);
    });
});
