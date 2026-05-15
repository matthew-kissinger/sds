import { loadScene as loadSceneDef } from '../../shared/scenes/index.js';
import { mulberry32 } from '../../shared/Random.js';

export const DIAGNOSTIC_ROCK_PLACEMENT_SCENE_ID = 'field';
const DIAGNOSTIC_ROCK_PLACEMENT_MAX_ROCKS = 6;
const ROCK_Y_SCALE = 0.7;
const ROCK_Z_SCALE = 1.2;
const ROCK_PLACEMENT_SEED_OFFSET = 0x526f636b;

function randomGaussian(rng) {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function round(value) {
    return Number(value.toFixed(4));
}

function createRockFormation(centerX, centerZ, formationType, rng) {
    const rocks = [];

    if (formationType === 'cluster') {
        const numRocks = 5 + Math.floor(rng() * 10);
        const radius = 30 + rng() * 40;
        for (let i = 0; i < numRocks; i++) {
            const angle = rng() * Math.PI * 2;
            const dist = Math.abs(randomGaussian(rng)) * radius * 0.5;
            rocks.push({
                x: centerX + Math.cos(angle) * dist,
                z: centerZ + Math.sin(angle) * dist,
                scale: 0.7 + rng() * 0.6,
            });
        }
    } else if (formationType === 'line') {
        const length = 50 + rng() * 100;
        const angle = rng() * Math.PI * 2;
        const numRocks = 8 + Math.floor(rng() * 12);
        for (let i = 0; i < numRocks; i++) {
            const t = (i / (numRocks - 1)) - 0.5;
            const offset = (rng() - 0.5) * 20;
            rocks.push({
                x: centerX + Math.cos(angle) * t * length + Math.sin(angle) * offset,
                z: centerZ + Math.sin(angle) * t * length + Math.cos(angle) * offset,
                scale: 0.8 + rng() * 0.4,
            });
        }
    } else if (formationType === 'field') {
        const width = 80 + rng() * 80;
        const height = 80 + rng() * 80;
        const numRocks = 15 + Math.floor(rng() * 20);
        for (let i = 0; i < numRocks; i++) {
            rocks.push({
                x: centerX + (rng() - 0.5) * width,
                z: centerZ + (rng() - 0.5) * height,
                scale: 0.6 + rng() * 0.8,
            });
        }
    }

    return rocks;
}

function isInRect(point, rect, buffer = 0) {
    return point.x >= rect.minX - buffer
        && point.x <= rect.maxX + buffer
        && point.z >= rect.minZ - buffer
        && point.z <= rect.maxZ + buffer;
}

function createRockZones(sceneDef) {
    const zones = sceneDef?.terrain?.zones;
    const islandBoundary = sceneDef?.boundary?.kind === 'island' ? sceneDef.boundary : null;
    if (islandBoundary) {
        return [
            { zone: zones.nearField, formations: 1, types: ['cluster'], scaleRange: { min: 4, max: 7 } },
            { zone: zones.midField, formations: 2, types: ['cluster'], scaleRange: { min: 5, max: 9 } },
        ];
    }

    return [
        { zone: zones.nearField, formations: 2, types: ['cluster'], scaleRange: { min: 8, max: 15 } },
        { zone: zones.midField, formations: 4, types: ['cluster', 'line'], scaleRange: { min: 10, max: 20 } },
        { zone: zones.farField, formations: 6, types: ['cluster', 'line', 'field'], scaleRange: { min: 15, max: 30 } },
        { zone: zones.horizon, formations: 8, types: ['field', 'line'], scaleRange: { min: 25, max: 50 } },
    ];
}

function generateDiagnosticRocks(sceneDef, seed) {
    const rng = mulberry32(seed + ROCK_PLACEMENT_SEED_OFFSET);
    const zones = sceneDef?.terrain?.zones;
    const playArea = zones.playArea;
    const farmHouseArea = sceneDef?.farmHouse?.exclusionArea ?? null;
    const corral = sceneDef?.corral ?? null;
    const islandBoundary = sceneDef?.boundary?.kind === 'island' ? sceneDef.boundary : null;
    const islandSafeRadius = islandBoundary ? islandBoundary.radius - islandBoundary.falloff - 4 : 0;
    const results = [];

    const isInWater = (x, z) => {
        if (!islandBoundary) return false;
        const dx = x - islandBoundary.center.x;
        const dz = z - islandBoundary.center.z;
        return (dx * dx + dz * dz) > islandSafeRadius * islandSafeRadius;
    };
    const isInCorralKeepout = (x, z) => {
        if (!corral) return false;
        const dx = x - corral.center.x;
        const dz = z - corral.center.z;
        const radius = corral.radius + 8;
        return (dx * dx + dz * dz) < radius * radius;
    };

    for (const { zone, formations, types, scaleRange } of createRockZones(sceneDef)) {
        for (let f = 0; f < formations; f++) {
            const centerX = zone.minX + rng() * (zone.maxX - zone.minX);
            const centerZ = zone.minZ + rng() * (zone.maxZ - zone.minZ);
            const center = { x: centerX, z: centerZ };

            if (islandBoundary) {
                if (isInWater(centerX, centerZ) || isInCorralKeepout(centerX, centerZ)) continue;
            } else if (isInRect(center, playArea, 50)) {
                continue;
            }
            if (farmHouseArea && isInRect(center, farmHouseArea)) continue;

            const formationType = types[Math.floor(rng() * types.length)];
            const formation = createRockFormation(centerX, centerZ, formationType, rng);
            for (const rock of formation) {
                if (islandBoundary) {
                    if (isInWater(rock.x, rock.z) || isInCorralKeepout(rock.x, rock.z)) continue;
                } else if (isInRect(rock, playArea, 40)) {
                    continue;
                }
                if (farmHouseArea && isInRect(rock, farmHouseArea)) continue;

                const size = rng();
                const type = islandBoundary
                    ? (size < 0.75 ? 'rock1' : 'rock2')
                    : (size < 0.5 ? 'rock1' : size < 0.8 ? 'rock2' : 'rock3');
                const baseScale = scaleRange.min + rng() * (scaleRange.max - scaleRange.min);
                const finalScale = baseScale * rock.scale;

                results.push({
                    sourceIndex: results.length,
                    type,
                    x: round(rock.x),
                    z: round(rock.z),
                    scale: round(finalScale),
                    rotationX: round(rng() * Math.PI * 0.3),
                    rotationY: round(rng() * Math.PI * 2),
                    rotationZ: round(rng() * Math.PI * 0.3),
                    formationScale: round(rock.scale),
                });
            }
        }
    }

    return results;
}

function sampleRocks(rocks, maxRendered) {
    const byType = new Map();
    for (const rock of rocks) {
        if (!byType.has(rock.type)) byType.set(rock.type, []);
        byType.get(rock.type).push(rock);
    }
    const types = [...byType.keys()].sort();
    const samples = [];
    while (samples.length < maxRendered) {
        let added = false;
        for (const type of types) {
            const next = byType.get(type).shift();
            if (!next) continue;
            samples.push(next);
            added = true;
            if (samples.length >= maxRendered) break;
        }
        if (!added) break;
    }
    return samples;
}

function rockSample(sample) {
    return {
        sourceIndex: sample.sourceIndex,
        type: sample.type,
        production: {
            x: sample.x,
            z: sample.z,
            scale: sample.scale,
            rotationX: sample.rotationX,
            rotationY: sample.rotationY,
            rotationZ: sample.rotationZ,
            scaleY: ROCK_Y_SCALE,
            scaleZ: ROCK_Z_SCALE,
            radius: Number((sample.scale * 1.2).toFixed(3)),
            colliderRadius: Number((sample.scale * 0.55).toFixed(3)),
            isObstacle: sample.formationScale >= 0.8,
        },
    };
}

export function createDiagnosticRockPlacementPlan({
    sceneId = DIAGNOSTIC_ROCK_PLACEMENT_SCENE_ID,
    maxRendered = DIAGNOSTIC_ROCK_PLACEMENT_MAX_ROCKS,
} = {}) {
    const sceneDef = loadSceneDef(sceneId);
    const seed = sceneDef?.terrain?.seed ?? 0;
    const rocks = generateDiagnosticRocks(sceneDef, seed);
    const samples = sampleRocks(rocks, maxRendered).map(rockSample);

    return {
        ok: samples.length > 0,
        sceneId: sceneDef.id,
        seed,
        rng: 'mulberry32(sceneSeed + Rock)',
        source: 'diagnostic-rock-placement-generated-from-scene-zones',
        productionReference: 'js/world/RockPlacement.js rockInstances transform contract',
        obstacleContract: 'recorded-only-not-wired-to-shared/SceneObstacles',
        generatedRocks: rocks.length,
        sampledRocks: samples.length,
        types: [...new Set(samples.map((sample) => sample.type))].sort(),
        samples,
    };
}
