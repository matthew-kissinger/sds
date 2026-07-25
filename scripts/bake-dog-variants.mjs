#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Dog GLB bake. This script is the sole owner of assets/models/<dog>.glb;
 * scripts/compress-glbs.mjs skips them (see its OWNED_ELSEWHERE list).
 *
 * Cycle 91 Phase 6: dog animation dedup.
 *
 * The five dog GLBs each embed the identical clip set (~800 KB x5 of
 * duplicated keyframe data). Jep - the critical-loaded default dog - keeps
 * its animations and acts as the shared clip source; this script strips the
 * animations from the other four and re-compresses them, and the loader
 * (TerrainBuilder._loadAnimalModel) falls back to Jep's clips for any dog
 * GLB that ships without animations.
 *
 * Guard: before stripping anything, every dog's clip set is compared to
 * Jep's (clip names + per-clip channel target-path multiset). A mismatch
 * aborts, because then the clips are NOT interchangeable and the dedup
 * premise is wrong. A dog that already carries zero clips is treated as
 * already-baked and skipped, so the script is re-runnable.
 *
 * Cycle 112 Phase 2: Jep's own clip set is now a manifest.
 *
 * Jep shipped 19 clips at 1,301 KB against 206 KB of mesh, so 84% of the
 * heaviest file on the critical path was keyframe data. Eight of those clips
 * were unreachable: js/Sheepdog.js pins movement direction to 'forward', so
 * the L/R variants of every gait could never be selected. Three idle
 * variations went with them as a deliberate trade (six cycling idles cost
 * ~65 KB each and only show while the dog stands still). Nothing here is
 * deferred or loaded late; the clips simply do not exist any more, which is
 * why the runtime animation system needed no change.
 *
 * Keyframe data is also the one thing draco and meshopt do not touch, which
 * is why Jep was only 0.9% smaller than its uncompressed source. resample()
 * below collapses the constant tracks that dominate a skeletal rig.
 *
 * Usage: node scripts/bake-dog-variants.mjs
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat, writeFile } from 'node:fs/promises';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, meshopt, prune, resample, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS = join(resolve(__dirname, '..'), 'assets', 'models');

const SOURCE_DOG = 'Jep.glb';
const STRIP_DOGS = ['Pip.glb', 'Sally.glb', 'Shiloh.glb', 'George_Washington.glb'];

/**
 * The clips Jep ships, and therefore the clips every dog can play.
 *
 * This is an allow-list on purpose. A new clip added to the source rig will
 * NOT silently land on the critical path; it stays out until it is named
 * here, and the assertion below fails loudly if a name here disappears or is
 * renamed upstream.
 *
 * Every name must also appear in ANIMATION_STATES in js/Sheepdog.js, and the
 * reverse: a state naming a clip that is not baked shows the dog frozen in
 * its last pose. tests/dog-asset-budget.spec.js pins both directions.
 */
const JEP_KEEP_CLIPS = [
    // Idles. Cycled every 3-7s by Sheepdog.cycleIdleAnimation while stationary.
    'Idle_1', 'Idle_2', 'Idle_4',
    // The four gait tiers, selected by speed. All four are reachable within
    // seconds of spawn, so all four are base clips.
    'Walk_F_IP', 'Trot_F_IP', 'Run_F_IP', 'RunFast_F_IP',
    // Bark is bound to Space and can fire at t=0.
    'Bark',
];

/** Drop every clip not named in `keep`, returning the dropped names. */
function keepOnlyClips(doc, keep) {
    const dropped = [];
    for (const anim of doc.getRoot().listAnimations()) {
        if (keep.includes(anim.getName())) continue;
        dropped.push(anim.getName());
        for (const ch of anim.listChannels()) ch.dispose();
        for (const s of anim.listSamplers()) s.dispose();
        anim.dispose();
    }
    return dropped;
}

const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(),
        'draco3d.encoder': await draco3d.createEncoderModule(),
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
    });

function clipSignature(doc) {
    return doc.getRoot().listAnimations().map((anim) => ({
        name: anim.getName(),
        channels: anim.listChannels()
            .map((ch) => `${ch.getTargetNode()?.getName() ?? '?'}:${ch.getTargetPath()}`)
            .sort(),
    })).sort((a, b) => a.name.localeCompare(b.name));
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const jepPath = join(MODELS, SOURCE_DOG);
const jepDoc = await io.read(jepPath);
const jepBefore = (await io.writeBinary(jepDoc)).byteLength;
const jepClipNames = jepDoc.getRoot().listAnimations().map((a) => a.getName());

// The interchangeability signature is taken BEFORE Jep is trimmed, because it
// answers "do the peers share this rig", which the trim does not change.
const jepSig = JSON.stringify(clipSignature(jepDoc));

// Fail loudly rather than silently shipping a dog missing a clip its state
// machine will ask for.
const missing = JEP_KEEP_CLIPS.filter((n) => !jepClipNames.includes(n));
if (missing.length > 0) {
    console.error(`[DOGS] ABORT: ${SOURCE_DOG} is missing clips named in JEP_KEEP_CLIPS: ${missing.join(', ')}`);
    console.error(`[DOGS]        present: ${jepClipNames.join(', ')}`);
    process.exit(1);
}

const dropped = keepOnlyClips(jepDoc, JEP_KEEP_CLIPS);
if (dropped.length > 0) {
    // resample() before the geometry codecs: it collapses constant keyframe
    // tracks, which is most of a skeletal rig, and the second prune() clears
    // the accessors it orphans.
    await jepDoc.transform(
        dedup(), weld(), prune(),
        resample({ tolerance: 1e-4 }),
        prune(),
        draco({ method: 'edgebreaker', encodeSpeed: 0, decodeSpeed: 5 }),
        meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    const jepOut = await io.writeBinary(jepDoc);
    await writeFile(jepPath, jepOut);
    console.log(`[DOGS] ${SOURCE_DOG}: ${(jepBefore / 1024).toFixed(0)} KB -> ${(jepOut.byteLength / 1024).toFixed(0)} KB`);
    console.log(`[DOGS]   kept ${JEP_KEEP_CLIPS.length}: ${JEP_KEEP_CLIPS.join(', ')}`);
    console.log(`[DOGS]   dropped ${dropped.length}: ${dropped.join(', ')}`);
} else {
    // Report the on-disk size, not the writeBinary roundtrip: re-serializing an
    // already-baked doc without the transform chain inflates it, which would
    // read as a size regression that never happened.
    const onDisk = (await stat(jepPath)).size;
    console.log(`[DOGS] ${SOURCE_DOG}: ${jepClipNames.length} clips, already matches the manifest (${(onDisk / 1024).toFixed(0)} KB)`);
}

for (const file of STRIP_DOGS) {
    const path = join(MODELS, file);
    const doc = await io.read(path);
    const clips = doc.getRoot().listAnimations();
    if (clips.length === 0) {
        console.log(`[DOGS] ${file}: already stripped, skipping`);
        continue;
    }
    const sig = JSON.stringify(clipSignature(doc));
    if (sig !== jepSig) {
        console.error(`[DOGS] ABORT: ${file} clip set differs from ${SOURCE_DOG} - clips are not interchangeable.`);
        process.exit(1);
    }
    const before = (await io.writeBinary(doc)).byteLength;
    keepOnlyClips(doc, []);
    await doc.transform(dedup(), weld(), prune(), draco({ encodeSpeed: 0, decodeSpeed: 5 }));
    const out = await io.writeBinary(doc);
    await writeFile(path, out);
    console.log(`[DOGS] ${file}: ${(before / 1024).toFixed(0)} KB -> ${(out.byteLength / 1024).toFixed(0)} KB (animations stripped; loader reuses ${SOURCE_DOG}'s clips)`);
}
console.log('[DOGS] done');
