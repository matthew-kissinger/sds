// SPDX-License-Identifier: AGPL-3.0-or-later
// Generate only the isolated pilot configs. No Cloudflare calls or credentials.
import { mkdir, writeFile, readdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const databaseId = process.argv[2];
if (!/^[a-f0-9-]{36}$/.test(databaseId ?? '') || ['513aa937-e60a-4fb6-b499-9f3814149e88', '6d5b0fce-952f-4d94-8936-b51fc559496c'].includes(databaseId)) {
  throw new Error('Supply the new staging D1 UUID; production/preview IDs are forbidden.');
}
const end = process.argv.includes('--open') ? Date.now() + 60 * 60 * 1000 : 0;
const common = { account_id: '56adffd40534f7fe110fc661a40bbf53', compatibility_date: '2026-10-19',
  compatibility_flags: ['nodejs_compat'], workers_dev: false, preview_urls: false,
  observability: { enabled: false }, limits: { cpu_ms: 50 },
  vars: { STAGING_END: String(end) } };
const game = { ...common, name: 'sds-game-staging', main: '../../staging/game.ts',
  routes: [{ pattern: 'staging.sheepdogsim.com', custom_domain: true }],
  assets: { directory: './assets', binding: 'ASSETS', run_worker_first: true, not_found_handling: 'single-page-application' },
  d1_databases: [{ binding: 'DB', database_name: 'sds-identity-staging', database_id: databaseId, migrations_dir: './migrations' }] };
const realtime = { ...common, name: 'sds-realtime-staging', main: '../../staging/realtime.ts',
  routes: [{ pattern: 'staging.sheepdogsim.com/r/*', zone_name: 'sheepdogsim.com' }],
  vars: { ...common.vars, ALLOWED_ORIGIN: 'https://staging.sheepdogsim.com', ROOM_CAPS: { na: 1, eu: 0, apac: 0 } },
  services: [{ binding: 'IDENTITY', service: 'sds-game-staging', entrypoint: 'RoomAdmission' },
    { binding: 'GAME_SHELL', service: 'sds-game-staging', entrypoint: 'InviteShell' }],
  durable_objects: { bindings: [{ name: 'ROOMS', class_name: 'RoomDO' }, { name: 'LOBBIES', class_name: 'LobbyDO' }] },
  migrations: [{ tag: 'v1', new_sqlite_classes: ['RoomDO', 'LobbyDO'] }] };
await mkdir('.wrangler/staging', { recursive: true });
await mkdir('.wrangler/staging/migrations', { recursive: true });
// Historical source migrations include a player-data snapshot. Never seed it in staging.
for (const name of (await readdir('worker/migrations')).filter(n => n.endsWith('.sql') && n !== '0002_backfill_droplet.sql')) {
  await copyFile(resolve('worker/migrations', name), resolve('.wrangler/staging/migrations', name));
}
for (const [name, config] of Object.entries({ game, realtime })) await writeFile(resolve('.wrangler/staging', name + '.json'), JSON.stringify(config, null, 2) + '\n');
console.log(end ? `Pilot closes at ${new Date(end).toISOString()}` : 'Pilot configs generated closed.');
