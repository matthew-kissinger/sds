// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

function gitValue(args, fallback) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return fallback
  }
}

function filesUnder(directory) {
  const files = []
  const visit = (current) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name)
      if (statSync(path).isDirectory()) visit(path)
      else files.push(path)
    }
  }
  visit(directory)
  return files
}

function readCapabilities() {
  const configuredPath = process.env.SDS_RELEASE_CAPABILITIES_PATH
  const candidate = configuredPath
    ? resolve(root, configuredPath)
    : resolve(root, 'release-capabilities.json')
  if (!existsSync(candidate)) {
    if (configuredPath) throw new Error(`Release capabilities file not found: ${candidate}`)
    return undefined
  }
  return JSON.parse(readFileSync(candidate, 'utf8'))
}

export function createReleaseManifest({
  distDir = resolve(root, 'dist'),
  packagePath = resolve(root, 'package.json'),
  commit = process.env.SDS_RELEASE_SHA || gitValue(['rev-parse', 'HEAD'], 'unknown'),
  sourceRef = process.env.SDS_RELEASE_REF || gitValue(['symbolic-ref', '--short', 'HEAD'], 'detached'),
  builtAt = process.env.SDS_RELEASE_BUILT_AT || new Date().toISOString(),
  capabilities = readCapabilities(),
} = {}) {
  if (!existsSync(distDir)) throw new Error(`Build output not found: ${distDir}`)
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
  const manifestPath = resolve(distDir, 'release.json')
  const files = filesUnder(distDir).filter((path) => resolve(path) !== manifestPath)
  const artifactHash = createHash('sha256')
  let bytes = 0

  for (const path of files) {
    const content = readFileSync(path)
    const fileHash = createHash('sha256').update(content).digest('hex')
    const name = relative(distDir, path).split(sep).join('/')
    bytes += content.length
    artifactHash.update(`${name}\0${content.length}\0${fileHash}\n`)
  }

  return {
    schema: 1,
    product: 'Sheepdog Sim',
    package: basename(root),
    version: pkg.version,
    commit,
    sourceRef,
    builtAt,
    artifact: {
      fileCount: files.length,
      bytes,
      sha256: artifactHash.digest('hex'),
    },
    ...(capabilities ? { capabilities } : {}),
  }
}

export function writeReleaseManifest(options = {}) {
  const distDir = options.distDir || resolve(root, 'dist')
  const manifest = createReleaseManifest({ ...options, distDir })
  const output = resolve(distDir, 'release.json')
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`)
  return { manifest, output }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const distArg = process.argv[2]
  const { manifest, output } = writeReleaseManifest({
    ...(distArg ? { distDir: resolve(distArg) } : {}),
  })
  console.log(`Wrote ${output}`)
  console.log(`Release ${manifest.version} ${manifest.commit} ${manifest.artifact.sha256}`)
}

