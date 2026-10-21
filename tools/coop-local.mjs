// SPDX-License-Identifier: AGPL-3.0-or-later
// Disposable real workerd + real identity API + normal rendered client. Never remote.
import { build as bundle } from 'esbuild';
import { Miniflare } from 'miniflare';
import { build, createServer, preview } from 'vite';
import { readdir, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { builtClientDir } from '../scripts/build-output.mjs';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const configFile = resolve('vite.coop.config.ts');
const options = { bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  external: ['cloudflare:workers'], loader: { '.wasm': 'binary' } };
const identity = await bundle({ ...options, stdin: { contents: `
  export { default } from './worker/src/index.ts';
  export { default as RoomAdmission } from './worker/src/roomAdmission.ts';`, resolveDir: process.cwd() } });
const gateway = await bundle({ ...options, stdin: { contents: `
  import realtime from './realtime/index.ts';
  export { RoomDO, LobbyDO } from './realtime/index.ts';
  export default { fetch(request, env, ctx) {
    return new URL(request.url).pathname.startsWith('/api/')
      ? env.GAME.fetch(request) : realtime.fetch(request, env, ctx);
  } };`, resolveDir: process.cwd() } });
let mf, server;
async function close() { await server?.close?.(); await mf?.dispose(); }
try {
  const manifest = contents => ({ mainModule: 'index.mjs', modulesRoot: process.cwd(), modules: { 'index.mjs': { type: 'esm', contents } } });
  mf = new Miniflare({ host: '127.0.0.1', port: 8799, logRequests: false, workers: [
    { config: { name: 'local-realtime', manifest: manifest(gateway.outputFiles[0].text),
      compatibilityDate: '2026-10-19', compatibilityFlags: ['nodejs_compat'],
      exports: { RoomDO: { type: 'durable-object', storage: 'sqlite' }, LobbyDO: { type: 'durable-object', storage: 'sqlite' } },
      env: {
        ROOMS: { type: 'durable-object', worker: 'local-realtime', exportName: 'RoomDO' },
        LOBBIES: { type: 'durable-object', worker: 'local-realtime', exportName: 'LobbyDO' },
        ALLOWED_ORIGIN: { type: 'text', value: 'http://localhost:5198' },
        ROOM_CAPS: { type: 'json', value: { na: 4, eu: 4, apac: 4 } },
        MATCH_DB: { type: 'd1', id: 'local-multiplayer-history' },
        OWNER_STATS_TOKEN: { type: 'text', value: 'local-owner-key-for-development-only' },
        GAME: { type: 'worker', worker: 'local-identity' },
        IDENTITY: { type: 'worker', worker: 'local-identity', exportName: 'RoomAdmission', dev: { remote: false } },
      } } },
    { config: { name: 'local-identity', manifest: manifest(identity.outputFiles[0].text),
      compatibilityDate: '2026-10-19', compatibilityFlags: ['nodejs_compat'],
      env: { JWT_SECRET: { type: 'text', value: randomBytes(32).toString('hex') }, DB: { type: 'd1', id: 'local-coop-identity' } } } },
  ] });
  await mf.ready;
  const db = await mf.getD1Database('DB', 'local-identity');
  for (const name of (await readdir('worker/migrations')).filter(n => n.endsWith('.sql')).sort()) {
    const sql = (await readFile(`worker/migrations/${name}`, 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\r?\n/g, ' ');
    if (sql.trim()) await db.exec(sql);
  }
  const matches = await mf.getD1Database('MATCH_DB', 'local-realtime');
  for (const name of (await readdir('realtime/migrations')).filter(n => n.endsWith('.sql')).sort()) {
    const sql = (await readFile(`realtime/migrations/${name}`, 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\r?\n/g, ' ');
    await matches.exec(sql);
  }
  if (process.argv.includes('--built') || process.argv.includes('--production-assets')) {
    const production = process.argv.includes('--production-assets');
    if (!production) await build({ configFile, mode: 'coop' });
    const result = await preview({ configFile, mode: 'coop', ...(production ? { build: { outDir: builtClientDir } } : {}) });
    server = { close: () => new Promise(resolve => result.httpServer.close(resolve)) };
  } else { server = await createServer({ configFile, mode: 'coop' }); await server.listen(); }
  console.log('Local co-op: http://localhost:5198 — independent browser profiles; Ctrl+C stops both services.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void close().then(() => process.exit(0)));
} catch (error) { await close(); throw error; }
