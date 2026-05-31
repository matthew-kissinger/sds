import { describe, it, expect } from 'vitest';
import { mulberry32, withSeededRandom } from '../shared/Random.js';

// Characterization tests: lock the CURRENT actual behavior of shared/Random.js.
// These are deterministic-sim primitives shared client + Worker; the golden
// vectors below were captured from the current implementation. If the sim's
// PRNG output ever changes, multiplayer prediction desyncs - so this is a
// regression fence, not an aspiration.

describe('mulberry32', () => {
    // Golden vector: first 5 outputs for seed 12345, captured from the current
    // implementation. Same seed -> same sequence across V8 instances.
    it('yields a fixed sequence for seed 12345', () => {
        const rng = mulberry32(12345);
        const got = [rng(), rng(), rng(), rng(), rng()];
        expect(got).toEqual([
            0.9797282677609473,
            0.3067522644996643,
            0.484205421525985,
            0.817934412509203,
            0.5094283693470061,
        ]);
    });

    // Golden vector for seed 0 (exercises the >>> 0 unsigned coercion path).
    it('yields a fixed sequence for seed 0', () => {
        const rng = mulberry32(0);
        const got = [rng(), rng(), rng(), rng(), rng()];
        expect(got).toEqual([
            0.26642920868471265,
            0.0003297457005828619,
            0.2232720274478197,
            0.1462021479383111,
            0.46732782293111086,
        ]);
    });

    it('produces all outputs in [0, 1)', () => {
        const rng = mulberry32(987654321);
        for (let i = 0; i < 1000; i++) {
            const n = rng();
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThan(1);
        }
    });

    it('is reproducible: two generators with the same seed agree', () => {
        const a = mulberry32(42);
        const b = mulberry32(42);
        for (let i = 0; i < 20; i++) {
            expect(a()).toBe(b());
        }
    });

    it('different seeds diverge on the first output', () => {
        const a = mulberry32(1);
        const b = mulberry32(2);
        expect(a()).not.toBe(b());
    });
});

describe('withSeededRandom', () => {
    it('restores the original Math.random after normal completion', () => {
        const reference = Math.random;
        const result = withSeededRandom(123, () => {
            // Inside the wrapper, Math.random is the seeded PRNG (not the original).
            expect(Math.random).not.toBe(reference);
            const v = Math.random();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
            return 'ok';
        });
        expect(result).toBe('ok');
        expect(Math.random).toBe(reference);
    });

    it('restores the original Math.random even when fn() throws (try/finally)', () => {
        const reference = Math.random;
        const boom = new Error('boom');
        expect(() => {
            withSeededRandom(123, () => {
                expect(Math.random).not.toBe(reference);
                throw boom;
            });
        }).toThrow(boom);
        // finally block must have restored the saved reference despite the throw.
        expect(Math.random).toBe(reference);
    });

    it('seeds Math.random deterministically inside the callback', () => {
        const seq1 = withSeededRandom(777, () => [Math.random(), Math.random(), Math.random()]);
        const seq2 = withSeededRandom(777, () => [Math.random(), Math.random(), Math.random()]);
        expect(seq1).toEqual(seq2);
        // and it matches a bare mulberry32(777) sequence
        const rng = mulberry32(777);
        expect(seq1).toEqual([rng(), rng(), rng()]);
    });

    it('returns whatever fn() returns', () => {
        const obj = { tag: 'value' };
        expect(withSeededRandom(1, () => obj)).toBe(obj);
    });
});
