// SPDX-License-Identifier: AGPL-3.0-or-later
// /api/event accepts only the names the client sends, and spends its own rate-limit
// bucket, so counts cannot cost a player a sign-in or a score card.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import worker from '../../worker/src/index.ts';
import { EVENT_NAMES } from '../../worker/src/eventProps.ts';

const noopCtx = { waitUntil() {}, passThroughOnException() {} } as any;

function fakeDb() {
  const inserted: string[] = [];
  const db: any = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement: any = {
        bind(...args: unknown[]) { binds = args; return statement; },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() {
          if (/INSERT INTO events/i.test(sql)) inserted.push(binds[0] as string);
          return { success: true };
        },
      };
      return statement;
    },
    inserted,
  };
  return db;
}

const env = (db: any) => ({ DB: db, JWT_SECRET: 'test-secret' }) as any;
const postEvent = (db: any, name: string, ip?: string) => worker.fetch(new Request('https://worker.test/api/event', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(ip ? { 'cf-connecting-ip': ip } : {}) },
  body: JSON.stringify({ name, props: {} }),
}), env(db), noopCtx);
const getBoard = (db: any, ip: string) => worker.fetch(new Request('https://worker.test/api/leaderboards', {
  headers: { 'cf-connecting-ip': ip },
}), env(db), noopCtx);

describe('/api/event names', () => {
  it('match every name the client can send', () => {
    const source = readFileSync('app/src/funnel/funnel.ts', 'utf8');
    const union = source.match(/export type FunnelEvent =([\s\S]*?);/)![1]!;
    const client = [...union.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(client.length).toBeGreaterThan(0);
    expect([...EVENT_NAMES].sort()).toEqual([...client].sort());
  });

  it('accept each of them', async () => {
    const db = fakeDb();
    for (const name of EVENT_NAMES) expect((await postEvent(db, name)).status, name).toBe(200);
    expect(db.inserted.sort()).toEqual([...EVENT_NAMES].sort());
  });

  it('refuse anything else, and write nothing', async () => {
    const db = fakeDb();
    for (const name of ['client_error', 'funnel_', '', 'FUNNEL_LOAD', '__proto__']) {
      expect((await postEvent(db, name)).status, name).toBe(400);
    }
    expect(db.inserted).toEqual([]);
  });
});

describe('/api/event rate limit', () => {
  it('runs out on its own, leaving the front door open', async () => {
    const db = fakeDb();
    const ip = '198.51.100.1';
    let limited = false;
    for (let sent = 0; sent < 200 && !limited; sent += 1) limited = (await postEvent(db, 'funnel_load', ip)).status === 429;
    expect(limited).toBe(true);
    expect((await getBoard(db, ip)).status).not.toBe(429);
  });

  it('and the front door running out leaves it open', async () => {
    const db = fakeDb();
    const ip = '198.51.100.2';
    let limited = false;
    for (let sent = 0; sent < 200 && !limited; sent += 1) limited = (await getBoard(db, ip)).status === 429;
    expect(limited).toBe(true);
    expect((await postEvent(db, 'funnel_load', ip)).status).toBe(200);
  });
});
