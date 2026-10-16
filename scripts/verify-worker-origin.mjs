// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Verifies that one origin serves both halves of a release from the sds-worker
// Worker: the game as static assets and the score API under /api.
//
// Every check asserts a Content-Type and a body shape, never a status alone.
// Before the cutover, https://sheepdogsim.com/api/anything answered HTTP 200
// with index.html from the Pages single-page fallback, so a status check on an
// API path proves nothing. The same holds in reverse: the old Worker answered
// `/` with its health JSON, so `/` must now be HTML.
//
//   node scripts/verify-worker-origin.mjs --url https://sheepdogsim.com
//   node scripts/verify-worker-origin.mjs --url http://127.0.0.1:8787 --sha <commit>
//
// Options:
//   --url <origin>   required; the origin to check.
//   --sha <commit>   also require /release.json to report this commit.
//   --retries <n>    attempts before failing, 5 s apart (default 1).
//   --static-only    check only the static surface, not /api (for an origin
//                    that is still the Pages project, as a rollback check).

const args = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  const prefixed = args.find((arg) => arg.startsWith(`--${name}=`));
  return prefixed ? prefixed.slice(name.length + 3) : fallback;
}

const origin = option('url', '').replace(/\/+$/, '');
const sha = option('sha', '');
const retries = Number(option('retries', '1'));
const staticOnly = args.includes('--static-only');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/^https?:\/\/[^/]+$/.test(origin), '--url must be an origin such as https://sheepdogsim.com');
assert(Number.isInteger(retries) && retries >= 1, '--retries must be a positive integer.');
assert(!sha || /^[0-9a-f]{40}$/i.test(sha), '--sha must be a full 40-character commit SHA.');

async function get(path, init = {}) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${origin}${path}${separator}proof=${Date.now()}`, {
    redirect: 'manual',
    cache: 'no-store',
    ...init,
    headers: { 'user-agent': 'SheepdogSimOriginVerifier/1.0', 'cache-control': 'no-cache', ...init.headers },
  });
  const type = response.headers.get('content-type') || '';
  return { response, type, text: response.status >= 300 && response.status < 400 ? '' : await response.text() };
}

function isHtml(type) {
  return type.toLowerCase().startsWith('text/html');
}

function isJson(type) {
  return type.toLowerCase().startsWith('application/json');
}

function parse(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not JSON: ${text.slice(0, 80)}`);
  }
}

async function verifyOnce() {
  const results = {};

  const root = await get('/');
  assert(root.response.status === 200, `/ returned HTTP ${root.response.status}.`);
  assert(isHtml(root.type), `/ must be index.html, got Content-Type ${root.type || '(none)'}.`);
  assert(root.text.includes('<title>Sheepdog Sim'), '/ is HTML but not the game page.');
  results.root = root.type;

  const fallback = await get('/release-check-unmatched-path');
  assert(fallback.response.status === 200 && isHtml(fallback.type), `An unmatched path must serve index.html, got ${fallback.response.status} ${fallback.type}.`);
  assert(fallback.text === root.text, 'The single-page fallback differs from index.html.');
  results.spaFallback = 'index.html';

  const about = await get('/about.html');
  assert(about.response.status === 301, `/about.html must 301 (from _redirects), got ${about.response.status}.`);
  assert(new URL(about.response.headers.get('location') || '', origin).pathname === '/about', '/about.html must redirect to /about.');
  results.aboutRedirect = 301;

  const release = await get('/release.json');
  assert(release.response.status === 200 && isJson(release.type), `/release.json must be JSON, got ${release.response.status} ${release.type}.`);
  const cacheControl = release.response.headers.get('cache-control') || '';
  assert(/no-store/.test(cacheControl), `/release.json must carry no-store from _headers, got "${cacheControl}".`);
  const manifest = parse(release.text, '/release.json');
  if (sha) assert(String(manifest.commit).toLowerCase() === sha.toLowerCase(), `/release.json reports ${manifest.commit}, expected ${sha}.`);
  results.release = { version: manifest.version, commit: manifest.commit, cacheControl };

  if (!staticOnly) {
    const health = await get('/api/healthz');
    assert(health.response.status === 200, `/api/healthz returned HTTP ${health.response.status}.`);
    assert(isJson(health.type), `/api/healthz must be application/json, got ${health.type || '(none)'} - is the route serving the Pages fallback?`);
    const body = parse(health.text, '/api/healthz');
    assert(body.ok === true && body.worker === 'sds-worker', `/api/healthz body is not the sds-worker health: ${health.text}`);
    results.health = body;

    const unknown = await get('/api/release-check-unknown-route');
    assert(unknown.response.status === 404 && isJson(unknown.type), `An unknown /api path must be a JSON 404 from the Worker, got ${unknown.response.status} ${unknown.type}.`);
    results.apiNotFound = 404;

    const board = await get('/api/leaderboard?mode=solo&scene=field-v3&sheepCount=25&limit=1');
    assert(board.response.status === 200 && isJson(board.type), `field-v3 leaderboard must be JSON 200, got ${board.response.status} ${board.type}.`);
    assert(Array.isArray(parse(board.text, 'leaderboard').entries), 'field-v3 leaderboard has no entries array.');
    results.leaderboard = 'field-v3/25';
  }

  return results;
}

let lastError;
for (let attempt = 1; attempt <= retries; attempt += 1) {
  try {
    console.log(JSON.stringify({ origin, ...(await verifyOnce()) }, null, 2));
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}
console.error(`verify-worker-origin: ${lastError.message}`);
process.exit(1);
