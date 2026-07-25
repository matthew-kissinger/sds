// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FencePresets } from '../js/FencePresets.js';
import { StructureBuilder } from '../js/StructureBuilder.js';
import {
    FENCE_WEAR,
    applyRailSag,
    groundWeatherFactor,
    railSagDepth,
    undersideWeatherFactor,
    writeFenceVertexColors,
} from '../js/world/fenceWear.js';
import {
    FENCE_POST,
    FENCE_RAIL,
    buildFenceKit,
    buildFencePost,
    buildFenceRail,
    chamferedRect,
    paletteUV,
} from '../tools/bake-fence/kitPieces.mjs';

/**
 * The fence kit gets an authoring source, and the fence gets weathered and sagged
 * (Cycle 115 Phases 1 and 2).
 *
 * Four things are pinned here:
 *
 *   1. The SILHOUETTE. Cycle 115 Q2 froze it: `js/StructureBuilder.js` hangs
 *      rails at [0.5, 1.2, 1.9] off a 2.18m post and the entrance heroes are
 *      shot against that fence. A re-authored kit may change any surface it
 *      likes and no dimension the runtime computes against.
 *   2. `COLOR_0` exists on every piece and darkens toward the ground. Without
 *      the channel there is nothing for Phase 2's weathering to ride on, which
 *      is precisely the state the shipped kit was in.
 *   3. The sag is real, is bounded, and grows with the SQUARE of the span. A
 *      droop that does not scale is a bent asset, not a hanging rail.
 *   4. Both material paths read vertex colours. The baked kit gets it from
 *      `GLTFLoader` (COLOR_0 flips `vertexColors` on for us); the procedural
 *      fallback had `vertexColors` off and no `color` attribute at all, so it
 *      would have rendered the same fence flat.
 *
 * The authoring module is pure JS on purpose, so this spec measures the real
 * geometry without launching the bake's headless Chromium.
 */

/** Measured off `assets/models/Fence_Kit-v1.0.0.glb`; see tools/bake-fence.mjs SILHOUETTE. */
const SHIPPED = {
    postHeight: 2.1800,
    postHalfX: 0.2092,
    postHalfZ: 0.1990,
    railHalfLength: 0.5000,
    railHalfHeight: 0.0496,
    railHalfDepth: 0.0606,
};
/** The tolerance the bake enforces, restated so widening one without the other fails. */
const SILHOUETTE_TOLERANCE = 0.02;

/** Rail attachment heights, from `createBorderSegment` in js/FencePresets.js. */
const RAIL_HEIGHTS = [0.5, 1.2, 1.9];

function bounds(geometry) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < geometry.positions.length; i += 3) {
        for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], geometry.positions[i + k]);
            max[k] = Math.max(max[k], geometry.positions[i + k]);
        }
    }
    return { min, max };
}

/**
 * Half-width of the post's cross-section at a given height, along +X.
 *
 * The post is a stack of rings, so an arbitrary height usually falls BETWEEN
 * two of them. Widest-vertex-in-a-slab would read zero there; this collapses
 * the mesh to its ring levels and interpolates, which is what the silhouette
 * actually is at that height.
 */
function crossSectionHalfWidthAt(geometry, y) {
    const { positions } = geometry;
    const levels = new Map();
    for (let i = 0; i < positions.length; i += 3) {
        const key = positions[i + 1].toFixed(5);
        levels.set(key, Math.max(levels.get(key) ?? 0, Math.abs(positions[i])));
    }
    const rings = [...levels.entries()]
        .map(([k, half]) => ({ y: Number(k), half }))
        .sort((a, b) => a.y - b.y);
    if (y <= rings[0].y) return rings[0].half;
    for (let i = 1; i < rings.length; i++) {
        if (rings[i].y < y) continue;
        const lower = rings[i - 1];
        const upper = rings[i];
        if (upper.y === lower.y) return Math.max(lower.half, upper.half);
        const t = (y - lower.y) / (upper.y - lower.y);
        return lower.half + (upper.half - lower.half) * t;
    }
    return rings[rings.length - 1].half;
}

describe('the fence kit has an authoring source', () => {
    it('emits every wrapper node the runtime looks up, with COLOR_0 on each', () => {
        const kit = buildFenceKit();
        expect(kit.map((p) => p.node)).toEqual(['Fence_Post', 'Fence_Rail', 'Gate_Post', 'Gate_Arch']);
        for (const piece of kit) {
            expect(piece.geometry.colors.length, `${piece.node} COLOR_0`).toBe(piece.geometry.positions.length);
            expect(piece.stats.triangles).toBeGreaterThan(0);
            // Indexed, not a triangle soup: the compression chain welds and
            // Draco-encodes indices, and an unindexed kit doubles the payload.
            expect(piece.geometry.indices.length % 3).toBe(0);
        }
    });

    it('holds the post silhouette Q2 froze', () => {
        const { min, max } = bounds(buildFencePost());
        expect(min[1]).toBeCloseTo(0, 6);
        expect(max[1] - min[1]).toBeCloseTo(SHIPPED.postHeight, 6);
        expect(Math.abs(max[0] - SHIPPED.postHalfX)).toBeLessThanOrEqual(SILHOUETTE_TOLERANCE);
        expect(Math.abs(max[2] - SHIPPED.postHalfZ)).toBeLessThanOrEqual(SILHOUETTE_TOLERANCE);
    });

    it('holds the rail silhouette the runtime scales against', () => {
        const { min, max } = bounds(buildFenceRail());
        // railModelLength is 1.0 in createBorderSegment; the rail must be
        // centred on its own origin and run along local +X.
        expect(max[0]).toBeCloseTo(SHIPPED.railHalfLength, 6);
        expect(min[0]).toBeCloseTo(-SHIPPED.railHalfLength, 6);
        expect(max[1]).toBeCloseTo(SHIPPED.railHalfHeight, 6);
        expect(max[2]).toBeCloseTo(SHIPPED.railHalfDepth, 6);
        expect(FENCE_RAIL.length).toBe(1.0);
    });

    it('keeps the shaft wide enough at every rail height to hold its rails', () => {
        const post = buildFencePost();
        // The lean cap in js/FencePresets.js is argued from the post's
        // cross-section still covering the top rail's attachment. Half the
        // rail's depth is the bar the shaft has to clear at each height.
        for (const height of RAIL_HEIGHTS) {
            expect(crossSectionHalfWidthAt(post, height), `shaft at ${height}m`)
                .toBeGreaterThan(SHIPPED.railHalfDepth);
        }
    });

    it('cuts a true 45 degree chamfer at the top, not a rounded end', () => {
        const post = buildFencePost();
        const top = FENCE_POST.height;
        const inset = crossSectionHalfWidthAt(post, top - FENCE_POST.chamfer)
            - crossSectionHalfWidthAt(post, top);
        // Equal rise and inset is what makes it 45 degrees, and a single flat
        // band is what makes it a chamfer rather than a fillet.
        expect(inset).toBeCloseTo(FENCE_POST.chamfer, 6);
    });

    it('samples the shared palette at band centres, never between two bands', () => {
        for (const piece of buildFenceKit()) {
            const { uvs } = piece.geometry;
            for (let i = 0; i < uvs.length; i += 2) {
                const band = (uvs[i] * 32 - 2) / 4;
                expect(Number.isInteger(Math.round(band * 1e6) / 1e6), `uv ${uvs[i]}`).toBe(true);
                expect(uvs[i]).toBeCloseTo(paletteUV(Math.round(band)), 9);
                // u == v, matching the shipped kit; the palette is one row
                // repeated four times so only u carries meaning.
                expect(uvs[i + 1]).toBeCloseTo(uvs[i], 9);
            }
        }
    });

    it('bakes byte-identically, so a re-bake does not churn the goldens', () => {
        const a = buildFenceKit();
        const b = buildFenceKit();
        for (let i = 0; i < a.length; i++) {
            expect(Array.from(b[i].geometry.positions)).toEqual(Array.from(a[i].geometry.positions));
            expect(Array.from(b[i].geometry.colors)).toEqual(Array.from(a[i].geometry.colors));
        }
    });

    it('chamfers a rect section without ever crossing itself', () => {
        const section = chamferedRect(0.1, 0.1, 0.027);
        expect(section).toHaveLength(8);
        for (const [a, b] of section) {
            expect(Math.abs(a)).toBeLessThanOrEqual(0.1 + 1e-9);
            expect(Math.abs(b)).toBeLessThanOrEqual(0.1 + 1e-9);
        }
        // A chamfer larger than the section degenerates to a diamond rather
        // than inverting; the clamp is what stops a knob typo emitting a knot.
        expect(chamferedRect(0.1, 0.1, 10)).toHaveLength(8);
        expect(chamferedRect(0.1, 0.1, 0)).toHaveLength(4);
    });
});

describe('weathering darkens toward the ground', () => {
    it('darkens a post from foot to top', () => {
        const post = buildFencePost();
        const { positions, colors } = post;
        let footSum = 0, footCount = 0, topSum = 0, topCount = 0;
        for (let i = 0; i < positions.length; i += 3) {
            const y = positions[i + 1];
            if (y < 0.1) { footSum += colors[i]; footCount++; }
            if (y > FENCE_POST.height - 0.1) { topSum += colors[i]; topCount++; }
        }
        expect(footCount).toBeGreaterThan(0);
        expect(topCount).toBeGreaterThan(0);
        expect(footSum / footCount).toBeLessThan(topSum / topCount);
    });

    it('never brightens past the palette', () => {
        for (const piece of buildFenceKit()) {
            for (const c of piece.geometry.colors) {
                expect(c).toBeGreaterThan(0);
                expect(c).toBeLessThanOrEqual(1);
            }
        }
    });

    it('is monotonic in height and saturates above the fade', () => {
        expect(groundWeatherFactor(0)).toBeCloseTo(FENCE_WEAR.groundShade, 9);
        expect(groundWeatherFactor(FENCE_WEAR.groundFadeHeight)).toBeCloseTo(1, 9);
        expect(groundWeatherFactor(10)).toBeCloseTo(1, 9);
        expect(groundWeatherFactor(-1)).toBeCloseTo(FENCE_WEAR.groundShade, 9);
        let previous = -1;
        for (let y = 0; y <= 1; y += 0.05) {
            const now = groundWeatherFactor(y);
            expect(now).toBeGreaterThanOrEqual(previous);
            previous = now;
        }
    });

    it('darkens undersides and leaves up-facing and vertical faces alone', () => {
        expect(undersideWeatherFactor(-1)).toBeCloseTo(FENCE_WEAR.undersideShade, 9);
        expect(undersideWeatherFactor(0)).toBeCloseTo(1, 9);
        expect(undersideWeatherFactor(1)).toBeCloseTo(1, 9);
    });

    it('writes colours onto a geometry that has none, honouring the ground reference', () => {
        const grounded = new THREE.BoxGeometry(0.2, 2, 0.2);
        writeFenceVertexColors(grounded, { footY: -1, BufferAttributeCtor: THREE.BufferAttribute });
        const colors = grounded.getAttribute('color');
        expect(colors).toBeTruthy();
        expect(colors.count).toBe(grounded.getAttribute('position').count);

        let low = Infinity, high = -Infinity;
        for (let i = 0; i < colors.count; i++) {
            const y = grounded.getAttribute('position').getY(i);
            if (y < 0) low = Math.min(low, colors.getX(i));
            else high = Math.max(high, colors.getX(i));
        }
        expect(low).toBeLessThan(high);

        // footY null means "this piece has no ground of its own", which is the
        // rail's situation. Only the underside term survives.
        const floating = new THREE.BoxGeometry(1, 0.1, 0.12);
        writeFenceVertexColors(floating, { footY: null, BufferAttributeCtor: THREE.BufferAttribute });
        const floatingColors = floating.getAttribute('color');
        let min = Infinity;
        for (let i = 0; i < floatingColors.count; i++) min = Math.min(min, floatingColors.getX(i));
        expect(min).toBeCloseTo(FENCE_WEAR.undersideShade, 6);
    });
});

describe('rails droop between posts', () => {
    it('scales the droop with the square of the span, and caps it', () => {
        expect(railSagDepth(5)).toBeCloseTo(FENCE_WEAR.sagPerSquareMetre * 25, 9);
        expect(railSagDepth(4) / railSagDepth(2)).toBeCloseTo(4, 6);
        expect(railSagDepth(0)).toBe(0);
        expect(railSagDepth(1000)).toBe(FENCE_WEAR.sagMax);
        // The cap must sit clear of anything the game actually builds: posts
        // are spaced at most `postSpacing` apart, so nothing in a real run
        // should ever reach it.
        expect(railSagDepth(5)).toBeLessThan(FENCE_WEAR.sagMax);
    });

    it('pins the rail at both posts and drops it in the middle', () => {
        const geometry = new THREE.BoxGeometry(5, 0.1, 0.12, 4, 1, 1);
        const before = geometry.getAttribute('position').clone();
        const sag = applyRailSag(geometry, 5);
        expect(sag).toBeCloseTo(railSagDepth(5), 9);

        const position = geometry.getAttribute('position');
        let endDrop = 0, midDrop = 0;
        for (let i = 0; i < position.count; i++) {
            const drop = before.getY(i) - position.getY(i);
            if (Math.abs(position.getX(i)) > 2.4) endDrop = Math.max(endDrop, Math.abs(drop));
            if (Math.abs(position.getX(i)) < 1e-6) midDrop = Math.max(midDrop, drop);
        }
        expect(endDrop).toBeCloseTo(0, 9);
        expect(midDrop).toBeCloseTo(sag, 6);
    });

    it('droops along Z when the rail was built along Z', () => {
        const geometry = new THREE.BoxGeometry(0.12, 0.1, 5, 1, 1, 4);
        applyRailSag(geometry, 5, { longAxis: 'z' });
        const position = geometry.getAttribute('position');
        let midDrop = 0;
        for (let i = 0; i < position.count; i++) {
            if (Math.abs(position.getZ(i)) < 1e-6) midDrop = Math.max(midDrop, -position.getY(i) - 0.05);
        }
        expect(midDrop).toBeCloseTo(railSagDepth(5), 6);
    });

    it('converts metres into the geometry own units when the kit is quantised', () => {
        // A kit compressed with Draco arrives normalised, with the mesh node
        // carrying the scale back to metres. Half-scale geometry needs twice
        // the droop in its own units to land the same droop in the world.
        const geometry = new THREE.BoxGeometry(2, 0.2, 0.24, 4, 1, 1);
        applyRailSag(geometry, 5, { metresPerUnit: 0.5 });
        const position = geometry.getAttribute('position');
        let midDrop = 0;
        for (let i = 0; i < position.count; i++) {
            if (Math.abs(position.getX(i)) < 1e-6) midDrop = Math.max(midDrop, -position.getY(i) - 0.1);
        }
        expect(midDrop).toBeCloseTo(railSagDepth(5) / 0.5, 6);
    });

    it('refuses a geometry with no interior vertices rather than pretending', () => {
        // A plain unsegmented box has vertices only where the parabola is flat.
        const geometry = new THREE.BoxGeometry(5, 0.1, 0.12);
        const before = geometry.getAttribute('position').clone();
        applyRailSag(geometry, 5);
        const position = geometry.getAttribute('position');
        for (let i = 0; i < position.count; i++) {
            expect(position.getY(i)).toBeCloseTo(before.getY(i), 9);
        }
    });
});

// ---------------------------------------------------------------------------

function makeModule(name, meshName, geometry, meshY = 0) {
    const group = new THREE.Group();
    group.name = name;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.name = meshName;
    mesh.position.y = meshY;
    group.add(mesh);
    return group;
}

/** A kit shaped like the baked one: one mesh per wrapper, so the instanced path runs. */
function makeInstancedKit() {
    const presets = new FencePresets();
    presets.useGLBModels = true;
    presets.models.fencePost = makeModule(
        'Fence_Post', 'Mesh_Fence_Post_Runtime',
        new THREE.BoxGeometry(0.41, SHIPPED.postHeight, 0.41), SHIPPED.postHeight / 2,
    );
    presets.models.fenceRail = makeModule(
        'Fence_Rail', 'Mesh_Fence_Rail_Runtime',
        new THREE.BoxGeometry(1, 0.0992, 0.1212, 4, 1, 1),
    );
    return presets;
}

describe('both material paths read the weathering', () => {
    it('turns vertex colours on for the procedural fallback and gives it something to read', () => {
        const presets = new FencePresets();
        expect(presets.materials.post.vertexColors).toBe(true);
        expect(presets.materials.rail.vertexColors).toBe(true);
        // The material declares the attribute either way, so a geometry drawn
        // with it and no `color` renders black. Both cached geometries carry one.
        expect(presets.geometries.post.getAttribute('color')).toBeTruthy();
        expect(presets.geometries.rail.getAttribute('color')).toBeTruthy();
    });

    it('colours and droops every rail the procedural fallback builds', () => {
        const presets = new FencePresets();
        presets.useGLBModels = false;
        const segment = presets.createBorderSegment(20, 'horizontal', { seedKey: 'wear-probe' });
        const rails = segment.children.filter((child) => child.userData?.railSpan);
        expect(rails.length).toBeGreaterThan(0);
        for (const rail of rails) {
            expect(rail.geometry.getAttribute('color')).toBeTruthy();
            expect(rail.geometry.userData.fenceRailSagDepth).toBeCloseTo(railSagDepth(5), 9);
            expect(rail.geometry.boundingBox.min.y).toBeLessThan(-0.05 - railSagDepth(5) * 0.9);
        }
    });

    it('droops the instanced rails, once per segment, without touching the kit', () => {
        const presets = makeInstancedKit();
        const sourceGeometry = presets.models.fenceRail.children[0].geometry;
        const sourceMinY = sourceGeometry.getAttribute('position').getY(0);

        const scene = new THREE.Scene();
        const builder = new StructureBuilder(scene);
        builder.fencePresets = presets;
        const segment = presets.createBorderSegment(20, 'horizontal', { seedKey: 'sag-probe' });
        scene.add(segment);
        builder._surfaceToTerrain(segment);

        const rails = segment.children.find((child) => child.name === 'Fence_Rail_Instances');
        expect(rails).toBeTruthy();
        expect(rails.geometry.userData.fenceRailSagDepth).toBeCloseTo(railSagDepth(5), 9);
        // The kit's own geometry is the source for every other segment, so it
        // must come out of this straight.
        expect(sourceGeometry.getAttribute('position').getY(0)).toBeCloseTo(sourceMinY, 9);
        expect(sourceGeometry.userData.fenceRailSagDepth).toBeUndefined();
    });

    it('sags the same amount on a slope, measured along the rail rather than fought', () => {
        // _slopeRailToTerrain re-orients a rail between its two posts. The sag
        // rides in the rail's LOCAL frame, so a sloped rail keeps its droop
        // instead of having it flattened out by the re-orientation.
        const presets = makeInstancedKit();
        const scene = new THREE.Scene();
        const builder = new StructureBuilder(scene);
        builder.fencePresets = presets;
        builder.setHeightfield({ sample: (x) => x * 0.2 });
        const segment = presets.createBorderSegment(20, 'horizontal', { seedKey: 'slope-probe' });
        scene.add(segment);
        builder._surfaceToTerrain(segment);

        const rails = segment.children.find((child) => child.name === 'Fence_Rail_Instances');
        expect(rails.geometry.userData.fenceRailSagDepth).toBeCloseTo(railSagDepth(5), 9);
    });

    it('keeps a procedural rail hung off both post tops after _slopeRailToTerrain', () => {
        // The interaction Cycle 115 P2 called out: the slope pass REPLACES the
        // rail's rotation and re-seats its position between the two lifted post
        // tops. A rail whose sag lived in world space would be sheared by that;
        // one whose sag lives in its own frame comes out still hanging from both
        // ends, with the droop measured perpendicular to the chord.
        const presets = new FencePresets();
        presets.useGLBModels = false;
        const scene = new THREE.Scene();
        const builder = new StructureBuilder(scene);
        builder.fencePresets = presets;
        const slope = 0.2;
        builder.setHeightfield({ sample: (x) => x * slope });

        const segment = presets.createBorderSegment(20, 'horizontal', { seedKey: 'proc-slope' });
        scene.add(segment);
        builder._surfaceToTerrain(segment);
        scene.updateMatrixWorld(true);

        const rail = segment.children.find((child) => child.userData?.railSpan?.baseY === 1.2);
        expect(rail).toBeTruthy();
        const half = rail.userData.railSpan.halfLen;
        const sag = railSagDepth(half * 2);

        // The rail's own chord in WORLD space, after the slope pass rebuilt its
        // rotation. It climbs, which is the whole point of _slopeRailToTerrain.
        // Slightly less than span * slope, because the rail's geometry is built
        // at the HORIZONTAL post spacing while the chord it is rotated onto is
        // the hypotenuse: a pre-existing shortfall this phase does not touch.
        const left = rail.localToWorld(new THREE.Vector3(-half, 0, 0));
        const right = rail.localToWorld(new THREE.Vector3(half, 0, 0));
        const rise = right.y - left.y;
        expect(rise).toBeGreaterThan(half * 2 * slope * 0.97);
        expect(rise).toBeLessThanOrEqual(half * 2 * slope + 1e-9);

        // Every vertex measured against that chord. The ends sit within half a
        // rail thickness of it; the middle hangs a full sag plus half a
        // thickness below. A sag applied in world space would have been sheared
        // by the rotation and would fail the second bound.
        const chord = right.clone().sub(left).normalize();
        const position = rail.geometry.getAttribute('position');
        const world = new THREE.Vector3();
        const offset = new THREE.Vector3();
        let endWorst = 0;
        let middleDrop = 0;
        for (let i = 0; i < position.count; i++) {
            world.fromBufferAttribute(position, i).applyMatrix4(rail.matrixWorld);
            offset.copy(world).sub(left);
            const along = offset.dot(chord);
            const drop = -(offset.y - chord.y * along);   // below the chord, positive
            if (along < 0.01 || along > half * 2 - 0.01) endWorst = Math.max(endWorst, Math.abs(drop));
            if (Math.abs(along - half) < 0.01) middleDrop = Math.max(middleDrop, drop);
        }
        const railHalfThickness = presets.railHeight / 2;
        expect(endWorst).toBeLessThanOrEqual(railHalfThickness * 1.05);
        expect(middleDrop).toBeGreaterThan(sag * 0.95 + railHalfThickness * 0.9);
    });
});
