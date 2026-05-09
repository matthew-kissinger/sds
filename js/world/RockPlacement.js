/**
 * Rock placement extracted from `TerrainBuilder.addEnvironmentDetails`
 * in Cycle 28 Stream B2. Reads `builder.zones`, `builder.sceneDef`,
 * `builder.models.rocks`, `builder.isInFarmHouseArea`, `builder._groundY`;
 * mutates `builder.rockPositions`, `builder.rocks`,
 * `builder.environmentDetails`; adds InstancedMesh2 instances to
 * `builder.scene`.
 *
 * Behavior is unchanged from the inline method — same Math.random()
 * sequence, same per-zone formation counts, same rock-type distribution,
 * same isObstacle / colliderRadius math.
 *
 * Note: rock placement currently uses Math.random() (not seeded). The
 * scatter-positions characterization golden parks rocks until a future
 * cycle extracts the placement to a deterministic shared/RockPlacement
 * module; in the meantime, this module preserves the existing visual
 * randomness 1:1.
 */

import * as THREE from 'three';
import { InstancedMesh2 } from '@three.ez/instanced-mesh';

/**
 * @param {object} builder TerrainBuilder instance.
 * @returns {Promise<Array>} Array of InstancedMesh2 created.
 */
export async function placeEnvironmentDetails(builder) {
    if (!builder.modelsLoaded) {
        console.warn('Models not loaded yet. Loading models...');
        await builder.loadModels();
    }

    // Reset rock-position tracker — populated as rocks are placed below.
    // `createTrees` reads this list to exclude tree candidates that would
    // spawn on top of a big rock formation.
    builder.rockPositions = [];

    const rockInstances = {
        rock1: [], // small rocks
        rock2: [], // medium rocks
        rock3: []  // large rocks/formations
    };

    // Helper for gaussian distribution
    const randomGaussian = () => {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };

    // Improved rock generation using geological formations
    const createRockFormation = (centerX, centerZ, formationType = 'cluster') => {
        const rocks = [];

        if (formationType === 'cluster') {
            // Circular cluster with density falloff
            const numRocks = 5 + Math.floor(Math.random() * 10);
            const radius = 30 + Math.random() * 40;

            for (let i = 0; i < numRocks; i++) {
                const angle = Math.random() * Math.PI * 2;
                // Use gaussian distribution for more natural clustering
                const dist = Math.abs(randomGaussian()) * radius * 0.5;
                const x = centerX + Math.cos(angle) * dist;
                const z = centerZ + Math.sin(angle) * dist;

                rocks.push({ x, z, scale: 0.7 + Math.random() * 0.6 });
            }
        } else if (formationType === 'line') {
            // Linear formation (like a ridge)
            const length = 50 + Math.random() * 100;
            const angle = Math.random() * Math.PI * 2;
            const numRocks = 8 + Math.floor(Math.random() * 12);

            for (let i = 0; i < numRocks; i++) {
                const t = (i / (numRocks - 1)) - 0.5;
                const offset = (Math.random() - 0.5) * 20;
                const x = centerX + Math.cos(angle) * t * length + Math.sin(angle) * offset;
                const z = centerZ + Math.sin(angle) * t * length + Math.cos(angle) * offset;

                rocks.push({ x, z, scale: 0.8 + Math.random() * 0.4 });
            }
        } else if (formationType === 'field') {
            // Scattered field with variable density
            const width = 80 + Math.random() * 80;
            const height = 80 + Math.random() * 80;
            const numRocks = 15 + Math.floor(Math.random() * 20);

            for (let i = 0; i < numRocks; i++) {
                const x = centerX + (Math.random() - 0.5) * width;
                const z = centerZ + (Math.random() - 0.5) * height;

                rocks.push({ x, z, scale: 0.6 + Math.random() * 0.8 });
            }
        }

        return rocks;
    };

    // Cycle 5+ island scenes: rocks stay on the land (inside the safe radius),
    // corral kept clear. Same inversion as createTrees.
    const islandBoundary = builder.sceneDef?.boundary?.kind === 'island' ? builder.sceneDef.boundary : null;

    // Generate rock formations in different zones. Island scenes get fewer +
    // smaller rocks (no horizon zone since that's water; no boulders/rock3-
    // scale since playtest 2026-04-25 flagged the big rocks as unwelcome).
    const zones = islandBoundary
        ? [
            // Only nearField + midField on islands (rest is water)
            { zone: builder.zones.nearField, formations: 1, types: ['cluster'], scaleRange: { min: 4, max: 7 } },
            { zone: builder.zones.midField, formations: 2, types: ['cluster'], scaleRange: { min: 5, max: 9 } },
        ]
        : [
            { zone: builder.zones.nearField, formations: 2, types: ['cluster'], scaleRange: { min: 8, max: 15 } },
            { zone: builder.zones.midField, formations: 4, types: ['cluster', 'line'], scaleRange: { min: 10, max: 20 } },
            { zone: builder.zones.farField, formations: 6, types: ['cluster', 'line', 'field'], scaleRange: { min: 15, max: 30 } },
            { zone: builder.zones.horizon, formations: 8, types: ['field', 'line'], scaleRange: { min: 25, max: 50 } }
        ];

    // Get current play area for rock exclusion
    const playArea = builder.zones.playArea;
    const corral = builder.sceneDef?.corral || null;
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
        const r = corral.radius + 8;  // bigger margin for rocks (large footprint)
        return (dx * dx + dz * dz) < r * r;
    };

    zones.forEach(({ zone, formations, types, scaleRange }) => {
        for (let f = 0; f < formations; f++) {
            const centerX = zone.minX + Math.random() * (zone.maxX - zone.minX);
            const centerZ = zone.minZ + Math.random() * (zone.maxZ - zone.minZ);

            if (islandBoundary) {
                // Island scene — must be on land, away from corral
                if (isInWater(centerX, centerZ)) continue;
                if (isInCorralKeepout(centerX, centerZ)) continue;
            } else {
                // Legacy rect scene — exclude play area
                const buffer = 50;
                if (centerX >= playArea.minX - buffer && centerX <= playArea.maxX + buffer &&
                    centerZ >= playArea.minZ - buffer && centerZ <= playArea.maxZ + buffer) continue;
            }

            // Skip if in farm house area
            if (builder.isInFarmHouseArea(centerX, centerZ)) continue;

            const formationType = types[Math.floor(Math.random() * types.length)];
            const formation = createRockFormation(centerX, centerZ, formationType);

            formation.forEach(rock => {
                if (islandBoundary) {
                    // Island scene — drop rocks that drifted outside the safe radius or into the corral
                    if (isInWater(rock.x, rock.z)) return;
                    if (isInCorralKeepout(rock.x, rock.z)) return;
                } else {
                    // Legacy rect — too-close-to-play-area exclusion. Cycle 11
                    // tightened buffer 20 → 40 after a playtest flagged rocks
                    // landing on the inside edge of the perimeter fence on
                    // Home Field.
                    const rockBuffer = 40;
                    if (rock.x >= playArea.minX - rockBuffer && rock.x <= playArea.maxX + rockBuffer &&
                        rock.z >= playArea.minZ - rockBuffer && rock.z <= playArea.maxZ + rockBuffer) return;
                }

                if (builder.isInFarmHouseArea(rock.x, rock.z)) return;

                // Determine rock type based on size. Island scenes skip rock3
                // (boulders) entirely — playtest 2026-04-25 flagged the big
                // formations as unwelcome on a tight playable island.
                const size = Math.random();
                let rockType;
                if (islandBoundary) {
                    rockType = size < 0.75 ? 'rock1' : 'rock2';
                } else {
                    if (size < 0.5) rockType = 'rock1';
                    else if (size < 0.8) rockType = 'rock2';
                    else rockType = 'rock3';
                }

                const baseScale = scaleRange.min + Math.random() * (scaleRange.max - scaleRange.min);
                const finalScale = baseScale * rock.scale;

                // Always partially bury rocks. Cycle 14 Phase 4 compensates for
                // the GLB's pivot via modelBaseYOffset (Quaternius rocks pivot
                // at centroid, not base). The lift is multiplied by the Y-scale
                // factor so the lowest visible vertex lands exactly on terrain
                // Y. Bury is in world units so it feels consistent across scale
                // variance.
                const ROCK_Y_SCALE = 0.7;
                const baseY = builder._groundY(rock.x, rock.z);
                const baseOffset = builder.models.rocks[rockType]?.userData?.modelBaseYOffset ?? 0;
                const yOffset = baseY + baseOffset * finalScale * ROCK_Y_SCALE - finalScale * (0.03 + Math.random() * 0.03);

                rockInstances[rockType].push({
                    position: new THREE.Vector3(rock.x, yOffset, rock.z),
                    rotation: new THREE.Euler(
                        Math.random() * Math.PI * 0.3,
                        Math.random() * Math.PI * 2,
                        Math.random() * Math.PI * 0.3
                    ),
                    scale: new THREE.Vector3(finalScale, finalScale * ROCK_Y_SCALE, finalScale * 1.2)
                });

                // Cycle 6 Phase 2 / Q3 (fallback): isObstacle marks rocks big
                // enough to collide with (per-rock multiplier ≥ 0.8). Smaller
                // rocks remain decorative — including them as colliders made
                // the world feel like an obstacle course. Visual footprint
                // radius covers tree-exclusion; collider radius is half the
                // visual since rocks are partially buried + rounded.
                builder.rockPositions.push({
                    x: rock.x,
                    z: rock.z,
                    radius: finalScale * 1.2,
                    isObstacle: rock.scale >= 0.8,
                    colliderRadius: finalScale * 0.55
                });
            });
        }
    });

    // Create instanced meshes for each rock type. Cycle 19 follow-up:
    // migrated from THREE.InstancedMesh → InstancedMesh2 so we get
    // per-instance CPU frustum culling.
    const instancedMeshes = [];

    Object.entries(rockInstances).forEach(([rockType, instances]) => {
        if (instances.length === 0 || !builder.models.rocks[rockType]) return;

        const model = builder.models.rocks[rockType];

        model.traverse(child => {
            if (child.isMesh) {
                const instancedMesh = new InstancedMesh2(
                    child.geometry,
                    child.material,
                    { capacity: instances.length, createEntities: false }
                );
                // Cycle 12 Phase 1 A8: geometry/material shared with the cached
                // GLB. Tag so clearRocks() does not dispose.
                instancedMesh.userData.sharedFromGlbCache = true;

                instancedMesh.addInstances(instances.length, (obj, i) => {
                    const inst = instances[i];
                    obj.position.copy(inst.position);
                    obj.quaternion.setFromEuler(inst.rotation);
                    obj.scale.copy(inst.scale);
                });

                // Build the BVH that accelerates per-instance culling. Rocks
                // are static (no per-frame position updates), so the BVH never
                // needs to rebuild.
                instancedMesh.computeBVH({ margin: 0 });

                // Disable rock shadows on mobile
                instancedMesh.castShadow = !builder.isMobile;
                instancedMesh.receiveShadow = true;

                builder.scene.add(instancedMesh);
                instancedMeshes.push(instancedMesh);
            }
        });

        console.log(`[BUILD] Created ${instances.length} ${rockType} instances (InstancedMesh2 + BVH)`);
    });

    builder.rocks = instancedMeshes;
    builder.environmentDetails = instancedMeshes; // Keep compatibility
    const totalRocks = Object.values(rockInstances).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`[BUILD] Total rocks created: ${totalRocks} using instanced rendering`);

    return instancedMeshes;
}
