import { describe, it, expect } from 'vitest';
import { Heightfield } from '../shared/terrain/Heightfield.js';

/**
 * Cycle 14 Phase 1 — meshSampleY contract.
 *
 * `meshSampleY` triangle-interpolates against the captured terrain-mesh
 * vertex grid (PlaneGeometry vertex order: index = iy * (segs+1) + ix,
 * with ix east / iy south after the canonical -PI/2 rotation about X).
 * Each quad splits along the SW->NE diagonal: NW triangle covers
 * fu+fv<=1, SE triangle covers fu+fv>1.
 */

function flatField() {
    // Tiny stand-in heightfield for the fallback path. Content is
    // irrelevant once setMeshGrid is called.
    const data = new Float32Array(4);
    return new Heightfield({ data, width: 2, height: 2, worldSize: 4, peakHeight: 1 });
}

/**
 * Build a (segs+1)² mesh grid from a row-major 2D array.
 * rows[iy][ix] -> displacedHeights[iy * stride + ix].
 * grid coordinates are world (X, Z) over `size × size` centred on origin.
 */
function attachMeshGrid(field, rows, size = 4) {
    const segs = rows.length - 1;
    const stride = segs + 1;
    const arr = new Float32Array(stride * stride);
    for (let iy = 0; iy <= segs; iy++) {
        for (let ix = 0; ix <= segs; ix++) {
            arr[iy * stride + ix] = rows[iy][ix];
        }
    }
    field.setMeshGrid({ displacedHeights: arr, segments: segs, size });
    return field;
}

describe('Heightfield.meshSampleY — vertex agreement', () => {
    it('returns the exact captured Y at each vertex of a 2x2 mesh grid', () => {
        // segs=1, stride=2. Quad covers world [-2,2] x [-2,2].
        // Vertex world coords (ix,iy) -> (ix*4 - 2, iy*4 - 2):
        //   (0,0) -> (-2,-2)
        //   (1,0) -> ( 2,-2)
        //   (0,1) -> (-2, 2)
        //   (1,1) -> ( 2, 2)
        const field = flatField();
        attachMeshGrid(
            field,
            [
                [10, 20], // iy=0 (north): NW=10, NE=20
                [30, 40] // iy=1 (south): SW=30, SE=40
            ],
            4
        );

        expect(field.meshSampleY(-2, -2)).toBeCloseTo(10, 6);
        expect(field.meshSampleY(2, -2)).toBeCloseTo(20, 6);
        expect(field.meshSampleY(-2, 2)).toBeCloseTo(30, 6);
        expect(field.meshSampleY(2, 2)).toBeCloseTo(40, 6);
    });

    it('triangle-interpolates the centre of a quad along the diagonal', () => {
        // Centre (0,0) lies on the SW->NE diagonal so both triangles agree.
        // NW: (1-0.5-0.5)*ha + 0.5*hb + 0.5*hd = 0*10 + 0.5*30 + 0.5*20 = 25
        // SE: (1-0.5)*hb + (0.5+0.5-1)*hc + (1-0.5)*hd = 0.5*30 + 0*40 + 0.5*20 = 25
        const field = flatField();
        attachMeshGrid(
            field,
            [
                [10, 20],
                [30, 40]
            ],
            4
        );
        expect(field.meshSampleY(0, 0)).toBeCloseTo(25, 6);
    });

    it('NW and SE triangles disagree off the diagonal (sanity check on triangulation)', () => {
        // For a non-planar quad, NW interp and SE interp differ off the
        // diagonal. This test pins that meshSampleY picks the *right*
        // triangle for each side of the diagonal.
        // ha=0, hb=0, hc=0, hd=10 — only the NE corner has height.
        const field = flatField();
        attachMeshGrid(
            field,
            [
                [0, 10], // NW=0, NE=10
                [0, 0] // SW=0, SE=0
            ],
            4
        );

        // NW triangle, fu=0.25, fv=0.25 (north of diagonal): hd contribution = fu*10 = 2.5
        // World: ix0=0, iy0=0, fu=0.25 -> x = -2 + 0.25*4 = -1; fv=0.25 -> z = -1.
        expect(field.meshSampleY(-1, -1)).toBeCloseTo(2.5, 6);

        // SE triangle, fu=0.75, fv=0.75 (south of diagonal):
        // hd contribution = (1-fv)*10 = 0.25*10 = 2.5; hb=hc=0.
        // World: x = -2 + 0.75*4 = 1; z = 1.
        expect(field.meshSampleY(1, 1)).toBeCloseTo(2.5, 6);
    });

    it('agrees with a planar slope at every interior point (slope along +X)', () => {
        // 3x3 grid, planar slope: y = ix*5. Triangle interp should be exact.
        const field = flatField();
        attachMeshGrid(
            field,
            [
                [0, 5, 10],
                [0, 5, 10],
                [0, 5, 10]
            ],
            4
        );

        // Sample at multiple non-vertex points; expected y = (worldX+2)/4 * 10.
        for (const x of [-1.7, -0.3, 0.5, 1.2]) {
            for (const z of [-1.7, 0, 1.5]) {
                const expected = ((x + 2) / 4) * 10;
                expect(field.meshSampleY(x, z)).toBeCloseTo(expected, 5);
            }
        }
    });

    it('agrees with a planar slope along +Z', () => {
        const field = flatField();
        attachMeshGrid(
            field,
            [
                [0, 0, 0],
                [5, 5, 5],
                [10, 10, 10]
            ],
            4
        );

        for (const x of [-1.7, 0, 1.5]) {
            for (const z of [-1.5, -0.2, 0.7]) {
                const expected = ((z + 2) / 4) * 10;
                expect(field.meshSampleY(x, z)).toBeCloseTo(expected, 5);
            }
        }
    });

    it('clamps out-of-range queries to the nearest edge vertex', () => {
        const field = flatField();
        attachMeshGrid(
            field,
            [
                [10, 20],
                [30, 40]
            ],
            4
        );

        // Far outside footprint -> clamped to corner vertices.
        expect(field.meshSampleY(-1000, -1000)).toBeCloseTo(10, 6);
        expect(field.meshSampleY(1000, 1000)).toBeCloseTo(40, 6);
        expect(field.meshSampleY(1000, -2)).toBeCloseTo(20, 6);
        expect(field.meshSampleY(-2, 1000)).toBeCloseTo(30, 6);
    });

    it('throws when meshSampleY is called with no mesh grid bound (Cycle 30)', () => {
        // Cycle 9 Phase 5's defensive `sample(x, z) + 0.05` fallback was
        // removed in Cycle 30. Visual-Y has no meaningful fallback path:
        // either you have a captured terrain mesh to triangle-interp against,
        // or you should be calling `sample()` directly for sim/physics Y.
        const data = new Float32Array([0, 0, 1, 1]);
        const field = new Heightfield({ data, width: 2, height: 2, worldSize: 4, peakHeight: 10 });

        expect(() => field.meshSampleY(-1, -1)).toThrow(/no mesh grid bound/);
        expect(() => field.surfaceY(-1, -1)).toThrow(/no mesh grid bound/);
        // Error message names the remediation so callers know which API to use.
        expect(() => field.meshSampleY(0, 0)).toThrow(/setMeshGrid|bakeMeshGrid/);

        // Once a grid is bound (here via bakeMeshGrid), meshSampleY works.
        // Use a worldSize large enough that the centre vertex isn't in the
        // smoothstep fade band.
        const big = new Heightfield({
            data: new Float32Array(4).fill(0.5),
            width: 2,
            height: 2,
            worldSize: 200,
            peakHeight: 10
        });
        big.bakeMeshGrid({ segments: 2, size: 100 });
        expect(big.meshSampleY(0, 0)).toBeCloseTo(5, 6); // 0.5 * 10, no lift
    });

    it('surfaceY delegates to meshSampleY when grid is set (no extra lift)', () => {
        const field = flatField();
        attachMeshGrid(
            field,
            [
                [10, 20],
                [30, 40]
            ],
            4
        );
        // Was sample()+0.05; is now triangle-interp with no lift.
        expect(field.surfaceY(0, 0)).toBeCloseTo(25, 6);
        expect(field.surfaceY(-2, -2)).toBeCloseTo(10, 6);
    });

    it('rejects mesh-grid arrays of the wrong length', () => {
        const field = flatField();
        expect(() =>
            field.setMeshGrid({ displacedHeights: new Float32Array(3), segments: 1, size: 4 })
        ).toThrow(/length/);
        expect(() =>
            field.setMeshGrid({ displacedHeights: [0, 0, 0, 0], segments: 1, size: 4 })
        ).toThrow(TypeError);
    });
});

describe('Heightfield.bakeMeshGrid — algorithm', () => {
    /** Minimal 4-texel field: data[iz*W + ix] over W=H=2 covering worldSize=4. */
    function constantField(value, peakHeight = 1, worldSize = 4) {
        const data = new Float32Array(4).fill(value);
        return new Heightfield({ data, width: 2, height: 2, worldSize, peakHeight });
    }

    it('returns a Float32Array of length (segments+1)² and binds it via setMeshGrid', () => {
        const field = constantField(0.5, 10, 4);
        const grid = field.bakeMeshGrid({ segments: 4, size: 4 });
        expect(grid).toBeInstanceOf(Float32Array);
        expect(grid.length).toBe((4 + 1) * (4 + 1));
        // setMeshGrid was called: displacedHeights handle === returned grid.
        expect(field.displacedHeights).toBe(grid);
        expect(field.meshSegments).toBe(4);
        expect(field.meshSize).toBe(4);
    });

    it('reproduces sample(x, z) at every vertex when no falloff is needed', () => {
        // worldSize=200 → fadeStart=80, fadeEnd=100. mesh size=100 →
        // max radial=50 < fadeStart, so falloff stays 1 for every vertex.
        // peakHeight=10, all data = 0.7 → sample() returns 7.
        const field = constantField(0.7, 10, 200);
        const grid = field.bakeMeshGrid({ segments: 4, size: 100 });
        // 5×5 grid, every cell should be 7 (no falloff fires).
        for (let i = 0; i < grid.length; i++) {
            expect(grid[i]).toBeCloseTo(7, 6);
        }
    });

    it('applies the smoothstep falloff over the last 20m of worldSize', () => {
        // worldSize=80 → fadeStart=20, fadeEnd=40. Mesh size=80 to expose
        // the full radial range, segments=8 → step=10, so vertices land at
        // worldX/Z ∈ {-40,-30,-20,-10,0,10,20,30,40}. Constant data=1,
        // peakHeight=1 → sample()=1 everywhere; the only thing varying is
        // the falloff multiplier.
        const field = constantField(1, 1, 80);
        const grid = field.bakeMeshGrid({ segments: 8, size: 80 });
        const stride = 9;

        // Centre vertex (radial=0) → falloff=1.
        expect(grid[4 * stride + 4]).toBeCloseTo(1, 6);
        // Edge vertex (radial=40 = fadeEnd) → falloff=0.
        expect(grid[0]).toBeCloseTo(0, 6);
        expect(grid[8]).toBeCloseTo(0, 6);
        expect(grid[8 * stride]).toBeCloseTo(0, 6);
        expect(grid[8 * stride + 8]).toBeCloseTo(0, 6);
        // Vertex at radial=fadeStart (20) → falloff=1 (boundary, smoothstep at 0).
        // (ix=2, iy=4) → worldX=-20, worldZ=0, radial=20. fadeStart=20, so
        // radial > fadeStart is false (strict >); falloff stays 1.
        expect(grid[4 * stride + 2]).toBeCloseTo(1, 6);
        // Vertex at radial=30 (fadeStart+10, halfway through fade) →
        // t = (30-20)/20 = 0.5; smoothstep(0.5) = 0.5; falloff = 1 - 0.5 = 0.5.
        // (ix=1, iy=4) → worldX=-30, worldZ=0, radial=30.
        expect(grid[4 * stride + 1]).toBeCloseTo(0.5, 6);
    });

    it('uses square-radial (Chebyshev) distance, not Euclidean, for the falloff', () => {
        // A vertex at (worldX=-30, worldZ=-30) has Euclidean ~42.4 but
        // square-radial 30. The square-radial path matches the visible
        // terrain mesh's smoothstep, which is what TerrainBuilder draws.
        // worldSize=80 → fadeStart=20, fadeEnd=40.
        const field = constantField(1, 1, 80);
        const grid = field.bakeMeshGrid({ segments: 8, size: 80 });
        const stride = 9;
        // Corner vertex at (ix=1, iy=1) → worldX=-30, worldZ=-30, square
        // radial = 30 → falloff = 0.5 (same as the on-axis radial=30 case).
        // Euclidean would have given radial ~42.4 → falloff = 0 (clamped).
        expect(grid[1 * stride + 1]).toBeCloseTo(0.5, 6);
    });

    it('binds the grid so meshSampleY switches from throwing to triangle-interp', () => {
        // worldSize=200 keeps the centre vertex out of the smoothstep zone
        // so we can compare visual Y vs raw sample() cleanly.
        // Pre-bake (Cycle 30): meshSampleY throws because no grid is bound.
        // Post-bake: meshSampleY triangle-interps against the bound grid.
        const field = constantField(1, 1, 200);
        expect(() => field.meshSampleY(0, 0)).toThrow(/no mesh grid bound/);

        field.bakeMeshGrid({ segments: 2, size: 100 });
        // Post-bake: triangle-interp returns the captured Y (no defensive lift).
        const postY = field.meshSampleY(0, 0);
        expect(postY).toBeCloseTo(1, 6);
    });

    it('agrees byte-for-byte with a hand-rolled mirror of the same algorithm', () => {
        // Pin equivalence to the inline TerrainBuilder.createTerrain loop
        // so the Phase 2 refactor is byte-identical.
        const data = new Float32Array(16);
        for (let i = 0; i < data.length; i++) data[i] = (i * 0.13) % 1;
        const field = new Heightfield({ data, width: 4, height: 4, worldSize: 80, peakHeight: 5 });

        const segments = 16;
        const size = 100; // mesh extends past worldSize, exposes the falloff
        const grid = field.bakeMeshGrid({ segments, size });

        // Hand-rolled reference (identical to the algorithm TerrainBuilder
        // had inline before Phase 2).
        const stride = segments + 1;
        const ref = new Float32Array(stride * stride);
        const half = size * 0.5;
        const hfHalf = field.worldSize * 0.5;
        const fadeStart = hfHalf - 20;
        const fadeEnd = hfHalf;
        for (let iy = 0; iy < stride; iy++) {
            const worldZ = iy * (size / segments) - half;
            for (let ix = 0; ix < stride; ix++) {
                const worldX = ix * (size / segments) - half;
                const h = field.sample(worldX, worldZ);
                const radial = Math.max(Math.abs(worldX), Math.abs(worldZ));
                let falloff = 1;
                if (radial > fadeStart) {
                    const t = Math.min(1, (radial - fadeStart) / (fadeEnd - fadeStart));
                    falloff = 1 - t * t * (3 - 2 * t);
                }
                ref[iy * stride + ix] = h * falloff;
            }
        }

        for (let i = 0; i < ref.length; i++) {
            expect(grid[i]).toBe(ref[i]);
        }
    });

    it('rejects invalid segments / size with RangeError', () => {
        const field = constantField(0.5, 1, 4);
        expect(() => field.bakeMeshGrid({ segments: 0, size: 4 })).toThrow(RangeError);
        expect(() => field.bakeMeshGrid({ segments: -1, size: 4 })).toThrow(RangeError);
        expect(() => field.bakeMeshGrid({ segments: 2.5, size: 4 })).toThrow(RangeError);
        expect(() => field.bakeMeshGrid({ segments: 2, size: 0 })).toThrow(RangeError);
        expect(() => field.bakeMeshGrid({ segments: 2, size: -1 })).toThrow(RangeError);
        expect(() => field.bakeMeshGrid({ segments: 2, size: Infinity })).toThrow(RangeError);
    });
});
