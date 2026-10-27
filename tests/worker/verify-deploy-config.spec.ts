// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * scripts/verify-deploy-config.mjs is the gate between a build and a deploy of
 * the generated wrangler.json. A gate is only worth having if it fails, so each
 * case here breaks one fact and expects a failure that names the field.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain ES module without declarations
import { checkBuildOutput, checkDeployConfig } from '../../scripts/verify-deploy-config.mjs';

const PRODUCTION_D1 = '513aa937-e60a-4fb6-b499-9f3814149e88';
const PREVIEW_D1 = '6d5b0fce-952f-4d94-8936-b51fc559496c';

const production = () => ({
  name: 'sds-worker',
  main: 'index.js',
  compatibility_date: '2026-04-01',
  compatibility_flags: ['nodejs_compat'],
  workers_dev: true,
  preview_urls: false,
  routes: [],
  observability: { enabled: true },
  upload_source_maps: true,
  durable_objects: { bindings: [] },
  d1_databases: [{ binding: 'DB', database_name: 'sds-db', database_id: PRODUCTION_D1, migrations_dir: '../../../migrations' }],
  migrations: [
    { tag: 'v1', new_sqlite_classes: ['RoomDO', 'LobbyDO'] },
    { tag: 'v2', deleted_classes: ['RoomDO', 'LobbyDO'] },
  ],
  assets: {
    binding: 'ASSETS',
    not_found_handling: '404-page',
    run_worker_first: ['/api/*', '/c/*'],
    directory: '../../../dist',
  },
});

const preview = () => ({
  ...production(),
  name: 'sds-worker-preview',
  preview_urls: true,
  routes: [],
  d1_databases: [{ binding: 'DB', database_name: 'sds-db-preview', database_id: PREVIEW_D1 }],
});

let scratch: string;
let configPath: string;
let distDir: string;

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'sds-deploy-config-'));
  distDir = join(scratch, 'dist');
  mkdirSync(distDir);
  writeFileSync(join(distDir, 'index.html'), '<html></html>');
  writeFileSync(join(distDir, 'release.json'), '{}');
  const workerDir = join(scratch, '.wrangler', 'build', 'sds_worker');
  mkdirSync(workerDir, { recursive: true });
  writeFileSync(join(workerDir, 'index.js'), '');
  configPath = join(workerDir, 'wrangler.json');
});

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const check = (config: unknown, options: { preview?: boolean; distDir?: string } = {}) =>
  checkDeployConfig(config, configPath, { distDir, ...options }) as string[];

describe('verify-deploy-config', () => {
  it('passes the production and preview shapes it expects', () => {
    expect(check(production())).toEqual([]);
    expect(check(preview(), { preview: true })).toEqual([]);
  });

  it('fails a wrong D1 id', () => {
    const config = production();
    config.d1_databases[0].database_id = PREVIEW_D1;
    expect(check(config).join('\n')).toMatch(/d1_databases:/);
  });

  it('fails a route, which nothing declares since 3.3.2', () => {
    const config = production();
    config.routes = [{ pattern: 'sheepdogsim.com/*', zone_name: 'sheepdogsim.com' }];
    expect(check(config).join('\n')).toMatch(/routes:/);
  });

  it('fails a changed migration', () => {
    const config = production();
    config.migrations[1] = { tag: 'v2', deleted_classes: ['RoomDO'] } as any;
    expect(check(config).join('\n')).toMatch(/migrations:/);
  });

  it('fails the preview configuration in production mode, and the reverse', () => {
    const failures = check(preview()).join('\n');
    expect(failures).toMatch(/name:/);
    expect(failures).toMatch(/preview_urls:/);
    expect(failures).toMatch(/d1_databases:/);
    expect(check(production(), { preview: true }).join('\n')).toMatch(/name:/);
  });

  it('fails changed compatibility, observability and source-map settings', () => {
    const config = production();
    config.compatibility_date = '2026-05-01';
    config.compatibility_flags = [];
    config.observability = { enabled: false };
    config.upload_source_maps = false;
    const failures = check(config).join('\n');
    expect(failures).toMatch(/compatibility_date:/);
    expect(failures).toMatch(/compatibility_flags:/);
    expect(failures).toMatch(/observability\.enabled:/);
    expect(failures).toMatch(/upload_source_maps:/);
  });

  it('fails an assets directory other than the one it was given', () => {
    const config = production();
    config.assets.directory = '../../../elsewhere';
    expect(check(config).join('\n')).toMatch(/assets\.directory:/);
  });

  it('fails a missing release.json', () => {
    const empty = join(scratch, 'empty-dist');
    mkdirSync(empty);
    writeFileSync(join(empty, 'index.html'), '');
    const config = production();
    config.assets.directory = '../../../empty-dist';
    expect(check(config, { distDir: empty }).join('\n')).toMatch(/no release\.json/);
  });

  it('fails changed assets settings', () => {
    const config = production();
    config.assets.run_worker_first = [];
    config.assets.not_found_handling = 'none';
    const failures = check(config).join('\n');
    expect(failures).toMatch(/assets\.run_worker_first:/);
    expect(failures).toMatch(/assets\.not_found_handling:/);
  });
});

/**
 * The same gate for the Build Output `cf deploy --prebuilt` ships (Release 2
 * Stage B): app/.cloudflare/output/v0 with config.json, the Worker's
 * worker.config.json, its bundle and the assets.
 */
const cfWorker = (preview = false) => ({
  exports: { RoomAdmission: { type: 'worker' }, InviteShell: { type: 'worker' } },
  name: preview ? 'sds-worker-preview' : 'sds-worker',
  compatibilityDate: '2026-04-01',
  compatibilityFlags: ['nodejs_compat'],
  assets: { notFoundHandling: '404-page', runWorkerFirst: ['/api/*', '/c/*'] },
  observability: { enabled: true },
  workersDev: true,
  previewUrls: preview,
  ...(preview ? {} : { domains: ['sheepdogsim.com'] }),
  env: {
    ASSETS: { type: 'assets' },
    DB: { type: 'd1', name: preview ? 'sds-db-preview' : 'sds-db', id: preview ? PREVIEW_D1 : PRODUCTION_D1 },
    JWT_SECRET: { type: 'secret' },
  },
  manifest: { type: 'partial', mainModule: 'index.js', modules: {} },
});

function writeBuildOutput(worker: Record<string, unknown>, mode: string, { withRelease = true, withNotFound = true } = {}) {
  const output = mkdtempSync(join(tmpdir(), 'sds-build-output-'));
  writeFileSync(join(output, 'config.json'), JSON.stringify({ buildContext: { isPreview: false, mode } }));
  const workerDir = join(output, 'workers', 'default');
  mkdirSync(join(workerDir, 'bundle'), { recursive: true });
  mkdirSync(join(workerDir, 'assets'));
  writeFileSync(join(workerDir, 'bundle', 'index.js'), '');
  writeFileSync(join(workerDir, 'assets', 'index.html'), '<html></html>');
  if (withRelease) writeFileSync(join(workerDir, 'assets', 'release.json'), '{}');
  if (withNotFound) writeFileSync(join(workerDir, 'assets', '404.html'), '<html></html>');
  writeFileSync(join(workerDir, 'worker.config.json'), JSON.stringify(worker));
  return output;
}

describe('verify-deploy-config --cf', () => {
  const outputs: string[] = [];
  const check = (worker: Record<string, unknown>, mode: string, options: { preview?: boolean; withRelease?: boolean; withNotFound?: boolean } = {}) => {
    const output = writeBuildOutput(worker, mode, options);
    outputs.push(output);
    return checkBuildOutput(output, options) as string[];
  };
  afterAll(() => { for (const output of outputs) rmSync(output, { recursive: true, force: true }); });

  it('passes the production and preview Build Outputs it expects', () => {
    expect(check(cfWorker(), 'production')).toEqual([]);
    expect(check(cfWorker(true), 'preview', { preview: true })).toEqual([]);
  });

  it('fails a build made in the other mode', () => {
    expect(check(cfWorker(true), 'preview').join('\n')).toMatch(/buildContext\.mode:|^name:/m);
    expect(check(cfWorker(), 'production', { preview: true }).join('\n')).toMatch(/buildContext\.mode:/);
  });

  it('fails a wrong D1, a route on either Worker and a Durable Object export', () => {
    const wrongDb = cfWorker();
    wrongDb.env.DB.id = PREVIEW_D1;
    expect(check(wrongDb, 'production').join('\n')).toMatch(/^env:/m);
    // Since 3.3.2 no route is declared: one that comes back would be
    // re-published by every deploy (docs/operations/declarative-hosting.md).
    const productionRoute = { ...cfWorker(), triggers: [{ type: 'fetch', pattern: 'sheepdogsim.com/*', zone: 'sheepdogsim.com' }] };
    expect(check(productionRoute, 'production').join('\n')).toMatch(/^triggers:/m);
    const previewRoute = { ...cfWorker(true), triggers: [{ type: 'fetch', pattern: 'sheepdogsim.com/*', zone: 'sheepdogsim.com' }] };
    expect(check(previewRoute, 'preview', { preview: true }).join('\n')).toMatch(/^triggers:/m);
    const withExports = { ...cfWorker(), exports: { RoomDO: { type: 'durable-object', storage: 'sqlite' } } };
    expect(check(withExports, 'production').join('\n')).toMatch(/^exports:/m);
    // The apex Custom Domain is production's alone; a preview that declares
    // one, or a production build without it, fails.
    const noDomain = { ...cfWorker(), domains: [] };
    expect(check(noDomain, 'production').join('\n')).toMatch(/^domains:/m);
    const previewDomain = { ...cfWorker(true), domains: ['sheepdogsim.com'] };
    expect(check(previewDomain, 'preview', { preview: true }).join('\n')).toMatch(/^domains:/m);
  });

  it('fails a missing bundle entry and a missing release.json', () => {
    const noMain = { ...cfWorker(), manifest: { type: 'partial', mainModule: 'missing.js', modules: {} } };
    expect(check(noMain, 'production').join('\n')).toMatch(/manifest\.mainModule/);
    expect(check(cfWorker(), 'production', { withRelease: false }).join('\n')).toMatch(/no release\.json/);
  });
});
