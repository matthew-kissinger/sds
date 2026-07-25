// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 115 Phase 5 - the homestead lantern lights at dusk.
 *
 * Two jobs. The first block is the RECORD: Phase 5's open question was whether
 * the lamp should be a real light, and the plan's answer was "decide by
 * measurement". The measurement is a census of what is actually in the scene,
 * and the parts of it that a test can re-take are re-taken here so the decision
 * stops being true loudly rather than quietly. The prose version, with the
 * numbers and the reasoning, lives in `js/atmosphere/duskLamp.js`.
 *
 * The second block is the acceptance: unlit at noon, emissive past dusk, on
 * both render paths.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    BoxGeometry,
    Color,
    Group,
    Mesh,
    MeshStandardMaterial,
    Scene,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';

import { Atmosphere } from '../js/atmosphere/Atmosphere.js';
import {
    DUSK_LAMP_FULL_ELEVATION_RAD,
    DUSK_LAMP_OFF_ELEVATION_RAD,
    duskLampFactor,
} from '../js/atmosphere/duskLamp.js';
import {
    FARMHOUSE_ROLE_TREATMENTS,
    applyFarmhouseMaterialRoles,
} from '../js/world/farmhouseMaterialRoles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const DEG = Math.PI / 180;

/** Every `.js` file under `js/`, which is the whole client. */
function clientSources() {
    return readdirSync(resolve(REPO, 'js'), { recursive: true, encoding: 'utf8' })
        .filter((entry) => entry.endsWith('.js'))
        .map((entry) => ({
            path: `js/${entry.replaceAll('\\', '/')}`,
            source: readFileSync(resolve(REPO, 'js', entry), 'utf8'),
        }));
}

/**
 * Drop comments so the census below measures CODE. This file's own subject
 * matter forces the words `PointLight` and `lights:` into explanatory comments
 * in `duskLamp.js`, which is exactly the false positive to avoid.
 */
function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * The three lantern meshes as the shipped GLB names them, plus enough of the
 * house around them that the role table has something to sort. Standing in for
 * `TerrainBuilder.addFarmHouse`'s clone; `tests/farmhouse-material-roles.spec.js`
 * is the one that reads all 109 names out of the file itself.
 */
function makeLanternHouse() {
    const root = new Group();
    root.name = 'Farmhouse_Root';
    const source = new MeshStandardMaterial({ name: 'PaletteMaterial001' });
    const geometry = new BoxGeometry(1, 1, 1);
    for (const name of [
        'Mesh_RoofA',
        'Mesh_Body_WallFront',
        'Mesh_PorchColumnL',
        'Mesh_LanternBracket',
        'Mesh_LanternGlow',
        'Mesh_LanternCap',
    ]) {
        const mesh = new Mesh(geometry, source);
        mesh.name = name;
        root.add(mesh);
    }
    return root;
}

const lampOf = (root) => root.children.find((c) => c.name === 'Mesh_LanternGlow').material;

function makeAtmosphere(initialPreset) {
    return new Atmosphere(new Scene(), {
        initialPreset,
        enableDayNight: true,
        enableClouds: false,
    });
}

describe('Q3 record: why the lamp is emissive and not a real light', () => {
    it('confirms the client still has no point, spot, area or probe light', () => {
        // The premise of the whole decision. If this ever fails, somebody has
        // added the first one and the tradeoff below deserves a re-read rather
        // than an update to this expectation.
        const offenders = clientSources()
            .filter(({ source }) => /new\s+(?:THREE\.)?(?:Point|Spot|RectArea)Light\s*\(|new\s+(?:THREE\.)?LightProbe\s*\(/
                .test(stripComments(source)))
            .map(({ path }) => path);
        expect(offenders).toEqual([]);
    });

    it('confirms no hand-written WebGL shader in the client reads the light graph', () => {
        // This is the half of the measurement that killed the real light. A
        // PointLight only shows up on a surface whose material asks Three for
        // light uniforms; `THREE.ShaderMaterial` gets them only under
        // `lights: true`. Not one material in the repo asks. So the ground the
        // lamp stands on (js/TerrainBuilder.js) and the grass growing out of it
        // (js/GrassSystem.js) would have stayed exactly as dark with the light
        // as without it, on the WebGL path.
        const offenders = clientSources()
            .filter(({ source }) => /\blights\s*[:=]\s*true/.test(stripComments(source)))
            .map(({ path }) => path);
        expect(offenders).toEqual([]);
    });

    it('confirms the two render paths disagree about whether the ground is lit at all', () => {
        // The other half. Even if the WebGL side were fixed, the WebGPU ground
        // is a MeshLambertNodeMaterial (lit) while the WebGL ground is a
        // ShaderMaterial (not), so one real light would have painted a pool on
        // one renderer and nothing on the other. Emissive geometry is identical
        // on both by construction, which is why it wins.
        const webgl = stripComments(readFileSync(resolve(REPO, 'js/TerrainBuilder.js'), 'utf8'));
        const webgpu = stripComments(
            readFileSync(resolve(REPO, 'js/world/webgpuTerrainNodeMaterial.js'), 'utf8'),
        );
        expect(webgl).toContain('new THREE.ShaderMaterial({');
        expect(webgpu).toContain('new MeshLambertNodeMaterial()');
    });

    it('confirms Three resolves emissive against the live material, not a build-time copy', () => {
        // The load-bearing three internal, and the reason this ships with no
        // WebGPU twin: `MaterialNode`'s EMISSIVE scope builds material
        // REFERENCES rather than baked uniforms, and `MaterialReferenceNode`
        // resolves an unpinned reference against the rendered object's own
        // material every frame. So writing `emissiveIntensity` on the standard
        // material animates the lamp on the node path too.
        //
        // If a three upgrade moves this, the lamp needs an on-device re-check
        // before it can be trusted on WebGPU. Failing here is the warning.
        const materialNode = readFileSync(
            resolve(REPO, 'node_modules/three/src/nodes/accessors/MaterialNode.js'), 'utf8',
        );
        const referenceNode = readFileSync(
            resolve(REPO, 'node_modules/three/src/nodes/accessors/MaterialReferenceNode.js'), 'utf8',
        );
        expect(materialNode).toContain("this.getFloat( 'emissiveIntensity' )");
        expect(materialNode).toContain('node = materialReference( property, type );');
        expect(referenceNode).toContain('this.material !== null ? this.material : state.material');
    });

    it('carries emissive across the node-material conversion Three does for stock materials', () => {
        // `NodeLibrary.fromMaterial` is a `for (const key in material)` copy
        // onto a fresh node material. Reproduced literally, because the copy is
        // what puts the lantern's warm colour on the WebGPU path at all.
        const root = makeLanternHouse();
        applyFarmhouseMaterialRoles(root);
        const lamp = lampOf(root);
        lamp.emissiveIntensity = 1.75;

        const nodeMaterial = new MeshStandardNodeMaterial();
        for (const key in lamp) nodeMaterial[key] = lamp[key];

        expect(nodeMaterial.emissive).toBeInstanceOf(Color);
        expect(nodeMaterial.emissive.getHex()).toBe(lamp.emissive.getHex());
        expect(nodeMaterial.emissiveIntensity).toBe(1.75);
        // Lit on the node path, which is what makes the emissive term reachable.
        expect(nodeMaterial.lights).toBe(true);
    });
});

describe('duskLampFactor', () => {
    it('is out in daylight and lit once the sun is down', () => {
        expect(duskLampFactor(70 * DEG)).toBe(0); // noon, t=0.50
        expect(duskLampFactor(30 * DEG)).toBe(0); // golden hour, t=0.65
        expect(duskLampFactor(-8 * DEG)).toBe(1); // NIGHT_T, t=0.80
        expect(duskLampFactor(-22 * DEG)).toBe(1); // midnight
    });

    it('is part way up at sunset and part way down at sunrise', () => {
        // The numbers recorded in duskLamp.js's keyframe table.
        expect(duskLampFactor(8 * DEG)).toBeCloseTo(0.376, 3); // t=0.75
        expect(duskLampFactor(7 * DEG)).toBeCloseTo(0.438, 3); // t=0.25
    });

    it('closes exactly at the band edges, so neither end can drift open', () => {
        expect(duskLampFactor(DUSK_LAMP_OFF_ELEVATION_RAD)).toBe(0);
        expect(duskLampFactor(DUSK_LAMP_FULL_ELEVATION_RAD)).toBe(1);
        expect(DUSK_LAMP_OFF_ELEVATION_RAD).toBeGreaterThan(DUSK_LAMP_FULL_ELEVATION_RAD);
    });

    it('never brightens as the sun rises', () => {
        let previous = 1;
        for (let deg = -30; deg <= 90; deg += 1) {
            const value = duskLampFactor(deg * DEG);
            expect(value).toBeLessThanOrEqual(previous + 1e-12);
            previous = value;
        }
        expect(previous).toBe(0);
    });

    it('reads out rather than throwing on a garbage elevation', () => {
        expect(duskLampFactor(NaN)).toBe(0);
        expect(duskLampFactor(undefined)).toBe(0);
    });
});

describe('the farmhouse lantern is an emissive material the atmosphere drives', () => {
    it('gives the glow pane its own material with a warm emissive and a peak', () => {
        const root = makeLanternHouse();
        const summary = applyFarmhouseMaterialRoles(root);
        const lamp = lampOf(root);

        expect(summary.assigned.lantern).toBe(1);
        expect(summary.duskLampMaterialCount).toBe(1);
        expect(lamp.name).toBe('PaletteMaterial001_lantern');
        // Warm: red dominant, blue lowest. Authored in linear working space.
        expect(lamp.emissive.r).toBeGreaterThan(lamp.emissive.g);
        expect(lamp.emissive.g).toBeGreaterThan(lamp.emissive.b);
        expect(lamp.userData.duskLampPeakIntensity)
            .toBe(FARMHOUSE_ROLE_TREATMENTS.lantern.duskLampPeakIntensity);
        // Dark until something drives it, so an unbound scene is unchanged.
        expect(lamp.emissiveIntensity).toBe(0);
    });

    it('leaves the bracket and the cap on trim, unlit and un-peaked', () => {
        const root = makeLanternHouse();
        applyFarmhouseMaterialRoles(root);

        for (const name of ['Mesh_LanternBracket', 'Mesh_LanternCap']) {
            const material = root.children.find((c) => c.name === name).material;
            expect(material.userData.farmhouseMaterialRole).toBe('trim');
            expect(material.userData.duskLampPeakIntensity).toBeUndefined();
            expect(material.emissive.getHex()).toBe(0x000000);
        }
    });

    it('hands the lamp materials to the binder on the root userData', () => {
        // The seam js/boot/initWorld.js reads. Deliberately not in the summary,
        // which is JSON-serialised into the WebGPU boot diagnostic.
        const root = makeLanternHouse();
        applyFarmhouseMaterialRoles(root);
        expect(root.userData.duskLampMaterials).toEqual([lampOf(root)]);
    });

    it('renders unlit at noon and emissive past dusk', () => {
        // The two acceptance lines, driven through the lever the plan named.
        const root = makeLanternHouse();
        applyFarmhouseMaterialRoles(root);
        const lamp = lampOf(root);
        const atmosphere = makeAtmosphere('pastoral-noon');

        try {
            expect(atmosphere.bindDuskLamps(root.userData.duskLampMaterials)).toBe(1);

            atmosphere.setTimeOfDay(0.5);
            expect(lamp.emissiveIntensity).toBe(0);

            atmosphere.setTimeOfDay(0.75);
            const atDusk = lamp.emissiveIntensity;
            expect(atDusk).toBeGreaterThan(0);

            atmosphere.setTimeOfDay(0.8);
            expect(lamp.emissiveIntensity).toBeGreaterThan(atDusk);
            expect(lamp.emissiveIntensity)
                .toBeCloseTo(FARMHOUSE_ROLE_TREATMENTS.lantern.duskLampPeakIntensity, 6);

            // And back out again, so a survival run's second morning is not lit
            // by a lamp nobody blew out.
            atmosphere.setTimeOfDay(0.5);
            expect(lamp.emissiveIntensity).toBe(0);
        } finally {
            atmosphere.dispose();
        }
    });

    it('reads the scene preset on the scenes that have no day/night cycle', () => {
        // Home Field is `pastoral-noon` forever and Rolling Hills is `dusk`
        // forever; neither ever advances the day clock. Keying the curve on sun
        // elevation rather than on t is what makes both come out right.
        const noonRoot = makeLanternHouse();
        applyFarmhouseMaterialRoles(noonRoot);
        const noon = makeAtmosphere('pastoral-noon');

        const duskRoot = makeLanternHouse();
        applyFarmhouseMaterialRoles(duskRoot);
        const dusk = makeAtmosphere('dusk');

        try {
            noon.bindDuskLamps(noonRoot.userData.duskLampMaterials);
            dusk.bindDuskLamps(duskRoot.userData.duskLampMaterials);
            expect(lampOf(noonRoot).emissiveIntensity).toBe(0);
            expect(lampOf(duskRoot).emissiveIntensity).toBeGreaterThan(0);
        } finally {
            noon.dispose();
            dusk.dispose();
        }
    });

    it('follows a direct sun override too, which is how the capture rig poses it', () => {
        const root = makeLanternHouse();
        applyFarmhouseMaterialRoles(root);
        const atmosphere = makeAtmosphere('pastoral-noon');

        try {
            atmosphere.bindDuskLamps(root.userData.duskLampMaterials);
            expect(lampOf(root).emissiveIntensity).toBe(0);
            atmosphere.setSun({ elevation: -10 * DEG, azimuth: 0 });
            expect(lampOf(root).emissiveIntensity).toBeGreaterThan(0);
        } finally {
            atmosphere.dispose();
        }
    });

    it('replaces the binding rather than accumulating, and drops it on dispose', () => {
        // One Atmosphere per scene load, one bind per scene load. A scene with
        // no farmhouse passes nothing, which has to clear rather than keep.
        const root = makeLanternHouse();
        applyFarmhouseMaterialRoles(root);
        const atmosphere = makeAtmosphere('dusk');

        try {
            expect(atmosphere.bindDuskLamps(root.userData.duskLampMaterials)).toBe(1);
            expect(atmosphere.bindDuskLamps(root.userData.duskLampMaterials)).toBe(1);
            expect(atmosphere.bindDuskLamps(undefined)).toBe(0);
            expect(atmosphere.bindDuskLamps([null, undefined])).toBe(0);
        } finally {
            atmosphere.dispose();
        }
        expect(atmosphere.duskLamps).toEqual([]);
    });

    it('will not light a bound material that never declared a peak', () => {
        const stray = new MeshStandardMaterial({ name: 'NotALamp' });
        const atmosphere = makeAtmosphere('night');

        try {
            atmosphere.bindDuskLamps([stray]);
            expect(stray.emissiveIntensity).toBe(1); // three's untouched default
        } finally {
            atmosphere.dispose();
        }
    });
});
