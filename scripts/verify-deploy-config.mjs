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
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { BUILD_OUTPUT, BUILT_CLIENT, repo as root } from './build-output.mjs'

export { BUILD_OUTPUT, BUILT_CLIENT }

const PRODUCTION = {
  name: 'sds-worker',
  // No route on either Worker since 3.3.2: sheepdogsim.com is production's
  // Custom Domain (cf only, docs/operations/declarative-hosting.md), and a
  // route declared again would be re-published by every deploy. The preview
  // Worker has neither: a preview must never claim a production hostname.
  routes: [],
  domains: ['sheepdogsim.com'],
  previewUrls: false,
  database: { name: 'sds-db', id: '513aa937-e60a-4fb6-b499-9f3814149e88' },
}
const PREVIEW = {
  name: 'sds-worker-preview',
  routes: [],
  domains: [],
  previewUrls: true,
  database: { name: 'sds-db-preview', id: '6d5b0fce-952f-4d94-8936-b51fc559496c' },
}
const MIGRATIONS = [
  { tag: 'v1', new_sqlite_classes: ['RoomDO', 'LobbyDO'] },
  { tag: 'v2', deleted_classes: ['RoomDO', 'LobbyDO'] },
]


function parseArgs(args) {
  const options = { preview: false, cf: false, config: '.wrangler/build/sds_worker/wrangler.json' }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--preview') options.preview = true
    else if (arg === '--cf') options.cf = true
    else if (arg === '--config') options.config = args[++index]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (options.cf && options.config === '.wrangler/build/sds_worker/wrangler.json') options.config = BUILD_OUTPUT
  return options
}

/**
 * The same facts, read from the Build Output `cf deploy` ships instead of the
 * wrangler file: `<output>/config.json` names the mode the build was made in,
 * `<output>/workers/default/worker.config.json` is the Worker as
 * app/cloudflare.config.ts resolved for that mode, `bundle/` holds the script
 * and `assets/` the game. Returns the list of failed assertions.
 */
export function checkBuildOutput(outputDir, { preview = false } = {}) {
  const expected = preview ? PREVIEW : PRODUCTION
  const failures = []
  const expect = (label, actual, wanted) => {
    if (!isDeepStrictEqual(actual, wanted)) {
      failures.push(`${label}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`)
    }
  }
  const read = (file) => JSON.parse(readFileSync(resolve(outputDir, file), 'utf8'))
  const rootConfig = read('config.json')
  expect('buildContext.mode', rootConfig.buildContext?.mode, preview ? 'preview' : 'production')
  expect('buildContext.isPreview', rootConfig.buildContext?.isPreview, false)

  const workerDir = resolve(outputDir, 'workers', 'default')
  const worker = read('workers/default/worker.config.json')
  expect('name', worker.name, expected.name)
  expect('compatibilityDate', worker.compatibilityDate, '2026-04-01')
  expect('compatibilityFlags', worker.compatibilityFlags, ['nodejs_compat'])
  expect('observability', worker.observability, { enabled: true })
  expect('workersDev', worker.workersDev, true)
  expect('previewUrls', worker.previewUrls, expected.previewUrls)
  expect('triggers', worker.triggers ?? [], expected.routes.map(({ pattern, zone_name }) => ({ type: 'fetch', pattern, zone: zone_name })))
  expect('domains', worker.domains ?? [], expected.domains)
  // The applied v1/v2 history deleted every Durable Object class; the exports
  // map carries live classes only, so there must be none.
  expect('exports', worker.exports, undefined)
  expect('env', worker.env, {
    ASSETS: { type: 'assets' },
    DB: { type: 'd1', name: expected.database.name, id: expected.database.id },
    JWT_SECRET: { type: 'secret' },
  })
  expect('assets', worker.assets, { notFoundHandling: 'single-page-application', runWorkerFirst: ['/api/*', '/c/*'] })

  const main = worker.manifest?.mainModule
  if (!main || !existsSync(resolve(workerDir, 'bundle', main))) {
    failures.push(`manifest.mainModule: ${JSON.stringify(main)} is not a file under ${resolve(workerDir, 'bundle')}`)
  }
  const assetsDir = resolve(workerDir, 'assets')
  if (!existsSync(assetsDir) || !statSync(assetsDir).isDirectory()) {
    failures.push(`assets ${assetsDir} is not a directory`)
  } else {
    const present = new Set(readdirSync(assetsDir))
    if (!present.has('release.json')) failures.push(`assets ${assetsDir} has no release.json`)
    if (!present.has('index.html')) failures.push(`assets ${assetsDir} has no index.html`)
    for (const name of ['wrangler.json', 'worker.config.json', '.dev.vars']) {
      if (present.has(name)) failures.push(`assets ${assetsDir} contains ${name}`)
    }
  }
  return failures
}

/**
 * Returns the list of failed assertions; empty means the config is right. Each
 * names the field it checked. `distDir` is where the assets must resolve to,
 * the repository's dist/ unless a test supplies its own.
 */
export function checkDeployConfig(config, configPath, { preview = false, distDir = resolve(root, 'dist') } = {}) {
  const expected = preview ? PREVIEW : PRODUCTION
  const failures = []
  const expect = (label, actual, wanted) => {
    if (!isDeepStrictEqual(actual, wanted)) {
      failures.push(`${label}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`)
    }
  }

  expect('name', config.name, expected.name)
  expect('compatibility_date', config.compatibility_date, '2026-04-01')
  expect('compatibility_flags', config.compatibility_flags, ['nodejs_compat'])
  expect('observability.enabled', config.observability?.enabled, true)
  expect('upload_source_maps', config.upload_source_maps, true)
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
  expect('assets.run_worker_first', assets.run_worker_first, ['/api/*', '/c/*'])
  if (!assets.directory) {
    failures.push('assets.directory is missing: wrangler would refuse to deploy')
  } else {
    const directory = resolve(configDir, assets.directory)
    expect('assets.directory', directory, resolve(distDir))
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
    throw new Error(`${configPath} does not exist. Run npm run build${options.preview ? (options.cf ? ':preview' : ' with CLOUDFLARE_ENV=preview') : ''} first.`)
  }
  if (options.cf) {
    const failures = checkBuildOutput(configPath, options)
    if (failures.length > 0) {
      for (const failure of failures) console.error(`verify-deploy-config: ${failure}`)
      throw new Error(`${failures.length} Build Output check(s) failed.`)
    }
    const worker = JSON.parse(readFileSync(resolve(configPath, 'workers/default/worker.config.json'), 'utf8'))
    console.log(
      `Verified Build Output ${options.config} (${options.preview ? 'preview' : 'production'}): ` +
        `${worker.name}, triggers ${JSON.stringify(worker.triggers ?? [])}, domains ${JSON.stringify(worker.domains ?? [])}, D1 ${worker.env.DB.id}, no exports`,
    )
    return
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
