// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeReleaseManifest } from '../../scripts/write-release-manifest.mjs'
import { verifyReleaseManifest } from '../../scripts/verify-release-manifest.mjs'

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'sds-release-manifest-'))
  temporaryDirectories.push(directory)
  const distDir = join(directory, 'dist')
  mkdirSync(join(distDir, 'assets'), { recursive: true })
  writeFileSync(join(distDir, 'index.html'), '<!doctype html><title>Sheepdog Sim</title>')
  writeFileSync(join(distDir, 'assets', 'main-abc123.js'), 'console.log("game")')
  const packagePath = join(directory, 'package.json')
  writeFileSync(packagePath, JSON.stringify({ version: '3.0.0' }))
  return { distDir, packagePath }
}

describe('release manifest', () => {
  it('records the exact source and a stable digest of the packaged files', () => {
    const { distDir, packagePath } = fixture()
    const options = {
      distDir,
      packagePath,
      commit: 'a'.repeat(40),
      sourceRef: 'refs/heads/main',
      builtAt: '2026-08-24T12:00:00.000Z',
      capabilities: { singlePlayer: true, multiplayer: false, maxSheep: 200 },
    }
    const first = writeReleaseManifest(options).manifest
    const second = writeReleaseManifest(options).manifest

    expect(second.artifact).toEqual(first.artifact)
    expect(first.artifact.fileCount).toBe(2)
    expect(first.artifact.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.parse(readFileSync(join(distDir, 'release.json'), 'utf8'))).toEqual(second)
  })

  it('accepts a bounded single-player v3 release', () => {
    const manifest = {
      schema: 1,
      version: '3.0.0',
      commit: 'b'.repeat(40),
      artifact: { sha256: 'c'.repeat(64) },
      capabilities: { singlePlayer: true, multiplayer: false, maxSheep: 200, leaderboards: 'solo-times' },
    }

    expect(() => verifyReleaseManifest(manifest, {
      sha: 'b'.repeat(40),
      requireV3Static: true,
    })).not.toThrow()
  })

  it.each([
    ['old product version', { version: '2.6.4' }],
    ['multiplayer enabled', { capabilities: { singlePlayer: true, multiplayer: true, maxSheep: 200 } }],
    ['5,000 sheep enabled', { capabilities: { singlePlayer: true, multiplayer: false, maxSheep: 5000 } }],
  ])('refuses %s in the production release profile', (_label, override) => {
    const manifest = {
      schema: 1,
      version: '3.0.0',
      commit: 'd'.repeat(40),
      artifact: { sha256: 'e'.repeat(64) },
      capabilities: { singlePlayer: true, multiplayer: false, maxSheep: 200 },
      ...override,
    }

    expect(() => verifyReleaseManifest(manifest, { requireV3Static: true })).toThrow()
  })
})

