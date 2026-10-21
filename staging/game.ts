// SPDX-License-Identifier: AGPL-3.0-or-later
import identity from '../worker/src/index';
import RoomAdmission from '../worker/src/roomAdmission';
import { stagingAccess, type PilotEnv } from './access';
import InviteShell from '../worker/src/inviteShell';
export { RoomAdmission, InviteShell };
interface Env extends PilotEnv { ASSETS: Fetcher; DB: D1Database; JWT_SECRET: string }
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
