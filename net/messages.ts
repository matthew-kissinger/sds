// SPDX-License-Identifier: AGPL-3.0-or-later
// Wire data only. No Worker, renderer, identity secret or simulation seed.
export const PROTOCOL = 3;
export interface Standing { slot: number; name: string; count: number; forfeited: boolean }
export interface MatchResult { mode: 'coop' | 'competitive'; reason: 'flock' | 'forfeit' | 'no_winner'; tick: number; count: number; started: number; remaining: number; standings: Standing[]; unclaimed: number; winners: number[] }
export type Region = 'na' | 'eu' | 'apac';
export interface RoomView {
  type: 'room'; protocol: number; handle: string; region: Region; revision: number;
  settings: { mode: 'coop' | 'competitive'; flockSize: 25 | 75 | 200; visibility: 'private' | 'public' };
  phase: 'waiting' | 'starting' | 'playing' | 'finished' | 'closed';
  round: string | null; interruption: string | null; hostSlot: number | null;
  members: { slot: number; name: string; connected: boolean; ready: boolean }[];
  result: MatchResult | null;
}
export interface DogFrame {
  slot: number; x: number; z: number; vx: number; vz: number; hx: number; hz: number;
  stamina: number; sprinting: boolean; cooldown: number; inside: boolean; ack: number;
}
export interface BarkFrame { serial: number; tick: number; slot: number; x: number; z: number }
export interface MatchFrame {
  type: 'snapshot'; protocol: number; rules: 'coop-1' | 'competitive-1'; roster: number[]; standings: Standing[]; unclaimed: number; round: string;
  tick: number; basis: null; count: number; dogs: DogFrame[];
  // Full keyframes initially: x,z,heading,lifecycle for each sheep.
  sheep: number[]; barks: BarkFrame[];
}
