// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The game's anonymous counts (docs/operations/funnel.md) carry a country, which
 * only the Worker can vouch for: it comes from Cloudflare's reading of the
 * connection, and a client cannot claim one.
 */
import { describe, expect, it } from 'vitest';
import worker from '../../worker/src/index.ts';

const noopCtx = { waitUntil() {}, passThroughOnException() {} } as any;

function fakeDb() {
  const inserts: unknown[][] = [];
  return {
    inserts,
    prepare() {
      return { bind(...args: unknown[]) { return { run: async () => { inserts.push(args); return {}; } }; } };
    },
  };
}

async function post(db: ReturnType<typeof fakeDb>, props: Record<string, unknown>, cf?: { country?: string }) {
  const request = new Request('https://worker.test/api/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'funnel_load', props }),
  });
  if (cf) Object.assign(request, { cf });
  return worker.fetch(request, { DB: db, JWT_SECRET: 'test-secret' } as any, noopCtx);
}

describe('/api/event country', () => {
  it('records the country Cloudflare reports and no player', async () => {
    const db = fakeDb();
    const response = await post(db, { ui: 'id', device: 'phone' }, { country: 'ID' });
    expect(response.status).toBe(200);
    const [name, props, player] = db.inserts[0]!;
    expect(name).toBe('funnel_load');
    expect(JSON.parse(props as string)).toEqual({ ui: 'id', device: 'phone', country: 'ID' });
    expect(player).toBeNull();
  });

  it('ignores a country the client claims', async () => {
    const db = fakeDb();
    await post(db, { ui: 'id', country: 'XX' }, { country: 'MY' });
    expect(JSON.parse(db.inserts[0]![1] as string).country).toBe('MY');

    const without = fakeDb();
    await post(without, { ui: 'id', country: 'XX' });
    expect(JSON.parse(without.inserts[0]![1] as string)).toEqual({ ui: 'id' });
  });

  it('keeps every field of the widest count under its caps', async () => {
    const db = fakeDb();
    const props = {
      ui: 'zh-CN',
      browser: 'zh-Hans-CN',
      device: 'phone',
      phase: 'returned',
      elapsed: '5-10m',
      sheep: '25-50%',
      frame: '100-250ms',
      renderer: 'webgl2',
      tier: 'medium',
      flock: 200,
      mode: 'multiplayer',
    };
    await post(db, props, { country: 'ID' });
    expect(JSON.parse(db.inserts[0]![1] as string)).toEqual({ ...props, country: 'ID' });
  });
});
