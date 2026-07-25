// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 114 Phase 4 - farmhouse roof / wall / trim material split.
 *
 * The load-bearing fact this spec protects: `assets/models/Farm house.glb`
 * ships one material shared by 109 role-named mesh nodes, and the roof, the
 * gables, the porch roof and the body walls all sample the SAME palette-atlas
 * swatch. The split is therefore a per-mesh material assignment keyed on the
 * node names in the shipped file, which makes those names a contract.
 *
 * So this spec reads the GLB's own JSON chunk rather than trusting a list
 * copied into the test. A re-export that renames, adds or drops a mesh fails
 * here instead of silently dropping that mesh back onto the shared material,
 * where it would quietly rejoin the one-tan-mass look the split exists to fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import {
    FARMHOUSE_MATERIAL_ROLES,
    FARMHOUSE_ROLE_TREATMENTS,
    FARMHOUSE_UNROLED_MESH_PREFIXES,
    applyFarmhouseMaterialRoles,
    classifyFarmhouseMesh,
} from '../js/world/farmhouseMaterialRoles.js';
import { replaceTreeMaterialsByName } from '../js/world/materialReplacement.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FARMHOUSE_GLB = resolve(__dirname, '..', 'assets', 'models', 'Farm house.glb');

/**
 * Read a binary glTF's JSON chunk. A GLB is a 12-byte header followed by
 * chunks of [uint32 byteLength][uint32 chunkType][payload], and the spec
 * requires the first chunk to be the JSON one. So the JSON length is the
 * uint32 at byte 12 and the payload starts at byte 20.
 */
function readGlbJsonChunk(path) {
    const buffer = readFileSync(path);
    const jsonLength = buffer.readUInt32LE(12);
    return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
}

const gltf = readGlbJsonChunk(FARMHOUSE_GLB);

/**
 * GLTFLoader names each scene-graph object after its NODE, not after the mesh
 * definition the node points at (`_loadNodeShallow` reserves the node name
 * before resolving dependencies, precisely so the node name wins). Several
 * nodes in this file share a mesh definition - the four window frames, the two
 * roof slopes - so the node list, not the 55-entry mesh list, is what a
 * `traverse` actually sees.
 */
const MESH_NODE_NAMES = gltf.nodes
    .filter((node) => node.mesh !== undefined)
    .map((node) => node.name);

const ALL_PREFIXES = [
    ...Object.values(FARMHOUSE_MATERIAL_ROLES).flat(),
    ...FARMHOUSE_UNROLED_MESH_PREFIXES,
];

/**
 * Stand in for the loaded GLB material: one MeshStandardMaterial carrying the
 * palette atlas, shared by every mesh, exactly as GLTFLoader hands it over
 * (baseColorFactor absent -> white, roughnessFactor absent -> 1).
 */
function makeSourceMaterial() {
    const material = new MeshStandardMaterial({ name: 'PaletteMaterial001' });
    material.map = new Texture();
    material.roughnessMap = new Texture();
    material.metalnessMap = material.roughnessMap;
    return material;
}

/** Build a farmhouse whose mesh names are the real ones from the shipped GLB. */
function makeFarmhouse(sourceMaterial) {
    const root = new Group();
    root.name = 'Farmhouse_Root';
    const geometry = new BoxGeometry(1, 1, 1);
    for (const name of MESH_NODE_NAMES) {
        const mesh = new Mesh(geometry, sourceMaterial);
        mesh.name = name;
        root.add(mesh);
    }
    return root;
}

const REC709 = [0.2126, 0.7152, 0.0722];
const luminance = (color) => color.r * REC709[0] + color.g * REC709[1] + color.b * REC709[2];

describe('farmhouse material roles - the shipped GLB is the contract', () => {
    it('still ships exactly one material, which is the premise of the split', () => {
        // If a re-export ever gives the kit real per-role materials, this fails
        // and the runtime split should be reconsidered rather than stacked on top.
        expect(gltf.materials).toHaveLength(1);
        expect(gltf.materials[0].name).toBe('PaletteMaterial001');
    });

    it('has unique node names, so GLTFLoader does not suffix any of them', () => {
        // createUniqueName appends `_1` on a collision, which would break every
        // prefix match below. Uniqueness is what keeps the role table honest.
        const named = gltf.nodes.map((node) => node.name).filter(Boolean);
        expect(new Set(named).size).toBe(named.length);
        expect(MESH_NODE_NAMES).toHaveLength(109);
    });

    it('covers every mesh-bearing node name in the shipped file', () => {
        const unknown = MESH_NODE_NAMES.filter((name) => classifyFarmhouseMesh(name) === 'unknown');
        expect(unknown).toEqual([]);
    });

    it('has no dead prefixes: every table entry matches at least one shipped mesh', () => {
        const dead = ALL_PREFIXES.filter(
            (prefix) => !MESH_NODE_NAMES.some((name) => name.startsWith(prefix)),
        );
        expect(dead).toEqual([]);
    });

    it('splits the shipped meshes into the counts the house actually has', () => {
        // Pinned deliberately. These are the shipped numbers; a re-export that
        // moves them is a signal to re-read the model, not to edit this line.
        const byRole = MESH_NODE_NAMES.reduce((acc, name) => {
            const role = classifyFarmhouseMesh(name);
            acc[role] = (acc[role] ?? 0) + 1;
            return acc;
        }, {});
        expect(byRole).toEqual({ roof: 21, wall: 22, trim: 65, unroled: 1 });
    });
});

describe('farmhouse mesh classification', () => {
    it('resolves the roof mass, including the porch lean-to', () => {
        expect(classifyFarmhouseMesh('Mesh_RoofA')).toBe('roof');
        expect(classifyFarmhouseMesh('Mesh_RoofB')).toBe('roof');
        expect(classifyFarmhouseMesh('Mesh_GableFront_0')).toBe('roof');
        expect(classifyFarmhouseMesh('Mesh_GableBack_8')).toBe('roof');
        // Order matters: `Mesh_PorchRoof` also starts with the trim table's
        // `Mesh_Porch`, and roof has to win.
        expect(classifyFarmhouseMesh('Mesh_PorchRoof')).toBe('roof');
    });

    it('resolves the structural mass including the masonry', () => {
        expect(classifyFarmhouseMesh('Mesh_Body_WallRight_Sill')).toBe('wall');
        expect(classifyFarmhouseMesh('Mesh_Body_Floor')).toBe('wall');
        expect(classifyFarmhouseMesh('Mesh_StoneBase')).toBe('wall');
        expect(classifyFarmhouseMesh('Mesh_ChimneyPot')).toBe('wall');
        expect(classifyFarmhouseMesh('Mesh_HearthMantel')).toBe('wall');
    });

    it('resolves the thin and loose detail to trim', () => {
        expect(classifyFarmhouseMesh('Mesh_PorchFloor')).toBe('trim');
        expect(classifyFarmhouseMesh('Mesh_PorchStairsRiser2')).toBe('trim');
        expect(classifyFarmhouseMesh('Mesh_RailingPostStairR')).toBe('trim');
        expect(classifyFarmhouseMesh('Mesh_SlatFL_1.35')).toBe('trim');
        expect(classifyFarmhouseMesh('Mesh_WGridRight_V')).toBe('trim');
        // The door leaf is the one mesh in the file with no `Mesh_` prefix.
        expect(classifyFarmhouseMesh('Door')).toBe('trim');
        expect(classifyFarmhouseMesh('Mesh_DoorHandle')).toBe('trim');
        expect(classifyFarmhouseMesh('Mesh_LanternGlow')).toBe('trim');
    });

    it('leaves the shadow footprint slab unroled and flags anything unrecognised', () => {
        expect(classifyFarmhouseMesh('ShadowProxy')).toBe('unroled');
        expect(classifyFarmhouseMesh('Mesh_SolarPanel')).toBe('unknown');
        expect(classifyFarmhouseMesh('')).toBe('unknown');
        expect(classifyFarmhouseMesh(undefined)).toBe('unknown');
    });

    it('keeps the role table and the treatment table in step', () => {
        expect(Object.keys(FARMHOUSE_ROLE_TREATMENTS).sort())
            .toEqual(Object.keys(FARMHOUSE_MATERIAL_ROLES).sort());
    });
});

describe('applyFarmhouseMaterialRoles', () => {
    it('turns one shared material into three, keeping the shadow proxy on the loaded one', () => {
        const source = makeSourceMaterial();
        const summary = applyFarmhouseMaterialRoles(makeFarmhouse(source));

        expect(summary.applied).toBe(true);
        expect(summary.visitedMeshes).toBe(109);
        expect(summary.assigned).toEqual({ roof: 21, wall: 22, trim: 65 });
        expect(summary.unknownMeshNames).toEqual([]);

        // The house body: exactly three, not one.
        expect(summary.roleMaterialCount).toBe(3);
        expect(summary.roleMaterialNames).toEqual([
            'PaletteMaterial001_roof',
            'PaletteMaterial001_trim',
            'PaletteMaterial001_wall',
        ]);

        // Plus the untouched ShadowProxy, which is why the total reads four.
        expect(summary.unroledMeshes).toBe(1);
        expect(summary.distinctMaterialCount).toBe(4);
        expect(summary.materialNames).toContain('PaletteMaterial001');
    });

    it('leaves the shadow proxy pointing at the exact loaded material instance', () => {
        const source = makeSourceMaterial();
        const root = makeFarmhouse(source);
        applyFarmhouseMaterialRoles(root);

        const proxy = root.children.find((child) => child.name === 'ShadowProxy');
        expect(proxy.material).toBe(source);
    });

    it('derives from the atlas rather than replacing it, so the textures survive', () => {
        const source = makeSourceMaterial();
        const root = makeFarmhouse(source);
        applyFarmhouseMaterialRoles(root);

        const byRole = {};
        for (const child of root.children) {
            const role = child.material.userData?.farmhouseMaterialRole;
            if (role) byRole[role] = child.material;
        }

        for (const role of ['roof', 'wall', 'trim']) {
            expect(byRole[role]).not.toBe(source);
            expect(byRole[role].map).toBe(source.map);
            expect(byRole[role].roughnessMap).toBe(source.roughnessMap);
            expect(byRole[role].isMeshStandardMaterial).toBe(true);
        }
    });

    it('separates the three masses: roof darkest, trim lightest, trim least rough', () => {
        const source = makeSourceMaterial();
        const root = makeFarmhouse(source);
        applyFarmhouseMaterialRoles(root);

        const pick = (name) => root.children.find((child) => child.name === name).material;
        const roof = pick('Mesh_RoofA');
        const wall = pick('Mesh_Body_WallBack');
        const trim = pick('Mesh_PorchColumnL');

        // The defect this phase fixes: roof and wall sampled the same swatch,
        // so with one material they were literally the same colour.
        expect(roof).not.toBe(wall);
        expect(wall).not.toBe(trim);
        expect(luminance(roof.color)).toBeLessThan(luminance(wall.color));
        expect(luminance(wall.color)).toBeLessThan(luminance(trim.color));

        // Roughness multiplies the metallic-roughness atlas, so a lower number
        // is a glossier surface. Planed trim catches a highlight the flat
        // walls do not; the shingled roof stays at the atlas value.
        expect(roof.roughness).toBeGreaterThan(wall.roughness);
        expect(wall.roughness).toBeGreaterThan(trim.roughness);
        expect(roof.roughness).toBe(source.roughness * FARMHOUSE_ROLE_TREATMENTS.roof.roughnessMultiplier);
    });

    it('multiplies the source colour rather than repainting it', () => {
        const source = makeSourceMaterial();
        source.color.setRGB(0.5, 0.4, 0.3);
        const root = makeFarmhouse(source);
        applyFarmhouseMaterialRoles(root);

        const roof = root.children.find((child) => child.name === 'Mesh_RoofA').material;
        const [mr, mg, mb] = FARMHOUSE_ROLE_TREATMENTS.roof.colorMultiplier;
        expect(roof.color.r).toBeCloseTo(0.5 * mr, 6);
        expect(roof.color.g).toBeCloseTo(0.4 * mg, 6);
        expect(roof.color.b).toBeCloseTo(0.3 * mb, 6);
        // The loaded material is untouched, so the GLB cache stays clean.
        expect(source.color.r).toBe(0.5);
    });

    it('is idempotent: a second pass does not compound the tint', () => {
        const source = makeSourceMaterial();
        const root = makeFarmhouse(source);
        applyFarmhouseMaterialRoles(root);

        const roof = root.children.find((child) => child.name === 'Mesh_RoofA').material;
        const before = roof.color.clone();

        const second = applyFarmhouseMaterialRoles(root);
        expect(second.applied).toBe(false);
        expect(root.children.find((child) => child.name === 'Mesh_RoofA').material).toBe(roof);
        expect(roof.color.r).toBe(before.r);
        expect(roof.color.g).toBe(before.g);
        expect(roof.color.b).toBe(before.b);
    });

    it('shares one trio across every clone of the same loaded material', () => {
        // TerrainBuilder.addFarmHouse clones the cached GLB root on every scene
        // load, and the building clear path removes without disposing. Deriving
        // per clone would leak three materials per load.
        const source = makeSourceMaterial();
        const first = makeFarmhouse(source);
        const second = makeFarmhouse(source);
        applyFarmhouseMaterialRoles(first);
        applyFarmhouseMaterialRoles(second);

        const roofOf = (root) => root.children.find((child) => child.name === 'Mesh_RoofA').material;
        expect(roofOf(second)).toBe(roofOf(first));
    });

    it('reports rather than throws when a mesh name is not covered', () => {
        const source = makeSourceMaterial();
        const root = makeFarmhouse(source);
        const stray = new Mesh(new BoxGeometry(1, 1, 1), source);
        stray.name = 'Mesh_SolarPanel';
        root.add(stray);

        const summary = applyFarmhouseMaterialRoles(root);
        expect(summary.unknownMeshNames).toEqual(['Mesh_SolarPanel']);
        expect(stray.material).toBe(source);
    });

    it('returns an inert summary for a root it cannot walk', () => {
        const summary = applyFarmhouseMaterialRoles(null);
        expect(summary.applied).toBe(false);
        expect(summary.visitedMeshes).toBe(0);
        expect(summary.roleMaterialCount).toBe(0);
    });
});

describe('the trio survives WebGPU node-material adaptation as three', () => {
    it('is not touched by the tree/rock name-keyed material adapter', () => {
        // js/world/webgpuMaterialAdapter.js only ever runs over builder.models
        // trees / treesLod1 / rocks, and its name table is `branches` + `leaves`.
        // Running it against the farmhouse anyway proves it could not collapse
        // the trio even if the wiring changed.
        const source = makeSourceMaterial();
        const root = makeFarmhouse(source);
        applyFarmhouseMaterialRoles(root);

        const before = root.children.map((child) => child.material);
        const result = replaceTreeMaterialsByName(root, {
            branches: () => new MeshStandardMaterial(),
            leaves: () => new MeshStandardMaterial(),
        });

        expect(result.replacedMaterials).toBe(0);
        expect(result.missingTargets).toEqual(['branches', 'leaves']);
        expect(root.children.map((child) => child.material)).toEqual(before);
    });

    it('presents three distinct material instances, which is what fromMaterial keys on', () => {
        // three's NodeLibrary.fromMaterial builds one MeshStandardNodeMaterial
        // per source MeshStandardMaterial instance and copies every property
        // across, so distinct instances with distinct colour and roughness are
        // exactly what makes three node materials on the WebGPU path.
        const source = makeSourceMaterial();
        const root = makeFarmhouse(source);
        applyFarmhouseMaterialRoles(root);

        const roleMaterials = new Set();
        for (const child of root.children) {
            if (child.material.userData?.farmhouseMaterialRole) roleMaterials.add(child.material);
        }

        expect(roleMaterials.size).toBe(3);
        expect(new Set([...roleMaterials].map((material) => material.uuid)).size).toBe(3);
        expect(new Set([...roleMaterials].map((material) => material.type))).toEqual(
            new Set(['MeshStandardMaterial']),
        );
        expect(new Set([...roleMaterials].map((material) => material.color.getHex())).size).toBe(3);
        expect(new Set([...roleMaterials].map((material) => material.roughness)).size).toBe(3);
    });
});
