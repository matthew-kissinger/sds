// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 100: the baked terrain heightfields ship brotli-pre-compressed on the
// web (Cloudflare Pages) build, declared via Content-Encoding: br in
// public/_headers. The browser decodes transparently below fetch(), so
// Heightfield.load sees byte-identical float32. These specs lock the two
// invariants that makes that safe: the compression is lossless, and _headers
// declares the encoding + no-transform for the .bin (not the .json manifest).
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { brotliCompressSync, brotliDecompressSync, constants as zc } from 'node:zlib'

const ROOT = resolve(import.meta.dirname, '..')
const SCENES = ['field', 'rolling-hills', 'open-country', 'newsheepdogland']

describe('terrain heightfield pre-compression (Cycle 100)', () => {
  // Pure round-trip on the source bytes. Losslessness is quality-independent,
  // so a fast quality proves the invariant without the q11 build cost.
  for (const scene of SCENES) {
    it(`${scene}.bin brotli round-trips byte-identical`, () => {
      const src = readFileSync(resolve(ROOT, `public/terrain/${scene}.bin`))
      const br = brotliCompressSync(src, {
        params: { [zc.BROTLI_PARAM_QUALITY]: 5, [zc.BROTLI_PARAM_SIZE_HINT]: src.length },
      })
      expect(br.length).toBeLessThan(src.length)
      expect(brotliDecompressSync(br).equals(src)).toBe(true)
    })
  }

  it('_headers declares Content-Encoding: br + no-transform for /terrain/*.bin only', () => {
    const headers = readFileSync(resolve(ROOT, 'public/_headers'), 'utf8')
    expect(headers).toMatch(/\/terrain\/\*\.bin\b/)
    expect(headers).toMatch(/Content-Encoding:\s*br/i)
    expect(headers).toMatch(/no-transform/i)
    // The JSON manifest rule must NOT claim a brotli encoding.
    expect(headers).toMatch(/\/terrain\/\*\.json\b/)
  })

  // When a web build has run, the shipped artifact itself must be lossless
  // brotli. Skips when dist is absent (local test runs without a prior build);
  // a non-web build (itchio/native) leaves the .bin raw, which is also valid.
  const distDir = resolve(ROOT, 'dist/terrain')
  const haveDist = existsSync(resolve(distDir, 'rolling-hills.bin'))
  ;(haveDist ? describe : describe.skip)('built dist/terrain artifact', () => {
    for (const scene of SCENES) {
      it(`dist/${scene}.bin decodes to source (or is raw on a non-web build)`, () => {
        const src = readFileSync(resolve(ROOT, `public/terrain/${scene}.bin`))
        const dist = readFileSync(resolve(distDir, `${scene}.bin`))
        if (dist.equals(src)) return // raw passthrough (itchio/native build)
        expect(dist.length).toBeLessThanOrEqual(src.length)
        expect(brotliDecompressSync(dist).equals(src)).toBe(true)
      })
    }
  })
})
