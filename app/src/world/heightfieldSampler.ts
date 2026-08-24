// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The heightfield sampler. Ported from `sds/shared/terrain/Heightfield.js`
 * (same license, same copyright holder), keeping its two load-bearing ideas:
 *
 *  1. one bilinear sampler over a baked R32F grid, and
 *  2. the sample-vs-meshSampleY split - the field's own bilinear value is NOT
 *     the Y the renderer draws, because the renderer draws triangles.
 *
 * herd narrows that split rather than carrying it. In sds the visible mesh was
 * a different resolution from the grid AND applied its own edge falloff at
 * build time, so `meshSampleY` needed a second array captured from the mesh
 * after displacement - a render-state cache hanging off a shared module, null
 * on the worker, which spec/02 explicitly calls out as a boundary-blurring
 * mistake. Here the bake writes the grid the mesh is built from: terrain mesh
 * vertex (ix, iz) IS grid sample (ix, iz), edge fade already baked in. So
 * `meshSampleY` is a pure function of the same committed array, no capture, no
 * mutable cache, no null-on-the-worker.
 *
 * Which one to call:
 *
 *  - `groundY(x, z)` - THE single source of truth for anything that sits on the
 *    ground. It is `meshSampleY`: the exact surface the player sees, so nothing
 *    ever floats or sinks inside a quad. Every ground-sitting object calls this
 *    and only this.
 *  - `sample(x, z)` - the field's bilinear value, for continuous work that
 *    wants a smooth function rather than the drawn facets (normals, gradients).
 *
 * Pure arithmetic: no three, no DOM, no fetch. The loader lives next door in
 * heightfield.ts so this module stays testable in node against the committed
 * bytes.
 *
 * NOTE ON UNITS. The grid stores metres directly, unlike sds's normalized
 * [0,1] plus `peakHeight`. One less multiply per sample and one less way for a
 * consumer to forget the scale; `amplitude` in the manifest is the promise the
 * bake checks, not a factor callers must apply.
 */

/** A flattened rect: where a structure stands, and a scatter keep-out. */
export interface TerrainPad {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Smoothstep rim width in metres, outside the rect. */
  readonly rim: number;
  /** The flat height in metres inside the rect. */
  readonly level: number;
}

/** assets/terrain/manifest.json, as the app reads it. */
export interface HeightfieldManifest {
  readonly version: number;
  readonly recipe: string;
  readonly seed: number;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  /** Side length of the square footprint in metres, centred on the origin. */
  readonly worldSize: number;
  /** Metres between grid samples. worldSize / (width - 1). */
  readonly spacing: number;
  /** Peak |height| in metres the bake normalised to. */
  readonly amplitude: number;
  readonly relief: number;
  readonly maxGradient: number;
  readonly pads: readonly TerrainPad[];
}

export class Heightfield {
  readonly data: Float32Array;
  readonly manifest: HeightfieldManifest;
  /** Last valid index on either axis. Hoisted: every sample uses it. */
  private readonly maxIndex: number;
  private readonly half: number;

  constructor(data: Float32Array, manifest: HeightfieldManifest) {
    const expected = manifest.width * manifest.height;
    if (data.length !== expected) {
      throw new RangeError(
        `Heightfield: ${data.length} samples, manifest says ${expected} (${manifest.width}x${manifest.height})`,
      );
    }
    if (manifest.width !== manifest.height) {
      throw new RangeError('Heightfield: the footprint is square by construction');
    }
    this.data = data;
    this.manifest = manifest;
    this.maxIndex = manifest.width - 1;
    this.half = manifest.worldSize / 2;
  }

  /**
   * Grid coordinate for a world X or Z, clamped to the footprint. Outside it
   * the ground is the flat skirt, which the bake fades the edge samples to, so
   * clamping and "flat outside" are the same answer.
   */
  private axis(world: number): number {
    const raw = (world + this.half) / this.manifest.spacing;
    return raw < 0 ? 0 : raw > this.maxIndex ? this.maxIndex : raw;
  }

  /**
   * Bilinear height in metres. Smooth everywhere, which is what gradients and
   * normals want; it is NOT what the renderer draws (see `meshSampleY`).
   */
  sample(x: number, z: number): number {
    const width = this.manifest.width;
    const data = this.data;
    const cu = this.axis(x);
    const cv = this.axis(z);

    const ix0 = Math.floor(cu);
    const iz0 = Math.floor(cv);
    const ix1 = ix0 < this.maxIndex ? ix0 + 1 : ix0;
    const iz1 = iz0 < this.maxIndex ? iz0 + 1 : iz0;
    const fx = cu - ix0;
    const fz = cv - iz0;

    const h00 = data[iz0 * width + ix0]!;
    const h10 = data[iz0 * width + ix1]!;
    const h01 = data[iz1 * width + ix0]!;
    const h11 = data[iz1 * width + ix1]!;

    const near = h00 + (h10 - h00) * fx;
    const far = h01 + (h11 - h01) * fx;
    return near + (far - near) * fz;
  }

  /**
   * Visual surface Y: the exact height of the triangle the renderer draws at
   * (x, z). Grid samples are mesh vertices, and the mesh splits each quad on
   * its south-west to north-east diagonal the way PlaneGeometry does, so this
   * is the drawn surface and not an approximation of it.
   *
   *   a = (ix0, iz0)  b = (ix0, iz1)  c = (ix1, iz1)  d = (ix1, iz0)
   *   triangles (a, b, d) and (b, c, d)
   */
  meshSampleY(x: number, z: number): number {
    const width = this.manifest.width;
    const data = this.data;
    const cu = this.axis(x);
    const cv = this.axis(z);

    const ix0 = Math.floor(cu);
    const iz0 = Math.floor(cv);
    const ix1 = ix0 < this.maxIndex ? ix0 + 1 : ix0;
    const iz1 = iz0 < this.maxIndex ? iz0 + 1 : iz0;
    const fu = cu - ix0;
    const fv = cv - iz0;

    const ha = data[iz0 * width + ix0]!;
    const hb = data[iz1 * width + ix0]!;
    const hc = data[iz1 * width + ix1]!;
    const hd = data[iz0 * width + ix1]!;

    if (fu + fv <= 1) return (1 - fu - fv) * ha + fv * hb + fu * hd;
    return (1 - fu) * hb + (fu + fv - 1) * hc + (1 - fv) * hd;
  }

  /**
   * The ground height every ground-sitting object stands on. One function, one
   * answer, for sheep, dog, fence posts, pen floor, scatter and the camera's
   * ridge clamp: that single source of truth is what ends the floating-prop bug
   * class (spec/04).
   */
  groundY(x: number, z: number): number {
    return this.meshSampleY(x, z);
  }

  /**
   * Surface normal by central difference over the smooth field, one grid cell
   * either side. Written into `out` so hot paths allocate nothing.
   */
  normal(x: number, z: number, out: { x: number; y: number; z: number }): void {
    const eps = this.manifest.spacing;
    const nx = -(this.sample(x + eps, z) - this.sample(x - eps, z));
    const nz = -(this.sample(x, z + eps) - this.sample(x, z - eps));
    const ny = 2 * eps;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length < 1e-9) {
      out.x = 0;
      out.y = 1;
      out.z = 0;
      return;
    }
    out.x = nx / length;
    out.y = ny / length;
    out.z = nz / length;
  }
}

/** A flat field with the same footprint. See heightfield.ts for who sees it. */
export function flatHeightfield(manifest: HeightfieldManifest): Heightfield {
  return new Heightfield(new Float32Array(manifest.width * manifest.height), manifest);
}

/**
 * Decode the baked bytes. Little-endian R32F, row-major, index
 * `iz * width + ix`. Kept here so the browser loader and the node tests turn
 * bytes into a sampler through the same code.
 */
export function decodeHeightfield(bytes: ArrayBuffer, manifest: HeightfieldManifest): Heightfield {
  const expected = manifest.width * manifest.height * 4;
  if (bytes.byteLength !== expected) {
    throw new RangeError(`heightfield.bin is ${bytes.byteLength} bytes, manifest wants ${expected}`);
  }
  // Float32Array over the buffer reads host endianness. Every platform the
  // game runs on is little-endian; assert rather than assume.
  if (!LITTLE_ENDIAN) throw new Error('heightfield.bin is little-endian R32F');
  return new Heightfield(new Float32Array(bytes), manifest);
}

const LITTLE_ENDIAN = (() => {
  const probe = new DataView(new ArrayBuffer(2));
  probe.setUint16(0, 1, true);
  return probe.getUint8(0) === 1;
})();
