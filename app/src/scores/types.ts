// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import type { FlockSize } from '@app/state/store';

export interface ScoreIdentity {
  readonly persistentId: string;
  readonly authSecret: string;
  readonly displayName: string;
  readonly fullName: string;
}
export interface PlayerProfile {
  readonly persistentId: string;
  readonly displayName: string;
  readonly fullName: string;
}

export interface RegisterReceipt {
  readonly token: string;
  readonly authSecret?: string;
  readonly playerProfile: PlayerProfile;
}

export interface LeaderboardEntry {
  readonly rank: number;
  readonly persistentId: string;
  readonly displayName: string;
  readonly fullName: string;
  readonly scoreSeconds: number;
}

export interface CompletedRun {
  readonly flockSize: FlockSize;
  readonly completionTimeMs: number;
  readonly completionTick: number;
}

/**
 * One of the player's own completed runs.
 *
 * The board shows one row per player, so a second and slower run is recorded
 * and then aggregated out of the display. Players read that as the run not
 * having been saved. This is the same submission read back unaggregated.
 */
export interface PlayerRun {
  readonly flockSize: FlockSize;
  readonly scoreSeconds: number;
  readonly submittedAt: number;
  /**
   * Where this time would sit on that flock size's public board, and how many
   * players are on it. The board ranks players by their best, so a player's
   * own best carries their board position exactly, and a slower run of theirs
   * carries the position that run would have held.
   *
   * Both are optional because they are a later addition to the same endpoint:
   * a client running against a worker that has not been deployed yet reads
   * runs without them and simply does not draw a standing. A rank that is
   * absent is not a rank of zero.
   */
  readonly boardRank?: number;
  readonly boardPlayers?: number;
}
