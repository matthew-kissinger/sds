/**
 * Tree placement, impostor baking, and cross-billboard helpers extracted
 * from `TerrainBuilder` in Cycle 28 Stream B2.
 *
 * Reads `builder.sceneDef`, `builder.rockPositions`, `builder.models.trees`,
 * `builder.models.treesLod1`, `builder.scene`, `builder.isMobile`,
 * `builder._probeRender`, `builder._bakeImpostorCache`,
 * `builder._lod2EmptyGeoCache`; mutates `builder.treeInstances`,
 * `builder._impostorMaterials`, `builder.trees`.
 *
 * Behavior is unchanged from the inline methods — same seeded
 * `generateTrees` call, same per-instance LOD chain, same Pixel Forge
 * Kiln impostor preference, same cross-billboard fallback. The
 * scatter-positions characterization golden tracks `generateTrees`
 * output bit-for-bit; this module is just the placement-into-Three.js
 * stage.
 */

import * as THREE from 'three';
import { InstancedMesh2 } from '@three.ez/instanced-mesh';

import { generateTrees } from '../../shared/TreePlacement.js';
import { mulberry32 } from '../../shared/Random.js';
import { loadKilnImpostor } from '../kiln-impostor-material.js';
import { getSceneManager } from '../GameBridge.js';
import { TIER_PRESETS } from '../HardwareTier.js';

/**
 * @param {object} builder TerrainBuilder instance.
 * @param {Array | null} [competitivePastures]
 * @returns {Promise<Array>} Array of InstancedMesh2 created.
 */
export async function placeTrees(builder, competitivePastures = null) {
    if (!builder.modelsLoaded) {
        console.warn('Models not loaded yet. Loading models...');
        await builder.loadModels();
    }

    // Cycle 6 Phase 1: placement lives in shared/TreePlacement.js so client +
    // Worker compute identical positions from the same seed. Y math (_groundY +
    // per-model base offset) stays here on the client because it's a renderer
    // concern.
    const seed = builder.sceneDef?.terrain?.seed ?? 0;
    const flatTrees = generateTrees(builder.sceneDef, mulberry32(seed), {
        competitivePastures,
        rockPositions: builder.rockPositions,
    });

    builder.treeInstances = flatTrees;

    const treeInstances = {
        tree1: [],
        tree2: [],
    };
    for (const t of flatTrees) {
        // Use _groundY (mirrors terrain falloff) instead of raw heightfield
        // sample — trees in outer zones extend past the heightfield's
        // worldSize and would otherwise float above the flat skirt.
        const treeY = builder._groundY(t.x, t.z);
        // Compensate for the GLB's origin offset.
        const baseOffset = builder.models.trees[t.type]?.userData?.modelBaseYOffset ?? 0;
        const placementY = treeY + baseOffset * t.scale;
        treeInstances[t.type].push({
            position: new THREE.Vector3(t.x, placementY, t.z),
            rotation: new THREE.Euler(0, t.rotationY, 0),
            scale: new THREE.Vector3(t.scale, t.scale, t.scale),
        });
    }

    // Cycle 16 Phase 1+2: per-instance LOD chain via InstancedMesh2.addLOD.
    const renderer = getSceneManager()?.getRenderer();
    const instancedMeshes = [];

    // Cycle 25 Phase B: hardware tier gates the LOD1 mid-band on the
    // tree InstancedMeshes. Resolved once per pass since tier doesn't
    // change at runtime.
    const hwTier = getSceneManager()?.getTier?.() ?? (builder.isMobile ? 'low' : 'med');

    // Cycle 17 follow-up: reset the per-swap impostor-material list so
    // setImpostorTint() doesn't hold stale refs from a prior scene's
    // billboards.
    builder._impostorMaterials = [];

    // Cycle 17 Phase 1 probe hook (gated on `?probeRender=1`).
    const probe = builder._probeRender ? (window.__sds = window.__sds || {}, window.__sds.probe = window.__sds.probe || { trees: {} }) : null;
    if (probe) {
        probe.trees.rendererAtCreate = !!renderer;
        probe.trees.isMobile = !!builder.isMobile;
        probe.trees.byType = {};
    }

    // Cache baked cross-billboard impostors per tree type. Survives dispose()
    // like the models cache. Cycle 11 Phase 1 A8 finding: re-baking on each
    // scene swap leaks one WebGLRenderTarget per tree species per swap.
    if (!builder._bakeImpostorCache) builder._bakeImpostorCache = new Map();

    // Cycle 19 follow-up: build trunk LOD2 empty geometry by cloning the
    // trunk's own attribute schema with zero-length buffers. The previous
    // shared 3-vert empty triggered ANGLE "Vertex buffer is not big enough
    // for the draw call" warnings.
    const makeMatchingEmptyGeo = (srcGeo) => {
        const empty = new THREE.BufferGeometry();
        for (const [name, attr] of Object.entries(srcGeo.attributes)) {
            const TypedArray = attr.array.constructor;
            empty.setAttribute(name, new THREE.BufferAttribute(new TypedArray(0), attr.itemSize));
        }
        if (srcGeo.index) {
            const TypedArray = srcGeo.index.array.constructor;
            empty.setIndex(new THREE.BufferAttribute(new TypedArray(0), 1));
        }
        empty.boundingBox = new THREE.Box3();
        empty.boundingSphere = new THREE.Sphere();
        return empty;
    };
    if (!builder._lod2EmptyGeoCache) builder._lod2EmptyGeoCache = new WeakMap();

    // Cycle 20 Phase 2: pre-load offline-baked Kiln impostors in parallel
    // for every tree type that's actually about to be instanced.
    const kilnImpostorByType = new Map();
    const kilnTreeTypes = Object.entries(treeInstances)
        .filter(([type, list]) => list.length > 0 && builder.models.trees[type])
        .map(([type]) => type);
    const kilnLoadResults = await Promise.all(
        kilnTreeTypes.map((type) => loadKilnImpostor(`assets/models/trees/${type}.imposter`))
    );
    for (let i = 0; i < kilnTreeTypes.length; i++) {
        const triple = kilnLoadResults[i];
        if (!triple) continue;
        kilnImpostorByType.set(kilnTreeTypes[i], triple);
        // Cycle 25 Phase D: uMatchBoost calibration LUT removed.
        // Cycle 26 v2.0.5: AtmosphericDesatPatch deleted.
    }

    Object.entries(treeInstances).forEach(([treeType, instances]) => {
        if (instances.length === 0 || !builder.models.trees[treeType]) return;

        const lod0Model = builder.models.trees[treeType];
        const lod1Model = builder.models.treesLod1?.[treeType] ?? null;

        // Index LOD0 + LOD1 children by mesh name so trunk pairs with trunk
        // and leaves with leaves.
        const lod1ChildByName = new Map();
        if (lod1Model) {
            lod1Model.traverse(c => { if (c.isMesh && c.geometry) lod1ChildByName.set(c.name, c); });
        }

        // Cycle 20 Phase 2: prefer the offline-baked Kiln impostor. Fall back
        // to the cross-billboard if the kiln load failed.
        const kiln = kilnImpostorByType.get(treeType) ?? null;

        let impostor = kiln ? null : builder._bakeImpostorCache.get(treeType);
        const impostorWasCached = !!impostor;
        if (!kiln && !impostor && renderer) {
            impostor = bakeTreeImpostor(builder, lod0Model, renderer);
            if (impostor) builder._bakeImpostorCache.set(treeType, impostor);
        }
        if (probe) {
            probe.trees.byType[treeType] = {
                instances: instances.length,
                lod1Available: !!lod1Model,
                impostorBaked: !!(kiln || impostor),
                impostorFromCache: !!kiln || impostorWasCached,
                impostorKind: kiln ? 'kiln' : impostor ? 'cross-billboard' : 'none',
                impostorWidth: kiln
                    ? +(kiln.sidecar.worldSize).toFixed(3)
                    : impostor ? +impostor.width.toFixed(3) : null,
                impostorBboxMinY: kiln
                    ? +(kiln.sidecar.bbox.min[1]).toFixed(3)
                    : impostor ? +impostor.bboxMinY.toFixed(3) : null,
                impostorBboxMaxY: kiln
                    ? +(kiln.sidecar.bbox.max[1]).toFixed(3)
                    : impostor ? +impostor.bboxMaxY.toFixed(3) : null,
                bakeBox: probe.trees.lastBakeBox ? { ...probe.trees.lastBakeBox } : null,
                rendererAvailable: !!renderer,
            };
        }

        let billboardGeo = null;
        let billboardMat = null;
        if (kiln) {
            // Cycle 20 Phase 2 primary path. Geometry + material were built
            // once by loadKilnImpostor and cached.
            billboardGeo = kiln.geometry;
            billboardMat = kiln.material;
        } else if (impostor) {
            // Cross-billboard fallback (Cycle 16/17). `transparent: false`
            // puts the billboard in the OPAQUE render queue with a hard alpha
            // cutoff — the transparent queue's alpha-blend interaction with
            // mipmapped silhouettes produced a light halo around tree edges.
            billboardGeo = createCrossBillboardGeometry(impostor.width, impostor.bboxMinY, impostor.bboxMaxY);
            billboardMat = new THREE.MeshBasicMaterial({
                map: impostor.texture,
                transparent: false,
                alphaTest: 0.4,
                side: THREE.DoubleSide,
                depthWrite: true,
                fog: true
            });
        }
        if (billboardMat) {
            // Tracked on builder._impostorMaterials so per-frame setImpostorTint()
            // can update each material's color to follow sun direction + ToD.
            if (!builder._impostorMaterials) builder._impostorMaterials = [];
            builder._impostorMaterials.push(billboardMat);
        }

        lod0Model.traverse(child => {
            if (!child.isMesh || !child.geometry) return;

            const isLeavesMesh = child.name === 'leaves';
            const lod1Child = lod1ChildByName.get(child.name);

            const im = new InstancedMesh2(
                child.geometry,
                child.material,
                { capacity: instances.length, createEntities: false }
            );
            // Cycle 12 Phase 1 A8: this InstancedMesh shares its geometry +
            // material with the cached GLB model. Tag so clearTrees() removes-
            // from-scene only — disposing would invalidate the GLB cache and
            // force a texture re-upload on the next swap.
            im.userData.sharedFromGlbCache = true;

            // Cycle 22 Phase A: LOD1 80m band with meshopt-baked geometry.
            // Cycle 25 Phase B: tier-gated. Desktop med/high drops the mid-
            // band entirely so the LOD0 silhouette holds out to 200m where
            // the impostor takes over. Mobile-low keeps the chain because
            // perf budget matters more than silhouette fidelity.
            const tierPreset = TIER_PRESETS[hwTier] ?? TIER_PRESETS.med;
            const usesLod1 = tierPreset.usesLod1ForFoliage;
            if (usesLod1 && lod1Child?.geometry && lod1Child?.material) {
                im.addLOD(lod1Child.geometry, lod1Child.material, 80);
            }

            if (billboardGeo && billboardMat) {
                if (isLeavesMesh) {
                    // Cycle 21 Phase 5: pushed LOD swap 100m → 200m so the
                    // foreground/midground stays geometric (LOD0).
                    im.addLOD(billboardGeo, billboardMat, 200);
                    // Cycle 21 Phase 5 fix: explicitly route the SHADOW render
                    // pass through LOD0 ONLY — never through the LOD2 impostor
                    // billboard. The billboard vertex shader uses cameraPosition
                    // for camera-facing pose; during the shadow pass
                    // cameraPosition is the LIGHT's position, so the billboard
                    // ends up facing the sun and its shadow doesn't align with
                    // the player camera's view. Setting shadowRender pinned to
                    // LOD0 means every instance renders LOD0 geometry into the
                    // shadow map — leaf-shaped shadow that matches the player's
                    // view. Slight perf cost but shadow rendering is depth-only
                    // + no fragment shader, so negligible at our 200-500-tree
                    // scale.
                    im.LODinfo.shadowRender = {
                        levels: [{ distance: 0, hysteresis: 0, object: im }],
                        count: [0],
                    };
                } else {
                    let trunkLod2 = builder._lod2EmptyGeoCache.get(child.geometry);
                    if (!trunkLod2) {
                        trunkLod2 = makeMatchingEmptyGeo(child.geometry);
                        builder._lod2EmptyGeoCache.set(child.geometry, trunkLod2);
                    }
                    // Cycle 21 Phase 5: same 200m distance as leaves.
                    im.addLOD(trunkLod2, child.material, 200);
                }
            }

            // InstancedMesh2 entities expose position/quaternion/scale.
            im.addInstances(instances.length, (obj, i) => {
                const inst = instances[i];
                obj.position.copy(inst.position);
                obj.quaternion.setFromEuler(inst.rotation);
                obj.scale.copy(inst.scale);
            });

            // Cycle 19 follow-up: build a BVH so per-instance frustum culling
            // + LOD distance checks short-circuit by tree-chunk instead of
            // scanning every instance. Trees are static post-placement (no
            // per-frame matrix updates), so margin: 0 is fine.
            im.computeBVH({ margin: 0 });

            im.castShadow = !builder.isMobile;
            im.receiveShadow = true;

            builder.scene.add(im);
            instancedMeshes.push(im);
        });

        const lodTag = billboardGeo ? 'LOD0+impostor' : 'LOD0-only';
        console.log(`[TERRAIN] Created ${instances.length} ${treeType} mesh instances (${lodTag})`);
    });

    builder.trees = instancedMeshes;
    const total = Object.values(treeInstances).reduce((s, a) => s + a.length, 0);
    console.log(`[TERRAIN] Total trees: ${total} (per-instance LOD0/LOD1/LOD2 chain)`);

    return instancedMeshes;
}

/**
 * Render a tree GLB to an offscreen RenderTarget, viewed from the side
 * with an orthographic camera, transparent background. Returns a texture
 * + the model's bounding-box width/height so the billboard quad matches
 * the GLB's footprint.
 *
 * @param {object} builder
 * @param {THREE.Object3D} model
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{texture: THREE.Texture, width: number, bboxMinY: number, bboxMaxY: number} | null}
 */
export function bakeTreeImpostor(builder, model, renderer) {
    const bakeScene = new THREE.Scene();
    bakeScene.background = null;
    // Cycle 17 Phase 2: dropped ambient 0.55 → 0.30 + dirLight 0.85 → 0.55.
    // Prior values washed brown bark up to a tan/cream tone that read as
    // "white bark" silhouette against grass at LOD2 distance.
    const ambient = new THREE.AmbientLight(0xffffff, 0.30);
    bakeScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
    dirLight.position.set(2, 4, 3);
    bakeScene.add(dirLight);

    const treeClone = model.clone(true);
    treeClone.traverse(node => {
        if (node.isMesh) {
            node.castShadow = false;
            node.receiveShadow = false;
        }
    });
    bakeScene.add(treeClone);

    const box = new THREE.Box3().setFromObject(treeClone);
    if (!isFinite(box.min.x) || box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (builder._probeRender && typeof window !== 'undefined') {
        window.__sds = window.__sds || {};
        window.__sds.probe = window.__sds.probe || { trees: {} };
        window.__sds.probe.lastBakeBox = { x: size.x, y: size.y, z: size.z, minY: box.min.y, maxY: box.max.y };
    }

    // Pad the camera frustum slightly so the tree silhouette doesn't
    // clip against the texture edges.
    const halfW = Math.max(size.x, size.z) * 0.55;
    const halfH = size.y * 0.55;
    const aspect = halfW / halfH;
    const TEX = 512;
    const texW = aspect >= 1 ? TEX : Math.round(TEX * aspect);
    const texH = aspect >= 1 ? Math.round(TEX / aspect) : TEX;

    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 200);
    cam.position.set(center.x, center.y, box.max.z + 50);
    cam.lookAt(center.x, center.y, center.z);

    const target = new THREE.WebGLRenderTarget(texW, texH, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: true
    });

    const prevTarget = renderer.getRenderTarget();
    const prevClearColor = new THREE.Color();
    renderer.getClearColor(prevClearColor);
    const prevClearAlpha = renderer.getClearAlpha();

    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.render(bakeScene, cam);

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClearColor, prevClearAlpha);

    bakeScene.remove(treeClone);

    return {
        texture: target.texture,
        width: halfW * 2,
        bboxMinY: box.min.y,
        bboxMaxY: box.max.y
    };
}

/**
 * Three textured quads arranged at 0°, 60°, 120° around the Y axis. Any
 * view direction is within ~30° of one quad's normal, so the tree silhouette
 * stays full-width regardless of camera angle.
 *
 * @param {number} width
 * @param {number} y0  Lower Y in unit scale (matches model bbox.min.y)
 * @param {number} y1  Upper Y in unit scale (matches model bbox.max.y)
 * @returns {THREE.BufferGeometry}
 */
export function createCrossBillboardGeometry(width, y0, y1) {
    const halfW = width / 2;
    const positions = [];
    const uvs = [];
    // 3 planes at 0°, 60°, 120°. Each plane is 2 triangles (6 verts).
    for (let q = 0; q < 3; q++) {
        const angle = (q * Math.PI) / 3;
        const ax = Math.cos(angle) * halfW;
        const az = Math.sin(angle) * halfW;
        positions.push(
            -ax, y0, -az, ax, y0, az, ax, y1, az,
            -ax, y0, -az, ax, y1, az, -ax, y1, -az
        );
        uvs.push(
            0, 0, 1, 0, 1, 1,
            0, 0, 1, 1, 0, 1
        );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
}
