// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Proves a returning player keeps their name across a change to the score
// Worker. app/src/scores/controller.ts treats a 401 as "re-register", so a
// Worker that verifies tokens with a different JWT_SECRET, or reads a different
// D1, does not fail loudly: it hands returning players new random names and
// orphans their times. This is the check that would notice.
//
//   Before the change, mint an identity on the origin being changed:
//     node scripts/verify-identity.mjs --url https://sds-worker.matt-m-kissinger.workers.dev --save <file>
//   After it, on every origin that now serves the API:
//     node scripts/verify-identity.mjs --url https://sheepdogsim.com --check <file>
//
// --save registers a new identity and writes its persistentId, authSecret,
// display name and the session token minted by the old Worker to <file>.
// Keep that file outside the repository; the secret and token are credentials
// for a throwaway player, and they must never be committed.
//
// --check then proves three things on the new origin:
//   1. the token minted before the change still verifies (GET /api/my-scores
//      answers JSON 200, not 401), so JWT_SECRET is unchanged - the token is
//      valid for 24 hours, so save shortly before the change;
//   2. re-registering with persistentId + authSecret returns the same full
//      name, so the same D1 row answered;
//   3. the same persistentId with a wrong secret is refused with 401.
//
// An identity copied from a browser can be checked the same way: write a JSON
// file by hand with the persistentId and authSecret from the localStorage key
// sheepdog.score-identity.v1 and the full name the game shows, as
// { "persistentId": ..., "authSecret": ..., "fullName": ... }. With no token in
// the file, --check skips step 1 and runs 2 and 3.

import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

const origin = (option('url') || '').replace(/\/+$/, '');
const saveFile = option('save');
const checkFile = option('check');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/^https?:\/\/[^/]+$/.test(origin), '--url must be an origin.');
assert(Boolean(saveFile) !== Boolean(checkFile), 'Pass exactly one of --save <file> or --check <file>.');

async function call(path, init) {
  const response = await fetch(`${origin}${path}`, init);
  const type = response.headers.get('content-type') || '';
  assert(type.toLowerCase().startsWith('application/json'), `${path} answered ${response.status} ${type || '(no type)'}, not JSON - is this origin serving the API?`);
  return { status: response.status, body: await response.json() };
}

function register(body) {
  return call('/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

if (saveFile) {
  // An explicit operational name, so the row is recognisable if anyone looks.
  const first = await register({ displayName: 'Cutover Check', nameType: 'custom' });
  assert(first.status === 200, `register returned ${first.status}: ${JSON.stringify(first.body)}`);
  const profile = first.body.playerProfile;
  assert(typeof first.body.authSecret === 'string' && profile?.persistentId, 'register did not issue an identity.');
  const record = {
    origin,
    savedAt: new Date().toISOString(),
    persistentId: profile.persistentId,
    authSecret: first.body.authSecret,
    fullName: profile.fullName,
    token: first.body.token,
  };
  writeFileSync(saveFile, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ saved: saveFile, persistentId: record.persistentId, fullName: record.fullName }));
} else {
  const record = JSON.parse(readFileSync(checkFile, 'utf8'));
  assert(record.persistentId && record.authSecret && record.fullName, `${checkFile} needs persistentId, authSecret and fullName.`);
  const result = { origin, persistentId: record.persistentId, expected: record.fullName };

  if (record.token) {
    const runs = await call('/api/my-scores?scene=field-v3', { headers: { authorization: `Bearer ${record.token}` } });
    assert(runs.status === 200, `A token minted before the change was refused with ${runs.status}. JWT_SECRET differs - stop.`);
    result.preChangeToken = 'accepted';
  }

  const again = await register({ persistentId: record.persistentId, authSecret: record.authSecret });
  assert(again.status === 200, `Re-register returned ${again.status}: ${JSON.stringify(again.body)}`);
  result.actual = again.body.playerProfile?.fullName;
  assert(result.actual === record.fullName, `Returning identity resolved to "${result.actual}", expected "${record.fullName}". Stop.`);

  const forged = await register({ persistentId: record.persistentId, authSecret: 'not-the-secret' });
  assert(forged.status === 401, `A wrong secret was answered ${forged.status}, expected 401.`);
  result.wrongSecret = 401;

  console.log(JSON.stringify(result, null, 2));
}
