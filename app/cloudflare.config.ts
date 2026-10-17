// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Worker, declared for the `cf` CLI (Release 2 Stage B, STATUS.md).
 *
 * WHY THIS FILE IS IN app/ AND NOT AT THE ROOT. The Cloudflare Vite plugin
 * 2.0 reads `cloudflare.config.ts` from the Vite root and nowhere else (no
 * option, no walk up), and this project's Vite root is `app/`, where the
 * client and its index.html live. `cf` finds the file by walking up from its
 * working directory, so `cf` is run from `app/` (the npm scripts do that) and
 * both tools agree on one project root. The Build Output they share is
 * `app/.cloudflare/output/v0/`, gitignored. Moving the Vite root to the
 * repository instead would move index.html, app/public and every path the
 * client build is measured by, for a tool constraint; that is the trade-off
 * recorded in docs/history/status-log.md.
 *
 * This is the same Worker `wrangler.toml` describes, typed: one `sds-worker`
 * serving the game as static assets and the score API under /api, with a
 * `preview` mode that is the per-pull-request Worker `sds-worker-preview` on
 * its own D1. `cf` reads this file and ignores `wrangler.toml`; wrangler reads
 * `wrangler.toml` and ignores this file. Both stay while Stage B is on the
 * preview Worker only, because the production deploy and any rollback still
 * run through wrangler (docs/operations/deployment.md). Every fact here is
 * pinned by tests/worker/cloudflare-config.spec.ts against wrangler.toml, so
 * the two cannot drift while both exist.
 *
 * MODES, NOT ENVIRONMENTS. `cf` has no `--env`: a function-form config returns
 * one complete configuration per `mode`, and a mode deploys a separate Worker
 * only because it returns a different `name`. Nothing is inherited, so the
 * preview branch repeats what it shares rather than merging it.
 *
 * NO MIGRATIONS BLOCK. wrangler's `[[migrations]]` history (v1 created the
 * version 2 multiplayer classes, v2 deleted them) is already applied to both
 * Workers: each carries `migration_tag` v2 and exports no Durable Object
 * class. The `exports` map replaces that history with the live classes, and
 * the docs say not to copy deletions that have been applied, so there is
 * nothing to declare. Whether a deploy from this file leaves the tag where it
 * is, and whether a wrangler deploy of an older commit and a rollback across
 * it do too, is Stage B's third check, measured on the preview Worker.
 */

import { bindings, defineConfig, triggers } from 'cf/config';

const SHARED = {
  compatibilityDate: '2026-04-01',
  compatibilityFlags: ['nodejs_compat'],
  // The score API, relative to this file. The client never imports it;
  // `vite build` bundles it through the Cloudflare Vite plugin.
  entrypoint: '../worker/src/index.ts',
  // Only /api/* runs the Worker first; every other path is served by the asset
  // layer, with index.html for anything unmatched. _headers and _redirects
  // from app/public are honoured by the asset layer itself.
  assets: {
    notFoundHandling: 'single-page-application' as const,
    runWorkerFirst: ['/api/*'],
  },
  observability: { enabled: true },
} as const;

export default defineConfig(({ mode }) => {
  if (mode === 'preview') {
    return {
      worker: {
        ...SHARED,
        name: 'sds-worker-preview',
        // Each pull request uploads a version here with a preview alias, so
        // its build answers on pr-<number>-sds-worker-preview.<subdomain>
        // against this Worker's own D1 and JWT_SECRET. No route: the
        // production hostname is never claimed by a preview.
        workersDev: true,
        previewUrls: true,
        env: {
          ASSETS: bindings.assets(),
          DB: bindings.d1({ name: 'sds-db-preview', id: '6d5b0fce-952f-4d94-8936-b51fc559496c' }),
          JWT_SECRET: bindings.secret(),
        },
      },
    };
  }
  return {
    worker: {
      ...SHARED,
      name: 'sds-worker',
      // Explicit, never inferred: sds-worker.<subdomain>.workers.dev must keep
      // answering, because every client built before Release 1 has it baked
      // in as the score API. Version preview URLs of production would serve
      // production's D1 and secrets from a throwaway hostname, so they are off;
      // pull-request previews use the preview mode instead.
      workersDev: true,
      previewUrls: false,
      // sheepdogsim.com is a Custom Domain of this Worker from 3.3.1
      // (docs/operations/declarative-hosting.md): the deploy owns the apex
      // record (a proxied AAAA 100:: placeholder, read-only in the zone) and
      // the certificate, and removing the domain removes both, measured on
      // the preview Worker 2026-10-17. The deploy refuses a hostname that has
      // a record of ours, so the apex CNAME to the retired Pages project is
      // deleted by hand right before the deploy that publishes this.
      domains: ['sheepdogsim.com'],
      // The route stays for this release: it takes precedence over the Custom
      // Domain on the same hostname, so traffic does not move while the
      // record changes, and re-publishing it is the rollback of step 3. It
      // goes in the release after, once the Custom Domain is seen serving.
      // www is a zone redirect over a placeholder record, by design.
      triggers: [triggers.fetch({ pattern: 'sheepdogsim.com/*', zone: 'sheepdogsim.com' })],
      env: {
        ASSETS: bindings.assets(),
        DB: bindings.d1({ name: 'sds-db', id: '513aa937-e60a-4fb6-b499-9f3814149e88' }),
        JWT_SECRET: bindings.secret(),
      },
    },
  };
});
