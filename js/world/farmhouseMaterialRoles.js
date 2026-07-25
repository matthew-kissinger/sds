// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Cycle 114 Phase 4 - the farmhouse reads as roof, walls and trim.
 *
 * `assets/models/Farm house.glb` is a palette-atlas kit-bash, not a single
 * flat block. It ships 109 mesh-bearing nodes under 11 group nodes, all
 * sharing one material (`PaletteMaterial001`) that carries a 32x4 base-colour
 * atlas plus a matching metallic-roughness atlas. Every mesh's UVs park on one
 * of five 4px swatches:
 *
 *   swatch 0  rgb(78, 58, 43)     dark brown   - ShadowProxy only
 *   swatch 1  rgb(125, 133, 128)  cool grey    - stone base, chimney, hearth
 *   swatch 2  rgb(139, 106, 69)   mid brown    - walls AND roof AND gables
 *   swatch 3  rgb(193, 163, 109)  tan          - window grids, porch, door
 *   swatch 4  rgb(56, 55, 53)     near black   - door handle, lantern, pot
 *
 * That third line is the whole defect the front-door review named. The roof,
 * the gables, the porch roof and the body walls all sample swatch 2, so the
 * house is literally one colour from the eaves down. Nothing in `js/` was
 * overriding the atlas with a flat tint; the atlas itself never separated the
 * roof from the walls.
 *
 * The fix is a per-mesh material assignment by name, which is why it needs no
 * new geometry and no GLB edit (Cycle 114 D11 forbids both). The three role
 * materials are CLONES of the loaded one, so the atlas, its textures and the
 * single lighting response all survive; only a colour multiplier and a
 * roughness multiplier differ per role. Replacing the atlas with flat colours
 * would throw away detail that is already in the file.
 *
 * Three groups, not one per role. The temptation is a material per part, but
 * three is what separates at gameplay distance and three is what the model
 * still reads as one object under.
 *
 * Cycle 115 Phase 5 adds a fourth, and it is a genuine exception rather than a
 * drift back toward one-per-part. `Mesh_LanternGlow` is the only mesh in the
 * file that has to change over the course of a day, and `emissiveIntensity` is
 * a per-material property, so sharing trim's material would light every window
 * frame, porch column and hay bale in the kit along with the wick. Its albedo
 * treatment is trim's numbers exactly, so at noon the lantern is
 * indistinguishable from what Cycle 114 shipped; the only difference is an
 * emissive term that reads zero until the sun goes down. The bracket and the
 * cap stay on trim: they are painted iron, they do not burn.
 */

/**
 * Role table. Name prefixes, matched in the order roof, lantern, wall, trim, so
 * the more specific `Mesh_PorchRoof` lands in roof before `Mesh_Porch` claims
 * it for trim, and `Mesh_LanternGlow` lands in lantern before `Mesh_Lantern`
 * claims it (with its bracket and cap) for trim. Ordering is load-bearing; do
 * not sort these alphabetically.
 *
 * One named table rather than inline string tests scattered through a loop:
 * a re-export that renames a mesh has exactly one place to be fixed, and
 * `tests/farmhouse-material-roles.spec.js` reads this table against the
 * shipped GLB so the rename fails loudly instead of silently dropping a mesh
 * back onto the shared material.
 */
export const FARMHOUSE_MATERIAL_ROLES = Object.freeze({
    // The mass that has to stop matching the walls. `Mesh_RoofA` / `Mesh_RoofB`
    // are the two main slopes, `Mesh_GableFront_0..8` / `Mesh_GableBack_0..8`
    // are the stepped gable courses, `Mesh_PorchRoof` is the porch lean-to.
    roof: Object.freeze([
        'Mesh_Roof',
        'Mesh_Gable',
        'Mesh_PorchRoof',
    ]),
    // The wick pane, and nothing else. An 8cm x 12cm x 8cm box hanging off the
    // porch bracket at local (2.24, 1.70, 1.25). Small enough that it costs one
    // draw call it was already paying, big enough to read as a point of warm
    // light from across the homestead once it is emissive.
    lantern: Object.freeze([
        'Mesh_LanternGlow',
    ]),
    // The structural mass: timber walls plus the masonry that reads as part of
    // the same block (stone base, chimney stack, hearth). Keeping masonry with
    // the walls rather than giving it a group of its own is deliberate - it
    // already has its own atlas swatch, so it separates without its own
    // material. Contrast the lantern above, which needed one because its
    // emissive has to move and the atlas cannot move it.
    wall: Object.freeze([
        'Mesh_Body_Wall',
        'Mesh_Body_Floor',
        'Mesh_StoneBase',
        'Mesh_Chimney',
        'Mesh_Hearth',
    ]),
    // Everything thin, planed or loose: window frames and grids, porch deck,
    // columns, supports and stairs, railings, rails, slats, the door and its
    // frame, the lantern, and the yard clutter modelled into the GLB (hay
    // bales, barrel). The clutter rides trim because it is small warm detail
    // that wants the same slight lift, not because it is joinery.
    trim: Object.freeze([
        'Mesh_WFrame',
        'Mesh_WGrid',
        'Mesh_Porch',
        'Mesh_Rail',
        'Mesh_Slat',
        'Mesh_Door',
        'Door',
        'Mesh_Lantern',
        'Mesh_HayBale',
        'Mesh_Barrel',
    ]),
});

/** Match order for {@link classifyFarmhouseMesh}. Roof first, see above. */
const ROLE_MATCH_ORDER = Object.freeze(['roof', 'lantern', 'wall', 'trim']);

/**
 * Meshes deliberately left on the loaded material. `ShadowProxy` is the flat
 * ground-hugging footprint box the kit ships for a future baked contact
 * shadow; it is not part of the house's read and must not be tinted with it.
 */
export const FARMHOUSE_UNROLED_MESH_PREFIXES = Object.freeze(['ShadowProxy']);

/**
 * Per-role treatment applied on top of the shared atlas.
 *
 * `colorMultiplier` is a linear-space multiplier on `material.color`, which
 * three multiplies against the sRGB-decoded atlas texel. Working through it
 * for swatch 2, the shared wall/roof brown rgb(139, 106, 69):
 *
 *   roof -> rgb(97, 72, 48)    clearly darker, a touch cooler (weathered shingle)
 *   wall -> rgb(143, 106, 67)  effectively held, a touch warmer
 *   trim -> rgb(151, 113, 69)  a step lighter, so thin members catch the eye
 *
 * and for swatch 3, the tan the porch and door sample, rgb(193, 163, 109):
 *
 *   trim -> rgb(209, 173, 109) sun-bleached painted timber
 *
 * The amounts are deliberately conservative. The atlas already carries the
 * hue; the job here is separating the three masses, not repainting the house.
 *
 * `roughnessMultiplier` multiplies `material.roughness`, which itself
 * multiplies the metallic-roughness atlas green channel (0.859 on swatch 2).
 * So the roof stays at the atlas value (rough shingle), the walls sit just
 * under it, and the trim drops to ~0.69 so planed timber and the iron door
 * handle pick up a highlight the flat walls do not.
 */
export const FARMHOUSE_ROLE_TREATMENTS = Object.freeze({
    roof: Object.freeze({
        colorMultiplier: Object.freeze([0.46, 0.45, 0.50]),
        roughnessMultiplier: 1.0,
    }),
    wall: Object.freeze({
        colorMultiplier: Object.freeze([1.06, 1.01, 0.93]),
        roughnessMultiplier: 0.96,
    }),
    trim: Object.freeze({
        colorMultiplier: Object.freeze([1.20, 1.14, 1.00]),
        roughnessMultiplier: 0.80,
    }),
    // Trim's albedo numbers, deliberately copied rather than referenced, so
    // that an unlit lantern is the same object Cycle 114 shipped and the only
    // thing Phase 5 changed is what happens after sundown.
    //
    // `emissiveColor` is LINEAR RGB, same working space as `colorMultiplier`
    // above and same space `Color.setRGB` writes in by default, so it does not
    // go through an sRGB decode. (1.00, 0.47, 0.16) is a warm flame: hot enough
    // in red to clip through the ACES curve and read as a source rather than as
    // a painted-orange surface, low enough in blue to stay firelight rather
    // than porch bulb.
    //
    // `duskLampPeakIntensity` is the `emissiveIntensity` at full dark. Emissive
    // is added AFTER lighting and before tone mapping on both paths, so 2.2 x
    // (1.00, 0.47, 0.16) = (2.20, 1.03, 0.35) resolves to a clipped warm core
    // with amber falloff at the pane edges. The lamp is 8cm across; at
    // gameplay distance it is a handful of pixels and wants to be over-driven,
    // not correct.
    lantern: Object.freeze({
        colorMultiplier: Object.freeze([1.20, 1.14, 1.00]),
        roughnessMultiplier: 0.80,
        emissiveColor: Object.freeze([1.00, 0.47, 0.16]),
        duskLampPeakIntensity: 2.2,
    }),
});

/**
 * Classify one farmhouse mesh node by name.
 *
 * @param {string} meshName - the node name as it arrives from GLTFLoader
 * @returns {'roof'|'wall'|'trim'|'unroled'|'unknown'} `unroled` means the mesh
 *   is explicitly listed as keeping the loaded material; `unknown` means the
 *   role table does not cover it, which is a re-export drift signal.
 */
export function classifyFarmhouseMesh(meshName) {
    if (typeof meshName !== 'string' || meshName === '') return 'unknown';

    for (const prefix of FARMHOUSE_UNROLED_MESH_PREFIXES) {
        if (meshName.startsWith(prefix)) return 'unroled';
    }

    for (const role of ROLE_MATCH_ORDER) {
        for (const prefix of FARMHOUSE_MATERIAL_ROLES[role]) {
            if (meshName.startsWith(prefix)) return role;
        }
    }

    return 'unknown';
}

/**
 * Derived materials are cached per SOURCE material instance, not per farmhouse
 * clone. `TerrainBuilder.addFarmHouse` clones the cached GLB root on every
 * scene load and `Object3D.clone()` shares material references, so without
 * this cache each load would allocate three more materials that the building
 * clear path (which deliberately removes buildings without disposing, see
 * `tests/swap-drift-glb-guard.spec.js`) would never release. A WeakMap keyed
 * on the source material lets the derived trio go when the GLB cache does.
 */
const derivedRoleMaterials = new WeakMap();

function deriveRoleMaterial(sourceMaterial, role) {
    let trio = derivedRoleMaterials.get(sourceMaterial);
    if (!trio) {
        trio = Object.create(null);
        derivedRoleMaterials.set(sourceMaterial, trio);
    }
    if (trio[role]) return trio[role];

    const treatment = FARMHOUSE_ROLE_TREATMENTS[role];
    const material = sourceMaterial.clone();
    material.name = `${sourceMaterial.name || 'FarmhouseMaterial'}_${role}`;
    // Multiply rather than assign: `Color.r/g/b` are already in three's working
    // (linear) colour space and `setRGB` writes back in the same space, so this
    // is an honest multiply against whatever baseColorFactor the GLB declared
    // instead of a hardcoded repaint.
    if (material.color?.setRGB) {
        const [mr, mg, mb] = treatment.colorMultiplier;
        material.color.setRGB(
            sourceMaterial.color.r * mr,
            sourceMaterial.color.g * mg,
            sourceMaterial.color.b * mb,
        );
    }
    if (typeof material.roughness === 'number') {
        material.roughness = sourceMaterial.roughness * treatment.roughnessMultiplier;
    }
    material.userData = { ...(material.userData ?? {}), farmhouseMaterialRole: role };

    // Cycle 115 Phase 5. Assign rather than multiply, because unlike colour
    // this is not modulating something the atlas already carries: the GLB
    // declares no emissive factor at all, so there is nothing to be honest
    // against. Intensity starts at 0 so a scene that never binds the lamp
    // renders exactly the Cycle 114 house. `js/atmosphere/Atmosphere.js`
    // raises it off the sun's elevation once bound; the peak rides on the
    // material so the binder needs no table of its own.
    if (treatment.emissiveColor && material.emissive?.setRGB) {
        const [er, eg, eb] = treatment.emissiveColor;
        material.emissive.setRGB(er, eg, eb);
        material.emissiveIntensity = 0;
        material.userData.duskLampPeakIntensity = treatment.duskLampPeakIntensity;
    }

    trio[role] = material;
    return material;
}

function assignMeshRoleMaterial(mesh, role) {
    const current = mesh.material;
    const list = Array.isArray(current) ? current : [current];
    let replaced = 0;
    const next = list.map((material) => {
        if (!material) return material;
        // Idempotent: a second pass over an already-split house is a no-op
        // rather than a derive-from-derived that would compound the tint.
        if (material.userData?.farmhouseMaterialRole) return material;
        replaced += 1;
        return deriveRoleMaterial(material, role);
    });
    mesh.material = Array.isArray(current) ? next : next[0];
    return replaced;
}

/**
 * Split the farmhouse's single shared material into the roof, wall, trim and
 * lantern set. Call this on an instantiated farmhouse root (the clone that goes
 * into the scene), before anything else walks its materials.
 *
 * Dual-path note: this deliberately touches no node material. The farmhouse
 * has never had a hand-written WebGPU twin - it renders through three's own
 * stock-material conversion, `NodeLibrary.fromMaterial`, which builds one
 * `MeshStandardNodeMaterial` per source material instance and copies every
 * property across (`node_modules/three/src/renderers/common/nodes/NodeLibrary.js`).
 * Three distinct `MeshStandardMaterial` instances therefore arrive as three
 * distinct node materials with their own colour and roughness uniforms.
 * `js/world/webgpuMaterialAdapter.js` only rewrites tree and rock materials
 * (`builder.models.trees` / `treesLod1` / `rocks`, by the material names
 * `branches` and `leaves`), so it never sees the farmhouse and cannot collapse
 * the set. The split lands on both paths by construction.
 *
 * Cycle 115 Phase 5 leans on the same fact for the lantern, one layer deeper:
 * Three's EMISSIVE material scope resolves to `materialReference('emissive')`
 * and `materialReference('emissiveIntensity')`
 * (`node_modules/three/src/nodes/accessors/MaterialNode.js`), and
 * `MaterialReferenceNode.updateReference` resolves those against the rendered
 * object's ORIGINAL material every frame, not against the converted copy. So
 * writing `emissiveIntensity` on the standard material animates the lamp on the
 * WebGPU path as well, with no node material and no twin to keep in step.
 *
 * Two material counts come back, because they legitimately differ.
 * `roleMaterialCount` is the house body's split and is the number that has to
 * read 4. `distinctMaterialCount` also counts the material still carried by
 * anything in {@link FARMHOUSE_UNROLED_MESH_PREFIXES}, so on the shipped GLB it
 * reads 5: the four role materials plus the untouched `ShadowProxy` slab.
 *
 * The lamp materials also land on `root.userData.duskLampMaterials` for
 * `js/boot/initWorld.js` to hand to `Atmosphere.bindDuskLamps`. On the root's
 * userData rather than in the summary on purpose: the summary is JSON-serialised
 * into the WebGPU boot diagnostic (`js/rendering/productionWebGpuBoot.js`), and
 * a live `Material` in there would drag its textures through `toJSON`.
 *
 * @param {object} root - the farmhouse Object3D (or anything with `traverse`)
 * @returns {{
 *   applied: boolean,
 *   visitedMeshes: number,
 *   assigned: {roof: number, lantern: number, wall: number, trim: number},
 *   unroledMeshes: number,
 *   unknownMeshNames: string[],
 *   roleMaterialNames: string[],
 *   roleMaterialCount: number,
 *   materialNames: string[],
 *   distinctMaterialCount: number,
 *   duskLampMaterialCount: number,
 * }} summary, suitable for a boot diagnostic
 */
export function applyFarmhouseMaterialRoles(root) {
    const assigned = { roof: 0, lantern: 0, wall: 0, trim: 0 };
    const unknownMeshNames = [];
    const allMaterials = new Set();
    const roleMaterials = new Set();
    const duskLampMaterials = new Set();
    let visitedMeshes = 0;
    let unroledMeshes = 0;
    let replaced = 0;

    const nameOf = (material) => material.name || '(unnamed)';

    if (!root || typeof root.traverse !== 'function') {
        return {
            applied: false,
            visitedMeshes: 0,
            assigned,
            unroledMeshes: 0,
            unknownMeshNames,
            roleMaterialNames: [],
            roleMaterialCount: 0,
            materialNames: [],
            distinctMaterialCount: 0,
            duskLampMaterialCount: 0,
        };
    }

    root.traverse((child) => {
        if (!child?.isMesh || !child.material) return;
        visitedMeshes += 1;

        const role = classifyFarmhouseMesh(child.name);
        // Membership rather than a hand-listed OR, so a fifth role is one line
        // in the table above and not two edits in two files. Every counter is
        // seeded to 0, so `undefined` means "not a role we assign" and lands in
        // the unroled / unknown branches below exactly as before.
        if (assigned[role] !== undefined) {
            replaced += assignMeshRoleMaterial(child, role);
            assigned[role] += 1;
        } else if (role === 'unroled') {
            unroledMeshes += 1;
        } else {
            // Not fatal at runtime: an unrecognised mesh keeps the loaded
            // material and the house still renders. The spec is what fails.
            unknownMeshNames.push(child.name);
        }

        for (const material of (Array.isArray(child.material) ? child.material : [child.material])) {
            if (!material) continue;
            allMaterials.add(material);
            if (material.userData?.farmhouseMaterialRole) roleMaterials.add(material);
            // Keyed on the property the binder reads, not on the role name, so
            // any future role that declares a peak is collected for free.
            if (Number.isFinite(material.userData?.duskLampPeakIntensity)) {
                duskLampMaterials.add(material);
            }
        }
    });

    if (unknownMeshNames.length > 0) {
        console.warn(
            `[farmhouse] ${unknownMeshNames.length} mesh name(s) are not covered by the role table `
            + `and kept the shared material: ${unknownMeshNames.slice(0, 8).join(', ')}`
        );
    }

    root.userData = { ...(root.userData ?? {}), duskLampMaterials: [...duskLampMaterials] };

    return {
        applied: replaced > 0,
        visitedMeshes,
        assigned,
        unroledMeshes,
        unknownMeshNames,
        roleMaterialNames: [...roleMaterials].map(nameOf).sort(),
        roleMaterialCount: roleMaterials.size,
        materialNames: [...allMaterials].map(nameOf).sort(),
        distinctMaterialCount: allMaterials.size,
        duskLampMaterialCount: duskLampMaterials.size,
    };
}
