// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * app/cloudflare.config.ts against wrangler.toml, mode for environment.
 *
 * While Release 2 Stage B runs on the preview Worker only, both files describe
 * the same two Workers: `cf` reads one, wrangler the other, and neither reads
 * both. This holds every hosting fact the wrangler spec pins equal in the cf
 * declaration, so the two cannot drift while both exist. The shapes come from
 * `cf/config`'s builders (`bindings.d1` -> `{ type: 'd1', name, id }`,
 * `triggers.fetch` -> `{ type: 'fetch', pattern, zone }`), which is what the
 * Vite plugin and `cf deploy` consume.
 */
import { fileURLToPath } from 'node:url';
import { unstable_readConfig as readConfig } from 'wrangler';
import { describe, expect, it } from 'vitest';
import define from '../../app/cloudflare.config.ts';

const wranglerPath = fileURLToPath(new URL('../../wrangler.toml', import.meta.url));
const wrangler = (env?: string) => readConfig({ config: wranglerPath, env }, { hideWarnings: true }) as any;

// `defineConfig` returns the function it was given; the plugin and `cf` call
// it with the mode. `undefined` is what a plain `vite build` passes through as
// 'production', and what `cf deploy` without --mode means.
const cf = (mode?: string) => (define as unknown as (ctx: { mode?: string; isPreview: boolean }) => any)({ mode, isPreview: false }).worker;

const PAIRS: readonly [label: string, cfWorker: any, wranglerConfig: any][] = [
  ['production', cf('production'), wrangler()],
  ['preview', cf('preview'), wrangler('preview')],
];

describe('cloudflare.config.ts says what wrangler.toml says', () => {
  it('names the same two Workers and gives the production one to the default mode too', () => {
    expect(cf('production').name).toBe('sds-worker');
    expect(cf(undefined).name).toBe('sds-worker');
    expect(cf('preview').name).toBe('sds-worker-preview');
    for (const [, worker, config] of PAIRS) expect(worker.name).toBe(config.name);
  });

  it('runs the same entry on the same runtime', () => {
    for (const [, worker, config] of PAIRS) {
      expect(worker.entrypoint).toBe('../worker/src/index.ts');
      expect(String(config.main).replaceAll('\\', '/').endsWith('/worker/src/index.ts')).toBe(true);
      expect(worker.compatibilityDate).toBe(config.compatibility_date);
      expect(worker.compatibilityFlags).toEqual(config.compatibility_flags);
    }
  });

  it('serves the game the same way: API first, single-page fallback, observability on', () => {
    for (const [, worker, config] of PAIRS) {
      expect(worker.assets).toEqual({
        notFoundHandling: config.assets.not_found_handling,
        runWorkerFirst: config.assets.run_worker_first,
      });
      expect(worker.observability).toEqual({ enabled: config.observability.enabled });
    }
  });

  it('keeps workers.dev on for both, version preview URLs for preview only', () => {
    for (const [, worker, config] of PAIRS) {
      expect(worker.workersDev).toBe(config.workers_dev);
      expect(worker.previewUrls).toBe(config.preview_urls);
    }
    expect(cf('production').previewUrls).toBe(false);
    expect(cf('preview').previewUrls).toBe(true);
  });

  it('routes sheepdogsim.com to production only, by route and never by custom domain', () => {
    expect(cf('production').triggers).toEqual([
      { type: 'fetch', pattern: 'sheepdogsim.com/*', zone: 'sheepdogsim.com' },
    ]);
    expect(wrangler().routes).toEqual([{ pattern: 'sheepdogsim.com/*', zone_name: 'sheepdogsim.com' }]);
    expect(cf('production').domains).toBeUndefined();
    expect(cf('preview').triggers).toBeUndefined();
    expect(wrangler('preview').routes).toEqual([]);
    // The rehearsal hostname (docs/operations/declarative-hosting.md): a
    // subdomain of the zone, on the preview Worker only, never the apex.
    expect(cf('preview').domains).toEqual(['stage.sheepdogsim.com']);
  });

  it('binds each Worker to its own D1, the assets and the JWT secret, and to nothing else', () => {
    for (const [, worker, config] of PAIRS) {
      const [d1] = config.d1_databases;
      expect(worker.env).toEqual({
        ASSETS: { type: 'assets' },
        DB: { type: 'd1', name: d1.database_name, id: d1.database_id },
        JWT_SECRET: { type: 'secret' },
      });
      expect(config.assets.binding).toBe('ASSETS');
    }
    expect(cf('production').env.DB.id).not.toBe(cf('preview').env.DB.id);
  });

  it('declares no Durable Object class, because the applied history deleted them', () => {
    // wrangler.toml keeps the v1/v2 migrations as the append-only record; the
    // exports map carries live classes only, and there are none.
    for (const [, worker, config] of PAIRS) {
      expect(worker.exports).toBeUndefined();
      expect(config.migrations.at(-1)).toEqual({ tag: 'v2', deleted_classes: ['RoomDO', 'LobbyDO'] });
      expect(config.durable_objects.bindings).toEqual([]);
    }
  });
});
