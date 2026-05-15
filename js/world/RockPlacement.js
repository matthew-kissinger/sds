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
 * The pure placement plan accepts an injected RNG. Production still passes
 * Math.random() so current visual randomness stays unchanged; diagnostics can
 * pass a seeded RNG without carrying a hand-copied formation mirror.
 */

import * as THREE from 'three';
import { InstancedMesh2 } from '@three.ez/instanced-mesh';
import { generateRockPlacementPlan } from './rockPlacementPlan.js';

/**
 * @param {object} builder TerrainBuilder instance.
 * @returns {Promise<Array>} Array of InstancedMesh2 created.
 */
export async function placeEnvironmentDetails(builder) {
    if (!builder.modelsLoaded) {
        console.warn('Models not loaded yet. Loading models...');
        await builder.loadModels();
    }

    const modelBaseYOffsets = Object.fromEntries(
        Object.entries(builder.models.rocks)
            .map(([rockType, model]) => [rockType, model?.userData?.modelBaseYOffset ?? 0])
    );
    const placementPlan = generateRockPlacementPlan({
        zones: builder.zones,
        sceneDef: builder.sceneDef,
        rng: Math.random,
        isInFarmHouseArea: (x, z) => builder.isInFarmHouseArea(x, z),
        groundY: (x, z) => builder._groundY(x, z),
        modelBaseYOffsets,
    });
    const rockInstances = placementPlan.rockInstances;
    builder.rockPositions = placementPlan.rockPositions;

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
                    obj.position.set(inst.position.x, inst.position.y, inst.position.z);
                    obj.quaternion.setFromEuler(new THREE.Euler(inst.rotation.x, inst.rotation.y, inst.rotation.z));
                    obj.scale.set(inst.scale.x, inst.scale.y, inst.scale.z);
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
    const totalRocks = placementPlan.totalRocks;
    console.log(`[BUILD] Total rocks created: ${totalRocks} using instanced rendering`);

    return instancedMeshes;
}
