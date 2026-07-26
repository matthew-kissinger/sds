// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The gate cue's numbers, and the gate-post rim (Cycle 116 Phase 3-A).
 *
 * Four failure modes this file exists for.
 *
 * ONE: the rim goes asymmetric. `js/world/webgpuRockRimNodeMaterial.js` and its
 * `onBeforeCompile` twin are the same effect implemented twice, driven two
 * different ways, with constants that already disagree, so a player on WebGPU
 * and a player on WebGL are looking at two different rocks. The rim here is
 * emissive precisely because emissive is the one drive that provably lands on
 * both backends from one write. `derives ONLY an emissive change` below is what
 * fails if somebody later reaches for a shader hook to buy a fresnel falloff.
 *
 * TWO: material accumulation across scene swaps. `clearAllStructures` disposes
 * geometries and deliberately never materials, `loadModels` caches forever, and
 * `cloneModel` shares material refs, so a rim material derived per gate is one
 * more permanent allocation per scene load. The swap test rebuilds a gate 25
 * times and demands the derived count stay flat.
 *
 * THREE: source-material bleed. The gate's posts come from the same fence-kit
 * material as every other post in the field, so writing the rim in place would
 * light the whole perimeter and keep it lit after the swap.
 *
 * FOUR: numbers that restate themselves. Radii are asserted against descriptors
 * resolved from the REAL scene defs rather than against hand-typed widths, and
 * every threshold and intensity is read out of the module rather than repeated
 * here, so a constant that moves moves the expectation with it and only the
 * RELATIONSHIPS are pinned.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

// Phase 3-B split these two modules by BUNDLE DIRECTION rather than by subject:
// gateThreshold.js is in the eagerly loaded main chunk (the fence builder calls
// applyGatePostRim while building a gate) and keeps the warm, the rim material
// and the two handover constants; gateCue.js is fetched on demand with the cue
// and keeps every curve only the cue reads. Nothing below changed value or
// behaviour - only which of the two files each name is imported from. The
// reasoning, with the measurement, is in both file headers.
import {
    GATE_CUE_WARM_LINEAR,
    GATE_POST_RIM_FLAG,
    GATE_RIM_MATERIALS_KEY,
    applyGatePostRim,
} from '../js/world/gateThreshold.js';
import {
    resolveGateDescriptor,
    resolveGateCueVisibility,
    GATE_CUE_NEAR_DISTANCE,
    GATE_CUE_COLUMN_FADE_SPAN,
    GATE_POST_RIM_PEAK_INTENSITY,
    GATE_THRESHOLD_GATE_OUTSET_M,
    GATE_THRESHOLD_MIN_RADIUS_M,
    GATE_THRESHOLD_MAX_RADIUS_M,
    GATE_THRESHOLD_BASE_OPACITY,
    GATE_THRESHOLD_PEAK_OPACITY,
    gateRimFactor,
    gateThresholdRadius,
    gateThresholdBrightness,
    gateThresholdOpacity,
    setGatePostRimIntensity,
} from '../js/world/gateCue.js';
import { listScenes } from '../shared/scenes/index.js';
import { FencePresets } from '../js/FencePresets.js';

/** A gate-assembly stand-in whose mesh carries a real, emissive-capable material. */
function makeGateAssemblyFixture(material) {
    const group = new THREE.Group();
    group.name = 'Gate_Assembly';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(8.48, 2.2, 3.5), material);
    mesh.name = 'Gate_Wood';
    mesh.position.y = 1.1;
    group.add(mesh);
    group.userData.authoredWidth = 8;
    return group;
}

function presetsWithGateAssembly(material) {
    const presets = new FencePresets();
    presets.useGLBModels = true;
    presets.models.gateAssembly = makeGateAssemblyFixture(material);
    return presets;
}

/**
 * The far end of the handover, derived from Phase 2's two constants rather than
 * typed. Nothing in either module declares this number; it is where the fade
 * span above the near threshold runs out.
 */
const GATE_CUE_FAR_DISTANCE = GATE_CUE_NEAR_DISTANCE + GATE_CUE_COLUMN_FADE_SPAN;

describe('gateRimFactor - one near threshold for the whole cue', () => {
    it('is fully near at the near distance and fully far at the far distance', () => {
        expect(GATE_CUE_FAR_DISTANCE).toBeGreaterThan(GATE_CUE_NEAR_DISTANCE);
        expect(gateRimFactor(0)).toBe(1);
        expect(gateRimFactor(GATE_CUE_NEAR_DISTANCE)).toBe(1);
        expect(gateRimFactor(GATE_CUE_FAR_DISTANCE)).toBe(0);
        expect(gateRimFactor(GATE_CUE_FAR_DISTANCE * 10)).toBe(0);
    });

    it('decreases monotonically across the band and hits half at its midpoint', () => {
        const mid = (GATE_CUE_NEAR_DISTANCE + GATE_CUE_FAR_DISTANCE) / 2;
        expect(gateRimFactor(mid)).toBeCloseTo(0.5, 12);

        let previous = Infinity;
        for (let d = 0; d <= GATE_CUE_FAR_DISTANCE + 20; d += 1) {
            const value = gateRimFactor(d);
            expect(value, `factor at ${d}m`).toBeLessThanOrEqual(previous);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
            previous = value;
        }
    });

    it('reads a non-finite distance as fully far rather than throwing', () => {
        expect(gateRimFactor(NaN)).toBe(0);
        expect(gateRimFactor(undefined)).toBe(0);
        expect(gateRimFactor(Infinity)).toBe(0);
    });

    it('is the exact complement of the column, at every distance', () => {
        // THE anti-drift guard for the whole cycle. Phase 2 owns the far-state
        // surfaces (the world-space column, the screen-edge chevron) and this
        // phase owns the near-state ones (the post rim, the ground arc). Two
        // modules, two formulas, one handover: if either side is edited on its
        // own the two stop summing to one and the player gets a stretch of
        // distance where both draw, or neither does. Asserted against Phase 2's
        // live function rather than against a copy of its numbers.
        for (let d = 0; d <= GATE_CUE_FAR_DISTANCE + 10; d += 0.5) {
            const { columnOpacity } = resolveGateCueVisibility({ distance: d });
            expect(gateRimFactor(d) + columnOpacity, `handover at ${d}m`).toBeCloseTo(1, 12);
        }
        // And the two states are genuinely exclusive at the ends, not merely
        // summing to one somewhere in the middle.
        expect(resolveGateCueVisibility({ distance: GATE_CUE_NEAR_DISTANCE }).columnOpacity).toBe(0);
        expect(gateRimFactor(GATE_CUE_FAR_DISTANCE)).toBe(0);
    });
});

describe('gateThresholdRadius - sized from the real descriptors', () => {
    it('gives every registered scene a drawable radius inside the clamps', () => {
        const scenes = listScenes();
        expect(scenes.length).toBeGreaterThan(0);

        for (const scene of scenes) {
            const descriptor = resolveGateDescriptor(scene, null);
            expect(descriptor, `${scene.id} resolved no destination`).not.toBeNull();
            const radius = gateThresholdRadius(descriptor);
            expect(radius, `${scene.id} radius`).toBeGreaterThanOrEqual(GATE_THRESHOLD_MIN_RADIUS_M);
            expect(radius, `${scene.id} radius`).toBeLessThanOrEqual(GATE_THRESHOLD_MAX_RADIUS_M);
        }
    });

    it('outsets a gate past its posts and draws a disc at its own edge', () => {
        const scenes = listScenes();
        let sawGate = 0;
        let sawDisc = 0;

        for (const scene of scenes) {
            const descriptor = resolveGateDescriptor(scene, null);
            const half = descriptor.width / 2;
            const radius = gateThresholdRadius(descriptor);
            // Every shipped descriptor sits between the clamps, so the rule is
            // visible rather than masked. Guard that here so this assertion
            // cannot quietly become a clamp test.
            expect(half + GATE_THRESHOLD_GATE_OUTSET_M).toBeLessThan(GATE_THRESHOLD_MAX_RADIUS_M);
            expect(half).toBeGreaterThan(GATE_THRESHOLD_MIN_RADIUS_M - GATE_THRESHOLD_GATE_OUTSET_M);

            if (descriptor.kind === 'gate') {
                sawGate += 1;
                expect(radius, `${scene.id} gate arc clears its posts`)
                    .toBeCloseTo(half + GATE_THRESHOLD_GATE_OUTSET_M, 9);
                expect(radius).toBeGreaterThan(half);
            } else {
                sawDisc += 1;
                expect(radius, `${scene.id} disc arc is the disc`).toBeCloseTo(half, 9);
            }
        }

        // Both branches have to be exercised by the real scene list, or the
        // per-kind rule above is asserted against nothing.
        expect(sawGate).toBeGreaterThan(0);
        expect(sawDisc).toBeGreaterThan(0);
    });

    it('clamps a degenerate or absurd width rather than returning it', () => {
        expect(gateThresholdRadius(null)).toBe(GATE_THRESHOLD_MIN_RADIUS_M);
        expect(gateThresholdRadius({ width: 0, kind: 'corral' })).toBe(GATE_THRESHOLD_MIN_RADIUS_M);
        expect(gateThresholdRadius({ width: NaN, kind: 'corral' })).toBe(GATE_THRESHOLD_MIN_RADIUS_M);
        expect(gateThresholdRadius({ width: 4000, kind: 'zone' })).toBe(GATE_THRESHOLD_MAX_RADIUS_M);
    });
});

describe('gateThresholdBrightness - brightens in proportion', () => {
    it('runs from the base opacity to the peak opacity', () => {
        expect(gateThresholdBrightness(0)).toBeCloseTo(GATE_THRESHOLD_BASE_OPACITY, 12);
        expect(gateThresholdBrightness(1)).toBeCloseTo(GATE_THRESHOLD_PEAK_OPACITY, 12);
        expect(GATE_THRESHOLD_PEAK_OPACITY).toBeGreaterThan(GATE_THRESHOLD_BASE_OPACITY);
    });

    it('is a proportion, not an ease', () => {
        // Literally in proportion: the lift at any occupancy is that fraction
        // of the full lift. An eased curve passes the endpoints above and fails
        // here, which is the whole reason this assertion exists separately.
        const full = gateThresholdBrightness(1) - gateThresholdBrightness(0);
        for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
            const lift = gateThresholdBrightness(t) - gateThresholdBrightness(0);
            expect(lift, `lift at occupancy ${t}`).toBeCloseTo(full * t, 12);
        }
    });

    it('clamps occupancy outside [0, 1] and reads garbage as empty', () => {
        expect(gateThresholdBrightness(-3)).toBeCloseTo(GATE_THRESHOLD_BASE_OPACITY, 12);
        expect(gateThresholdBrightness(9)).toBeCloseTo(GATE_THRESHOLD_PEAK_OPACITY, 12);
        expect(gateThresholdBrightness(NaN)).toBeCloseTo(GATE_THRESHOLD_BASE_OPACITY, 12);
    });
});

describe('gateThresholdOpacity - one stated composition', () => {
    it('is the near factor times the occupancy curve', () => {
        for (const d of [0, GATE_CUE_NEAR_DISTANCE, 70, 80, GATE_CUE_FAR_DISTANCE, 200]) {
            for (const occ of [0, 0.4, 1]) {
                expect(gateThresholdOpacity(d, occ))
                    .toBeCloseTo(gateRimFactor(d) * gateThresholdBrightness(occ), 12);
            }
        }
    });

    it('draws nothing at all beyond the far distance, however full the funnel', () => {
        expect(gateThresholdOpacity(GATE_CUE_FAR_DISTANCE, 1)).toBe(0);
        expect(gateThresholdOpacity(500, 1)).toBe(0);
    });
});

describe('applyGatePostRim - one derived material per source', () => {
    it('derives a clone and never writes the source', () => {
        const source = new THREE.MeshStandardMaterial({ color: 0x8b7355 });
        source.name = 'Fence_Kit';
        const before = {
            emissive: source.emissive.getHex(),
            emissiveIntensity: source.emissiveIntensity,
            userData: source.userData,
        };

        const rim = applyGatePostRim(source);

        expect(rim).not.toBe(source);
        expect(rim.userData[GATE_POST_RIM_FLAG]).toBe(true);
        expect(source.emissive.getHex()).toBe(before.emissive);
        expect(source.emissiveIntensity).toBe(before.emissiveIntensity);
        expect(source.userData[GATE_POST_RIM_FLAG]).toBeUndefined();
        expect(source.userData).toEqual(before.userData);
    });

    it('paints the cue warm and starts dark', () => {
        const rim = applyGatePostRim(new THREE.MeshStandardMaterial());
        const [r, g, b] = GATE_CUE_WARM_LINEAR;
        expect(rim.emissive.r).toBeCloseTo(r, 12);
        expect(rim.emissive.g).toBeCloseTo(g, 12);
        expect(rim.emissive.b).toBeCloseTo(b, 12);
        // An undriven rim is invisible, so a gate whose per-frame owner never
        // binds renders exactly what it rendered before this phase.
        expect(rim.emissiveIntensity).toBe(0);
    });

    it('returns the same instance for the same source, and is idempotent', () => {
        const source = new THREE.MeshStandardMaterial();
        const first = applyGatePostRim(source);
        const second = applyGatePostRim(source);
        expect(second).toBe(first);
        // Re-running over an already-derived material must not derive from the
        // derived one, or a second pass would clone the clone forever.
        expect(applyGatePostRim(first)).toBe(first);
    });

    it('declines an unlit material rather than cloning something inert', () => {
        // MeshBasicMaterial has no emissive term, so a derived copy could never
        // do anything; the fallback gate's ground threshold is exactly this.
        const basic = new THREE.MeshBasicMaterial();
        const before = basic.clone();
        expect(applyGatePostRim(basic)).toBe(null);
        expect(basic.uuid).toBe(basic.uuid);
        expect(basic.color.getHex()).toBe(before.color.getHex());
        // A multi-material mesh and a group with no material at all take the
        // same exit, so a caller can walk a whole subtree with one `if (rim)`.
        expect(applyGatePostRim([new THREE.MeshStandardMaterial()])).toBe(null);
        expect(applyGatePostRim(undefined)).toBe(null);
        expect(applyGatePostRim(null)).toBe(null);
    });

    it('derives ONLY an emissive change, so both render paths get the same rim', () => {
        // The dual-path guard. Emissive and emissiveIntensity are the two
        // properties three resolves per frame against the ORIGINAL material on
        // the WebGPU node path (MaterialNode EMISSIVE -> materialReference), so
        // a rim expressed in them alone is identical on both backends by
        // construction. A shader hook or a material-type swap would buy a
        // prettier falloff on WebGL only, which is exactly the rock-rim defect.
        const source = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.7 });
        const rim = applyGatePostRim(source);

        expect(rim.type).toBe(source.type);
        expect(rim.onBeforeCompile).toBe(source.onBeforeCompile);
        expect(rim.defines).toEqual(source.defines);
        expect(rim.color.getHex()).toBe(source.color.getHex());
        expect(rim.roughness).toBe(source.roughness);
        expect(rim.metalness).toBe(source.metalness);
        expect(rim.transparent).toBe(source.transparent);
        expect(rim.opacity).toBe(source.opacity);
        expect(rim.side).toBe(source.side);
    });
});

describe('setGatePostRimIntensity - one drive point', () => {
    it('scales the peak intensity by the proximity factor', () => {
        const rim = applyGatePostRim(new THREE.MeshStandardMaterial());
        expect(setGatePostRimIntensity([rim], 1)).toBe(1);
        expect(rim.emissiveIntensity).toBeCloseTo(GATE_POST_RIM_PEAK_INTENSITY, 12);
        setGatePostRimIntensity([rim], 0.5);
        expect(rim.emissiveIntensity).toBeCloseTo(GATE_POST_RIM_PEAK_INTENSITY * 0.5, 12);
        setGatePostRimIntensity([rim], 0);
        expect(rim.emissiveIntensity).toBe(0);
    });

    it('clamps a factor outside [0, 1] and survives an empty or absent set', () => {
        const rim = applyGatePostRim(new THREE.MeshStandardMaterial());
        setGatePostRimIntensity([rim], 5);
        expect(rim.emissiveIntensity).toBeCloseTo(GATE_POST_RIM_PEAK_INTENSITY, 12);
        setGatePostRimIntensity([rim], -2);
        expect(rim.emissiveIntensity).toBe(0);
        setGatePostRimIntensity([rim], NaN);
        expect(rim.emissiveIntensity).toBe(0);
        expect(setGatePostRimIntensity(null, 1)).toBe(0);
        expect(setGatePostRimIntensity([], 1)).toBe(0);
    });
});

describe('the gate structure carries its rim, and swaps do not accumulate', () => {
    it('publishes the rim materials it built on the gate group', () => {
        const source = new THREE.MeshStandardMaterial({ color: 0x8b7355 });
        const presets = presetsWithGateAssembly(source);

        const gate = presets.createGateStructure(8, 'horizontal');
        const rimMaterials = gate.userData[GATE_RIM_MATERIALS_KEY];

        expect(Array.isArray(rimMaterials)).toBe(true);
        expect(rimMaterials.length).toBe(1);
        expect(rimMaterials[0].userData[GATE_POST_RIM_FLAG]).toBe(true);

        // The mesh in the scene actually wears it, rather than the group merely
        // listing a material nothing renders with.
        const worn = new Set();
        gate.traverse(child => { if (child.isMesh) worn.add(child.material); });
        expect(worn.has(rimMaterials[0])).toBe(true);
        expect(worn.has(source)).toBe(false);
    });

    it('drives a built gate from one call, on both paths', () => {
        const presets = presetsWithGateAssembly(new THREE.MeshStandardMaterial());
        const gate = presets.createGateStructure(8, 'horizontal');

        const written = setGatePostRimIntensity(gate.userData[GATE_RIM_MATERIALS_KEY], gateRimFactor(10));
        expect(written).toBe(1);
        for (const material of gate.userData[GATE_RIM_MATERIALS_KEY]) {
            expect(material.emissiveIntensity).toBeCloseTo(GATE_POST_RIM_PEAK_INTENSITY, 12);
        }
    });

    it('does not accumulate materials across repeated scene swaps', () => {
        // `clearAllStructures` disposes geometries and never materials, so the
        // only thing standing between a rebuild and a permanent allocation is
        // the WeakMap. 25 swaps against one cached model, which is what a
        // player moving between scenes for a session actually does.
        const source = new THREE.MeshStandardMaterial({ color: 0x8b7355 });
        const presets = presetsWithGateAssembly(source);

        const seen = new Set();
        for (let swap = 0; swap < 25; swap++) {
            const gate = presets.createGateStructure(8, 'horizontal');
            for (const material of gate.userData[GATE_RIM_MATERIALS_KEY]) seen.add(material);
        }

        expect(seen.size).toBe(1);
        // And the source the fence kit hands out to every other post in the
        // field is still the source: no bleed, nothing left lit after the swap.
        expect(source.emissive.getHex()).toBe(0x000000);
        expect(source.emissiveIntensity).toBe(1);
        expect(source.userData[GATE_POST_RIM_FLAG]).toBeUndefined();
    });

    it('rims the no-asset fallback gate too, so the rim does not depend on a download', () => {
        const presets = new FencePresets();
        presets.useGLBModels = false;

        const gate = presets.createGateStructure(8, 'horizontal');
        const rimMaterials = gate.userData[GATE_RIM_MATERIALS_KEY];

        expect(rimMaterials.length).toBeGreaterThan(0);
        for (const material of rimMaterials) {
            expect(material.userData[GATE_POST_RIM_FLAG]).toBe(true);
            expect(material.emissiveIntensity).toBe(0);
        }
    });
});
