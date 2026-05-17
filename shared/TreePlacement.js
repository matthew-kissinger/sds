/**
 * TreePlacement — deterministic Poisson-disk tree placement.
 *
 * Lifted from client `js/TerrainBuilder.createTrees` (Cycle 5) into shared/
 * so client (visual mesh) and Worker (collision data) compute the SAME
 * tree positions from the same seed.
 *
 * Identical seed → identical TreeInstance[] across V8 instances. The contract
 * relies on `mulberry32` from shared/Random.js (no Math.random calls inside).
 *
 * Cycle 6 Phase 3 adds woods-zone density biasing: inside any
 * WoodsZoneDef circle, min-distance shrinks (denser); outside (only when
 * zones are non-empty), it grows (sparser). Scenes without woodsZones
 * (Field, Rolling Hills) get the original uniform sampler.
 *
 * @typedef {Object} TreeInstance
 * @property {number} x
 * @property {number} z
 * @property {'tree1'|'tree2'} type
 * @property {number} scale         Final placement scale (zone scale * 0.7..1.3 variation)
 * @property {number} rotationY     Radians
 * @property {number} radiusXZ      Trunk collision radius (1.8m fixed — Q2 decision)
 */

import { canonicalSort } from './SceneObstacles.js';

const TRUNK_RADIUS_XZ = 1.8;
const TREE_CANOPY_RADIUS_BY_TYPE = Object.freeze({
    tree1: 0.36,
    tree2: 0.44
});
export const TREE_CANOPY_SPACING_PADDING = 3;

const ZONES = [
    { name: 'nearField', minDist: 25, maxDist: 40, scale: 15.0 },
    { name: 'midField',  minDist: 30, maxDist: 50, scale: 20.0 },
    { name: 'farField',  minDist: 35, maxDist: 60, scale: 25.0 },
    { name: 'horizon',   minDist: 40, maxDist: 70, scale: 30.0 },
];

// Cycle 20 Phase 2 v2 (2026-05-04): relaxed `INSIDE_FACTOR` 0.60 → 0.85.
// At zone-scale ~15-30m and tree canopy ~10-21m wide, the previous 0.6×
// shrunk min-distance below the canopy diameter, producing visible
// canopy-overlap clumping in OC woods (Matt's review post-tilt-fix).
// 0.85 keeps "denser inside the woods than outside" without overlapping
// canopies. OUTSIDE_FACTOR 1.4 → 1.5 widens the field-spaced trees a touch
// more so the inside/outside contrast still reads as intentional zoning.
//
// Cycle 21 Phase 0 (2026-05-04): bump INSIDE_FACTOR 0.85 → 0.92. Even at
// 0.85, dense rows of OC woods still showed visible canopy overlap from
// classic-camera high-pitch — the +40% Aspen leaf bump (paired Phase 0
// change) widens canopies further, so the placement Poisson radius needs
// to widen in lockstep to keep groves from reading as one big blob.
const WOODS_INSIDE_FACTOR = 0.92;
const WOODS_OUTSIDE_FACTOR = 1.5;

/**
 * Visual canopy footprint radius (m). Separate from trunk collision radius so
 * gameplay keeps the Q2 trunk contract while rendering rejects leaf overlap.
 *
 * @param {TreeInstance} tree
 * @returns {number}
 */
export function getTreeCanopyRadius(tree) {
    const radius = TREE_CANOPY_RADIUS_BY_TYPE[tree.type] ?? 0.4;
    return radius * tree.scale;
}

/**
 * Cross-zone acceptance pass. The per-zone Poisson samplers are still useful
 * candidate generators, but scene zones are nested; this pass enforces the
 * final visual footprint across all candidates.
 *
 * @param {TreeInstance[]} trees
 * @returns {TreeInstance[]}
 */
function filterCanopyOverlaps(trees) {
    const candidates = trees
        .map((tree, index) => ({ tree, index }))
        .sort((a, b) => b.tree.scale - a.tree.scale || a.index - b.index);
    /** @type {TreeInstance[]} */
    const accepted = [];

    for (const { tree } of candidates) {
        const radius = getTreeCanopyRadius(tree);
        let valid = true;
        for (const other of accepted) {
            const dx = tree.x - other.x;
            const dz = tree.z - other.z;
            const minDist = radius + getTreeCanopyRadius(other) + TREE_CANOPY_SPACING_PADDING;
            if (dx * dx + dz * dz < minDist * minDist) {
                valid = false;
                break;
            }
        }
        if (valid) accepted.push(tree);
    }

    canonicalSort(accepted);
    return accepted;
}

/**
 * @param {{x: number, z: number}} p
 * @param {import('./scenes/types.js').WoodsZoneDef[]} zones
 * @returns {boolean}
 */
function isInsideAnyWoodsZone(p, zones) {
    for (const zone of zones) {
        const dx = p.x - zone.center.x;
        const dz = p.z - zone.center.z;
        if (dx * dx + dz * dz <= zone.radius * zone.radius) return true;
    }
    return false;
}

/**
 * Per-candidate min-distance scalar based on woods-zone presence. Returns
 * a multiplier applied to the zone's nominal min-distance.
 */
function woodsBias(point, woodsZones) {
    if (!woodsZones || woodsZones.length === 0) return 1;
    return isInsideAnyWoodsZone(point, woodsZones) ? WOODS_INSIDE_FACTOR : WOODS_OUTSIDE_FACTOR;
}

/**
 * Organic biome boundaries — same sine-wave logic the legacy client used.
 * Drives the tree-type pick (tree1/tree2) given a candidate position.
 * Cycle 22: pine species removed; biomes now collapse to deciduous + mixed
 * (the old 'pine' biome ring becomes a wider deciduous fade).
 * @param {number} x
 * @param {number} z
 */
function getBiome(x, z) {
    const distFromCenter = Math.sqrt(x * x + z * z);
    const angle = Math.atan2(z, x);
    const wave1 = Math.sin(angle * 3 + distFromCenter * 0.01) * 50;
    const wave2 = Math.sin(angle * 5 - distFromCenter * 0.02) * 30;
    const adjustedDist = distFromCenter + wave1 + wave2;
    // Cycle 22: pine biome removed. Outer rings collapse to mixed (tree1+tree2)
    // so the species split stays organic without introducing a third type.
    if (adjustedDist < 250) return 'mixed';
    if (adjustedDist < 350) return 'deciduous';
    return 'mixed';
}

/**
 * Generate canonically-sorted TreeInstance[] for a scene.
 * Pure function — no Math.random, no DOM, no Three.js. Same (scene, seed)
 * always returns the same array.
 *
 * @param {import('./scenes/types.js').SceneDef} scene
 * @param {() => number} rng - PRNG returning [0, 1) (e.g. `mulberry32(seed)`)
 * @param {Object} [opts]
 * @param {Array<{minX:number,maxX:number,minZ:number,maxZ:number}>} [opts.competitivePastures]
 *        Extra pastures (competitive mode) whose bbox + 15m buffer rejects trees.
 * @param {Array<{x:number,z:number,radius:number}>} [opts.rockPositions]
 *        Pre-placed rocks; trees within `rock.radius + 4m` are skipped.
 * @returns {TreeInstance[]}
 */
export function generateTrees(scene, rng, opts = {}) {
    const { competitivePastures = null, rockPositions = null } = opts;
    const zones = scene?.terrain?.zones;
    if (!zones) return [];

    const islandBoundary = scene?.boundary?.kind === 'island' ? scene.boundary : null;
    const corral = scene?.corral || null;
    const islandSafeRadius = islandBoundary
        ? islandBoundary.radius - islandBoundary.falloff - 4
        : 0;
    const woodsZones = scene?.woodsZones || [];
    const farmHouseExclusion = scene?.farmHouse?.exclusionArea || null;

    // Legacy default-pen exclusion (Field). Mirrors the client's hardcoded
    // `z > 100 && z < 135 && |x| < 35` reject — the exact rect of the
    // single-player pasture for back-compat with rect scenes.
    const isInDefaultPasture = (x, z) =>
        z > 100 && z < 135 && Math.abs(x) < 35;

    const isInCompetitivePasture = (x, z) => {
        if (!competitivePastures) return false;
        const buffer = 15;
        for (const p of competitivePastures) {
            if (x >= p.minX - buffer && x <= p.maxX + buffer &&
                z >= p.minZ - buffer && z <= p.maxZ + buffer) return true;
        }
        return false;
    };

    const isInFarmHouseArea = (x, z) => {
        if (!farmHouseExclusion) return false;
        return x >= farmHouseExclusion.minX && x <= farmHouseExclusion.maxX &&
               z >= farmHouseExclusion.minZ && z <= farmHouseExclusion.maxZ;
    };

    const isPointOnRock = (x, z) => {
        if (!rockPositions || rockPositions.length === 0) return false;
        const padding = 4;
        for (const r of rockPositions) {
            const rdx = x - r.x;
            const rdz = z - r.z;
            const rr = r.radius + padding;
            if (rdx * rdx + rdz * rdz < rr * rr) return true;
        }
        return false;
    };

    const playArea = zones.playArea;

    /**
     * Per-zone Poisson-disk sampler. Returns canonical-orderless points;
     * the caller canonical-sorts at the end of generateTrees.
     */
    const poissonDisk = (baseMinDistance, baseMaxDistance, zone) => {
        // Cell size chosen for the *smallest* possible local min-distance
        // so the spatial grid is fine enough for woods-zone densification.
        const minMinDistance = woodsZones.length > 0
            ? baseMinDistance * WOODS_INSIDE_FACTOR
            : baseMinDistance;
        const cellSize = minMinDistance / Math.sqrt(2);
        const grid = new Map();
        const points = [];
        const active = [];
        const k = 30;

        const isValidPoint = (x, z) => {
            if (x < zone.minX || x > zone.maxX || z < zone.minZ || z > zone.maxZ) return false;

            if (islandBoundary) {
                const dx = x - islandBoundary.center.x;
                const dz = z - islandBoundary.center.z;
                if (dx * dx + dz * dz > islandSafeRadius * islandSafeRadius) return false;
                if (corral) {
                    const cdx = x - corral.center.x;
                    const cdz = z - corral.center.z;
                    const cr = corral.radius + 5;
                    if (cdx * cdx + cdz * cdz < cr * cr) return false;
                }
            } else {
                if (isInDefaultPasture(x, z)) return false;
                if (isInCompetitivePasture(x, z)) return false;
                const buffer = 20;
                if (x >= playArea.minX - buffer && x <= playArea.maxX + buffer &&
                    z >= playArea.minZ - buffer && z <= playArea.maxZ + buffer) return false;
            }

            if (isInFarmHouseArea(x, z)) return false;
            if (isPointOnRock(x, z)) return false;

            // Local min-distance check, biased by woods zones
            const localMinDist = baseMinDistance * woodsBias({ x, z }, woodsZones);
            const gridX = Math.floor(x / cellSize);
            const gridZ = Math.floor(z / cellSize);
            // Need to look at neighbours that could host a point within localMinDist
            const reach = Math.ceil(localMinDist / cellSize);
            for (let dx = -reach; dx <= reach; dx++) {
                for (let dz = -reach; dz <= reach; dz++) {
                    const key = `${gridX + dx},${gridZ + dz}`;
                    const bucket = grid.get(key);
                    if (!bucket) continue;
                    for (const n of bucket) {
                        const ddx = n.x - x;
                        const ddz = n.z - z;
                        const dist = Math.sqrt(ddx * ddx + ddz * ddz);
                        // Use the larger of the two points' local min-dists so
                        // an inside-woods point near a sparse-zone point still
                        // respects the sparser spacing.
                        const otherLocal = baseMinDistance * woodsBias(n, woodsZones);
                        if (dist < Math.max(localMinDist, otherLocal)) return false;
                    }
                }
            }
            return true;
        };

        const addPoint = (x, z) => {
            const p = { x, z };
            points.push(p);
            active.push(p);
            const key = `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
            const bucket = grid.get(key);
            if (bucket) bucket.push(p);
            else grid.set(key, [p]);
            return p;
        };

        // Seed point. Up to 100 attempts — for islands the zone box is
        // larger than the valid land disc, so a single shot often lands in
        // water and the algorithm bails with zero trees. Cycle 5 fix.
        for (let attempt = 0; attempt < 100; attempt++) {
            const sx = zone.minX + rng() * (zone.maxX - zone.minX);
            const sz = zone.minZ + rng() * (zone.maxZ - zone.minZ);
            if (isValidPoint(sx, sz)) {
                addPoint(sx, sz);
                break;
            }
        }

        while (active.length > 0) {
            const idx = Math.floor(rng() * active.length);
            const current = active[idx];
            let placed = false;
            for (let n = 0; n < k; n++) {
                const angle = rng() * Math.PI * 2;
                const localMin = baseMinDistance * woodsBias(current, woodsZones);
                const localMax = baseMaxDistance * woodsBias(current, woodsZones);
                const distance = localMin + rng() * (localMax - localMin);
                const nx = current.x + Math.cos(angle) * distance;
                const nz = current.z + Math.sin(angle) * distance;
                if (isValidPoint(nx, nz)) {
                    addPoint(nx, nz);
                    placed = true;
                }
            }
            if (!placed) active.splice(idx, 1);
        }

        return points;
    };

    /** @type {TreeInstance[]} */
    const out = [];

    for (const z of ZONES) {
        const zoneRect = zones[z.name];
        if (!zoneRect) continue;
        const points = poissonDisk(z.minDist, z.maxDist, zoneRect);
        for (const p of points) {
            const biome = getBiome(p.x, p.z);
            let type;
            // Cycle 25 Phase G: per-scene tree distribution profile +
            // scaleVariation override. Falls back to legacy 60/40 +
            // 50/50 mix if profile not supplied.
            const profile = scene?.treeProfile;
            if (profile && typeof profile === 'object') {
                // profile is { tree1: p1, tree2: p2 } summing to ~1.
                const r = rng();
                type = r < (profile.tree1 ?? 0.5) ? 'tree1' : 'tree2';
            } else if (biome === 'deciduous') {
                type = rng() < 0.6 ? 'tree1' : 'tree2';
            } else {
                // mixed: 50/50 — Cycle 22 pine removal collapsed the
                // 30/30/40 (tree1/tree2/pine) split.
                type = rng() < 0.5 ? 'tree1' : 'tree2';
            }
            // Cycle 21 Phase 0 (2026-05-04): tighter scale jitter
            // 0.7-1.3 → 0.80-1.20. Pairs with the wider WOODS_INSIDE_FACTOR
            // to reduce towering-vs-tiny outliers that read as
            // unintentional asymmetry from chase-cam classic.
            // Cycle 25 Phase G: per-scene scaleJitter override. Field
            // gets 0.85-1.15 (manicured pasture); OC gets 0.75-1.30
            // (wild forest); RH stays at 0.80-1.20 (default).
            const jitter = scene?.treeScaleJitter ?? { min: 0.80, max: 1.20 };
            const scaleVariation = jitter.min + rng() * (jitter.max - jitter.min);
            const finalScale = z.scale * scaleVariation;
            const rotationY = rng() * Math.PI * 2;
            out.push({
                x: p.x,
                z: p.z,
                type,
                scale: finalScale,
                rotationY,
                radiusXZ: TRUNK_RADIUS_XZ,
            });
        }
    }

    return filterCanopyOverlaps(out);
}

/**
 * Tree trunk collision radius (m). Constant — Q2 decision: fixed 1.8m
 * matches the visual trunk on a 12-22m mesh-scale tree without
 * per-mesh authoring overhead.
 */
export const TREE_TRUNK_RADIUS = TRUNK_RADIUS_XZ;
