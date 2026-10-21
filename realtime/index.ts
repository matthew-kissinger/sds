// SPDX-License-Identifier: AGPL-3.0-or-later
import { statsRoute } from './statsRoutes';
import { PROTOCOL } from '../net/messages';
import type { RealtimeEnv } from './bindings';
import { failure, json, object, requireThat, smallJson, unwrap } from './http';
import { REGIONS, isRegion, regionOf } from './regions';
import { settings, type Identity } from './roomState';
import { requestAllowed } from './traffic';
import { deploymentDeadline } from './deadline';
export { RoomDO } from './RoomDO';
export { LobbyDO } from './LobbyDO';

async function identity(request: Request, env: RealtimeEnv): Promise<Identity> {
  const authorization = request.headers.get('Authorization');
  requireThat(authorization && authorization.length <= 2048, 'identity_required', 401);
  const response = await env.IDENTITY.fetch('https://identity.internal/admission', {
    method: 'POST', headers: { Authorization: authorization },
  });
  requireThat(response.status !== 401, 'identity_expired', 401);
  requireThat(response.ok, 'identity_unavailable', 503);
  const value = object(await response.json());
  requireThat(typeof value.id === 'string' && value.id.length <= 128 && typeof value.name === 'string'
    && value.name.length <= 32, 'identity_unavailable', 503);
  return { id: value.id, name: value.name };
}
export default {
  async fetch(request: Request, env: RealtimeEnv): Promise<Response> {
    try {
      const url = new URL(request.url);
      requireThat(Date.now() < deploymentDeadline(env), 'pilot_closed', 410);
      requireThat(requestAllowed(request.headers.get('CF-Connecting-IP') ?? 'local', Date.now()), 'request_rate', 429);
      if (url.pathname === '/r/health' && request.method === 'GET') return json({ protocol: PROTOCOL, gameplay: true, commit: env.RELEASE_SHA });
      if (env.GAME_SHELL && request.method === 'GET' && (/^\/r\/(na|eu|apac)_[a-f0-9]{32}$/.test(url.pathname) || url.pathname === '/r/owner')) {
        return env.GAME_SHELL.fetch(request);
      }
      if (request.method === 'POST' || request.headers.has('Upgrade')) {
        requireThat(request.headers.get('Origin') === env.ALLOWED_ORIGIN, 'origin_denied', 403);
      }
      const stats = await statsRoute(request,env,() => identity(request,env));
      if (stats) return stats;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'r') return json({ error: 'not_found' }, 404);
      if (parts[1] === 'lobbies' && parts.length === 3 && request.method === 'GET') {
        const region = parts[2]; requireThat(isRegion(region), 'invalid_region', 400);
        const after = url.searchParams.get('after');
        requireThat(!after || regionOf(after) === region, 'invalid_cursor', 400);
        return json(await env.LOBBIES.get(env.LOBBIES.idFromName(region), { locationHint: REGIONS[region] }).list(after));
      }
      if (parts[1] === 'rooms' && parts.length === 2 && request.method === 'POST') {
        const who = await identity(request, env); const body = object(await smallJson(request));
        const region = body.region; requireThat(isRegion(region), 'invalid_region', 400);
        const config = settings(object(body.settings));
        const key = request.headers.get('Idempotency-Key');
        requireThat(key && /^[a-f0-9]{32}$/.test(key), 'idempotency_key_required', 400);
        const lobby = env.LOBBIES.get(env.LOBBIES.idFromName(region), { locationHint: REGIONS[region] });
        const handle = unwrap(await lobby.allocate(region, who.id, key, config));
        const room = env.ROOMS.get(env.ROOMS.idFromName(handle), { locationHint: REGIONS[region] });
        return json(unwrap(await room.admit(who, { handle, region, settings: config })), 201);
      }
      const handle = parts[1]; const region = handle && regionOf(handle);
      requireThat(region, 'room_not_found', 404);
      const room = env.ROOMS.get(env.ROOMS.idFromName(handle), { locationHint: REGIONS[region] });
      if (parts.length === 3 && parts[2] === 'join' && request.method === 'POST') return json(unwrap(await room.admit(await identity(request, env), null)));
      if (parts.length === 3 && parts[2] === 'ws' && request.method === 'GET') return room.fetch(request);
      // A read never reserves a seat. The local client server handles the invite
      // shell; /status is the availability endpoint for that shell.
      if ((parts.length === 2 || parts.length === 3 && parts[2] === 'status') && request.method === 'GET') return json(unwrap(await room.inspect()));
      return json({ error: 'not_found' }, 404);
    } catch (error) { return failure(error); }
  },
} satisfies ExportedHandler<RealtimeEnv>;
