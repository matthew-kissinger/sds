// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 86 Phase 2 Fix 3: /api/event crash-beacon stack cap.
 *
 * Before: every string prop was truncated to 256 chars, so the ~4 KB crash
 * stacks the P0-CRASH client beacon sends persisted truncated; and the
 * encoded propsJson was sliced at 2048 chars AFTER JSON-encoding, so a cut
 * mid-escape (stack ending in a backslash escape) or mid-multibyte stored
 * INVALID JSON.
 *
 * After: the `stack` key is capped at EVENT_STACK_PROP_CAP (4096) raw chars,
 * other strings keep EVENT_STRING_PROP_CAP (256), the total encoded propsJson
 * is bounded at EVENT_PROPS_JSON_CAP (8192) by re-encoding (never slicing the
 * encoded string), and every stored propsJson JSON.parses cleanly.
 *
 * Route tests drive the worker's default fetch export with a fake Env + fake
 * D1 capturing the INSERT INTO events binds, in the spirit of
 * tests/worker/score-authority.spec.ts.
 */
import { describe, it, expect } from 'vitest';
import worker from '../../worker/src/index.ts';
import {
  truncateRawString,
  encodePropsJson,
  EVENT_STRING_PROP_CAP,
  EVENT_STACK_PROP_CAP,
  EVENT_PROPS_JSON_CAP,
} from '../../worker/src/eventProps.ts';

// ---- fake D1 capturing event inserts ----------------------------------------

function makeFakeDb() {
  const eventInserts: { name: string; propsJson: string; pid: string | null }[] = [];
  const db: any = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt: any = {
        bind(...args: unknown[]) { binds = args; return stmt; },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() {
          if (/INSERT INTO events/i.test(sql)) {
            eventInserts.push({
              name: binds[0] as string,
              propsJson: binds[1] as string,
              pid: (binds[2] as string | null) ?? null,
            });
          }
          return { success: true };
        },
      };
      return stmt;
    },
    _eventInserts: eventInserts,
  };
  return db;
}

const noopCtx = { waitUntil() {}, passThroughOnException() {} } as any;

function makeEnv(db: any) {
  return { ROOM_DO: {}, LOBBY_DO: {}, DB: db, JWT_SECRET: 'test-secret' } as any;
}

async function postEvent(db: any, name: string, props: Record<string, unknown>): Promise<Response> {
  const req = new Request('https://worker.test/api/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, props }),
  });
  return worker.fetch(req, makeEnv(db), noopCtx);
}

// ---- route behavior -----------------------------------------------------------

describe('Cycle 86 Fix 3: /api/event stack cap + valid-JSON persistence', () => {
  it('stores a 4096-char client_error stack in full (>= 4000 chars) and the propsJson JSON.parses', async () => {
    const db = makeFakeDb();
    const stack = 'Error: boom\n' + 'at frame()  https://sheepdogsim.com/assets/main.js:1:2\n'.repeat(80);
    const fullStack = stack.slice(0, 4096).padEnd(4096, 'x');
    expect(fullStack.length).toBe(4096);

    const res = await postEvent(db, 'client_error', {
      message: 'boom',
      stack: fullStack,
      build: '2.2.12',
      ua: 'Mozilla/5.0 test',
    });
    expect(res.status).toBe(200);
    expect(db._eventInserts.length).toBe(1);

    const { propsJson } = db._eventInserts[0];
    const parsed = JSON.parse(propsJson); // must not throw
    expect(parsed.stack.length).toBeGreaterThanOrEqual(4000);
    expect(parsed.stack).toBe(fullStack);
    expect(parsed.message).toBe('boom');
    expect(propsJson.length).toBeLessThanOrEqual(EVENT_PROPS_JSON_CAP);
  });

  it('truncates an over-long stack at the raw 4096 cap, never mid-encoding', async () => {
    const db = makeFakeDb();
    const res = await postEvent(db, 'client_error', { stack: 'z'.repeat(10_000) });
    expect(res.status).toBe(200);
    const parsed = JSON.parse(db._eventInserts[0].propsJson);
    expect(parsed.stack).toBe('z'.repeat(EVENT_STACK_PROP_CAP));
  });

  it('a stack ending in backslashes at the truncation boundary still stores valid JSON', async () => {
    const db = makeFakeDb();
    // Raw backslashes straddling the 4096 boundary: the truncated RAW value
    // ends in a backslash, which JSON-encodes to a closed \\ escape. The old
    // encoded-slice could land between the two characters of an escape.
    const stack = 'a'.repeat(EVENT_STACK_PROP_CAP - 5) + '\\'.repeat(10);
    const res = await postEvent(db, 'client_error', { stack });
    expect(res.status).toBe(200);
    const { propsJson } = db._eventInserts[0];
    const parsed = JSON.parse(propsJson); // must not throw
    expect(parsed.stack).toBe('a'.repeat(EVENT_STACK_PROP_CAP - 5) + '\\'.repeat(5));
    expect(parsed.stack.length).toBe(EVENT_STACK_PROP_CAP);
  });

  it('a multibyte char straddling the truncation boundary is dropped whole (no lone surrogate)', async () => {
    const db = makeFakeDb();
    // The emoji's two UTF-16 units sit at indices 4095-4096; slice(0, 4096)
    // would keep only the high surrogate.
    const stack = 'a'.repeat(EVENT_STACK_PROP_CAP - 1) + '\u{1F600}';
    const res = await postEvent(db, 'client_error', { stack });
    expect(res.status).toBe(200);
    const { propsJson } = db._eventInserts[0];
    const parsed = JSON.parse(propsJson); // must not throw
    expect(parsed.stack).toBe('a'.repeat(EVENT_STACK_PROP_CAP - 1));
    expect((parsed.stack as string).isWellFormed()).toBe(true);
  });

  it('non-stack string props keep the 256-char cap', async () => {
    const db = makeFakeDb();
    const res = await postEvent(db, 'client_error', { ua: 'u'.repeat(1000), stack: 's'.repeat(1000) });
    expect(res.status).toBe(200);
    const parsed = JSON.parse(db._eventInserts[0].propsJson);
    expect(parsed.ua.length).toBe(EVENT_STRING_PROP_CAP);
    expect(parsed.stack.length).toBe(1000); // under the stack cap, untouched
  });

  it('bounds the total propsJson at 8192 by re-encoding, still valid JSON', async () => {
    const db = makeFakeDb();
    const props: Record<string, unknown> = { stack: 'S'.repeat(4096) };
    for (let i = 0; i < 15; i++) props[`k${i}`] = 'v'.repeat(1000); // each capped to 256
    const res = await postEvent(db, 'client_error', props);
    expect(res.status).toBe(200);
    const { propsJson } = db._eventInserts[0];
    expect(propsJson.length).toBeLessThanOrEqual(EVENT_PROPS_JSON_CAP);
    const parsed = JSON.parse(propsJson); // must not throw
    expect(typeof parsed.stack).toBe('string');
  });
});

// ---- helper-level edges --------------------------------------------------------

describe('Cycle 86 Fix 3: helper edges', () => {
  it('truncateRawString leaves short strings alone and never strands a high surrogate', () => {
    expect(truncateRawString('abc', 10)).toBe('abc');
    expect(truncateRawString('abcdef', 3)).toBe('abc');
    const s = 'ab' + '\u{1F600}';
    expect(truncateRawString(s, 3)).toBe('ab'); // cut inside the pair
    expect(truncateRawString(s, 4)).toBe(s);    // whole pair fits
  });

  it('encodePropsJson shrinks the longest string until the encoded form fits', () => {
    const props: Record<string, string | number | boolean> = {
      stack: '\\'.repeat(4000), // encodes to ~8000 chars of escapes
      message: 'm'.repeat(200),
      count: 3,
      flag: true,
    };
    const json = encodePropsJson(props, 4096);
    expect(json.length).toBeLessThanOrEqual(4096);
    const parsed = JSON.parse(json);
    expect(parsed.count).toBe(3);
    expect(parsed.flag).toBe(true);
    expect(parsed.stack.endsWith('\\')).toBe(true); // closed escape, parsed fine
  });

  it('encodePropsJson falls back to {} when nothing shrinkable remains', () => {
    const longKey = 'k'.repeat(5000);
    const json = encodePropsJson({ [longKey]: 1 }, 64);
    expect(json).toBe('{}');
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
