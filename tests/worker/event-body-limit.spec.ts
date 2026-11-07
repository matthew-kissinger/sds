// SPDX-License-Identifier: AGPL-3.0-or-later
// /api/event caps what it stores, and this caps what it reads to get there: the route
// is open, and a body of any size used to be taken in whole and parsed first.
import { describe, expect, it } from 'vitest';
import worker from '../../worker/src/index.ts';
import { EVENT_BODY_CAP } from '../../worker/src/eventProps.ts';

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
const post = (db: any, body: BodyInit, headers: Record<string, string> = {}, init: RequestInit = {}) => worker.fetch(new Request('https://worker.test/api/event', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body,
  ...init,
}), env(db), noopCtx);

/** A valid event of exactly `size` bytes. */
const eventOf = (size: number) => {
  const shell = JSON.stringify({ name: 'funnel_load', props: { pad: '' } });
  return JSON.stringify({ name: 'funnel_load', props: { pad: 'x'.repeat(size - shell.length) } });
};

/** The same bytes with no length declared, counting how many chunks were asked for. */
function chunked(size: number, chunkSize = 4096) {
  const bytes = new TextEncoder().encode(eventOf(size));
  let offset = 0;
  const source = { pulls: 0 };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      source.pulls += 1;
      if (offset >= bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  }, { highWaterMark: 0 });
  return { stream, source };
}

describe('/api/event body limit', () => {
  it('takes the counts the client sends', async () => {
    const db = fakeDb();
    const body = JSON.stringify({ name: 'funnel_load', props: { ui: 'en', browser: 'en-US', device: 'phone', source: 'default' } });
    expect((await post(db, body)).status).toBe(200);
    expect(db.inserted).toEqual(['funnel_load']);
  });

  it('takes a body of exactly the limit', async () => {
    const db = fakeDb();
    const res = await post(db, eventOf(EVENT_BODY_CAP));
    expect(res.status).toBe(200);
    expect(db.inserted).toEqual(['funnel_load']);
  });

  it('refuses one byte more, and writes nothing', async () => {
    const db = fakeDb();
    const res = await post(db, eventOf(EVENT_BODY_CAP + 1));
    expect(res.status).toBe(413);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(db.inserted).toEqual([]);
  });

  it('believes a declared length without reading the body', async () => {
    const db = fakeDb();
    const { stream, source } = chunked(EVENT_BODY_CAP * 4);
    const res = await post(db, stream, { 'content-length': String(EVENT_BODY_CAP * 4) }, { duplex: 'half' } as RequestInit);
    expect(res.status).toBe(413);
    expect(source.pulls).toBe(0);
    expect(db.inserted).toEqual([]);
  });

  it('stops reading a body with no declared length once it passes the limit', async () => {
    const db = fakeDb();
    const { stream, source } = chunked(EVENT_BODY_CAP * 4);
    const res = await post(db, stream, {}, { duplex: 'half' } as RequestInit);
    expect(res.status).toBe(413);
    expect(source.pulls).toBeLessThan(Math.ceil(EVENT_BODY_CAP / 4096) + 3);
    expect(db.inserted).toEqual([]);
  });

  it('reads a body with no declared length under the limit whole', async () => {
    const db = fakeDb();
    const { stream } = chunked(EVENT_BODY_CAP - 10);
    expect((await post(db, stream, {}, { duplex: 'half' } as RequestInit)).status).toBe(200);
    expect(db.inserted).toEqual(['funnel_load']);
  });

  it('still answers a body that is not JSON as an unknown name', async () => {
    const db = fakeDb();
    expect((await post(db, 'not json')).status).toBe(400);
    expect(db.inserted).toEqual([]);
  });
});
