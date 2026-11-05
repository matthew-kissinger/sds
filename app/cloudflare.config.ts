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
 * serving the game as static assets and the score API under /api. `cf` reads
 * this file and ignores `wrangler.toml`; wrangler reads `wrangler.toml` and
 * ignores this file. This file deploys; `wrangler.toml`
 * stays for the D1 scripts and for the tags built before the `cf` move
 * (3.2.1 to 3.3.0, docs/operations/deployment.md). Every fact here is pinned
 * by tests/worker/cloudflare-config.spec.ts against wrangler.toml, so the two
 * cannot drift while both exist.
 *
 * NO MIGRATIONS BLOCK. wrangler's `[[migrations]]` history (v1 created the
 * version 2 multiplayer classes, v2 deleted them) is already applied to both
 * Workers: each carries `migration_tag` v2 and exports no Durable Object
 * class. The `exports` map replaces that history with the live classes, and
 * the docs say not to copy deletions that have been applied, so there is
 * nothing to declare. Whether a deploy from this file leaves the tag where it
 * is, and whether a wrangler deploy of an older commit and a rollback across
 * it do too, was Stage B's third check (docs/history/status-log.md).
 */

import { bindings, defineConfig } from 'cf/config';

const SHARED = {
  compatibilityDate: '2026-04-01',
  compatibilityFlags: ['nodejs_compat'],
  // The score API, relative to this file. The client never imports it;
  // `vite build` bundles it through the Cloudflare Vite plugin.
  entrypoint: '../worker/src/game.ts',
  exports: { RoomAdmission: { type: 'worker' as const }, InviteShell: { type: 'worker' as const } },
  // /api/* and /c/* run the Worker first. Every other path is served by the
  // asset layer: the file if it exists, otherwise 404.html with a 404.
  // _redirects serves the three /play/<size> paths the game page.
  // _headers and _redirects from app/public are honoured by the asset layer.
  // /c/* is a score card. Without it here, the card unfurls as the game.
  assets: {
    notFoundHandling: '404-page' as const,
    runWorkerFirst: ['/api/*', '/c/*'],
  },
  observability: { enabled: true },
} as const;

export default defineConfig(() => {
  return {
    worker: {
      ...SHARED,
      name: 'sds-worker',
      // Explicit, never inferred: sds-worker.<subdomain>.workers.dev must keep
      // answering, because every client built before Release 1 has it baked
      // in as the score API. Version preview URLs of production would serve
      // production's D1 and secrets from a throwaway hostname, so they are off.
      workersDev: true,
      previewUrls: false,
      // sheepdogsim.com is a Custom Domain of this Worker since 3.3.1
      // (docs/operations/declarative-hosting.md): the deploy owns the apex
      // record (a proxied AAAA 100:: placeholder, read-only in the zone) and
      // the certificate, and removing the domain removes both, measured
      // 2026-10-17. No `triggers`: the sheepdogsim.com/* route that carried
      // Release 1's cutover was deleted by hand in 3.3.2, once the Custom
      // Domain was seen serving, and a route declared here would be
      // re-published by every deploy. /r/* stays free for a realtime Worker,
      // which can take sheepdogsim.com/r/* by route: routes win over a
      // Custom Domain on the same hostname (spec/03-multiplayer.md). www is
      // a zone redirect over a placeholder record, by design.
      domains: ['sheepdogsim.com'],
      env: {
        ASSETS: bindings.assets(),
        DB: bindings.d1({ name: 'sds-db', id: '513aa937-e60a-4fb6-b499-9f3814149e88' }),
        JWT_SECRET: bindings.secret(),
      },
    },
  };
});
