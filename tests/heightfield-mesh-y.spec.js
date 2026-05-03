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

    it('falls back to sample(x, z) + 0.05 when no mesh grid is set (worker / tests)', () => {
        // No setMeshGrid call -> falls back to bilinear sample with the
        // historical 0.05 lift. surfaceY() must agree.
        // 2x2 texel grid over worldSize=4 has texel centres at (-2,-2), (2,-2),
        // (-2,2), (2,2); world (-1,-1) is the bilinear midpoint between all
        // four. data = [N=0, NE=0, S=1, SE=1] -> bilinear midpoint = 0.5.
        const data = new Float32Array([0, 0, 1, 1]);
        const field = new Heightfield({ data, width: 2, height: 2, worldSize: 4, peakHeight: 10 });

        // Bilinear midpoint = 0.5 * 10 = 5; +0.05 lift.
        expect(field.meshSampleY(-1, -1)).toBeCloseTo(5.05, 6);
        // surfaceY() is the same wrapper.
        expect(field.surfaceY(-1, -1)).toBeCloseTo(5.05, 6);
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
