// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RoomDO } from './RoomDO';
import type { LobbyDO } from './LobbyDO';
import type { Region } from './regions';
export interface RealtimeEnv {
  ROOMS: DurableObjectNamespace<RoomDO>;
  LOBBIES: DurableObjectNamespace<LobbyDO>;
  IDENTITY: Fetcher;
  GAME_SHELL?: Fetcher;
  RELEASE_SHA?: string;
  MATCH_DB?: D1Database;
  OWNER_STATS_TOKEN?: string;
  ALLOWED_ORIGIN: string;
  ROOM_CAPS: Record<Region, number>;
  STAGING_END?: string;
}
