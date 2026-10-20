// SPDX-License-Identifier: AGPL-3.0-or-later
// Private service-binding entrypoint. Not exported by the deployed score
// router or configured in production yet. Local workerd tests consume it.
import { WorkerEntrypoint } from 'cloudflare:workers';
import { verifyJwt } from './jwt';
export default class RoomAdmission extends WorkerEntrypoint<{ JWT_SECRET: string; DB: D1Database }> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/admission') return new Response(null, { status: 404 });
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ') || auth.length > 2048) return new Response(null, { status: 401 });
    let payload: Awaited<ReturnType<typeof verifyJwt>>;
    try { payload = await verifyJwt(auth.slice(7), this.env.JWT_SECRET); }
    catch { return new Response(null, { status: 401 }); }
    if (!payload || typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)
      || payload.exp <= Date.now() / 1000 || typeof payload.persistent_id !== 'string'
      || !/^[a-zA-Z0-9-]{1,128}$/.test(payload.persistent_id)) return new Response(null, { status: 401 });
    const player = await this.env.DB.prepare('SELECT persistent_id, display_name FROM players WHERE persistent_id = ?')
      .bind(payload.persistent_id).first<{ persistent_id: string; display_name: string }>();
    if (!player) return new Response(null, { status: 401 });
    return Response.json({ id: player.persistent_id, name: player.display_name.slice(0, 32) },
      { headers: { 'Cache-Control': 'no-store' } });
  }
}
