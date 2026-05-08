/**
 * Heightfield — deterministic bilinear sampler over a baked R32F height grid.
 *
 * Used by both client (TerrainBuilder displacement, sheep/dog y-clamp, grass
 * placement) and Worker sim (slope-modulated sheep speed). Pure ES + JSDoc;
 * no Three.js, no DOM.
 *
 * World coords map to texel coords:
 *   u = (x + worldSize/2) / worldSize * width
 *   v = (z + worldSize/2) / worldSize * height
 * Out-of-range queries clamp to the edge texel.
 *
 * The raw `data` array stores normalized [0,1] heights; `sample()` multiplies
 * by `peakHeight` so callers get world-space metres.
 */

/**
 * @typedef {Object} HeightfieldManifest
 * @property {number} width        Texel width
 * @property {number} height       Texel height
 * @property {number} worldSize    Side length of the square footprint, metres
 * @property {number} peakHeight   Max metres above ground (multiplies normalized data)
 * @property {number} [version]    Bake version (for cache invalidation)
 */

/**
 * @typedef {Object} HeightfieldInit
 * @property {Float32Array} data
 * @property {number} width
 * @property {number} height
 * @property {number} worldSize
 * @property {number} peakHeight
 */

export class Heightfield {
    /** @type {Float32Array} */
    data;
    /** @type {number} */
    width;
    /** @type {number} */
    height;
    /** @type {number} */
    worldSize;
    /** @type {number} */
    peakHeight;
    /**
     * Captured post-displacement Ys of the visible terrain mesh, indexed by
     * `iy * (segments + 1) + ix` over a `(segments+1)²` grid covering
     * `meshSize × meshSize` centred on origin. Set by `TerrainBuilder` after
     * vertex displacement so `meshSampleY` can interpolate against the same
     * triangles the renderer draws. Null on the worker / in tests.
     * @type {Float32Array | null}
     */
    displacedHeights;
    /** @type {number | null} */
    meshSegments;
    /** @type {number | null} */
    meshSize;

    /** @param {HeightfieldInit} init */
    constructor({ data, width, height, worldSize, peakHeight }) {
        if (!(data instanceof Float32Array)) {
            throw new TypeError('Heightfield: data must be a Float32Array');
        }
        if (data.length !== width * height) {
            throw new RangeError(
                `Heightfield: data length ${data.length} != width*height ${width * height}`
            );
        }
        this.data = data;
        this.width = width;
        this.height = height;
        this.worldSize = worldSize;
        this.peakHeight = peakHeight;
        this.displacedHeights = null;
        this.meshSegments = null;
        this.meshSize = null;
    }

    /**
     * Hand the captured visible-mesh heights to the heightfield so visual
     * consumers can query the same Y the renderer draws. `displacedHeights`
     * MUST have length `(segments + 1)²` and be in PlaneGeometry vertex
     * order (`iy * (segments+1) + ix`, with ix east, iy south after the
     * canonical `-PI/2` rotation about X).
     *
     * @param {{ displacedHeights: Float32Array, segments: number, size: number }} grid
     */
    setMeshGrid({ displacedHeights, segments, size }) {
        if (!(displacedHeights instanceof Float32Array)) {
            throw new TypeError('Heightfield.setMeshGrid: displacedHeights must be a Float32Array');
        }
        const expected = (segments + 1) * (segments + 1);
        if (displacedHeights.length !== expected) {
            throw new RangeError(
                `Heightfield.setMeshGrid: displacedHeights length ${displacedHeights.length} != (segments+1)² ${expected}`
            );
        }
        this.displacedHeights = displacedHeights;
        this.meshSegments = segments;
        this.meshSize = size;
    }

    /**
     * Fetch a baked R32F heightmap and its sidecar manifest, then construct an instance.
     * Browser-only for Phase A. Workers will embed bytes in Phase B.
     *
     * @param {string} url Path to the heightmap bytes (e.g. `.bin`); manifest expected at `${url}.json`. Note: the binary format is still raw R32F floats; the file extension was renamed from `.r32f` to `.bin` because itch.io's html-classic.itch.zone CDN returns 403 on unrecognised extensions.
     * @returns {Promise<Heightfield>}
     */
    static async load(url) {
        const [bytesRes, manifestRes] = await Promise.all([
            fetch(url),
            fetch(`${url}.json`)
        ]);
        if (!bytesRes.ok) {
            throw new Error(`Heightfield: failed to fetch ${url} (${bytesRes.status})`);
        }
        if (!manifestRes.ok) {
            throw new Error(
                `Heightfield: failed to fetch ${url}.json (${manifestRes.status})`
            );
        }
        const buffer = await bytesRes.arrayBuffer();
        /** @type {HeightfieldManifest} */
        const manifest = await manifestRes.json();
        const data = new Float32Array(buffer);
        return new Heightfield({
            data,
            width: manifest.width,
            height: manifest.height,
            worldSize: manifest.worldSize,
            peakHeight: manifest.peakHeight
        });
    }

    /**
     * Bilinear height sample in world metres.
     * @param {number} x World X (centred on origin)
     * @param {number} z World Z (centred on origin)
     * @returns {number} Height in metres above ground.
     */
    sample(x, z) {
        const { width, height, worldSize, data, peakHeight } = this;
        // World -> texel space.
        const u = ((x + worldSize * 0.5) / worldSize) * width;
        const v = ((z + worldSize * 0.5) / worldSize) * height;

        // Clamp so out-of-range coords return the nearest edge sample.
        const maxU = width - 1;
        const maxV = height - 1;
        const cu = u < 0 ? 0 : u > maxU ? maxU : u;
        const cv = v < 0 ? 0 : v > maxV ? maxV : v;

        const x0 = Math.floor(cu);
        const z0 = Math.floor(cv);
        const x1 = x0 < maxU ? x0 + 1 : x0;
        const z1 = z0 < maxV ? z0 + 1 : z0;

        const fx = cu - x0;
        const fz = cv - z0;

        const h00 = data[z0 * width + x0];
        const h10 = data[z0 * width + x1];
        const h01 = data[z1 * width + x0];
        const h11 = data[z1 * width + x1];

        const top = h00 + (h10 - h00) * fx;
        const bot = h01 + (h11 - h01) * fx;
        const normalized = top + (bot - top) * fz;

        return normalized * peakHeight;
    }

    /**
     * Visual surface Y at world (x, z) — triangle-interpolated against the
     * captured terrain-mesh vertex grid so consumers see *exactly* the Y
     * the renderer draws. Eliminates the bilinear-vs-mesh divergence that
     * makes grass / trees / rocks float intermittently inside any 10m quad
     * on a slope (Cycle 14 Phase 1).
     *
     * Falls back to `sample(x, z) + 0.05` when no mesh grid has been set
     * (worker, tests). The 0.05 lift is the Cycle 9 Phase 5 mitigation —
     * still useful as a defensive default.
     *
     * Use for visual placement only. Sim/physics keep using raw `sample()`
     * so behaviour stays decoupled from any render-time mesh resampling.
     *
     * @param {number} x World X
     * @param {number} z World Z
     * @returns {number} Visual surface Y in metres.
     */
    meshSampleY(x, z) {
        const grid = this.displacedHeights;
        if (!grid) return this.sample(x, z) + 0.05;

        const segs = this.meshSegments;
        const size = this.meshSize;
        const stride = segs + 1;
        const half = size * 0.5;

        // World -> mesh grid coords. Plane verts are laid out with ix east,
        // iy south after the canonical -PI/2 rotation about X (see
        // TerrainBuilder.createTerrain).
        const u = ((x + half) / size) * segs;
        const v = ((z + half) / size) * segs;

        // Clamp to grid; out-of-range queries fall on the flat-skirt edge.
        const maxIdx = segs;
        const cu = u < 0 ? 0 : u > maxIdx ? maxIdx : u;
        const cv = v < 0 ? 0 : v > maxIdx ? maxIdx : v;

        const ix0 = Math.floor(cu);
        const iy0 = Math.floor(cv);
        const ix1 = ix0 < maxIdx ? ix0 + 1 : ix0;
        const iy1 = iy0 < maxIdx ? iy0 + 1 : iy0;

        const fu = cu - ix0;
        const fv = cv - iy0;

        // PlaneGeometry's index order (a, b, d / b, c, d) splits each quad
        // along the SW->NE diagonal. NW triangle (containing the NW corner
        // a) covers fu+fv<1; SE triangle (containing SE corner c) covers
        // fu+fv>1.
        //   a = (ix0, iy0) NW, b = (ix0, iy1) SW, c = (ix1, iy1) SE, d = (ix1, iy0) NE
        const ha = grid[iy0 * stride + ix0];
        const hb = grid[iy1 * stride + ix0];
        const hc = grid[iy1 * stride + ix1];
        const hd = grid[iy0 * stride + ix1];

        if (fu + fv <= 1) {
            // NW triangle: P = (1-fu-fv)*a + fv*b + fu*d
            return (1 - fu - fv) * ha + fv * hb + fu * hd;
        }
        // SE triangle: P = (1-fu)*b + (fu+fv-1)*c + (1-fv)*d
        return (1 - fu) * hb + (fu + fv - 1) * hc + (1 - fv) * hd;
    }

    /**
     * Visual surface Y for entity placement — thin wrapper around
     * `meshSampleY` for backward compat. Pre-Cycle 14 this added a fixed
     * 0.05 lift to mask the bilinear-vs-mesh gap; that gap is now closed
     * directly so the lift is gone.
     *
     * @param {number} x World X
     * @param {number} z World Z
     * @returns {number} Visual surface Y in metres.
     */
    surfaceY(x, z) {
        return this.meshSampleY(x, z);
    }

    /**
     * Surface normal via central finite differences (epsilon = 1m).
     * @param {number} x World X
     * @param {number} z World Z
     * @returns {{x: number, y: number, z: number}} Unit normal.
     */
    normal(x, z) {
        const eps = 1;
        const hL = this.sample(x - eps, z);
        const hR = this.sample(x + eps, z);
        const hD = this.sample(x, z - eps);
        const hU = this.sample(x, z + eps);

        // Tangent vectors: (2eps, hR-hL, 0) along X, (0, hU-hD, 2eps) along Z.
        // Cross product (Tz x Tx) yields an upward normal.
        const nx = -(hR - hL);
        const ny = 2 * eps;
        const nz = -(hU - hD);

        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len < 1e-9) return { x: 0, y: 1, z: 0 };
        return { x: nx / len, y: ny / len, z: nz / len };
    }

    /**
     * Underlying normalized [0,1] grid. Treat as read-only.
     * @returns {Float32Array}
     */
    getRawArray() {
        return this.data;
    }
}
