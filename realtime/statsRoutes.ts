// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RealtimeEnv } from './bindings';
import type { Identity } from './roomState';
import { json, requireThat } from './http';
import { ownerStats, playerHistory } from './matchStore';

export async function statsRoute(request: Request, env: RealtimeEnv, identity: () => Promise<Identity>) {
  const url = new URL(request.url);
  if (!['/r/stats/me','/r/stats/owner'].includes(url.pathname)) return null;
  requireThat(request.method === 'GET', 'method_not_allowed',405);
  if (url.pathname === '/r/stats/me') {
    const who = await identity();
    const before = url.searchParams.get('before');
    requireThat(!before || /^\d{1,16}:[a-f0-9]{32}$/.test(before) && Number.isSafeInteger(Number(before.split(':')[0])), 'invalid_cursor',400);
    requireThat([...url.searchParams.keys()].every(k=>k==='before'), 'invalid_query',400);
    requireThat(env.MATCH_DB, 'history_unavailable',503);
    return json(await playerHistory(env.MATCH_DB,who.id,before));
  }
  // A normal game identity never authorizes the owner endpoint. No URL credentials.
  requireThat(env.OWNER_STATS_TOKEN && env.OWNER_STATS_TOKEN.length >= 32, 'owner_unconfigured',503);
  const auth = request.headers.get('Authorization') ?? '';
  requireThat(auth.length <= 256,'owner_required',401);
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  const [actual,expected] = await Promise.all([digest(auth),digest(`Bearer ${env.OWNER_STATS_TOKEN}`)]);
  let difference = 0; for (let i=0;i<actual.length;i++) difference |= actual[i]! ^ expected[i]!;
  requireThat(difference === 0,'owner_required',401);
  const days = url.searchParams.get('days') ?? '7';
  requireThat(['1','7','30'].includes(days) && [...url.searchParams.keys()].every(k=>k==='days'),'invalid_query',400);
  requireThat(env.MATCH_DB,'history_unavailable',503);
  return json(await ownerStats(env.MATCH_DB,Number(days)));
}
