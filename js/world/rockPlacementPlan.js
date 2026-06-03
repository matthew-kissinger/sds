// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
export const ROCK_Y_SCALE = 0.7;
export const ROCK_Z_SCALE = 1.2;

function randomGaussian(rng) {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function createRockFormation(centerX, centerZ, formationType, rng) {
    const rocks = [];

    if (formationType === 'cluster') {
        const numRocks = 5 + Math.floor(rng() * 10);
        const radius = 30 + rng() * 40;

        for (let i = 0; i < numRocks; i++) {
            const angle = rng() * Math.PI * 2;
            const dist = Math.abs(randomGaussian(rng)) * radius * 0.5;
            const x = centerX + Math.cos(angle) * dist;
            const z = centerZ + Math.sin(angle) * dist;

            rocks.push({ x, z, scale: 0.7 + rng() * 0.6 });
        }
    } else if (formationType === 'line') {
        const length = 50 + rng() * 100;
        const angle = rng() * Math.PI * 2;
        const numRocks = 8 + Math.floor(rng() * 12);

        for (let i = 0; i < numRocks; i++) {
            const t = (i / (numRocks - 1)) - 0.5;
            const offset = (rng() - 0.5) * 20;
            const x = centerX + Math.cos(angle) * t * length + Math.sin(angle) * offset;
            const z = centerZ + Math.sin(angle) * t * length + Math.cos(angle) * offset;

            rocks.push({ x, z, scale: 0.8 + rng() * 0.4 });
        }
    } else if (formationType === 'field') {
        const width = 80 + rng() * 80;
        const height = 80 + rng() * 80;
        const numRocks = 15 + Math.floor(rng() * 20);

        for (let i = 0; i < numRocks; i++) {
            const x = centerX + (rng() - 0.5) * width;
            const z = centerZ + (rng() - 0.5) * height;

            rocks.push({ x, z, scale: 0.6 + rng() * 0.8 });
        }
    }

    return rocks;
}

export function createRockPlacementZones(zones, sceneDef) {
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

function isInRect(point, rect, buffer = 0) {
    return point.x >= rect.minX - buffer
        && point.x <= rect.maxX + buffer
        && point.z >= rect.minZ - buffer
        && point.z <= rect.maxZ + buffer;
}

export function generateRockPlacementPlan({
    zones,
    sceneDef,
    rng = Math.random,
    isInFarmHouseArea = () => false,
    groundY = () => 0,
    modelBaseYOffsets = {},
} = {}) {
    const rockInstances = {
        rock1: [],
        rock2: [],
        rock3: [],
    };
    const rockPositions = [];
    const placements = [];
    const islandBoundary = sceneDef?.boundary?.kind === 'island' ? sceneDef.boundary : null;
    const playArea = zones.playArea;
    const corral = sceneDef?.corral || null;
    const islandSafeRadius = islandBoundary
        ? islandBoundary.radius - islandBoundary.falloff - 4
        : 0;

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
        const r = corral.radius + 8;
        return (dx * dx + dz * dz) < r * r;
    };

    for (const { zone, formations, types, scaleRange } of createRockPlacementZones(zones, sceneDef)) {
        for (let f = 0; f < formations; f++) {
            const centerX = zone.minX + rng() * (zone.maxX - zone.minX);
            const centerZ = zone.minZ + rng() * (zone.maxZ - zone.minZ);

            if (islandBoundary) {
                if (isInWater(centerX, centerZ)) continue;
                if (isInCorralKeepout(centerX, centerZ)) continue;
            } else if (isInRect({ x: centerX, z: centerZ }, playArea, 50)) {
                continue;
            }

            if (isInFarmHouseArea(centerX, centerZ)) continue;

            const formationType = types[Math.floor(rng() * types.length)];
            const formation = createRockFormation(centerX, centerZ, formationType, rng);

            for (const rock of formation) {
                if (islandBoundary) {
                    if (isInWater(rock.x, rock.z)) continue;
                    if (isInCorralKeepout(rock.x, rock.z)) continue;
                } else if (isInRect(rock, playArea, 40)) {
                    continue;
                }

                if (isInFarmHouseArea(rock.x, rock.z)) continue;

                const size = rng();
                const rockType = islandBoundary
                    ? (size < 0.75 ? 'rock1' : 'rock2')
                    : (size < 0.5 ? 'rock1' : size < 0.8 ? 'rock2' : 'rock3');
                const baseScale = scaleRange.min + rng() * (scaleRange.max - scaleRange.min);
                const finalScale = baseScale * rock.scale;
                const baseY = groundY(rock.x, rock.z);
                const baseOffset = modelBaseYOffsets[rockType] ?? 0;
                const yOffset = baseY + baseOffset * finalScale * ROCK_Y_SCALE - finalScale * (0.03 + rng() * 0.03);
                const rotation = {
                    x: rng() * Math.PI * 0.3,
                    y: rng() * Math.PI * 2,
                    z: rng() * Math.PI * 0.3,
                };
                const scale = {
                    x: finalScale,
                    y: finalScale * ROCK_Y_SCALE,
                    z: finalScale * ROCK_Z_SCALE,
                };
                const obstacle = {
                    x: rock.x,
                    z: rock.z,
                    radius: finalScale * 1.2,
                    isObstacle: rock.scale >= 0.8,
                    colliderRadius: finalScale * 0.55,
                };
                const placement = {
                    sourceIndex: placements.length,
                    type: rockType,
                    formationScale: rock.scale,
                    finalScale,
                    position: { x: rock.x, y: yOffset, z: rock.z },
                    rotation,
                    scale,
                    obstacle,
                };

                rockInstances[rockType].push(placement);
                rockPositions.push(obstacle);
                placements.push(placement);
            }
        }
    }

    return {
        rockInstances,
        rockPositions,
        placements,
        totalRocks: placements.length,
    };
}
