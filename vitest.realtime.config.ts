// SPDX-License-Identifier: AGPL-3.0-or-later
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// No deployable config, account ID, remote resource or credential is needed.
// The real private admission implementation runs in a separate local Worker.
export default defineConfig(async () => {
  const identity = await build({ entryPoints: ['worker/src/roomAdmission.ts'], bundle: true,
    write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'], target: 'es2022' });
  return {
    resolve: { alias: { '@sim': fileURLToPath(new URL('./sim', import.meta.url)) } },
    plugins: [cloudflareTest({ main: './realtime/index.ts', remoteBindings: false,
      miniflare: {
        compatibilityDate: '2026-10-20', compatibilityFlags: ['nodejs_compat'],
        durableObjects: { ROOMS: { className: 'RoomDO', useSQLite: true }, LOBBIES: { className: 'LobbyDO', useSQLite: true } },
        bindings: { MATCH_SCHEMA: readFileSync('realtime/migrations/0001_match_history.sql','utf8'), ALLOWED_ORIGIN: 'http://localhost:5199', ROOM_CAPS: { na: 50, eu: 50, apac: 50 }, OWNER_STATS_TOKEN: 'local-owner-key-for-tests-only-00000000' },
        serviceBindings: { IDENTITY: 'local-identity' },
        d1Databases: { IDENTITY_DB: 'local-identity-db', MATCH_DB: 'local-match-history' },
        workers: [{ name: 'local-identity', modules: true, script: identity.outputFiles[0].text,
          compatibilityDate: '2026-10-20', bindings: { JWT_SECRET: 'local-test-secret-not-a-production-credential' },
          d1Databases: { DB: 'local-identity-db' } }],
      },
    })],
    // Cloudflare documents that DO WebSockets require shared storage.
    // Tests reset bindings after each case and close every client socket.
    test: { setupFiles: ['./realtime/tests/setup.ts'], include: ['realtime/tests/**/*.spec.ts', 'tests/trace-fixtures.spec.ts'], isolate: false, maxWorkers: 1,
      testTimeout: 20_000, hookTimeout: 20_000 },
  };
});
