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
