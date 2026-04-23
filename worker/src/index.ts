import { RoomDO } from './RoomDO';
import { LobbyDO } from './LobbyDO';

export { RoomDO, LobbyDO };

const CORS_ORIGIN = ['https://sheepdogsim.com', 'http://localhost:3000'];

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && CORS_ORIGIN.includes(origin) ? origin : CORS_ORIGIN[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function verifyToken(token: string, secret: string): Promise<{ persistent_id: string } | null> {
  try {
    const [header, payload, sig] = token.split('.');
    if (!header || !payload || !sig) return null;
    const data = `${header}.${payload}`;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
    if (!valid) return null;
    const claims = JSON.parse(atob(payload));
    if (claims.exp < Date.now() / 1000) return null;
    return claims;
  } catch { return null; }
}

async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${data}.${sigB64}`;
}

function sanitizeName(name: string): string {
  return name.replace(/<[^>]*>/g, '').trim().slice(0, 20);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // GET /api/lobbies
    if (url.pathname === '/api/lobbies' && request.method === 'GET') {
      const id = env.LOBBY_DO.idFromName('global');
      const stub = env.LOBBY_DO.get(id);
      const resp = await stub.fetch(new Request('http://internal/list'));
      return new Response(resp.body, { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // WebSocket room upgrade: GET /r/:code/ws
    const roomMatch = url.pathname.match(/^\/r\/([A-Z0-9]{4,8})\/ws$/);
    if (roomMatch && request.headers.get('Upgrade') === 'websocket') {
      const code = roomMatch[1];
      const id = env.ROOM_DO.idFromName(code);
      const stub = env.ROOM_DO.get(id);
      return stub.fetch(request);
    }

    // POST /api/register
    if (url.pathname === '/api/register' && request.method === 'POST') {
      const body = await request.json() as { persistentId: string; displayName: string };
      const name = sanitizeName(body.displayName || 'Player');
      const token = await signToken(
        { persistent_id: body.persistentId, name, exp: Math.floor(Date.now() / 1000) + 86400 },
        env.JWT_SECRET
      );
      return new Response(JSON.stringify({ token }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // POST /api/score
    if (url.pathname === '/api/score' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      const claims = await verifyToken(token, env.JWT_SECRET);
      if (!claims) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
      const body = await request.json() as { gameMode: string; score: number };
      // Score bounds validation (same as droplet server)
      const { gameMode, score } = body;
      const valid =
        (['soloClassic', 'soloExtreme', 'cooperative'].includes(gameMode) && score >= 30 && score <= 3600) ||
        (gameMode === 'timed' && Number.isInteger(score) && score >= 0 && score <= 500) ||
        (gameMode === 'competitive' && (score === 0 || score === 1));
      if (!valid) return new Response(JSON.stringify({ error: 'score out of bounds' }), { status: 400, headers: cors });
      await env.DB.prepare(
        'INSERT INTO score_submissions (persistent_id, game_mode, score, submitted_at) VALUES (?, ?, ?, ?)'
      ).bind(claims.persistent_id, gameMode, score, Date.now()).run();
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // GET /api/leaderboard?mode=X&limit=N
    if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
      const mode = url.searchParams.get('mode') || 'soloClassic';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 100);
      const colMap: Record<string, string> = {
        soloClassic: 'solo_classic_best', soloExtreme: 'solo_extreme_best',
        timed: 'timed_best', competitive: 'competitive_wins', cooperative: 'cooperative_best'
      };
      const col = colMap[mode];
      if (!col) return new Response(JSON.stringify({ error: 'invalid mode' }), { status: 400, headers: cors });
      const order = mode === 'timed' || mode === 'competitive' ? 'DESC' : 'ASC';
      const rows = await env.DB.prepare(
        `SELECT display_name, full_name, ${col} as score FROM players WHERE ${col} IS NOT NULL ORDER BY ${col} ${order} LIMIT ?`
      ).bind(limit).all();
      return new Response(JSON.stringify(rows.results), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    return new Response('Not found', { status: 404, headers: cors });
  }
};

interface Env {
  ROOM_DO: DurableObjectNamespace;
  LOBBY_DO: DurableObjectNamespace;
  DB: D1Database;
  JWT_SECRET: string;
}
