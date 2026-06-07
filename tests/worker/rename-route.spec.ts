// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Cycle 69 P1: the /api/rename route must degrade a missing or malformed body to
// a clean client error, not a server 500. Before this cycle the route did a bare
// `await request.json<any>()` outside the try/catch, so an absent body (or
// garbage JSON) threw into the outer catch and returned 500 - a server fault for
// what is really a client mistake. The fix routes every body-parsing POST through
// `readJsonObject`, which returns `{}` instead of throwing; the route's normal
// guards then produce 401 (no token) or 400 (empty name) downstream.
//
// This drives the real exported `fetch` handler (not a function in isolation) so
// it proves the route contract end-to-end. A stub DB is enough: the empty-name
// path throws ValidationError in sanitizeDisplayName before any DB access.
import { describe, it, expect } from 'vitest';
import worker, { readJsonObject } from '../../worker/src/index';
import { signJwt } from '../../worker/src/jwt';

const SECRET = 'test-jwt-secret-do-not-ship';

// A benign D1 stub: faithfully shaped (prepare -> bind -> first/all/run) but
// returns empties. The no-body / empty-name path never reaches it (name
// validation throws first), so it only exists to satisfy the signature.
function stubDb(): any {
  const stmt: any = {
    bind: () => stmt,
    first: async () => null,
    all: async () => ({ results: [] }),
    run: async () => ({ success: true }),
  };
  return { prepare: () => stmt, batch: async () => [] };
}

function makeEnv(): any {
  return { JWT_SECRET: SECRET, DB: stubDb() };
}

const ctx: any = { waitUntil() {}, passThroughOnException() {} };
const URL_RENAME = 'https://sds.test/api/rename';

describe('readJsonObject', () => {
  it('returns {} for an absent body instead of throwing', async () => {
    const req = new Request(URL_RENAME, { method: 'POST' });
    await expect(readJsonObject(req)).resolves.toEqual({});
  });

  it('returns {} for malformed JSON instead of throwing', async () => {
    const req = new Request(URL_RENAME, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not valid json',
    });
    await expect(readJsonObject(req)).resolves.toEqual({});
  });

  it('returns the parsed object for valid JSON', async () => {
    const req = new Request(URL_RENAME, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ display_name: 'Shep' }),
    });
    await expect(readJsonObject(req)).resolves.toEqual({ display_name: 'Shep' });
  });
});

describe('/api/rename body robustness (Cycle 69 P1)', () => {
  it('a valid token with NO body returns 400 (was 500), not a server error', async () => {
    const token = await signJwt({ persistent_id: 'pid-rename-route' }, SECRET);
    const req = new Request(URL_RENAME, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await worker.fetch(req, makeEnv(), ctx);
    expect(res.status).toBe(400);
    const data = await res.json<{ error: string }>();
    expect(data.error).toBe('name_empty');
  });

  it('a valid token with malformed JSON returns 400, not 500', async () => {
    const token = await signJwt({ persistent_id: 'pid-rename-route' }, SECRET);
    const req = new Request(URL_RENAME, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{ not valid json',
    });
    const res = await worker.fetch(req, makeEnv(), ctx);
    expect(res.status).toBe(400);
  });

  it('a valid token with an explicit empty display_name returns 400 (parse path still works)', async () => {
    const token = await signJwt({ persistent_id: 'pid-rename-route' }, SECRET);
    const req = new Request(URL_RENAME, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ display_name: '' }),
    });
    const res = await worker.fetch(req, makeEnv(), ctx);
    expect(res.status).toBe(400);
  });

  it('NO token and NO body returns 401 (token check still fires after the safe parse)', async () => {
    const req = new Request(URL_RENAME, { method: 'POST' });
    const res = await worker.fetch(req, makeEnv(), ctx);
    expect(res.status).toBe(401);
    const data = await res.json<{ error: string }>();
    expect(data.error).toBe('missing or invalid token');
  });
});
