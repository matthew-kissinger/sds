// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function parseArgs(args) {
  const options = { retries: 1 }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--require-v3-static') options.requireV3Static = true
    else if (arg === '--path') options.path = args[++index]
    else if (arg === '--url') options.url = args[++index]
    else if (arg === '--sha') options.sha = args[++index]
    else if (arg === '--retries') options.retries = Number(args[++index])
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.path && !options.url) options.path = 'dist/release.json'
  if (options.path && options.url) throw new Error('Use either --path or --url, not both.')
  if (!Number.isInteger(options.retries) || options.retries < 1) throw new Error('--retries must be a positive integer.')
  return options
}

export function verifyReleaseManifest(manifest, { sha, requireV3Static = false } = {}) {
  if (manifest.schema !== 1) throw new Error(`Unsupported release manifest schema: ${manifest.schema}`)
  if (!manifest.version || !manifest.commit || !manifest.artifact?.sha256) {
    throw new Error('Release manifest is missing version, commit, or artifact identity.')
  }
  if (sha && manifest.commit.toLowerCase() !== sha.toLowerCase()) {
    throw new Error(`Release commit ${manifest.commit} does not match expected ${sha}.`)
  }
  if (!/^[0-9a-f]{64}$/i.test(manifest.artifact.sha256)) {
    throw new Error('Artifact SHA-256 is not a 64-character hexadecimal digest.')
  }

  if (requireV3Static) {
    if (!/^3\./.test(manifest.version)) throw new Error(`Production workflow only accepts a 3.x release, got ${manifest.version}.`)
    const capabilities = manifest.capabilities
    if (!capabilities) throw new Error('A v3 production release requires release-capabilities.json.')
    if (capabilities.singlePlayer !== true) throw new Error('The v3 release must declare singlePlayer: true.')
    if (capabilities.multiplayer !== false) throw new Error('The v3 release must declare multiplayer: false.')
    if (!Number.isInteger(capabilities.maxSheep) || capabilities.maxSheep > 200) {
      throw new Error('The v3 release must declare an integer maxSheep no greater than 200.')
    }
  }

  return manifest
}

async function loadManifest(options) {
  if (options.path) return JSON.parse(await readFile(resolve(options.path), 'utf8'))
  const response = await fetch(`${options.url}${options.url.includes('?') ? '&' : '?'}proof=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
  })
  if (!response.ok) throw new Error(`${options.url} returned HTTP ${response.status}.`)
  return response.json()
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  let lastError
  for (let attempt = 1; attempt <= options.retries; attempt += 1) {
    try {
      const manifest = verifyReleaseManifest(await loadManifest(options), options)
      console.log(`Verified release ${manifest.version} ${manifest.commit} ${manifest.artifact.sha256}`)
      return
    } catch (error) {
      lastError = error
      if (attempt < options.retries) await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000))
    }
  }
  throw lastError
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
