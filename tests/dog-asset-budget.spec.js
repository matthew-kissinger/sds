// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 112 Phase 2: the dog GLB budget and the clip contract.
 *
 * Jep is the default dog and the only dog in GameAssetLoader's critical set, so
 * its bytes gate the first playable frame for every new player. It shipped at
 * 1,301 KB against 206 KB of mesh: 84% of the heaviest file on the critical
 * path was keyframe data, and eight of its nineteen clips were unreachable.
 *
 * Nothing guarded any of that. There is no test on GameAssetLoader, none on the
 * critical asset list, and none on dog animation, so a future bake could
 * silently put the weight back. This spec is that guard.
 *
 * The clip contract is pinned in BOTH directions on purpose:
 *   - a clip named in ANIMATION_STATES but absent from the GLB leaves the dog
 *     frozen in its last pose (Sheepdog.transitionToState warns and returns),
 *   - a clip in the GLB but named nowhere is dead weight on the critical path,
 *     which is the exact regression this phase removed.
 *
 * Modelled on tests/tree-assets.spec.js, the existing byte-budget pattern.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const url = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const JEP = url('../assets/models/Jep.glb');
const PEERS = ['Pip', 'Sally', 'Shiloh', 'George_Washington'].map((n) => url(`../assets/models/${n}.glb`));

/**
 * Jep's ceiling. Measured at 654 KB after the Cycle 112 bake; the headroom
 * absorbs codec drift across gltf-transform versions without going slack
 * enough to let a dropped clip back in (each is roughly 65 KB).
 */
const JEP_CEILING_BYTES = 700 * 1024;

/** What the cycle started from, so the saving is asserted rather than assumed. */
const JEP_CYCLE_START_BYTES = 1_331_856;
const REQUIRED_SAVING_BYTES = 600 * 1024;

const SHEEPDOG_SRC = readFileSync(url('../js/Sheepdog.js'), 'utf8');
const BAKE_SRC = readFileSync(url('../scripts/bake-dog-variants.mjs'), 'utf8');
const COMPRESS_SRC = readFileSync(url('../scripts/compress-glbs.mjs'), 'utf8');

/** Every clip name referenced by ANIMATION_STATES in js/Sheepdog.js. */
function clipNamesFromStates() {
    const table = SHEEPDOG_SRC.slice(
        SHEEPDOG_SRC.indexOf('const ANIMATION_STATES'),
        SHEEPDOG_SRC.indexOf('const SPEED_THRESHOLDS'),
    )
        // Comments in this block quote clip names in prose; only code counts.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
    expect(table.length).toBeGreaterThan(0);
    // Clip names are the quoted values; keys (animations, priority) are bare.
    return [...new Set([...table.matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g)].map((m) => m[1]))];
}

async function readClips(path) {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(),
        'draco3d.encoder': await draco3d.createEncoderModule(),
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
    });
    const doc = await io.read(path);
    return doc.getRoot().listAnimations().map((a) => a.getName());
}

describe('Jep byte budget', () => {
    it('stays under the critical-path ceiling', () => {
        const bytes = statSync(JEP).size;
        expect(bytes).toBeLessThanOrEqual(JEP_CEILING_BYTES);
    });

    it('is at least 600 KB smaller than at cycle start', () => {
        const saved = JEP_CYCLE_START_BYTES - statSync(JEP).size;
        expect(saved).toBeGreaterThanOrEqual(REQUIRED_SAVING_BYTES);
    });

    it('leaves the peer dogs clip-free so they keep sharing Jep', async () => {
        for (const p of PEERS) {
            expect(statSync(p).size).toBeLessThan(300 * 1024);
            expect(await readClips(p)).toEqual([]);
        }
    });
});

describe('clip contract', () => {
    it('ships exactly the clips the bake manifest names', async () => {
        const manifest = [...BAKE_SRC.matchAll(/const JEP_KEEP_CLIPS = \[([\s\S]*?)\];/g)]
            .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
        expect(manifest.length).toBeGreaterThan(0);
        expect((await readClips(JEP)).sort()).toEqual([...manifest].sort());
    });

    it('every clip the state machine can request exists in the GLB', async () => {
        const shipped = await readClips(JEP);
        for (const name of clipNamesFromStates()) {
            expect(shipped, `ANIMATION_STATES names "${name}" but the GLB does not ship it`).toContain(name);
        }
    });

    it('every clip in the GLB is reachable from the state machine', async () => {
        const referenced = clipNamesFromStates();
        for (const name of await readClips(JEP)) {
            expect(referenced, `Jep.glb ships "${name}" but no state can select it`).toContain(name);
        }
    });

    it('keeps all four gait tiers, which are all reachable within seconds of spawn', async () => {
        const shipped = await readClips(JEP);
        for (const gait of ['Walk_F_IP', 'Trot_F_IP', 'Run_F_IP', 'RunFast_F_IP']) {
            expect(shipped).toContain(gait);
        }
    });

    it('keeps Bark, which is bound to Space and can fire at t=0', async () => {
        expect(await readClips(JEP)).toContain('Bark');
    });
});

describe('bake ownership', () => {
    it('compress-glbs defers the dog rigs to bake-dog-variants', () => {
        // compress-glbs always re-reads from the pristine assets/_originals
        // backup, so without this exclusion a run would restore the 19-clip
        // source and undo the manifest. Its size-based skip happens to protect
        // Jep at 654 KB, but that is a coincidence of thresholds.
        expect(COMPRESS_SRC).toContain('OWNED_ELSEWHERE');
        for (const dog of ['Jep', 'Pip', 'Sally', 'Shiloh', 'George_Washington']) {
            expect(COMPRESS_SRC).toMatch(new RegExp(`\\^${dog}\\\\\\.glb\\$`, 'i'));
        }
    });
});
