import { describe, it, expect } from 'vitest';
import { Heightfield } from '../shared/terrain/Heightfield.js';

/**
 * Build a Heightfield from a 2D array of normalized heights.
 * Row-major: rows[z][x]. Centred on origin so worldSize/2 maps to last texel.
 */
function makeField(rows, { worldSize = 4, peakHeight = 10 } = {}) {
    const height = rows.length;
    const width = rows[0].length;
    const data = new Float32Array(width * height);
    for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
            data[z * width + x] = rows[z][x];
        }
    }
    return new Heightfield({ data, width, height, worldSize, peakHeight });
}

/** Texel centre in world coords for grid (width,height) over worldSize on origin. */
function worldOf(ix, iz, width, height, worldSize) {
    return {
        x: (ix / width) * worldSize - worldSize / 2,
        z: (iz / height) * worldSize - worldSize / 2
    };
}

describe('Heightfield.sample', () => {
    it('returns the raw value (scaled by peakHeight) at exact corner texels', () => {
        // 2x2 grid spanning worldSize=4 -> texel (0,0) at (-2,-2), (1,1) at (0,0).
        const field = makeField(
            [
                [0.0, 0.5],
                [0.25, 1.0]
            ],
            { worldSize: 4, peakHeight: 10 }
        );

        // Corner (-2, -2) -> texel (0,0) -> 0.0 * 10 = 0
        expect(field.sample(-2, -2)).toBeCloseTo(0, 6);
        // (0, 0) maps exactly to texel (1,1) -> 1.0 * 10 = 10
        expect(field.sample(0, 0)).toBeCloseTo(10, 6);
        // Texel (1, 0) at (0, -2) -> 0.5 * 10 = 5
        expect(field.sample(0, -2)).toBeCloseTo(5, 6);
        // Texel (0, 1) at (-2, 0) -> 0.25 * 10 = 2.5
        expect(field.sample(-2, 0)).toBeCloseTo(2.5, 6);
    });

    it('bilinearly interpolates: a half-texel query equals the mean of 4 neighbours', () => {
        // 2x2 grid; halfway between all four texels lies dead-centre at world coord
        // ((0/2)*4-2 + (1/2)*4-2)/2 = -1, and same for z. Mean is (1+2+3+4)/4 = 2.5.
        const field = makeField(
            [
                [0.1, 0.2],
                [0.3, 0.4]
            ],
            { worldSize: 4, peakHeight: 1 }
        );

        // Texel-space (0.5, 0.5) maps to world ((0.5/2)*4 - 2) = -1 on both axes.
        const expectedMean = (0.1 + 0.2 + 0.3 + 0.4) / 4;
        expect(field.sample(-1, -1)).toBeCloseTo(expectedMean, 6);
    });

    it('clamps out-of-bounds queries to the edge texel', () => {
        const field = makeField(
            [
                [0.0, 0.5],
                [0.5, 1.0]
            ],
            { worldSize: 4, peakHeight: 8 }
        );

        // Far south-west outside footprint -> texel (0,0) = 0.
        expect(field.sample(-1000, -1000)).toBeCloseTo(0, 6);
        // Far north-east outside footprint -> texel (1,1) = 1.0 * 8 = 8.
        expect(field.sample(1000, 1000)).toBeCloseTo(8, 6);
        // Off only one axis -> clamps that axis only.
        // x clamped to right edge (texel x=1), z stays at -2 -> texel (1,0) = 0.5 * 8 = 4.
        expect(field.sample(9999, -2)).toBeCloseTo(4, 6);
    });

    it('peakHeight scales the normalized data', () => {
        const rows = [
            [0.0, 1.0],
            [0.0, 1.0]
        ];
        const a = makeField(rows, { worldSize: 4, peakHeight: 1 });
        const b = makeField(rows, { worldSize: 4, peakHeight: 25 });

        expect(a.sample(0, 0)).toBeCloseTo(1, 6);
        expect(b.sample(0, 0)).toBeCloseTo(25, 6);
    });
});

describe('Heightfield.normal', () => {
    it('returns (0, 1, 0) on a perfectly flat field', () => {
        const flat = makeField(
            [
                [0.5, 0.5, 0.5],
                [0.5, 0.5, 0.5],
                [0.5, 0.5, 0.5]
            ],
            { worldSize: 100, peakHeight: 10 }
        );

        const n = flat.normal(0, 0);
        expect(n.x).toBeCloseTo(0, 6);
        expect(n.y).toBeCloseTo(1, 6);
        expect(n.z).toBeCloseTo(0, 6);
    });

    it('returns a unit vector (length 1)', () => {
        // Diagonal slope: height rises toward +x and +z corners.
        const field = makeField(
            [
                [0.0, 0.25, 0.5],
                [0.25, 0.5, 0.75],
                [0.5, 0.75, 1.0]
            ],
            { worldSize: 100, peakHeight: 20 }
        );
        const n = field.normal(10, 10);
        const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
        expect(len).toBeCloseTo(1, 6);
    });

    it('points away from the rising slope (slope rising in +x -> normal tilts in -x)', () => {
        // Height increases linearly along +x.
        const slope = makeField(
            [
                [0.0, 0.25, 0.5, 0.75, 1.0],
                [0.0, 0.25, 0.5, 0.75, 1.0],
                [0.0, 0.25, 0.5, 0.75, 1.0],
                [0.0, 0.25, 0.5, 0.75, 1.0],
                [0.0, 0.25, 0.5, 0.75, 1.0]
            ],
            { worldSize: 100, peakHeight: 50 }
        );

        const n = slope.normal(0, 0);
        expect(n.x).toBeLessThan(0);            // tilts opposite to slope direction
        expect(n.y).toBeGreaterThan(0);         // still mostly upward
        expect(Math.abs(n.z)).toBeLessThan(1e-6); // no slope along z
    });
});

describe('Heightfield construction & accessors', () => {
    it('exposes the underlying Float32Array via getRawArray', () => {
        const field = makeField(
            [
                [0.1, 0.2],
                [0.3, 0.4]
            ],
            { worldSize: 4, peakHeight: 1 }
        );
        const raw = field.getRawArray();
        expect(raw).toBeInstanceOf(Float32Array);
        expect(raw.length).toBe(4);
        expect(raw[0]).toBeCloseTo(0.1, 6);
        expect(raw[3]).toBeCloseTo(0.4, 6);
    });

    it('rejects mismatched data length', () => {
        expect(
            () =>
                new Heightfield({
                    data: new Float32Array(3),
                    width: 2,
                    height: 2,
                    worldSize: 4,
                    peakHeight: 1
                })
        ).toThrow(/length/);
    });

    it('rejects non-Float32Array data', () => {
        expect(
            () =>
                // @ts-expect-error testing runtime check
                new Heightfield({
                    data: [0, 0, 0, 0],
                    width: 2,
                    height: 2,
                    worldSize: 4,
                    peakHeight: 1
                })
        ).toThrow(TypeError);
    });
});

describe('texel grid layout sanity', () => {
    it('worldOf helper aligns with Heightfield mapping for arbitrary grids', () => {
        // 4x4 grid, worldSize 8 -> texel (0,0) at (-4,-4), (3,3) at (2,2).
        const W = 4;
        const H = 4;
        const WS = 8;
        const rows = Array.from({ length: H }, (_, z) =>
            Array.from({ length: W }, (_, x) => (x + z) / 8)
        );
        const field = makeField(rows, { worldSize: WS, peakHeight: 1 });

        for (let z = 0; z < H; z++) {
            for (let x = 0; x < W; x++) {
                const w = worldOf(x, z, W, H, WS);
                expect(field.sample(w.x, w.z)).toBeCloseTo(rows[z][x], 6);
            }
        }
    });
});
