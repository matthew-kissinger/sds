// SPDX-License-Identifier: AGPL-3.0-or-later
import realtime from '../realtime/index';
import { stagingAccess, type PilotEnv } from './access';
import type { RealtimeEnv } from '../realtime/bindings';
export { RoomDO } from '../realtime/RoomDO';
export { LobbyDO } from '../realtime/LobbyDO';
type Env = RealtimeEnv & PilotEnv & { GAME_SHELL: Fetcher };
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const denied = await stagingAccess(request, env); if (denied) return denied;
    if (request.method === 'GET' && /^\/r\/(na|eu|apac)_[a-f0-9]{32}$/.test(new URL(request.url).pathname)) {
      return env.GAME_SHELL.fetch(request);
    }
    return realtime.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
