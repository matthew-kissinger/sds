// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 59 Phase 2 - sheep capacity pre-size + incremental activation.
 *
 * The one real engine change for Counting Sheep: OptimizedSheepSystem can
 * pre-size its InstancedMesh + per-instance buffers to a maxCapacity and bring
 * instances online in batches (activateSheepBatch), while standard modes (no
 * maxCapacity) stay byte-identical - sized to exactly sheepCount, one-shot
 * spawn, full draw count. The byte-identical guard is the cycle's main hard stop.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { OptimizedSheepSystem } from '../js/OptimizedSheep.js';

// spreadRadius 0 + no borderPoints => deterministic spawn at the cluster center,
// so these tests assert counts/sizes without depending on Math.random.
const spawn = { centerX: 0, centerZ: 0, spreadRadius: 0, defaultCount: 1 };

describe('sheep capacity: standard mode byte-identical sizing (Cycle 59 P2)', () => {
    it('sizes mesh + buffers to sheepCount when no maxCapacity is given', () => {
        const scene = new THREE.Scene();
        const sys = new OptimizedSheepSystem(scene, 5, spawn);
        try {
            expect(sys.maxCapacity).toBe(5);
            expect(sys.activeCount).toBe(5);
            expect(sys.sheep.length).toBe(5);
            expect(sys.instancedMesh.count).toBe(5);
            expect(sys.instancedMesh.instanceMatrix.array.length).toBe(5 * 16);
            expect(sys.mergedGeometry.attributes.instanceData.array.length).toBe(5 * 4);
            expect(sys.mergedGeometry.attributes.instanceAnimation.array.length).toBe(5 * 4);
        } finally {
            sys.dispose();
        }
    });
});

describe('sheep capacity: counting pre-size + activation (Cycle 59 P2)', () => {
    it('pre-sizes to maxCapacity but starts with one active sheep', () => {
        const scene = new THREE.Scene();
        const sys = new OptimizedSheepSystem(scene, 1, spawn, false, { maxCapacity: 5000 });
        try {
            expect(sys.maxCapacity).toBe(5000);
            expect(sys.activeCount).toBe(1);
            expect(sys.sheep.length).toBe(1);
            expect(sys.instancedMesh.count).toBe(1);
            // The full buffer is allocated up front (the proven Chaos footprint).
            expect(sys.instancedMesh.instanceMatrix.array.length).toBe(5000 * 16);
            expect(sys.mergedGeometry.attributes.instanceData.array.length).toBe(5000 * 4);
        } finally {
            sys.dispose();
        }
    });

    it('activateSheepBatch brings dense, id-indexed sheep online and raises the draw count', () => {
        const scene = new THREE.Scene();
        const sys = new OptimizedSheepSystem(scene, 1, spawn, false, { maxCapacity: 5000 });
        try {
            const added = sys.activateSheepBatch(2);
            expect(added).toBe(2);
            expect(sys.activeCount).toBe(3);
            expect(sys.sheep.length).toBe(3);
            expect(sys.instancedMesh.count).toBe(3);
            // id === array index: dense, append-only, penned sheep keep their slot.
            expect(sys.sheep.map((s) => s.id)).toEqual([0, 1, 2]);
            // No buffer reallocation: still the original 5000 allocation.
            expect(sys.instancedMesh.instanceMatrix.array.length).toBe(5000 * 16);
        } finally {
            sys.dispose();
        }
    });

    it('clamps activation at maxCapacity and no-ops past the ceiling', () => {
        const scene = new THREE.Scene();
        const sys = new OptimizedSheepSystem(scene, 1, spawn, false, { maxCapacity: 4 });
        try {
            // 1 active; ask for 10 -> only 3 more fit (cap 4).
            expect(sys.activateSheepBatch(10)).toBe(3);
            expect(sys.activeCount).toBe(4);
            expect(sys.instancedMesh.count).toBe(4);
            // Further activation is a no-op at the ceiling.
            expect(sys.activateSheepBatch(5)).toBe(0);
            expect(sys.activeCount).toBe(4);
        } finally {
            sys.dispose();
        }
    });

    it('runs the onActivate hook for each newly-activated sheep', () => {
        const scene = new THREE.Scene();
        const sys = new OptimizedSheepSystem(scene, 1, spawn, false, { maxCapacity: 10 });
        try {
            const seen = [];
            sys.activateSheepBatch(3, (sheep) => seen.push(sheep.id));
            expect(seen).toEqual([1, 2, 3]);
        } finally {
            sys.dispose();
        }
    });
});
