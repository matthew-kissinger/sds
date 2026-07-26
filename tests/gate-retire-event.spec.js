// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * Funnel occupancy and the crossing pulse (Cycle 116 Phase 4).
 *
 * Five failure modes this file exists for, and each one is driven through the
 * real modules rather than described.
 *
 * ONE: the pulse costs something per sheep. Solo Chaos is 5,000 sheep and they
 * retire in clumps, so a per-crossing dispatch would build 5,000 events over a
 * round to produce exactly the same one pulse per frame. The allocation tests
 * below replace the global `Event` and `CustomEvent` constructors with counting
 * subclasses and drive 500 real retirements through the real `GameState` loop,
 * so "allocates nothing per crossing" is a measured integer rather than a claim.
 *
 * TWO: the pulse stacks, or goes missing. `at most one, never zero` is two
 * assertions that fail in opposite directions, so both are made on the same
 * frames: N crossings give exactly one pulse for N = 1 and N = 500, and a frame
 * with no crossing gives none.
 *
 * THREE: Newsheepdogland is silent. Its sheep retire inside
 * `shared/PenBarrier.js`, which dispatches nothing, and
 * `js/GameState.js`'s gate branch tests them against FieldConfig's passage zone
 * about 1,200 metres away. So the pen tests drive the cue with NO event at all
 * and assert it still pulses, and one of them measures that distance out of the
 * two real modules - `js/FieldConfig.js` on one side, the scene def on the
 * other - rather than out of a stub built here. A stub is how that assertion
 * held for a while with the two gates on top of each other.
 *
 * FOUR: the arc brightens off something other than the flock. The occupancy
 * tests place real sheep in and out of the funnel and check the arc's opacity
 * against `gateThresholdOpacity(distance, gateApproachOccupancy(...))` composed
 * from the same live functions the renderer calls - never against a number
 * typed here.
 *
 * FIVE: the event name drifts. `js/GameState.js` cannot import the constant
 * (it is in the eagerly loaded chunk and the cue is not), so the literal at the
 * dispatch site is checked against the exported constant by reading both.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';

import {
    resolveGateDescriptor,
    gateApproachRect,
    gateApproachCapacity,
    countSheepInGateApproach,
    gateApproachOccupancy,
    gatePulseEnvelope,
    gateThresholdOpacity,
    gateThresholdRadius,
    gateThresholdBrightness,
    GATE_PULSE_DURATION_S,
    GATE_PULSE_GAIN,
    GATE_RETIRED_EVENT,
    CORRAL_RETIRED_EVENT,
    createPenCrossingObserver,
} from '../js/world/gateCue.js';
import { bindGateCue, createGateCue } from '../js/effects/GateColumn.js';
import { FieldConfig } from '../js/FieldConfig.js';
import { field } from '../shared/scenes/field.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { openCountry } from '../shared/scenes/open-country.js';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';

// GameState pulls OptimizedSheep (three) transitively; stub it exactly the way
// tests/completion-count.spec.js does, so the retirement loop under test is the
// real one.
vi.mock('../js/OptimizedSheep.js', () => ({
    OptimizedSheepSystem: class {
        constructor() { this.instancedMesh = null; }
        getSheep() { return []; }
        setAudioManager() {}
        setSpawnConfig() {}
        resetAllSheep() {}
        setUseExtremeBoids() {}
        update() {}
    },
}));
vi.mock('../js/GameBridge.js', () => ({
    getCurrentRoom: () => null,
    getGameInstance: () => null,
    getNetworkManager: () => null,
    getGameState: () => null,
    setGameInstance: () => {},
    emitGameEvent: () => {},
    subscribeGameEvent: () => () => {},
}));

const { GameState } = await import('../js/GameState.js');

const REPO = resolve(import.meta.dirname, '..');
const source = (relative) => readFileSync(resolve(REPO, relative), 'utf8');

const DESTINATIONS = [
    ['Home Field gate', field, null],
    ['Rolling Hills corral', rollingHills, null],
    ['Open Country round-up zone', openCountry, { objective: { stage: 'roundup' } }],
    ['Open Country portal', openCountry, { objective: { stage: 'drive' } }],
    ['Newsheepdogland pen gate', newsheepdogland, null],
];

/** A sheep the funnel count and the retirement loop both accept. */
function sheepAt(x, z, { retired = false, retiresThisFrame = false } = {}) {
    return {
        position: { x, z },
        hasPassedGate: retired,
        isRetiring: retired,
        checkCorralAndRetire() {
            if (!retiresThisFrame) return false;
            this.hasPassedGate = true; this.isRetiring = true; return true;
        },
        checkGatePassageAndRetire() {
            if (!retiresThisFrame) return false;
            this.hasPassedGate = true; this.isRetiring = true; return true;
        },
    };
}

/** A point `distance` metres back along the funnel from the destination. */
function inFunnel(descriptor, distance, lateral = 0) {
    const f = descriptor.facing;
    return {
        x: descriptor.position.x - f.x * distance - f.z * lateral,
        z: descriptor.position.z - f.z * distance + f.x * lateral,
    };
}

/** Minimal SheepDogSimulation shape: exactly what bindGateCue reads. */
function fakeGame(sceneDef, { sheep = [], activeCount, dog = null, pen = null } = {}) {
    const scene = new THREE.Scene();
    return {
        currentScene: sceneDef,
        gameState: {
            sheep,
            optimizedSheepSystem: activeCount === undefined ? null : { activeCount },
        },
        sheepdog: dog ? { position: dog } : null,
        sceneManager: { getScene: () => scene },
        terrainBuilder: { _groundY: () => 0 },
        structureBuilder: { structures: {} },
        _penBarrier: pen,
        scene,
    };
}

/**
 * A solo GameState on the gate path (Home Field) or the corral path.
 *
 * The gate path is left EXACTLY as the constructor built it. `new GameState()`
 * seeds `gate` and `pasture` from `FieldConfig.getFullConfig()` (js/GameState.js
 * lines 44-78), so a state that is not touched afterwards is the shipping client
 * wiring: the same passage zone the real gate branch tests real sheep against.
 *
 * There used to be a `state.gate = { passageZone: {} }` stub here, and it is why
 * the out-of-reach assertion at the bottom of this file certified nothing - every
 * bound of that stub fell through to a default, so Newsheepdogland was being
 * measured against the origin rather than against wherever FieldConfig's gate
 * actually is. Moving FieldConfig's gate onto Newsheepdogland's left the whole
 * file green. Do not reintroduce a stub gate here.
 */
function soloState(sheep, { corral = false } = {}) {
    const state = new GameState();
    state.gameMode = 'solo';
    state.gameActive = true;
    state.isPaused = false;
    state.totalSheep = sheep.length;
    state.optimizedSheepSystem = { update: () => {} };
    state.setObjective(null);
    if (corral) state.setCorral({ center: { x: 0, z: 0 }, radius: 8 });
    state.sheep = sheep;
    return state;
}

/**
 * Replace the global event constructors with counting subclasses for one block.
 *
 * This is the whole "allocates nothing per crossing" proof. Real subclasses, so
 * jsdom's `dispatchEvent` still accepts them and the listeners still run; the
 * only thing that changes is that every construction is counted.
 */
function countingEvents() {
    const RealEvent = globalThis.Event;
    const RealCustomEvent = globalThis.CustomEvent;
    const counts = { Event: 0, CustomEvent: 0 };
    globalThis.Event = class extends RealEvent {
        constructor(...args) { super(...args); counts.Event += 1; }
    };
    globalThis.CustomEvent = class extends RealCustomEvent {
        constructor(...args) { super(...args); counts.CustomEvent += 1; }
    };
    return {
        counts,
        restore() { globalThis.Event = RealEvent; globalThis.CustomEvent = RealCustomEvent; },
    };
}

let live = [];
function cueFor(game) {
    const cue = bindGateCue(game);
    if (cue) live.push(cue);
    return cue;
}
beforeEach(() => { live = []; });
afterEach(() => { for (const cue of live) cue.dispose(); live = []; });

describe('the approach funnel is derived, per kind, never per scene', () => {
    it.each(DESTINATIONS)('%s gets a funnel sized off its own arc radius', (_label, sceneDef, gameState) => {
        const descriptor = resolveGateDescriptor(sceneDef, gameState);
        const rect = gateApproachRect(descriptor);
        const radius = gateThresholdRadius(descriptor);

        // The funnel is as wide as the mark on the ground, so what the player
        // sees brighten and what is being counted are the same place.
        expect(rect.half).toBe(radius);
        expect(rect.back).toBeGreaterThan(radius);
        // A gate is a mouth: everything past it has arrived. A disc's boundary
        // IS the destination, so sheep standing inside it still count.
        expect(rect.front).toBe(descriptor.kind === 'gate' ? 0 : radius);
        expect(rect.x).toBe(descriptor.position.x);
        expect(rect.z).toBe(descriptor.position.z);
    });

    it('splits on kind and names no scene', () => {
        // Hard stop 3. Home Field and Newsheepdogland share the gate funnel
        // shape without either being named; the two discs share the other.
        //
        // Compared as the whole rect normalised by its own radius, not as one
        // ratio: `front / half` alone is 0 for every gate and 1 for every disc
        // by construction, so it agrees across scenes even if the depth or the
        // packing density had been branched per scene underneath it.
        const rectOf = (sceneDef, state) => gateApproachRect(resolveGateDescriptor(sceneDef, state));
        const shape = (r) => [r.front / r.half, r.back / r.half, r.areaFull / (r.half * r.half)];
        // Compared to nine places rather than exactly: the scenes reach these
        // ratios through different radii, so two scenes on one formula land a
        // ULP apart. A same-shape claim is about the formula, not the bits.
        const same = (a, b, label) => a.forEach((v, i) => expect(b[i], `${label}[${i}]`).toBeCloseTo(v, 9));
        // Cycle 117 P2: Rolling Hills moved from the disc family to the gate
        // family when its corral became a fenced pasture, so the disc pair is
        // now Open Country's two stages (the gather zone and the portal).
        const gate = shape(rectOf(field, null));
        const disc = shape(rectOf(openCountry, { objective: { stage: 'drive' } }));

        same(gate, shape(rectOf(newsheepdogland, null)), 'gate');
        same(gate, shape(rectOf(rollingHills, null)), 'gate');
        same(disc, shape(rectOf(openCountry, null)), 'disc');
        // And the split is a real one, so "shares a shape" says something.
        expect(gate[0]).not.toBeCloseTo(disc[0], 6);
        expect(source('js/world/gateCue.js'))
            .not.toMatch(/rolling-hills|open-country|newsheepdogland|sceneDef\.id/);
    });

    it('reads full at the smaller of a packed funnel and a share of the flock', () => {
        // Neither term alone works. Area alone leaves Open Country's 60m gather
        // zone a few percent full with the whole flock inside it; flock alone
        // leaves Solo Chaos never brightening, because 5,000 sheep do not fit in
        // Home Field's 8m mouth.
        const homeField = gateApproachRect(resolveGateDescriptor(field, null));
        const zone = gateApproachRect(resolveGateDescriptor(openCountry, { objective: { stage: 'roundup' } }));

        expect(gateApproachCapacity(homeField, 5000)).toBe(homeField.areaFull);
        expect(gateApproachCapacity(zone, 200)).toBeLessThan(zone.areaFull);
        // And a survival flock of a handful can still fill its own funnel.
        expect(gateApproachCapacity(gateApproachRect(resolveGateDescriptor(newsheepdogland, null)), 6))
            .toBeLessThanOrEqual(6);
    });
});

describe('counting the funnel', () => {
    const descriptor = resolveGateDescriptor(field, null);
    const rect = gateApproachRect(descriptor);

    it('counts what is in front of the mouth and nothing else', () => {
        const back = inFunnel(descriptor, rect.back * 0.5);
        const beyond = inFunnel(descriptor, rect.back * 1.5);
        const wide = inFunnel(descriptor, rect.back * 0.5, rect.half * 1.5);
        // Negative distance is past the mouth, which on Home Field is inside
        // the pasture the flock is being driven into.
        const arrived = inFunnel(descriptor, -2);

        expect(countSheepInGateApproach([sheepAt(back.x, back.z)], rect)).toBe(1);
        expect(countSheepInGateApproach([sheepAt(beyond.x, beyond.z)], rect)).toBe(0);
        expect(countSheepInGateApproach([sheepAt(wide.x, wide.z)], rect)).toBe(0);
        expect(countSheepInGateApproach([sheepAt(arrived.x, arrived.z)], rect)).toBe(0);
    });

    it('does not count sheep that have already gone home', () => {
        // Newsheepdogland is the case: penned sheep stand in the pen for the
        // rest of the day rather than vanishing, and on a disc destination they
        // sit inside the funnel. A funnel that counted them would read full for
        // the rest of the round.
        const p = inFunnel(descriptor, rect.back * 0.5);
        expect(countSheepInGateApproach([sheepAt(p.x, p.z, { retired: true })], rect)).toBe(0);
    });

    it('survives holes in the flock array, and no flock at all', () => {
        // The title used to promise the no-allocation proof, which is not here:
        // it is the source read in "counts the funnel without building a list
        // per frame" below. This one is about the array Counting Sheep hands
        // over, which has holes in it before the batch comes online.
        const p = inFunnel(descriptor, 2);
        expect(countSheepInGateApproach([null, sheepAt(p.x, p.z), { position: null }], rect)).toBe(1);
        expect(countSheepInGateApproach(null, rect)).toBe(0);
        expect(gateApproachOccupancy([], null, 200)).toBe(0);
    });

    it('rises with the flock and saturates at one', () => {
        const many = [];
        for (let i = 0; i < 400; i++) {
            const p = inFunnel(descriptor, 1 + (i % 12), ((i % 7) - 3) * 0.6);
            many.push(sheepAt(p.x, p.z));
        }
        let previous = -1;
        for (const n of [0, 5, 20, 50, 400]) {
            const occupancy = gateApproachOccupancy(many.slice(0, n), rect, 200);
            expect(occupancy).toBeGreaterThanOrEqual(previous);
            previous = occupancy;
        }
        expect(previous).toBe(1);
    });
});

describe('occupancy drives the threshold brightness', () => {
    const descriptor = resolveGateDescriptor(field, null);
    const rect = gateApproachRect(descriptor);
    const dog = () => ({ x: descriptor.position.x + 6, z: descriptor.position.z });

    /** The opacity the renderer should be showing, composed from live functions. */
    const expected = (sheep, flock) => gateThresholdOpacity(
        Math.hypot(dog().x - descriptor.position.x, dog().z - descriptor.position.z),
        gateApproachOccupancy(sheep, rect, flock),
    );

    it('brightens the arc as sheep fill the funnel, on the real wiring', () => {
        const sheep = [];
        const game = fakeGame(field, { sheep, activeCount: 200, dog: dog() });
        const cue = cueFor(game);

        cue.update(0.016);
        const empty = cue.arc.material.opacity;
        expect(empty).toBeCloseTo(expected(sheep, 200), 9);

        for (let i = 0; i < 25; i++) {
            const p = inFunnel(descriptor, 1 + (i % 10), ((i % 5) - 2) * 0.8);
            sheep.push(sheepAt(p.x, p.z));
        }
        cue.update(0.016);
        const half = cue.arc.material.opacity;
        expect(half).toBeCloseTo(expected(sheep, 200), 9);
        expect(half).toBeGreaterThan(empty);

        // "in proportion": the lift is linear in occupancy, so 25 of a 50-sheep
        // capacity is exactly half way from floor to ceiling.
        expect(gateApproachCapacity(rect, 200)).toBe(50);
        expect(gateApproachOccupancy(sheep, rect, 200)).toBeCloseTo(0.5, 9);
        expect(half / gateThresholdBrightness(0.5))
            .toBeCloseTo(empty / gateThresholdBrightness(0), 9);
    });

    it('reads the live flock rather than the array length', () => {
        // Counting Sheep pre-sizes the array to its 5,000 ceiling and brings
        // instances online in batches, so `sheep.length` would report a full
        // flock on round one and hold the arc near dark for the whole run.
        const sheep = [];
        for (let i = 0; i < 4000; i++) sheep.push(sheepAt(9999, 9999));
        for (let i = 0; i < 10; i++) {
            const p = inFunnel(descriptor, 1 + i, 0);
            sheep[i] = sheepAt(p.x, p.z);
        }
        const batched = fakeGame(field, { sheep, activeCount: 20, dog: dog() });
        const wholeArray = fakeGame(field, { sheep, activeCount: 4000, dog: dog() });

        const a = cueFor(batched);
        const b = cueFor(wholeArray);
        a.update(0.016);
        b.update(0.016);
        expect(a.arc.material.opacity).toBeGreaterThan(b.arc.material.opacity);
        expect(a.arc.material.opacity).toBeCloseTo(expected(sheep, 20), 9);
    });

    it('is dark with an empty funnel and no dog anywhere near', () => {
        const cue = cueFor(fakeGame(field, { sheep: [], activeCount: 200 }));
        cue.update(0.016);
        expect(cue.arc.material.opacity).toBe(0);
    });
});

describe('one pulse per frame, never zero, never two', () => {
    const descriptor = resolveGateDescriptor(field, null);

    /** A cue near the gate, so the pulse has something to ride. */
    const nearCue = () => cueFor(fakeGame(field, {
        sheep: [], activeCount: 200, dog: { x: descriptor.position.x, z: descriptor.position.z + 5 },
    }));

    it.each([1, 500])('fires exactly one pulse on a frame with %i gate crossings', (n) => {
        const cue = nearCue();
        const before = cue.pulseCount;

        const flock = [];
        for (let i = 0; i < n; i++) flock.push(sheepAt(0, 0, { retiresThisFrame: true }));
        const state = soloState(flock);
        state.updateSheepBehaviors(0.016);

        cue.update(0.016);
        expect(cue.pulseCount - before).toBe(1);
    });

    it.each([1, 500])('fires exactly one pulse on a frame with %i corral crossings', (n) => {
        // The corral path keeps its per-sheep dispatch, because the lightning
        // zap is drawn at each sheep's position. The cue must still pulse once.
        const cue = nearCue();
        const before = cue.pulseCount;

        const flock = [];
        for (let i = 0; i < n; i++) flock.push(sheepAt(0, 0, { retiresThisFrame: true }));
        soloState(flock, { corral: true }).updateSheepBehaviors(0.016);

        cue.update(0.016);
        expect(cue.pulseCount - before).toBe(1);
    });

    it('fires no pulse on a frame where nothing crossed', () => {
        const cue = nearCue();
        const state = soloState([sheepAt(0, 0)]);
        const before = cue.pulseCount;
        for (let f = 0; f < 30; f++) {
            state.updateSheepBehaviors(0.016);
            cue.update(0.016);
        }
        expect(cue.pulseCount).toBe(before);
    });

    it('lifts the threshold on the crossing frame and settles back', () => {
        const cue = nearCue();
        cue.update(0.016);
        const resting = cue.arc.material.opacity;

        window.dispatchEvent(new Event(GATE_RETIRED_EVENT));
        cue.update(0.016);
        const lit = cue.arc.material.opacity;
        expect(lit).toBeCloseTo(resting * (1 + GATE_PULSE_GAIN), 9);

        // Instant attack, then decay: brightest on the frame it is told. The
        // step count is integer so the loop cannot run one frame past the
        // duration on a float accumulation and compare two settled values.
        const step = GATE_PULSE_DURATION_S / 10;
        let previous = lit;
        for (let i = 0; i < 10; i++) {
            cue.update(step);
            expect(cue.arc.material.opacity, `frame ${i}`).toBeLessThan(previous);
            previous = cue.arc.material.opacity;
        }
        expect(previous).toBeCloseTo(resting, 9);
        cue.update(step);
        expect(cue.arc.material.opacity).toBeCloseTo(resting, 9);
    });

    it('decays from full on the first frame and reaches zero at the duration', () => {
        expect(gatePulseEnvelope(0)).toBe(1);
        expect(gatePulseEnvelope(GATE_PULSE_DURATION_S)).toBe(0);
        expect(gatePulseEnvelope(GATE_PULSE_DURATION_S * 2)).toBe(0);
        expect(gatePulseEnvelope(-1)).toBe(0);
        expect(gatePulseEnvelope(NaN)).toBe(0);
        expect(gatePulseEnvelope(GATE_PULSE_DURATION_S / 2)).toBeCloseTo(0.25, 9);
    });

    it('stops listening once the cue is disposed', () => {
        // The cue's meshes go with the scene, but a listener on `window`
        // outlives it and would pulse the NEXT scene's cue from the previous
        // scene's crossings.
        const cue = nearCue();
        cue.dispose();
        live = live.filter((c) => c !== cue);
        const before = cue.pulseCount;
        window.dispatchEvent(new Event(GATE_RETIRED_EVENT));
        window.dispatchEvent(new CustomEvent(CORRAL_RETIRED_EVENT, { detail: { x: 0, z: 0, y: 0 } }));
        cue.update(0.016);
        expect(cue.pulseCount).toBe(before);
    });
});

describe('the crossing path allocates nothing per sheep', () => {
    it('builds one event for 500 gate crossings, and one for one', () => {
        // Hard stop 4, measured. The gate path counts crossings in an integer
        // and dispatches once after the loop, so the construction count is flat
        // in the number of sheep.
        const counted = [];
        for (const n of [1, 500]) {
            const flock = [];
            for (let i = 0; i < n; i++) flock.push(sheepAt(0, 0, { retiresThisFrame: true }));
            const state = soloState(flock);
            const events = countingEvents();
            try {
                state.updateSheepBehaviors(0.016);
            } finally { events.restore(); }
            counted.push(events.counts.Event + events.counts.CustomEvent);
        }
        expect(counted).toEqual([1, 1]);
    });

    it('keeps the listener side flat too', () => {
        // 500 corral events in one frame is the worst case the cue can be
        // handed, since that path is per sheep by necessity. The cue turns all
        // of them into one pulse and allocates nothing doing it.
        const descriptor = resolveGateDescriptor(field, null);
        const cue = cueFor(fakeGame(field, {
            sheep: [], activeCount: 200,
            dog: { x: descriptor.position.x, z: descriptor.position.z + 5 },
        }));
        const before = cue.pulseCount;
        for (let i = 0; i < 500; i++) {
            window.dispatchEvent(new CustomEvent(CORRAL_RETIRED_EVENT, { detail: { x: i, z: 0, y: 0 } }));
        }
        cue.update(0.016);
        expect(cue.pulseCount - before).toBe(1);
    });

    it('counts the funnel without building a list per frame', () => {
        // A `filter` here would allocate an array of up to 5,000 entries every
        // frame. The count is a bare loop, so the only way to check it is to
        // read the source it was written in.
        const text = source('js/world/gateCue.js');
        const start = text.indexOf('export function countSheepInGateApproach');
        const end = text.indexOf('export function gateApproachOccupancy', start + 1);
        // Both markers have to be found, and in this order. `slice` between two
        // markers it could not find returns the empty string, which satisfies
        // every negative assertion below while reading nothing at all - so a
        // renamed, moved or deleted counter used to leave this guard green.
        expect(start, 'countSheepInGateApproach not found in gateCue.js').toBeGreaterThan(-1);
        expect(end, 'gateApproachOccupancy not found after it').toBeGreaterThan(start);

        const body = text.slice(start, end);
        // It is still the bare loop this test is named for.
        expect(body).toMatch(/for \(let i = 0; i < sheep\.length; i\+\+\)/);
        expect(body).not.toMatch(/\.filter\(|\.map\(|\.slice\(|Array\.from|\[\.\.\./);
    });
});

describe('Newsheepdogland pulses through the pen, because nothing announces it', () => {
    it('reports each rise in the penned count exactly once', () => {
        const pen = { pennedCount: 0 };
        const observe = createPenCrossingObserver(pen);
        expect(observe()).toBe(0);
        pen.pennedCount = 3;
        expect(observe()).toBe(3);
        expect(observe()).toBe(0);
        pen.pennedCount = 4;
        expect(observe()).toBe(1);
    });

    it('treats the dawn release as bookkeeping rather than as crossings', () => {
        const pen = { pennedCount: 12 };
        const observe = createPenCrossingObserver(pen);
        pen.pennedCount = 0; // releaseAll at dawn
        expect(observe()).toBe(0);
        pen.pennedCount = 1; // the first sheep of the new day
        expect(observe()).toBe(1);
    });

    it('starts from the pen it is handed rather than from zero', () => {
        // A cue rebound mid-day finds a pen that is already full; treating that
        // as a hundred crossings would fire a pulse for sheep penned yesterday.
        const pen = { pennedCount: 40 };
        expect(createPenCrossingObserver(pen)()).toBe(0);
    });

    it('pulses the cue on a pen arrival with no event dispatched at all', () => {
        const pen = { pennedCount: 0 };
        const descriptor = resolveGateDescriptor(newsheepdogland, null);
        const cue = cueFor(fakeGame(newsheepdogland, {
            sheep: [], activeCount: 30, pen,
            dog: { x: descriptor.position.x, z: descriptor.position.z + 5 },
        }));
        const before = cue.pulseCount;

        cue.update(0.016);
        expect(cue.pulseCount).toBe(before);

        pen.pennedCount = 2;
        const events = countingEvents();
        try { cue.update(0.016); } finally { events.restore(); }
        expect(cue.pulseCount - before).toBe(1);
        expect(events.counts.Event + events.counts.CustomEvent).toBe(0);

        // And the delta is consumed, so it cannot fire a second time.
        cue.update(0.016);
        expect(cue.pulseCount - before).toBe(1);
    });

    it('does not double-pulse when an event and a pen arrival land on the same frame', () => {
        const pen = { pennedCount: 0 };
        const descriptor = resolveGateDescriptor(newsheepdogland, null);
        const cue = cueFor(fakeGame(newsheepdogland, {
            sheep: [], activeCount: 30, pen,
            dog: { x: descriptor.position.x, z: descriptor.position.z + 5 },
        }));
        const before = cue.pulseCount;
        pen.pennedCount = 1;
        window.dispatchEvent(new Event(GATE_RETIRED_EVENT));
        cue.update(0.016);
        expect(cue.pulseCount - before).toBe(1);
        // The pending event must have been consumed, not left queued behind the
        // observed delta to fire a stray pulse on the next frame.
        cue.update(0.016);
        expect(cue.pulseCount - before).toBe(1);
    });

    it('is out of reach of the gate event path, which is why the observer exists', () => {
        // The finding that justifies this whole observer, measured out of the two
        // shipping modules rather than restated: GameState's gate branch tests
        // Newsheepdogland's sheep against the passage zone js/FieldConfig.js
        // computes for Home Field, and the scene's own gate is a kilometre from
        // it. The check can never fire there, so no `gate-retired` can either.
        //
        // Both sides are read from source. The zone comes off a real GameState,
        // which the constructor seeded from FieldConfig, and is pinned to that
        // module so a stubbed or hand-written zone cannot creep back in; the
        // destination comes off the real scene def through the real resolver.
        // Move FieldConfig's gate onto Newsheepdogland's and this fails.
        const zone = soloState([]).getGateForSheepBehavior()?.passageZone;
        expect(zone).toEqual(FieldConfig.getGate().passageZone);
        for (const edge of ['minX', 'maxX', 'minZ', 'maxZ']) {
            expect(Number.isFinite(zone?.[edge]), `passage zone ${edge}`).toBe(true);
        }

        const descriptor = resolveGateDescriptor(newsheepdogland, null);
        const { position } = descriptor;
        const inZone = position.x >= zone.minX && position.x <= zone.maxX
            && position.z >= zone.minZ && position.z <= zone.maxZ;
        expect(inZone, 'the pen gate sits inside the passage zone').toBe(false);

        // And not merely outside it by a hair: the clearance from the pen gate
        // to the nearest corner of that zone is longer than the whole funnel the
        // flock walks up, so no sheep on the approach is inside it either.
        const away = Math.hypot(
            Math.max(zone.minX - position.x, 0, position.x - zone.maxX),
            Math.max(zone.minZ - position.z, 0, position.z - zone.maxZ),
        );
        expect(away).toBeGreaterThan(gateApproachRect(descriptor).back);
    });
});

describe('the dispatch site and the cue agree on one name', () => {
    it('dispatches exactly the constant the cue listens for', () => {
        // js/GameState.js is in the eagerly loaded chunk and js/world/gateCue.js
        // is not, so importing the constant there would drag the whole cue
        // module into main-*.js. The literal is checked against the constant
        // instead, which fails if either side is renamed.
        expect(source('js/GameState.js'))
            .toContain(`new Event('${GATE_RETIRED_EVENT}')`);
        expect(source('js/GameState.js'))
            .toContain(`new CustomEvent('${CORRAL_RETIRED_EVENT}'`);
    });

    it('dispatches the gate event outside the per-sheep loop', () => {
        // The structural half of the allocation test: a dispatch inside the
        // `for (let sheep of this.sheep)` body would still pass a spy that only
        // counts distinct names.
        const text = source('js/GameState.js');
        const loop = text.indexOf('for (let sheep of this.sheep)');
        const close = text.indexOf('return this.sheepRetired;', loop);
        const dispatch = text.indexOf(`new Event('${GATE_RETIRED_EVENT}')`);
        expect(loop).toBeGreaterThan(-1);
        expect(dispatch).toBeGreaterThan(loop);
        expect(dispatch).toBeLessThan(close);
        // and after the loop's own closing brace, which is where the count-all
        // tally ends.
        expect(text.slice(loop, dispatch)).toContain('this.sheepRetired++');
    });

    it('leaves the retirement tally exactly where Cycle 58 put it', () => {
        // The dispatch shares a block with the "199 of 200" fix, so the guard
        // that the crossing signal did not reintroduce a second increment sits
        // here next to it.
        const flock = [
            sheepAt(0, 0, { retired: true }),
            sheepAt(0, 0, { retiresThisFrame: true }),
            sheepAt(0, 0),
        ];
        const state = soloState(flock);
        state.updateSheepBehaviors(0.016);
        expect(state.sheepRetired).toBe(2);
    });
});
