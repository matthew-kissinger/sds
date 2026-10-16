// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The hosting invariants of worker/wrangler.toml, read through Wrangler's own
 * config reader so environment inheritance is measured rather than assumed.
 * Each assertion names a failure that was found while moving sheepdogsim.com
 * onto this Worker; see docs/operations/deployment.md.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workerDir = fileURLToPath(new URL('../../worker/', import.meta.url));
const require = createRequire(`${workerDir}package.json`);
const { unstable_readConfig: readConfig } = require('wrangler') as {
  unstable_readConfig: (args: { config: string; env?: string }, options: { hideWarnings: boolean }) => any;
};

const read = (env?: string) => readConfig({ config: `${workerDir}wrangler.toml`, env }, { hideWarnings: true });
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

  it('gives version preview URLs to env.preview only', () => {
    expect(production.preview_urls).toBe(false);
    expect(preview.preview_urls).toBe(true);
  });

  it('serves dist/ with the API first and a single-page fallback for the rest', () => {
    for (const config of [production, preview]) {
      expect(config.assets).toMatchObject({
        directory: '../dist',
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
    expect(preview.d1_databases).toEqual([expect.objectContaining({ binding: 'DB', database_name: 'sds-db-preview' })]);
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
