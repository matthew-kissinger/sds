import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { InstancedMesh2 } from '@three.ez/instanced-mesh';
import { configureGLTFLoader } from './TerrainBuilder.js';

/**
 * ScatterSystem — sibling to GrassSystem for ground-level detail props.
 *
 * Cycle 14 Phase 4: Quaternius Stylized Nature MegaKit (CC0) drives the
 * "alive meadow" feel called out in the rocks-and-scatter dossier:
 * pebbles + mushrooms + clovers + flowers scattered via Poisson-disk
 * sampling so density never reads as a regular grid. Yellow-flower
 * oversampling (5% of base points × 5–8 flowers per cluster in a 1.5m
 * radius) gives the eye-anchor punctuation Ghibli meadows lean on.
 *
 * Why a sibling system rather than a GrassSystem extension: timing /
 * wind / LOD coupling differ. Grass needs per-frame uniform updates
 * driven by interactor positions; scatter is mostly static once placed,
 * with at most a subtle wind sway on flora that piggybacks on the
 * existing tree-leaf-wind onBeforeCompile patch (TerrainBuilder.
 * _patchTreeWindMaterial). Flora gets the patch; mushrooms + pebbles
 * stay still.
 *
 * Rendering: one InstancedMesh2 per prop variant per child mesh. With
 * @three.ez/instanced-mesh's per-instance frustum culling, out-of-frame
 * scatter (which is most of the world from any single camera direction)
 * costs zero vertex shader work. Bbox-tight scenes tuck the scatter
 * pool inside a 200m circular zone (Field/RH) or shrink to fit the
 * island radius (OC), so density stays visually meaningful without
 * exploding the instance count past mid-tier mobile budgets.
 */

/**
 * Per-variant scatter configuration. `weight` drives the random
 * selection probability (sums to 100). `type` distinguishes flora
 * (gets the leaf-wind patch) from mushrooms / pebbles (no wind).
 *
 * Distribution per the rocks-and-scatter dossier rule of thumb:
 *   ~60% pebbles (visual noise)
 *   ~25% small flora (clovers + single flowers — the sway layer)
 *   ~15% mushrooms (punctuation accents)
 *
 * The yellow-flower oversampling on top of the base distribution adds
 * dandelion-cluster eye anchors without skewing the base ratio.
 */
const PROP_VARIANTS = [
    { name: 'pebble_round_1', path: 'assets/models/scatter/pebble_round_1.glb', weight: 20, type: 'pebble' },
    { name: 'pebble_round_2', path: 'assets/models/scatter/pebble_round_2.glb', weight: 20, type: 'pebble' },
    { name: 'pebble_round_3', path: 'assets/models/scatter/pebble_round_3.glb', weight: 20, type: 'pebble' },
    { name: 'mushroom_common', path: 'assets/models/scatter/mushroom_common.glb', weight: 7.5, type: 'mushroom' },
    { name: 'mushroom_laetiporus', path: 'assets/models/scatter/mushroom_laetiporus.glb', weight: 7.5, type: 'mushroom' },
    { name: 'clover_1', path: 'assets/models/scatter/clover_1.glb', weight: 6.25, type: 'flora' },
    { name: 'clover_2', path: 'assets/models/scatter/clover_2.glb', weight: 6.25, type: 'flora' },
    { name: 'flower_3_single', path: 'assets/models/scatter/flower_3_single.glb', weight: 6.25, type: 'flora' },
    { name: 'flower_4_single', path: 'assets/models/scatter/flower_4_single.glb', weight: 6.25, type: 'flora' }
];

// Variant used for the yellow-flower oversampling clusters. flower_4
// reads as the warmer, more saturated of the two single-flower assets
// in the MegaKit; if a future re-bake swaps colors, change this here.
const OVERSAMPLE_VARIANT = 'flower_4_single';

/**
 * Bridson-style Poisson-disk sampler within a circular area.
 * Returns array of [x, z] pairs, all ≥ minDist apart, all inside the
 * radius. ~30 LoC reference implementation; deterministic given a seeded
 * Math.random replacement, but currently uses unseeded random — fine
 * for visual scatter where we don't need byte-identical placement
 * across machines.
 *
 * @param {{ cx: number, cz: number, radius: number }} area
 * @param {number} minDist Minimum distance between samples.
 * @param {number} [maxAttempts=20] Per-active-sample attempts.
 * @returns {[number, number][]}
 */
function poissonDisk(area, minDist, maxAttempts = 20) {
    const cellSize = minDist / Math.SQRT2;
    const gridSize = Math.ceil((area.radius * 2) / cellSize) + 1;
    /** @type {Map<number, [number, number]>} sparse hashed grid */
    const grid = new Map();
    const samples = [];
    const active = [];

    const gridIdx = (x, z) => {
        const gx = Math.floor((x - area.cx + area.radius) / cellSize);
        const gz = Math.floor((z - area.cz + area.radius) / cellSize);
        return gz * gridSize + gx;
    };

    const insideRadius = (x, z) => {
        const dx = x - area.cx;
        const dz = z - area.cz;
        return dx * dx + dz * dz <= area.radius * area.radius;
    };

    const valid = (x, z) => {
        if (!insideRadius(x, z)) return false;
        const gx = Math.floor((x - area.cx + area.radius) / cellSize);
        const gz = Math.floor((z - area.cz + area.radius) / cellSize);
        for (let dgz = -2; dgz <= 2; dgz++) {
            for (let dgx = -2; dgx <= 2; dgx++) {
                const ngx = gx + dgx;
                const ngz = gz + dgz;
                if (ngx < 0 || ngz < 0 || ngx >= gridSize || ngz >= gridSize) continue;
                const p = grid.get(ngz * gridSize + ngx);
                if (!p) continue;
                const ddx = p[0] - x;
                const ddz = p[1] - z;
                if (ddx * ddx + ddz * ddz < minDist * minDist) return false;
            }
        }
        return true;
    };

    const seed = [area.cx, area.cz];
    samples.push(seed);
    active.push(seed);
    grid.set(gridIdx(seed[0], seed[1]), seed);

    while (active.length > 0) {
        const idx = (Math.random() * active.length) | 0;
        const [px, pz] = active[idx];
        let found = false;
        for (let i = 0; i < maxAttempts; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = minDist * (1 + Math.random()); // [minDist, 2*minDist]
            const x = px + Math.cos(angle) * r;
            const z = pz + Math.sin(angle) * r;
            if (valid(x, z)) {
                const sample = [x, z];
                samples.push(sample);
                active.push(sample);
                grid.set(gridIdx(x, z), sample);
                found = true;
                break;
            }
        }
        if (!found) {
            // Swap-and-pop removal — order doesn't matter, O(1).
            active[idx] = active[active.length - 1];
            active.pop();
        }
    }

    return samples;
}

export class ScatterSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {boolean} isMobile
     * @param {import('../shared/scenes/types.js').SceneDef | null} sceneDef
     * @param {import('../shared/terrain/Heightfield.js').Heightfield | null} heightfield
     * @param {import('../shared/scenes/types.js').BoundaryDef | null} boundary
     * @param {object} [hooks]
     * @param {(material: THREE.Material, minY: number, maxY: number) => void} [hooks.patchFloraWind]
     */
    constructor(scene, isMobile, sceneDef, heightfield, boundary, hooks = {}) {
        this.scene = scene;
        this.isMobile = isMobile;
        this.sceneDef = sceneDef;
        this.heightfield = heightfield;
        this.boundary = boundary || null;
        this.patchFloraWind = hooks.patchFloraWind || null;

        /** @type {Map<string, THREE.Group>} variant.name → loaded GLB scene */
        this.models = new Map();
        /** @type {InstancedMesh2[]} created per populate(); cleared on dispose */
        this.instancedMeshes = [];
        this.loader = configureGLTFLoader(new GLTFLoader());

        // Per-platform tuning. minDist drives Poisson density; the cap
        // is a safety net since dense sampling on a wide area can balloon.
        // Mobile leans sparser to keep the per-instance frustum cull cost
        // bounded.
        this.minDist = isMobile ? 6 : 4;
        this.cap = isMobile ? 800 : 2200;

        // Yellow-flower oversampling: pick this fraction of base samples
        // and place 5–8 flowers in a 1.5m radius around each. Per the
        // dossier, ~5% of points give the right cluster density without
        // tipping into "lawn of dandelions."
        this.oversampleFraction = 0.05;
        this.oversampleClusterMin = 5;
        this.oversampleClusterMax = 8;
        this.oversampleRadius = 1.5;

        /** @type {Array<{ minX: number, maxX: number, minZ: number, maxZ: number }>} */
        this.exclusionZones = [];
    }

    /**
     * Add an axis-aligned exclusion rect (farmhouse, pasture, etc.) so
     * scatter doesn't spawn inside structures or play-critical areas.
     */
    addExclusionZone(minX, maxX, minZ, maxZ) {
        this.exclusionZones.push({ minX, maxX, minZ, maxZ });
    }

    /**
     * Load every prop GLB in PROP_VARIANTS. Idempotent — re-invoking is
     * a no-op once models are cached.
     */
    async loadModels() {
        if (this.models.size === PROP_VARIANTS.length) return;
        await Promise.all(
            PROP_VARIANTS.map(async (variant) => {
                if (this.models.has(variant.name)) return;
                try {
                    const gltf = await this.loader.loadAsync(variant.path);
                    const root = gltf.scene;
                    // Bake child world transforms into geometries so an
                    // InstancedMesh-per-child correctly represents the
                    // prop's spatial layout. Same pattern as trees in
                    // TerrainBuilder.loadModels.
                    root.updateMatrixWorld(true);
                    let minY = Infinity;
                    let maxY = -Infinity;
                    root.traverse((child) => {
                        if (!child.isMesh || !child.geometry) return;
                        child.geometry = child.geometry.clone();
                        child.geometry.applyMatrix4(child.matrixWorld);
                        child.position.set(0, 0, 0);
                        child.quaternion.identity();
                        child.scale.set(1, 1, 1);
                        child.geometry.computeBoundingBox();
                        const bb = child.geometry.boundingBox;
                        if (bb && isFinite(bb.min.y)) {
                            if (bb.min.y < minY) minY = bb.min.y;
                            if (bb.max.y > maxY) maxY = bb.max.y;
                        }
                    });
                    if (!isFinite(minY)) { minY = 0; maxY = 1; }
                    root.userData.modelBboxMinY = minY;
                    root.userData.modelBboxMaxY = maxY;
                    this.models.set(variant.name, root);

                    // Apply leaf-wind patch to flora variants if a hook
                    // was provided. Mushrooms + pebbles stay unpatched.
                    if (variant.type === 'flora' && this.patchFloraWind) {
                        root.traverse((child) => {
                            if (!child.isMesh || !child.material) return;
                            const mats = Array.isArray(child.material) ? child.material : [child.material];
                            for (const m of mats) this.patchFloraWind(m, minY, maxY);
                        });
                    }
                } catch (err) {
                    console.warn(`[SCATTER] failed to load ${variant.path}:`, err.message);
                }
            })
        );
        console.log(`[SCATTER] loaded ${this.models.size}/${PROP_VARIANTS.length} prop variants`);
    }

    /**
     * Populate the scene with scatter instances. Call after loadModels()
     * + after the heightfield is set on TerrainBuilder so meshSampleY
     * places props on the visible mesh Y. Re-invoking after dispose() is
     * the supported re-population path.
     */
    populate() {
        if (this.instancedMeshes.length > 0) {
            console.warn('[SCATTER] populate() called with active instances; call dispose() first');
            return;
        }

        const radius = this._scatterRadius();
        const samples = poissonDisk({ cx: 0, cz: 0, radius }, this.minDist);
        // Cap. With minDist=4m on a 200m circle we get ~2500–3000; the
        // cap clips the long tail to keep mobile budgets predictable.
        if (samples.length > this.cap) samples.length = this.cap;

        // Apply exclusion filter — drop samples inside farmhouse / pasture
        // rects. Cheap O(N × Z) where Z is small (<=2 zones).
        const filtered = this.exclusionZones.length
            ? samples.filter(([x, z]) => !this._isExcluded(x, z))
            : samples;

        // Yellow-flower oversampling clusters.
        const oversamples = [];
        const oversampleN = Math.floor(filtered.length * this.oversampleFraction);
        for (let i = 0; i < oversampleN; i++) {
            const baseIdx = (Math.random() * filtered.length) | 0;
            const [bx, bz] = filtered[baseIdx];
            const count = this.oversampleClusterMin
                + Math.floor(Math.random() * (this.oversampleClusterMax - this.oversampleClusterMin + 1));
            for (let j = 0; j < count; j++) {
                const angle = Math.random() * Math.PI * 2;
                const r = Math.random() * this.oversampleRadius;
                const x = bx + Math.cos(angle) * r;
                const z = bz + Math.sin(angle) * r;
                if (!this._isExcluded(x, z)) oversamples.push([x, z]);
            }
        }

        // Assign each base sample a variant via weighted random; oversamples
        // all go to OVERSAMPLE_VARIANT.
        const totalWeight = PROP_VARIANTS.reduce((s, v) => s + v.weight, 0);
        /** @type {Map<string, [number, number][]>} */
        const byVariant = new Map();
        for (const v of PROP_VARIANTS) byVariant.set(v.name, []);

        for (const [x, z] of filtered) {
            let r = Math.random() * totalWeight;
            for (const v of PROP_VARIANTS) {
                r -= v.weight;
                if (r <= 0) {
                    byVariant.get(v.name).push([x, z]);
                    break;
                }
            }
        }
        const oversampleBucket = byVariant.get(OVERSAMPLE_VARIANT);
        if (oversampleBucket) for (const p of oversamples) oversampleBucket.push(p);

        // Build one InstancedMesh2 per (variant × child mesh). Variants
        // may have multiple child meshes (rare for scatter) — same pattern
        // as TerrainBuilder.createTrees.
        const dummy = new THREE.Object3D();
        for (const variant of PROP_VARIANTS) {
            const positions = byVariant.get(variant.name);
            if (!positions || positions.length === 0) continue;
            const model = this.models.get(variant.name);
            if (!model) continue;

            model.traverse((child) => {
                if (!child.isMesh) return;
                const inst = new InstancedMesh2(child.geometry, child.material, {
                    capacity: positions.length,
                    createEntities: false
                });
                // Cycle 12 Phase 1 A8: shared geometry+material with cached
                // GLB. clearScatter must remove-from-scene only.
                inst.userData.sharedFromGlbCache = true;
                inst.userData.scatterSystem = true;
                inst.userData.variantName = variant.name;

                inst.addInstances(positions.length, (obj, i) => {
                    const [x, z] = positions[i];
                    const y = this.heightfield ? this.heightfield.meshSampleY(x, z) : 0;
                    obj.position.set(x, y, z);
                    obj.rotation.y = Math.random() * Math.PI * 2;
                    // Per-instance scale jitter — pebbles/mushrooms
                    // benefit from variety, flora less so (their meshes
                    // are already varied).
                    const sJitter = variant.type === 'flora' ? 0.85 : 0.7;
                    const sRange = variant.type === 'flora' ? 0.3 : 0.6;
                    const s = sJitter + Math.random() * sRange;
                    obj.scale.setScalar(s);
                    obj.updateMatrix();
                    // InstancedMesh2's addInstances callback receives a
                    // helper Object3D — we don't need to call updateMatrix
                    // explicitly since the host class composes the matrix
                    // from position/rotation/scale during finalize.
                });

                inst.castShadow = false;
                inst.receiveShadow = !this.isMobile;
                this.scene.add(inst);
                this.instancedMeshes.push(inst);
            });
        }

        const totalPlaced = filtered.length + oversamples.length;
        console.log(
            `[SCATTER] populated ${totalPlaced} props ` +
            `(${filtered.length} base + ${oversamples.length} oversample) ` +
            `in ${this.instancedMeshes.length} draws across ${this.models.size} variants`
        );
    }

    /**
     * Remove every populated InstancedMesh2 from the scene. Geometry +
     * materials are not disposed — they're shared from the GLB cache
     * (sharedFromGlbCache) and survive scene swaps for re-population.
     */
    dispose() {
        for (const mesh of this.instancedMeshes) {
            if (mesh.parent) mesh.parent.remove(mesh);
        }
        this.instancedMeshes.length = 0;
    }

    /** @returns {number} */
    _scatterRadius() {
        const b = this.boundary;
        if (b?.kind === 'island' && typeof b.radius === 'number') {
            // Stay inside the island's playable disc minus a small margin
            // for the shoreline ring.
            return Math.min(b.radius - 8, 220);
        }
        return 200;
    }

    /** @returns {boolean} */
    _isExcluded(x, z) {
        for (const zone of this.exclusionZones) {
            if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Diagnostics — total instance count across all variants.
     * @returns {number}
     */
    getInstanceCount() {
        let n = 0;
        for (const mesh of this.instancedMeshes) n += mesh.instancesCount ?? 0;
        return n;
    }
}
