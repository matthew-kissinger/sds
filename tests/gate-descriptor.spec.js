// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * One destination descriptor, one source (Cycle 116 Phase 1).
 *
 * Three failure modes this file exists for.
 *
 * ONE: silent numeric drift between the gate the SIM retires sheep at and the
 * gate the CUE draws at. On Home Field those are two different modules that
 * happen to agree - js/FieldConfig.js computes (0, FIELD_SIZES.medium.maxZ) with
 * GATE_DEFAULTS.width, shared/scenes/field.js authors (0, 100) width 8 - and the
 * sibling `pasture` has ALREADY drifted between the same two files. So the
 * agreement is a coincidence, and a coincidence with a spec on it is a contract.
 * Every number below is read out of its real module; nothing is typed twice.
 *
 * TWO: a descriptor that falls back to `gameState`. js/boot/loadScene.js step 10
 * nulls `corral`/`objective`/`boundary` on a swap but not `gate`/`pasture`, so a
 * fallback would inherit Home Field's gate into an island and draw a cue in the
 * sea. The swap tests hand the resolver a game state carrying a stale gate and
 * demand it be ignored.
 *
 * THREE: a `facing` that points the wrong way. It is a direction, so asserting a
 * literal vector would just restate the implementation. These assert what the
 * direction has to MEAN instead: Home Field's crosses its own boundary outward,
 * Newsheepdogland's points from the gate into the pen it opens onto, and the
 * radial ones point away from the play centre.
 */
import { describe, it, expect } from 'vitest';

import {
    resolveGateDescriptor,
    gateFacingYaw,
    GATE_CUE_KINDS,
    DEFAULT_OBJECTIVE_STAGE,
} from '../js/world/gateCue.js';
import { resolveGateApproach } from '../js/world/groundShading.js';
import { FieldConfig, FIELD_SIZES } from '../js/FieldConfig.js';
import { createObjective } from '../shared/objective.js';
import { listScenes, loadScene } from '../shared/scenes/index.js';
import { field } from '../shared/scenes/field.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { openCountry } from '../shared/scenes/open-country.js';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';

const len = (v) => Math.hypot(v.x, v.z);
const dot = (a, b) => a.x * b.x + a.z * b.z;

describe('resolveGateDescriptor - every scene resolves exactly one', () => {
    it('resolves a well-formed descriptor for every registered scene', () => {
        const scenes = listScenes();
        expect(scenes.length).toBeGreaterThan(0);

        for (const scene of scenes) {
            const descriptor = resolveGateDescriptor(scene, null);
            expect(descriptor, `${scene.id} resolved no destination`).not.toBeNull();
            expect(GATE_CUE_KINDS, `${scene.id} kind`).toContain(descriptor.kind);
            expect(Number.isFinite(descriptor.position.x)).toBe(true);
            expect(Number.isFinite(descriptor.position.z)).toBe(true);
            expect(descriptor.width, `${scene.id} width`).toBeGreaterThan(0);
            expect(len(descriptor.facing), `${scene.id} facing is a unit vector`).toBeCloseTo(1, 9);
        }
    });

    it('returns null for a scene that declares no destination', () => {
        expect(resolveGateDescriptor({ id: 'empty', bounds: field.bounds }, null)).toBeNull();
        expect(resolveGateDescriptor(null, null)).toBeNull();
    });

    it('hands back a fresh position object rather than aliasing the scene def', () => {
        const descriptor = resolveGateDescriptor(field, null);
        expect(descriptor.position).not.toBe(field.gate.position);
        descriptor.position.x += 5;
        expect(field.gate.position.x).toBe(0);
    });
});

describe('Home Field - the sim gate and the cue gate are the same gate', () => {
    // The guard the cycle plan asks for. Both sides are read from their own
    // module; if either moves, this fails on the next run.
    it('agrees with FieldConfig on position and width', () => {
        // The comparison only means anything while FieldConfig is on the field
        // size Home Field is authored against, so pin that first.
        expect(FieldConfig.getBounds()).toEqual(FIELD_SIZES.medium);

        const simGate = FieldConfig.getGate();
        const cueGate = resolveGateDescriptor(loadScene('field'), null);

        expect(cueGate.kind).toBe('gate');
        expect(cueGate.position.x).toBe(simGate.position.x);
        expect(cueGate.position.z).toBe(simGate.position.z);
        expect(cueGate.width).toBe(simGate.width);
    });

    it('sits on the sim gate the sim retires through, not merely near it', () => {
        const simGate = FieldConfig.getGate();
        const cueGate = resolveGateDescriptor(field, null);
        const zone = simGate.passageZone;

        // Dead centre of the passage zone the retirement test uses.
        expect(cueGate.position.x).toBeGreaterThanOrEqual(zone.minX);
        expect(cueGate.position.x).toBeLessThanOrEqual(zone.maxX);
        expect(cueGate.position.z).toBeGreaterThanOrEqual(zone.minZ);
        expect(cueGate.position.z).toBeLessThanOrEqual(zone.maxZ);
        // And the arc it scales spans the mouth exactly.
        expect(cueGate.width).toBe(zone.maxX - zone.minX);
    });

    it('faces out of the play area, derived from the scene bounds', () => {
        const { position, facing } = resolveGateDescriptor(field, null);
        const b = field.bounds;
        const inside = (p) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
        const step = 0.5;

        const ahead = { x: position.x + facing.x * step, z: position.z + facing.z * step };
        const behind = { x: position.x - facing.x * step, z: position.z - facing.z * step };

        expect(inside(ahead), 'a step along facing leaves the play area').toBe(false);
        expect(inside(behind), 'a step against facing stays in the play area').toBe(true);
    });

    it('is the exact opposite of the worn approach axis', () => {
        // groundShading's `axis` points OUT of the mouth toward the traffic; the
        // cue's `facing` points the way the flock travels. Two jobs, one line.
        const approach = resolveGateApproach(field);
        const { facing } = resolveGateDescriptor(field, null);
        expect(dot(facing, approach.axis)).toBeCloseTo(-1, 9);
    });
});

describe('Rolling Hills - the corral disc', () => {
    it('resolves the corral, sized from its radius', () => {
        const descriptor = resolveGateDescriptor(rollingHills, null);
        expect(descriptor.kind).toBe('corral');
        expect(descriptor.position).toEqual({
            x: rollingHills.corral.center.x,
            z: rollingHills.corral.center.z,
        });
        expect(descriptor.width).toBe(rollingHills.corral.radius * 2);
    });

    it('faces away from the island centre', () => {
        const { position, facing } = resolveGateDescriptor(rollingHills, null);
        const centre = rollingHills.boundary.center;
        expect(dot(facing, { x: position.x - centre.x, z: position.z - centre.z }))
            .toBeGreaterThan(0);
    });
});

describe('Open Country - two destinations, one live stage', () => {
    it('defaults to the round-up zone, matching the objective machine own initial stage', () => {
        // Derived, not asserted from memory: whatever createObjective starts at
        // is what the descriptor must assume before any live state exists.
        const fresh = createObjective(openCountry.objective, openCountry.sheepSpawn.count);
        expect(DEFAULT_OBJECTIVE_STAGE).toBe(fresh.stage);

        const descriptor = resolveGateDescriptor(openCountry, null);
        expect(descriptor.kind).toBe('zone');
        expect(descriptor.position).toEqual({
            x: openCountry.objective.roundupZone.x,
            z: openCountry.objective.roundupZone.z,
        });
        expect(descriptor.width).toBe(openCountry.objective.roundupZone.radius * 2);
    });

    it('stays on the round-up zone while the live stage is roundup', () => {
        const gameState = { objective: createObjective(openCountry.objective, 200) };
        const descriptor = resolveGateDescriptor(openCountry, gameState);
        expect(descriptor.kind).toBe('zone');
        expect(descriptor.position.z).toBe(openCountry.objective.roundupZone.z);
    });

    it('moves to the portal once the live stage flips to drive', () => {
        const objective = createObjective(openCountry.objective, 200);
        objective.stage = 'drive';
        const descriptor = resolveGateDescriptor(openCountry, { objective });

        expect(descriptor.kind).toBe('portal');
        expect(descriptor.position).toEqual({
            x: openCountry.corral.center.x,
            z: openCountry.corral.center.z,
        });
        expect(descriptor.width).toBe(openCountry.corral.radius * 2);
    });

    it('reads portal from the corral effect, not from the scene id', () => {
        const objective = createObjective(openCountry.objective, 200);
        objective.stage = 'drive';
        expect(openCountry.corral.effect).toBe('portal');
        expect(rollingHills.corral.effect).toBeUndefined();

        expect(resolveGateDescriptor(openCountry, { objective }).kind).toBe('portal');
        expect(resolveGateDescriptor(rollingHills, { objective }).kind).toBe('corral');
    });

    it('falls back to the round-up zone on a malformed stage rather than jumping ahead', () => {
        for (const stage of [undefined, null, 'DRIVE', 42]) {
            const descriptor = resolveGateDescriptor(openCountry, { objective: { stage } });
            expect(descriptor.kind, `stage ${String(stage)}`).toBe('zone');
        }
    });
});

describe('Newsheepdogland - the homestead gate', () => {
    it('resolves the gate at its authored width', () => {
        const descriptor = resolveGateDescriptor(newsheepdogland, null);
        expect(descriptor.kind).toBe('gate');
        expect(descriptor.position).toEqual({
            x: newsheepdogland.gate.position.x,
            z: newsheepdogland.gate.position.z,
        });
        expect(descriptor.width).toBe(newsheepdogland.gate.width);
    });

    it('faces from the gate into the pen it opens onto', () => {
        // The semantic test for facingDeg. A swapped sin/cos or a flipped sign
        // sends the flock direction along the pen fence or back out to sea.
        const { position, facing } = resolveGateDescriptor(newsheepdogland, null);
        const pen = newsheepdogland.pen.center;
        const intoPen = { x: pen.x - position.x, z: pen.z - position.z };

        expect(len(intoPen)).toBeGreaterThan(0);
        expect(dot(facing, intoPen)).toBeGreaterThan(0);
        // And it points AT the pen centre, not merely into that half-plane.
        expect(dot(facing, intoPen) / len(intoPen)).toBeCloseTo(1, 6);
    });

    it('round trips the authored facingDeg through the yaw helper', () => {
        const { facing } = resolveGateDescriptor(newsheepdogland, null);
        const expected = (newsheepdogland.gate.facingDeg * Math.PI) / 180;
        expect(gateFacingYaw(facing)).toBeCloseTo(expected, 9);
    });

    it('prefers the gate over the pen, since the gate is what the flock aims at', () => {
        const descriptor = resolveGateDescriptor(newsheepdogland, null);
        expect(descriptor.position.x).not.toBe(newsheepdogland.pen.center.x);
    });
});

describe('scene swap - the previous scene never leaks in through game state', () => {
    // The exact shape disposeScene leaves behind: gate and pasture survive the
    // swap, corral and objective do not.
    const staleAfterHomeField = () => ({
        gate: FieldConfig.getGate(),
        pasture: FieldConfig.getPasture(),
        corral: null,
        objective: null,
        boundary: null,
    });

    it('resolves the island corral, not the stale Home Field gate', () => {
        const descriptor = resolveGateDescriptor(rollingHills, staleAfterHomeField());
        expect(descriptor.kind).toBe('corral');
        expect(descriptor.position).toEqual({
            x: rollingHills.corral.center.x,
            z: rollingHills.corral.center.z,
        });
        expect(descriptor.position.z).not.toBe(FieldConfig.getGate().position.z);
    });

    it('resolves the Open Country zone, not the stale Home Field gate', () => {
        const descriptor = resolveGateDescriptor(openCountry, staleAfterHomeField());
        expect(descriptor.kind).toBe('zone');
        expect(descriptor.width).toBe(openCountry.objective.roundupZone.radius * 2);
    });

    it('resolves nothing at all for a destination-free scene, stale state or not', () => {
        const bare = { id: 'bare', boundary: rollingHills.boundary, sheepSpawn: rollingHills.sheepSpawn };
        expect(resolveGateDescriptor(bare, staleAfterHomeField())).toBeNull();
    });

    it('gives every scene a descriptor independent of the order they load in', () => {
        const ids = ['field', 'rolling-hills', 'open-country', 'newsheepdogland'];
        const forward = ids.map((id) => resolveGateDescriptor(loadScene(id), staleAfterHomeField()));
        const reverse = [...ids].reverse()
            .map((id) => resolveGateDescriptor(loadScene(id), staleAfterHomeField()))
            .reverse();
        expect(forward).toEqual(reverse);
    });
});

describe('gateFacingYaw', () => {
    it('is the inverse of the degree convention the gate builder applies', () => {
        // js/StructureBuilder.js sets gate.rotation.y = facingDeg in radians, so
        // a yaw fed back through must reproduce it.
        for (const deg of [0, 45, 90, 180, -90]) {
            const facing = resolveGateDescriptor(
                { gate: { position: { x: 0, z: 0 }, width: 4, facingDeg: deg } },
                null,
            ).facing;
            expect(len(facing)).toBeCloseTo(1, 9);
            const yaw = gateFacingYaw(facing);
            expect(Math.sin(yaw)).toBeCloseTo(Math.sin((deg * Math.PI) / 180), 9);
            expect(Math.cos(yaw)).toBeCloseTo(Math.cos((deg * Math.PI) / 180), 9);
        }
    });

    it('is a safe zero on a malformed facing', () => {
        expect(gateFacingYaw(null)).toBe(0);
        expect(gateFacingYaw({ x: NaN, z: 1 })).toBe(0);
    });
});
