// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Snapshot what a deployed Worker serves for every file in a build, so two
// deploys of the same build can be compared: Stage B of the `cf` step is cut
// to production only if the asset set and headers it serves are identical to
// the wrangler path's (STATUS.md, "The `cf` step is two stages").
//
//   node scripts/snapshot-served-assets.mjs --url https://<alias>.workers.dev --dist dist --out snapshot.json
//   node scripts/snapshot-served-assets.mjs --diff a.json b.json
//
// For every file under --dist (the built artifact, dist/release.json listed
// too) it GETs the same path on --url and records the status, the response
// headers that describe the asset (content type, cache control, etag, content
// length, encoding, the custom headers from app/public/_headers), and the
// SHA-256 of the body. Headers that vary per request or per edge (date, cf-ray,
// server-timing, report-to, nel, alt-svc, set-cookie) are left out on purpose.
// It also records the root (/), one unmatched path (the single-page fallback)
// and /index.html (the redirect to the root), because those are the asset
// layer's behaviour rather than any one file.
//
// --diff prints every path whose status, headers or body digest differ, and
// exits 1 if any do.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const KEEP = [
  'content-type', 'cache-control', 'etag', 'content-length', 'content-encoding',
  'x-content-type-options', 'referrer-policy', 'permissions-policy',
  'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'x-frame-options',
  'strict-transport-security', 'content-security-policy', 'location', 'vary', 'accept-ranges',
]

function args() {
  const out = {}
  const list = process.argv.slice(2)
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    if (a === '--diff') { out.diff = [list[++i], list[++i]]; continue }
    if (a.startsWith('--')) out[a.slice(2)] = list[++i]
  }
  return out
}

function files(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path, base) : [relative(base, path).split(sep).join('/')]
  })
}

async function probe(url, attempt = 1) {
  let response
  let body
  try {
    response = await fetch(url, { redirect: 'manual', headers: { 'accept-encoding': 'identity' } })
    body = Buffer.from(await response.arrayBuffer())
  } catch (error) {
    // A reset on the way to the edge is the network's, not the deploy's;
    // three tries before it counts.
    if (attempt >= 3) throw error
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
    return probe(url, attempt + 1)
  }
  const headers = {}
  for (const key of KEEP) {
    const value = response.headers.get(key)
    if (value !== null) headers[key] = value
  }
  return { status: response.status, headers, sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length }
}

async function snapshot({ url, dist, out }) {
  if (!url || !dist || !out) throw new Error('--url, --dist and --out are required')
  const base = url.replace(/\/$/, '')
  const paths = files(dist).filter((path) => path !== '.assetsignore').sort()
  const result = { url: base, takenAt: new Date().toISOString(), files: {} }
  for (const path of paths) result.files['/' + path] = await probe(`${base}/${path}`)
  result.behaviour = {
    '/': await probe(`${base}/`),
    '/index.html': await probe(`${base}/index.html`),
    '/no/such/path': await probe(`${base}/no/such/path`),
  }
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
  console.log(`${paths.length} files from ${base} -> ${out}`)
}

function diff([aPath, bPath]) {
  const a = JSON.parse(readFileSync(aPath, 'utf8'))
  const b = JSON.parse(readFileSync(bPath, 'utf8'))
  const problems = []
  const compare = (label, x, y) => {
    if (x === undefined) { problems.push(`${label}: only in ${bPath}`); return }
    if (y === undefined) { problems.push(`${label}: only in ${aPath}`); return }
    if (x.status !== y.status) problems.push(`${label}: status ${x.status} vs ${y.status}`)
    if (x.sha256 !== y.sha256) problems.push(`${label}: body ${x.sha256.slice(0, 8)} vs ${y.sha256.slice(0, 8)} (${x.bytes} vs ${y.bytes} bytes)`)
    for (const key of new Set([...Object.keys(x.headers), ...Object.keys(y.headers)])) {
      if (x.headers[key] !== y.headers[key]) problems.push(`${label}: ${key} ${JSON.stringify(x.headers[key])} vs ${JSON.stringify(y.headers[key])}`)
    }
  }
  for (const path of new Set([...Object.keys(a.files), ...Object.keys(b.files)])) compare(path, a.files[path], b.files[path])
  for (const path of Object.keys(a.behaviour)) compare(`behaviour ${path}`, a.behaviour[path], b.behaviour[path])
  const total = Object.keys(a.files).length
  if (problems.length === 0) {
    console.log(`identical: ${total} files, every status, header and body digest, and the root, redirect and fallback behaviour`)
    return
  }
  console.log(`${problems.length} difference(s) across ${total} files:`)
  for (const problem of problems) console.log(`  ${problem}`)
  process.exitCode = 1
}

const options = args()
if (options.diff) diff(options.diff)
else await snapshot(options)
