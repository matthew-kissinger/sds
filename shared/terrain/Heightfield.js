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
    }

    /**
     * Fetch a baked R32F heightmap and its sidecar manifest, then construct an instance.
     * Browser-only for Phase A. Workers will embed bytes in Phase B.
     *
     * @param {string} url Path to the .r32f bytes; manifest expected at `${url}.json`.
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
