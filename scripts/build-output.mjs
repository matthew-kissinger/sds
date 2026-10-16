// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Where `npm run build` puts the built game and the Worker: the one place that
// names it, so a verifier, a probe, a workflow comment and the runbook cannot
// disagree (docs/operations/deployment.md, "Where the configuration lives").
//
// The Cloudflare Vite plugin 2.0 writes the Build Output Specification under
// the Vite root, which is app/ here, and forces every environment's
// build.outDir into it (its forceBuildOutputDirs runs after Vite has merged the
// user config), so nothing can keep the client at dist/. `cf deploy --prebuilt`
// uploads this directory as it stands.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repo = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** The Build Output, relative to the repository root. */
export const BUILD_OUTPUT = 'app/.cloudflare/output/v0'
/** The one Worker in it: worker.config.json, bundle/ and assets/. */
export const BUILT_WORKER = `${BUILD_OUTPUT}/workers/default`
/** The built game, served as the Worker's assets: where dist/ used to be. */
export const BUILT_CLIENT = `${BUILT_WORKER}/assets`

export const buildOutputDir = resolve(repo, BUILD_OUTPUT)
export const builtWorkerDir = resolve(repo, BUILT_WORKER)
export const builtClientDir = resolve(repo, BUILT_CLIENT)
