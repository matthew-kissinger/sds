// SPDX-License-Identifier: AGPL-3.0-or-later
import { WorkerEntrypoint } from 'cloudflare:workers';
import identity from '../worker/src/index';
import RoomAdmission from '../worker/src/roomAdmission';
import { stagingAccess, type PilotEnv } from './access';
export { RoomAdmission };
interface Env extends PilotEnv { ASSETS: Fetcher; DB: D1Database; JWT_SECRET: string }
// Only the realtime service can call this entrypoint; no recursive public fetch.
export class InviteShell extends WorkerEntrypoint<Env> {
  async fetch(request: Request) {
    const url = new URL(request.url); url.pathname = '/'; url.search = '';
    const response = await this.env.ASSETS.fetch(new Request(url, { method: 'GET' }));
    const result = new Response(response.body, response);
    result.headers.set('Cache-Control', 'private, no-store');
    result.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return result;
  }
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const denied = await stagingAccess(request, env); if (denied) return denied;
    if (new URL(request.url).pathname.startsWith('/api/')) return identity.fetch(request, env, ctx);
    const response = await env.ASSETS.fetch(request);
    const result = new Response(response.body, response);
    result.headers.set('X-Robots-Tag', 'noindex, nofollow');
    result.headers.set('Cache-Control', 'private, no-store');
    return result;
  },
} satisfies ExportedHandler<Env>;
