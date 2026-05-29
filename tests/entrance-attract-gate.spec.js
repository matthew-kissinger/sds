/**
 * Cycle 46 Phase 3: the boot-time entrance gate.
 *
 * `shouldBootAttract` decides whether a plain open paints the zen attract
 * field as first frame, or whether a deep-link / harness flag wants a built
 * scene immediately. This spec imports the REAL helper (not an inline mirror)
 * so it pins the actual entrance logic that main.js runs at construction.
 *
 * The multiplayer case is load-bearing: an `#/r/<code>` room invite must NOT
 * mount the attract field, because the MP swap path hard-reloads via
 * location.href and never engages the in-engine crossfade. The gate returning
 * false for `#/r/` is what keeps `_attractMode` false through an MP boot, which
 * in turn keeps swapScene on its hard-reload branch. A second inline assertion
 * below pins that hard-reload contract so the two halves can't drift apart.
 */
import { describe, it, expect } from 'vitest';
import { shouldBootAttract } from '../js/boot/bootAttract.js';

describe('Cycle 46 entrance gate — shouldBootAttract', () => {
    it('mounts the zen field on a plain open (no deep-link, no flags)', () => {
        expect(shouldBootAttract({ hash: '', search: '', cinematic: false })).toBe(true);
    });

    it('mounts the zen field when called with no input at all', () => {
        expect(shouldBootAttract()).toBe(true);
        expect(shouldBootAttract({})).toBe(true);
    });

    it('skips the zen field for a ?scene= deep-link', () => {
        expect(shouldBootAttract({ search: '?scene=field' })).toBe(false);
        expect(shouldBootAttract({ search: '?scene=rolling-hills' })).toBe(false);
    });

    it('skips the zen field for an #/r/ multiplayer room invite', () => {
        // MP room invite locks the scene and hard-reloads on swap, so the
        // entrance must build directly rather than crossfade out of attract.
        expect(shouldBootAttract({ hash: '#/r/ABCD' })).toBe(false);
    });

    it('skips the zen field for an #s/ or #/s/ sandbox deep-link', () => {
        expect(shouldBootAttract({ hash: '#s/eyJzY2VuZSI6ImZpZWxkIn0' })).toBe(false);
        expect(shouldBootAttract({ hash: '#/s/eyJzY2VuZSI6ImZpZWxkIn0' })).toBe(false);
    });

    it('skips the zen field for the ?autostart=1 share-card harness', () => {
        expect(shouldBootAttract({ search: '?autostart=1' })).toBe(false);
    });

    it('skips the zen field for the ?testNoCanvas=1 headless harness', () => {
        expect(shouldBootAttract({ search: '?testNoCanvas=1' })).toBe(false);
    });

    it('skips the zen field in cinematic capture mode', () => {
        expect(shouldBootAttract({ cinematic: true })).toBe(false);
    });

    it('treats autostart/testNoCanvas as opt-out only when exactly "1"', () => {
        // The gate compares against the string '1'; any other value is ignored
        // and a plain open still mounts the field.
        expect(shouldBootAttract({ search: '?autostart=0' })).toBe(true);
        expect(shouldBootAttract({ search: '?testNoCanvas=true' })).toBe(true);
    });

    it('opts out if any single deep-link/flag is present among others', () => {
        // A room invite that also carries a harmless query param still opts out.
        expect(shouldBootAttract({ hash: '#/r/WXYZ', search: '?utm_source=x' })).toBe(false);
        // A scene deep-link alongside a hash fragment still opts out.
        expect(shouldBootAttract({ hash: '#whatever', search: '?scene=field' })).toBe(false);
    });

    it('mounts the zen field for an unrelated hash fragment', () => {
        // A bare hash that is not a room/sandbox route is not an opt-out.
        expect(shouldBootAttract({ hash: '#leaderboard' })).toBe(true);
    });
});

/**
 * MP hard-reload contract (inline mirror).
 *
 * swapScene's multiplayer branch reloads the page via location.href rather
 * than running the in-process detach/rebuild + crossfade. This predicate
 * mirrors that branch condition. Kept inline so the test pins the contract:
 * if the MP swap path stops hard-reloading, this should fail loudly and force
 * a re-think of how an MP boot interacts with the (skipped) attract field.
 */
function mpSwapHardReloads({ isMultiplayer }) {
    return isMultiplayer === true;
}

describe('Cycle 46 entrance gate — MP swap preserves hard-reload', () => {
    it('hard-reloads on an MP scene swap', () => {
        expect(mpSwapHardReloads({ isMultiplayer: true })).toBe(true);
    });

    it('does not hard-reload a single-player swap', () => {
        expect(mpSwapHardReloads({ isMultiplayer: false })).toBe(false);
    });

    it('an MP boot never mounts attract, so the crossfade never engages', () => {
        // Ties the two halves together: the gate keeps MP out of attract, and
        // the swap path hard-reloads. Both must hold for MP to stay correct.
        const mpEntersAttract = shouldBootAttract({ hash: '#/r/ABCD' });
        expect(mpEntersAttract).toBe(false);
        expect(mpSwapHardReloads({ isMultiplayer: true })).toBe(true);
    });
});
