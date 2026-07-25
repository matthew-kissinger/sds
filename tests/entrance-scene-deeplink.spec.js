// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 112 Phase 7: `?scene=<id>` deep links arm the world they name.
 *
 * Before this, the engine read the param and built that scene as the backdrop
 * while the entrance armed the default world unconditionally, so Play committed
 * Home Field and `_buildSwapUrl` then deleted the param because the target was
 * the default scene. A deep link appeared to work and then silently did not.
 *
 * Two halves, pinned here together because they only compose correctly as a
 * pair: `worldIndexFromSearch` decides what the entrance arms, and the
 * `_buildSwapUrl` param rule decides whether the URL survives the commit.
 *
 * The coming-soon case is deliberate rather than incidental. Newsheepdogland is
 * gated (D19) and its Play button is disabled, so arming it from a shared link
 * would land a player on a tile they cannot start. It falls back to the default
 * exactly like an unknown id.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WORLDS, DEFAULT_WORLD_INDEX, worldIndexFromSearch } from '../js/components/entrance/worlds.ts';
import { DEFAULT_SCENE_ID } from '../shared/scenes/index.js';

const MAIN_JS = readFileSync(fileURLToPath(new URL('../js/main.js', import.meta.url)), 'utf8');

/**
 * The `_buildSwapUrl` param rule from js/main.js, exercised in isolation.
 * Kept in lockstep with the real method by the assertion in the last block,
 * which pins the source text of the branch this mirrors.
 */
function swapUrlParam(href, toId, pinned) {
    const url = new URL(href);
    if (toId === DEFAULT_SCENE_ID && !pinned) {
        url.searchParams.delete('scene');
    } else {
        url.searchParams.set('scene', toId);
    }
    return url;
}

describe('worldIndexFromSearch', () => {
    it('arms the world a known scene id names', () => {
        const rolling = WORLDS.findIndex((w) => w.id === 'rolling-hills');
        const open = WORLDS.findIndex((w) => w.id === 'open-country');
        expect(rolling).toBeGreaterThanOrEqual(0);
        expect(worldIndexFromSearch('?scene=rolling-hills')).toBe(rolling);
        expect(worldIndexFromSearch('?scene=open-country')).toBe(open);
    });

    it('arms the default when no scene param is present', () => {
        expect(worldIndexFromSearch('')).toBe(DEFAULT_WORLD_INDEX);
        expect(worldIndexFromSearch('?lang=ja')).toBe(DEFAULT_WORLD_INDEX);
        expect(worldIndexFromSearch('?scene=')).toBe(DEFAULT_WORLD_INDEX);
    });

    it('falls back to the default for an unknown id instead of half-applying', () => {
        expect(worldIndexFromSearch('?scene=nonsense')).toBe(DEFAULT_WORLD_INDEX);
        expect(worldIndexFromSearch('?scene=../../etc')).toBe(DEFAULT_WORLD_INDEX);
    });

    it('falls back to the default for a coming-soon world', () => {
        const gated = WORLDS.filter((w) => w.comingSoon);
        expect(gated.length).toBeGreaterThan(0); // guard: this test is vacuous if nothing is gated
        for (const w of gated) {
            expect(worldIndexFromSearch(`?scene=${w.id}`)).toBe(DEFAULT_WORLD_INDEX);
        }
    });

    it('never arms a world whose Play button is disabled', () => {
        for (const w of WORLDS) {
            const armed = WORLDS[worldIndexFromSearch(`?scene=${w.id}`)];
            expect(armed.comingSoon).toBeFalsy();
        }
    });

    it('does not throw on a malformed search string', () => {
        expect(() => worldIndexFromSearch('?%')).not.toThrow();
        expect(worldIndexFromSearch('?%')).toBe(DEFAULT_WORLD_INDEX);
    });
});

describe('_buildSwapUrl scene param', () => {
    it('keeps the param through a commit when the session was deep-linked', () => {
        const url = swapUrlParam('https://sheepdogsim.com/?scene=rolling-hills', 'rolling-hills', true);
        expect(url.searchParams.get('scene')).toBe('rolling-hills');
    });

    it('keeps an explicit param even when swapping to the default scene', () => {
        // The regression: a deep-linked session that swaps to Home Field used to
        // collapse the URL to "/" because the target equals DEFAULT_SCENE_ID.
        const url = swapUrlParam('https://sheepdogsim.com/?scene=rolling-hills', DEFAULT_SCENE_ID, true);
        expect(url.searchParams.get('scene')).toBe(DEFAULT_SCENE_ID);
        expect(url.pathname + url.search).not.toBe('/');
    });

    it('still drops the param for a plainly-opened session', () => {
        const url = swapUrlParam('https://sheepdogsim.com/', DEFAULT_SCENE_ID, false);
        expect(url.searchParams.has('scene')).toBe(false);
        expect(url.toString()).toBe('https://sheepdogsim.com/');
    });

    it('sets the param for a non-default target regardless of pinning', () => {
        for (const pinned of [true, false]) {
            const url = swapUrlParam('https://sheepdogsim.com/', 'open-country', pinned);
            expect(url.searchParams.get('scene')).toBe('open-country');
        }
    });
});

describe('the two halves agree', () => {
    it('the mirrored branch above still matches the one in js/main.js', () => {
        // swapUrlParam is a mirror, so it can drift from the real method and
        // leave every assertion above passing against a fiction. Pin the two
        // load-bearing lines: the pin is set at construction, and the delete is
        // guarded by it.
        expect(MAIN_JS).toContain('this._sceneParamPinned = Boolean(requestedSceneId) && validSceneIds.includes(requestedSceneId);');
        expect(MAIN_JS).toContain("if (toId === DEFAULT_SCENE_ID && !this._sceneParamPinned) {");
    });

    it('every non-gated world id round-trips from URL to armed world and back', () => {
        for (const w of WORLDS.filter((x) => !x.comingSoon)) {
            const armed = WORLDS[worldIndexFromSearch(`?scene=${w.id}`)];
            expect(armed.id).toBe(w.id);
            const url = swapUrlParam(`https://sheepdogsim.com/?scene=${w.id}`, armed.id, true);
            expect(url.searchParams.get('scene')).toBe(w.id);
        }
    });
});
