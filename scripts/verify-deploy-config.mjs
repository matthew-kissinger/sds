// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Checks the configuration the build generated, which is the one thing the
// deploy ships: `wrangler deploy --config .wrangler/build/sds_worker/wrangler.json`
// (docs/operations/deployment.md). Run it after `npm run build`.
//
//   node scripts/verify-deploy-config.mjs             # the production build
//   CLOUDFLARE_ENV=preview npm run build
//   node scripts/verify-deploy-config.mjs --preview   # the preview build
//
// The source of truth is wrangler.toml, pinned by tests/worker/wrangler-config.spec.ts;
// this proves the Vite plugin carried every fact through to the generated file
// and that the build selected the environment the deploy step expects.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

const PRODUCTION = {
  name: 'sds-worker',
  routes: [{ pattern: 'sheepdogsim.com/*', zone_name: 'sheepdogsim.com' }],
  previewUrls: false,
  database: { name: 'sds-db', id: '513aa937-e60a-4fb6-b499-9f3814149e88' },
}
const PREVIEW = {
  name: 'sds-worker-preview',
  routes: [],
  previewUrls: true,
  database: { name: 'sds-db-preview', id: '6d5b0fce-952f-4d94-8936-b51fc559496c' },
}
const MIGRATIONS = [
  { tag: 'v1', new_sqlite_classes: ['RoomDO', 'LobbyDO'] },
  { tag: 'v2', deleted_classes: ['RoomDO', 'LobbyDO'] },
]

function parseArgs(args) {
  const options = { preview: false, config: '.wrangler/build/sds_worker/wrangler.json' }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--preview') options.preview = true
    else if (arg === '--config') options.config = args[++index]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

/** Returns the list of failed assertions; empty means the config is right. */
export function checkDeployConfig(config, configPath, { preview = false } = {}) {
  const expected = preview ? PREVIEW : PRODUCTION
  const failures = []
  const expect = (label, actual, wanted) => {
    if (!isDeepStrictEqual(actual, wanted)) {
      failures.push(`${label}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`)
    }
  }

  expect('name', config.name, expected.name)
  expect('workers_dev', config.workers_dev, true)
  expect('preview_urls', config.preview_urls, expected.previewUrls)
  expect('routes', config.routes ?? [], expected.routes)
  expect('migrations', config.migrations, MIGRATIONS)
  expect('durable_objects.bindings', config.durable_objects?.bindings ?? [], [])
  expect('d1_databases', (config.d1_databases ?? []).map(({ binding, database_name, database_id }) => ({ binding, database_name, database_id })), [
    { binding: 'DB', database_name: expected.database.name, database_id: expected.database.id },
  ])

  const configDir = dirname(configPath)
  if (!config.main || !existsSync(resolve(configDir, config.main))) {
    failures.push(`main: ${JSON.stringify(config.main)} is not a file beside ${configPath}`)
  }

  const assets = config.assets ?? {}
  expect('assets.binding', assets.binding, 'ASSETS')
  expect('assets.not_found_handling', assets.not_found_handling, 'single-page-application')
  expect('assets.run_worker_first', assets.run_worker_first, ['/api/*'])
  if (!assets.directory) {
    failures.push('assets.directory is missing: wrangler would refuse to deploy')
  } else {
    const directory = resolve(configDir, assets.directory)
    if (!existsSync(directory) || !statSync(directory).isDirectory()) {
      failures.push(`assets.directory ${directory} is not a directory`)
    } else {
      const present = new Set(readdirSync(directory))
      if (!present.has('release.json')) failures.push(`assets.directory ${directory} has no release.json`)
      if (!present.has('index.html')) failures.push(`assets.directory ${directory} has no index.html`)
      // .assetsignore names what the Vite plugin keeps out of the upload. The
      // Worker's config and dev secrets must never be sitting in the directory.
      for (const name of ['wrangler.json', '.dev.vars']) {
        if (present.has(name)) failures.push(`assets.directory ${directory} contains ${name}`)
      }
    }
  }
  return failures
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const configPath = resolve(root, options.config)
  if (!existsSync(configPath)) {
    throw new Error(`${configPath} does not exist. Run npm run build${options.preview ? ' with CLOUDFLARE_ENV=preview' : ''} first.`)
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const failures = checkDeployConfig(config, configPath, options)
  if (failures.length > 0) {
    for (const failure of failures) console.error(`verify-deploy-config: ${failure}`)
    throw new Error(`${failures.length} deploy configuration check(s) failed.`)
  }
  console.log(
    `Verified deploy config ${options.config} (${options.preview ? 'preview' : 'production'}): ` +
      `${config.name}, routes ${JSON.stringify(config.routes ?? [])}, D1 ${config.d1_databases[0].database_id}, ` +
      `assets ${config.assets.directory}, migrations ${config.migrations.map((m) => m.tag).join(',')}`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
