// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 86 Phase 2 Fix 3: /api/event caps.
 *
 * Before: the encoded propsJson was sliced at 2048 chars AFTER JSON-encoding, so
 * a cut mid-escape or mid-multibyte stored INVALID JSON.
 *
 * After: strings are capped at EVENT_STRING_PROP_CAP (256) raw chars, the total
 * encoded propsJson is bounded at EVENT_PROPS_JSON_CAP (8192) by re-encoding (never
 * slicing the encoded string), and every stored propsJson JSON.parses cleanly. The
 * wider cap for crash stacks went with the client's crash beacon.
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
  return { DB: db, JWT_SECRET: 'test-secret' } as any;
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

describe('Cycle 86 Fix 3: /api/event caps + valid-JSON persistence', () => {
  it('caps every string prop at the raw 256, a stack too, and the propsJson JSON.parses', async () => {
    const db = makeFakeDb();
    const res = await postEvent(db, 'funnel_left', { phase: 'p'.repeat(1000), stack: 's'.repeat(4096) });
    expect(res.status).toBe(200);
    expect(db._eventInserts.length).toBe(1);
    const parsed = JSON.parse(db._eventInserts[0].propsJson); // must not throw
    expect(parsed.phase.length).toBe(EVENT_STRING_PROP_CAP);
    expect(parsed.stack.length).toBe(EVENT_STRING_PROP_CAP);
  });

  it('a value ending in backslashes at the truncation boundary still stores valid JSON', async () => {
    const db = makeFakeDb();
    // Truncation lands inside a run of backslashes, which encode as \\\\. Sliced
    // AFTER encoding this could leave a dangling escape; truncating the raw
    // string first keeps it valid.
    const value = 'a'.repeat(EVENT_STRING_PROP_CAP - 5) + '\\'.repeat(10);
    const res = await postEvent(db, 'funnel_left', { phase: value });
    expect(res.status).toBe(200);
    const parsed = JSON.parse(db._eventInserts[0].propsJson); // must not throw
    expect(parsed.phase).toBe('a'.repeat(EVENT_STRING_PROP_CAP - 5) + '\\'.repeat(5));
    expect(parsed.phase.length).toBe(EVENT_STRING_PROP_CAP);
  });

  it('a multibyte char straddling the truncation boundary is dropped whole (no lone surrogate)', async () => {
    const db = makeFakeDb();
    const value = 'a'.repeat(EVENT_STRING_PROP_CAP - 1) + '\u{1F600}';
    const res = await postEvent(db, 'funnel_left', { phase: value });
    expect(res.status).toBe(200);
    const parsed = JSON.parse(db._eventInserts[0].propsJson);
    expect(parsed.phase).toBe('a'.repeat(EVENT_STRING_PROP_CAP - 1));
    expect((parsed.phase as string).isWellFormed()).toBe(true);
  });

  it('bounds the total propsJson at 8192 by re-encoding, still valid JSON', async () => {
    const db = makeFakeDb();
    // Each is capped at 256 raw, and a backslash encodes as two characters.
    const props: Record<string, unknown> = {};
    for (let i = 0; i < 16; i++) props[`k${i}`] = '\\'.repeat(1000);
    const res = await postEvent(db, 'funnel_left', props);
    expect(res.status).toBe(200);
    const { propsJson } = db._eventInserts[0];
    expect(propsJson.length).toBeLessThanOrEqual(EVENT_PROPS_JSON_CAP);
    expect(() => JSON.parse(propsJson)).not.toThrow();
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
