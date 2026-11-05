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

const read = () => readConfig({ config: configPath }, { hideWarnings: true }) as any;
const production = read();

describe('sds-worker hosting configuration', () => {
  it('keeps the workers.dev host answering', () => {
    // Cloudflare infers workers_dev = false once routes exist, and every
    // client built before Release 1 calls sds-worker.<account>.workers.dev.
    expect(production.workers_dev).toBe(true);
  });

  it('declares no route and no custom domain: sheepdogsim.com is declared in app/cloudflare.config.ts', () => {
    // Since 3.3.2. A route here would be PUT by any wrangler deploy of this
    // file, and the Custom Domain is cf's to publish; /r/* stays free.
    expect(production.routes ?? []).toEqual([]);
  });

  it('uploads Worker source maps on purpose, not by the plugin default', () => {
    expect(production.upload_source_maps).toBe(true);
  });

  it('keeps version preview URLs off', () => {
    expect(production.preview_urls).toBe(false);
  });

  it('runs the Worker entry from worker/src and leaves the assets directory to the Vite plugin', () => {
    expect(String(production.main).replaceAll('\\', '/').endsWith('/worker/src/game.ts')).toBe(true);
    expect(production.assets.directory).toBeUndefined();
  });

  it('serves the game with the API first and a single-page fallback for the rest', () => {
    expect(production.assets).toMatchObject({
      binding: 'ASSETS',
      not_found_handling: '404-page',
      run_worker_first: ['/api/*', '/c/*'],
    });
  });

  it('binds the D1 and no Durable Object', () => {
    expect(production.d1_databases).toEqual([
      expect.objectContaining({ binding: 'DB', database_name: 'sds-db', database_id: '513aa937-e60a-4fb6-b499-9f3814149e88' }),
    ]);
    expect(production.durable_objects.bindings).toEqual([]);
  });

  it('retires the v2 room classes with an append-only migration history', () => {
    expect(production.migrations).toEqual([
      { tag: 'v1', new_sqlite_classes: ['RoomDO', 'LobbyDO'] },
      { tag: 'v2', deleted_classes: ['RoomDO', 'LobbyDO'] },
    ]);
  });
});
