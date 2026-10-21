// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Region } from './messages';
export type MatchStatus = 'starting' | 'playing' | 'finished' | 'interrupted' | 'abandoned';
export interface HistoryPlayer {
  slot: number; name: string; count: number | null; forfeited: boolean;
  outcome: 'none' | 'win' | 'shared' | 'forfeit_win' | 'coop_complete';
  disconnects: number; reconnects: number;
}
export interface HistoryMatch {
  id: string; region: Region; mode: 'coop' | 'competitive'; flockSize: number;
  visibility: 'public' | 'private'; rules: string; partySize: number;
  createdAt: number; startedAt: number | null; endedAt: number | null;
  status: MatchStatus; reason: string | null; ticks: number | null;
  count: number | null; unclaimed: number | null; waitMs: number | null;
  players: HistoryPlayer[];
}
export interface PlayerStats {
  mode: string; matches: number; completed: number; wins: number; sharedWins: number;
  forfeitWins: number; forfeits: number; sheep: number; interruptions: number;
}
export interface PlayerHistory {
  stats: PlayerStats[]; matches: (HistoryMatch & { yourSlot: number })[]; next: string | null;
}
export interface ActivityGroup {
  region: string; mode: string; attempts: number; started: number; finished: number;
  interrupted: number; abandoned: number; active: number; players: number;
  disconnects: number; reconnects: number; averageWaitMs: number | null;
}
export interface OwnerStats {
  since: number; generatedAt: number; groups: ActivityGroup[];
  capacity: { region: string; rejected: number }[]; recent: HistoryMatch[];
}
