// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The hosting invariants of the root wrangler.toml, read through Wrangler's own
 * config reader so environment inheritance is measured rather than assumed.
 * Each assertion names a failure that was found while moving sheepdogsim.com
 * onto this Worker; see docs/operations/deployment.md.
 */
import { fileURLToPath } from 'node:url';
import { unstable_readConfig as readConfig } from 'wrangler';
import { describe, expect, it } from 'vitest';

const configPath = fileURLToPath(new URL('../../wrangler.toml', import.meta.url));

const read = (env?: string) => readConfig({ config: configPath, env }, { hideWarnings: true }) as any;
const production = read();
const preview = read('preview');

describe('sds-worker hosting configuration', () => {
  it('keeps the workers.dev host answering in both environments', () => {
    // Cloudflare infers workers_dev = false once routes exist, and every
    // client built before Release 1 calls sds-worker.<account>.workers.dev.
    expect(production.workers_dev).toBe(true);
    expect(preview.workers_dev).toBe(true);
  });

  it('serves sheepdogsim.com by route, never by custom domain, and leaves /r/* free', () => {
    expect(production.routes).toEqual([{ pattern: 'sheepdogsim.com/*', zone_name: 'sheepdogsim.com' }]);
    expect(production.routes.some((route: any) => route.custom_domain)).toBe(false);
  });

  it('never lets the preview environment inherit the production route', () => {
    expect(preview.name).toBe('sds-worker-preview');
    expect(preview.routes).toEqual([]);
  });

  it('uploads Worker source maps on purpose, not by the plugin default', () => {
    expect(production.upload_source_maps).toBe(true);
    expect(preview.upload_source_maps).toBe(true);
  });

  it('gives version preview URLs to env.preview only', () => {
    expect(production.preview_urls).toBe(false);
    expect(preview.preview_urls).toBe(true);
  });

  it('runs the Worker entry from worker/src and leaves the assets directory to the Vite plugin', () => {
    for (const config of [production, preview]) {
      expect(String(config.main).replaceAll('\\', '/').endsWith('/worker/src/index.ts')).toBe(true);
      expect(config.assets.directory).toBeUndefined();
    }
  });

  it('serves the game with the API first and a single-page fallback for the rest', () => {
    for (const config of [production, preview]) {
      expect(config.assets).toMatchObject({
        binding: 'ASSETS',
        not_found_handling: 'single-page-application',
        run_worker_first: ['/api/*'],
      });
    }
  });

  it('binds each environment to its own D1 and to no Durable Object', () => {
    expect(production.d1_databases).toEqual([
      expect.objectContaining({ binding: 'DB', database_name: 'sds-db', database_id: '513aa937-e60a-4fb6-b499-9f3814149e88' }),
    ]);
    expect(preview.d1_databases).toEqual([
      expect.objectContaining({ binding: 'DB', database_name: 'sds-db-preview', database_id: '6d5b0fce-952f-4d94-8936-b51fc559496c' }),
    ]);
    expect(preview.d1_databases[0].database_id).not.toBe(production.d1_databases[0].database_id);
    expect(production.durable_objects.bindings).toEqual([]);
    expect(preview.durable_objects.bindings).toEqual([]);
  });

  it('retires the v2 room classes with an append-only migration history', () => {
    expect(production.migrations).toEqual([
      { tag: 'v1', new_sqlite_classes: ['RoomDO', 'LobbyDO'] },
      { tag: 'v2', deleted_classes: ['RoomDO', 'LobbyDO'] },
    ]);
  });
});
