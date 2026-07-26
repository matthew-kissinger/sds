// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 117 Phase 5 - one marker, and copy that matches the island.
 *
 * Three things this phase is responsible for, and none of them is a number a
 * screenshot would catch.
 *
 * ONE (D28). There were two markers doing one job. Cycle 116 built the gate cue
 * (a warm column at the destination, a ground threshold arc, a warming post rim,
 * a screen-edge chevron) and left standing an older one: `Sheepdog`'s
 * `distanceIndicator`, a white octahedron over a green chevron, drawn with
 * `depthTest: false` eight metres above the dog and parented to the SCENE ROOT
 * rather than to the dog, which is why cycle116-validation/probe/09-horizon.png
 * catches it hanging under the camera with no ground connection. D13 says the
 * player learns one visual language; two markers for one job is what D28 ends.
 * The tests below pin the removal by SURFACE and by REACH, not by a grep for a
 * name: the class no longer exposes the marker API, and it no longer imports the
 * one accessor that let it park geometry on the scene root in the first place.
 *
 * TWO. The cue's near state has posts to warm on Rolling Hills now. Cycle 116
 * wired `setGatePostRimIntensity` to whatever `js/FencePresets.js` published on
 * a built gate, and the island published nothing because it built no gate. Phase
 * 4 raised a real fence there, so the same code path that was inert on the
 * island now drives real materials. That is a fact about the built scene, so it
 * is asserted against the real StructureBuilder rather than a stub.
 *
 * THREE. The copy. The island's objective was "a hidden corral. Find it" that
 * fired lightning; it is now a fenced pasture with one gate and no lightning at
 * all. Every player-facing surface that described the old one is swept here so
 * the cycle's acceptance ("no player-facing copy shall describe a hidden
 * corral") is a test rather than a memory.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Sheepdog } from '../js/Sheepdog.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { __TEST_ONLY__ as SEO } from '../js/utils/seo.js';
import {
    resolveGateDescriptor,
    setGatePostRimIntensity,
    gateRimFactor,
    GATE_RIM_MATERIALS_KEY,
    GATE_POST_RIM_PEAK_INTENSITY,
} from '../js/world/gateCue.js';

const repoFile = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('D28 - the dog carries no second marker', () => {
    it('exposes no distance-indicator API at all', () => {
        // The whole surface, including `setAsLocalPlayer`, whose only body was
        // `isLocalPlayer = true; createDistanceIndicator();`. Leaving the setter
        // behind would leave the flag main.js used to gate the per-frame update,
        // which is the shape a half-removal takes.
        for (const method of [
            'createDistanceIndicator',
            'ensureIndicatorAttached',
            'removeDistanceIndicator',
            'updateDistanceIndicator',
            'setAsLocalPlayer',
        ]) {
            expect(Sheepdog.prototype[method], `Sheepdog.${method} is retired`).toBeUndefined();
        }
    });

    it('cannot reach the scene root, which is what made the marker draw over everything', () => {
        // The indicator was added to `getSceneManager().getScene()` rather than
        // to the dog's own mesh, specifically so nothing could occlude it. With
        // that import gone the class has no handle on the scene graph above its
        // own mesh, so the failure mode cannot be reintroduced by accident - it
        // takes a new import, which is a visible line in a diff.
        const src = repoFile('js/Sheepdog.js');
        expect(src).not.toMatch(/getSceneManager/);
        // And nothing left in it draws on top of the world.
        expect(src).not.toMatch(/depthTest:\s*false/);
    });

    it('leaves no caller anywhere in the client still driving one', () => {
        // A teardown call that survives a removal is the classic leftover: every
        // one of these sites optional-chained the call, so a survivor would fail
        // silently forever. Comment lines are allowed and are the point: the
        // removal is explained where it happened, so a reader who greps the old
        // name lands on why it is gone rather than on nothing.
        const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);
        for (const rel of [
            'js/main.js',
            'js/boot/initWorld.js',
            'js/boot/loadScene.js',
            'js/cinematic.js',
            'js/Sheepdog.js',
        ]) {
            const live = repoFile(rel)
                .split('\n')
                .filter((line) => /distanceIndicator|isLocalPlayer/i.test(line) && !isComment(line));
            expect(live, `${rel} still drives the retired marker`).toEqual([]);
        }
    });

    it('keeps the competitive player icon, which is a different marker for a different job', () => {
        // The coloured cone over a dog says WHICH PLAYER that dog is, in
        // competitive and local 2-player. It is parented to the dog's mesh, it
        // is lit, and no cue replaces it. D28 is about the destination marker.
        for (const method of ['createPlayerIcon', 'removePlayerIcon', 'animatePlayerIcon']) {
            expect(typeof Sheepdog.prototype[method]).toBe('function');
        }
    });
});

describe('the island cue points at the pasture gate, and has posts to warm', () => {
    it('resolves a gate descriptor centred on the opening', () => {
        const descriptor = resolveGateDescriptor(rollingHills, null);
        expect(descriptor.kind).toBe('gate');
        expect(descriptor.position).toEqual({
            x: rollingHills.pen.gate.position.x,
            z: rollingHills.pen.gate.position.z,
        });
    });

    it('publishes gate-post rim materials the cue can drive, from the real builder', () => {
        // Cycle 116's rim was a no-op on this island because nothing built a
        // gate here. This is that half of the cue coming alive as a consequence
        // of Phase 4's fence, and it is asserted through the same userData key
        // `createGateCue` reads rather than through a second convention.
        return (async () => {
            const THREE = await import('three');
            const { StructureBuilder, resolveSceneEnclosure } = await import('../js/StructureBuilder.js');
            const { FieldConfig } = await import('../js/FieldConfig.js');

            const scene = new THREE.Scene();
            const sb = new StructureBuilder(scene);
            sb.buildSinglePlayerStructures(
                FieldConfig.getBounds(),
                FieldConfig.getGate(),
                FieldConfig.getPasture(),
                { perimeterFence: false, corral: null, enclosure: resolveSceneEnclosure(rollingHills) },
            );

            const materials = [];
            for (const root of Object.values(sb.structures).flat()) {
                root?.traverse?.((node) => {
                    const published = node.userData?.[GATE_RIM_MATERIALS_KEY];
                    if (published) materials.push(...published);
                });
            }
            expect(materials.length, 'the island gate published no rim materials').toBeGreaterThan(0);

            // They start dark and light from the cue's own proximity factor, so
            // this is the near state working on the island, not just a list.
            for (const m of materials) expect(m.emissiveIntensity).toBe(0);
            setGatePostRimIntensity(materials, gateRimFactor(0));
            for (const m of materials) {
                expect(m.emissiveIntensity).toBeCloseTo(GATE_POST_RIM_PEAK_INTENSITY, 9);
            }
        })();
    });
});

describe('no player-facing copy describes a hidden corral', () => {
    /**
     * Every surface that carried the old objective. `shared/scenes/*.js` is not
     * swept wholesale because its code comments legitimately explain what the
     * corral WAS and why it went; the shipped string is checked directly
     * instead.
     */
    const WHOLE_FILE = [
        'public/scenes/rolling-hills.html',
        'js/utils/seo.js',
        'js/components/StartScreen/SandboxSetup.js',
    ];
    const ROLLING_HILLS_LINES = [
        'public/llms.txt',
        'index.html',
        'README.md',
    ];

    it.each(WHOLE_FILE)('%s carries no corral and no lightning', (rel) => {
        expect(repoFile(rel)).not.toMatch(/corral|lightning/i);
    });

    it.each(ROLLING_HILLS_LINES)('%s describes the island without one', (rel) => {
        const lines = repoFile(rel)
            .split('\n')
            .filter((line) => /rolling.?hills/i.test(line));
        expect(lines.length, `${rel} no longer mentions the island at all`).toBeGreaterThan(0);
        for (const line of lines) {
            expect(line, `${rel}: ${line.trim()}`).not.toMatch(/corral|lightning|hidden/i);
        }
    });

    it('ships a scene description and SEO blurb about a pasture, in Matt voice', () => {
        const strings = [rollingHills.description, SEO.SCENE_META['rolling-hills'].description];
        for (const s of strings) {
            expect(s).not.toMatch(/corral|lightning|hidden/i);
            expect(s).toMatch(/pasture/i);
            // prose-and-voice.md: no em-dash (U+2014), no exclamation marks, no
            // hype words. Grep-testable, so it is grepped.
            expect(s).not.toMatch(/—/);
            expect(s).not.toMatch(/!/);
            expect(s).not.toMatch(/amazing|incredible|blazing|stunning|next-gen/i);
        }
    });

    it('keeps the game framed as one fenced pasture and three islands', () => {
        // The framing errors prose-and-voice.md names by name. Rolling Hills
        // growing a pasture makes "four islands" tempting and it is still wrong:
        // Home Field is a flat pasture, and the island now has a pasture ON it.
        for (const rel of ['index.html', 'README.md', 'public/llms.txt', ...WHOLE_FILE]) {
            expect(repoFile(rel), `${rel} miscounts the biomes`)
                .not.toMatch(/four islands|three biomes|two islands/i);
        }
    });
});
