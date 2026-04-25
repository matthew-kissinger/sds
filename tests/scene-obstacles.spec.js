import { describe, it, expect } from 'vitest';
import {
    buildSceneObstacles,
    canonicalSort,
    obstacleAvoidance,
    pointInsideBuilding,
    emptyObstacles,
} from '../shared/SceneObstacles.js';

/**
 * SceneObstacles primitive (Cycle 5 Phase 1).
 *
 * Coverage:
 *   - canonicalSort produces stable order regardless of input order
 *   - buildSceneObstacles returns identical query results for two builds
 *     with the same logical input — the cross-V8 determinism contract
 *   - kdbush radius queries return correct neighbours
 *   - obstacleAvoidance push-out math is correct
 *   - pointInsideBuilding handles AABBs
 *   - emptyObstacles set is queryable safely
 */

describe('canonicalSort', () => {
    it('sorts by (x, z) ascending — stable across input orderings', () => {
        const a = [{ x: 3, z: 0, radiusXZ: 1 }, { x: 1, z: 5, radiusXZ: 1 }, { x: 1, z: 0, radiusXZ: 1 }];
        const b = [{ x: 1, z: 5, radiusXZ: 1 }, { x: 1, z: 0, radiusXZ: 1 }, { x: 3, z: 0, radiusXZ: 1 }];
        canonicalSort(a);
        canonicalSort(b);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(a[0]).toEqual({ x: 1, z: 0, radiusXZ: 1 });
        expect(a[1]).toEqual({ x: 1, z: 5, radiusXZ: 1 });
        expect(a[2]).toEqual({ x: 3, z: 0, radiusXZ: 1 });
    });

    it('handles duplicate coordinates without crashing', () => {
        const dup = [{ x: 0, z: 0, radiusXZ: 1 }, { x: 0, z: 0, radiusXZ: 2 }];
        canonicalSort(dup);
        expect(dup.length).toBe(2);
    });
});

describe('buildSceneObstacles — determinism contract', () => {
    it('two builds with same logical input produce identical query results', () => {
        const treesA = [
            { x: 5, z: 0, radiusXZ: 1 },
            { x: -5, z: 0, radiusXZ: 1 },
            { x: 0, z: 5, radiusXZ: 1 },
        ];
        const treesB = [
            { x: 0, z: 5, radiusXZ: 1 },
            { x: 5, z: 0, radiusXZ: 1 },
            { x: -5, z: 0, radiusXZ: 1 },
        ];
        const obsA = buildSceneObstacles({ trees: treesA });
        const obsB = buildSceneObstacles({ trees: treesB });

        // Both should canonical-sort to the same order
        expect(JSON.stringify(obsA.trees)).toBe(JSON.stringify(obsB.trees));

        // Queries return identical results
        const qA = obsA.queryTrees({ x: 0, z: 0 }, 6);
        const qB = obsB.queryTrees({ x: 0, z: 0 }, 6);
        expect(JSON.stringify(qA)).toBe(JSON.stringify(qB));
    });
});

describe('buildSceneObstacles — kdbush radius queries', () => {
    const trees = [
        { x: 5, z: 0, radiusXZ: 1 },
        { x: -5, z: 0, radiusXZ: 1 },
        { x: 0, z: 5, radiusXZ: 1 },
        { x: 0, z: -5, radiusXZ: 1 },
        { x: 50, z: 50, radiusXZ: 1 },  // far
    ];

    it('returns all 4 nearby trees within 6m', () => {
        const obs = buildSceneObstacles({ trees });
        const result = obs.queryTrees({ x: 0, z: 0 }, 6);
        expect(result.length).toBe(4);
    });

    it('returns no trees within 1m radius (closest is 5m away)', () => {
        const obs = buildSceneObstacles({ trees });
        const result = obs.queryTrees({ x: 0, z: 0 }, 1);
        expect(result.length).toBe(0);
    });

    it('returns the far tree only when query is large enough', () => {
        const obs = buildSceneObstacles({ trees });
        const near = obs.queryTrees({ x: 50, z: 50 }, 1);
        expect(near.length).toBe(1);
        expect(near[0].x).toBe(50);
    });
});

describe('obstacleAvoidance', () => {
    it('zero force when entity is outside obstacle radius sum', () => {
        const force = obstacleAvoidance(
            { x: 10, z: 0 }, 0.5,
            [{ x: 0, z: 0, radiusXZ: 1 }]
        );
        expect(force.x).toBe(0);
        expect(force.z).toBe(0);
    });

    it('outward force when entity overlaps obstacle', () => {
        const force = obstacleAvoidance(
            { x: 0.5, z: 0 }, 0.5,
            [{ x: 0, z: 0, radiusXZ: 1 }]
        );
        // Entity at +x, obstacle at origin → force pushes +x
        expect(force.x).toBeGreaterThan(0);
        expect(force.z).toBe(0);
    });

    it('force scales with overlap depth', () => {
        const shallowOverlap = obstacleAvoidance(
            { x: 1.4, z: 0 }, 0.5,
            [{ x: 0, z: 0, radiusXZ: 1 }]
        );
        const deepOverlap = obstacleAvoidance(
            { x: 0.5, z: 0 }, 0.5,
            [{ x: 0, z: 0, radiusXZ: 1 }]
        );
        expect(deepOverlap.x).toBeGreaterThan(shallowOverlap.x);
    });
});

describe('pointInsideBuilding', () => {
    const buildings = [
        { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
        { minX: 100, maxX: 110, minZ: 100, maxZ: 110 },
    ];

    it('returns true for points inside any building', () => {
        expect(pointInsideBuilding({ x: 0, z: 0 }, buildings)).toBe(true);
        expect(pointInsideBuilding({ x: 105, z: 105 }, buildings)).toBe(true);
    });

    it('returns false for points outside all buildings', () => {
        expect(pointInsideBuilding({ x: 50, z: 50 }, buildings)).toBe(false);
    });

    it('respects margin', () => {
        expect(pointInsideBuilding({ x: 6, z: 0 }, buildings)).toBe(false);
        expect(pointInsideBuilding({ x: 6, z: 0 }, buildings, 2)).toBe(true);
    });
});

describe('emptyObstacles', () => {
    it('produces a queryable, harmless set', () => {
        const obs = emptyObstacles();
        expect(obs.trees.length).toBe(0);
        expect(obs.rocks.length).toBe(0);
        expect(obs.buildings.length).toBe(0);
        expect(obs.queryTrees({ x: 0, z: 0 }, 100)).toEqual([]);
        expect(obs.queryRocks({ x: 0, z: 0 }, 100)).toEqual([]);
    });
});
