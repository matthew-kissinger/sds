// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The one cross-runtime wire contract. It imports nothing from app/, worker/,
 * or sim/, so the browser and Worker consume the same protocol without making
 * the deterministic sim depend on transport code.
 */

export const PROTOCOL_VERSION = 1 as const;
export const KEYFRAME_INTERVAL_TICKS = 60;
export const DELTA_DEGENERATE_FRACTION = 0.85;
export const KEYFRAME_REQUEST_COOLDOWN_MS = 500;

export type FlockSize = 25 | 75 | 200;
export type RoomState = 'waiting' | 'in-game' | 'finished';
export type SheepWireState = 0 | 1 | 2;

export interface WireSheep {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly vx: number;
  readonly vz: number;
  readonly state: SheepWireState;
}

export interface WireDog {
  readonly id: number;
  readonly playerId: string;
  readonly x: number;
  readonly z: number;
  readonly vx: number;
  readonly vz: number;
  readonly headingX: number;
  readonly headingZ: number;
  readonly stamina: number;
  readonly sprinting: boolean;
}

export interface GameFrameBase {
  readonly v: typeof PROTOCOL_VERSION;
  readonly tick: number;
  readonly timestamp: number;
  readonly sheepPenned: number;
  readonly totalSheep: number;
  readonly gameCompleted: boolean;
  readonly sheepdogs: readonly WireDog[];
}

export interface GameStateUpdate extends GameFrameBase {
  readonly sheep: readonly WireSheep[];
}

export interface ChangedSheep extends WireSheep {
  readonly i: number;
}

export interface GameStateDelta extends GameFrameBase {
  readonly baseTick: number;
  readonly changed: readonly ChangedSheep[];
}

export interface RoomPlayer {
  readonly sessionId: string;
  readonly persistentId: string;
  readonly displayName: string;
  readonly joinedAt: number;
  readonly connected: boolean;
}

export interface RoomSummary {
  readonly roomCode: string;
  readonly flockSize: FlockSize;
  readonly state: RoomState;
  readonly isPublic: boolean;
  readonly playerCount: number;
  readonly maxPlayers: 4;
  readonly hostPersistentId: string;
  readonly players: readonly RoomPlayer[];
}

export interface PlayerInputMessage {
  readonly t: 'playerInput';
  readonly direction: { readonly x: number; readonly z: number };
  readonly sprint: boolean;
  readonly bark?: boolean;
  readonly inputSequence: number;
  readonly timestamp: number;
  readonly clientPosition?: { readonly x: number; readonly z: number };
}

export type InboundMessage =
  | PlayerInputMessage
  | { readonly t: 'startGame' }
  | { readonly t: 'leaveRoom' }
  | { readonly t: 'ping'; readonly timestamp: number }
  | { readonly t: 'requestKeyframe' };

export type OutboundMessage =
  | ({ readonly t: 'roomUpdated' } & RoomSummary)
  | { readonly t: 'playerJoined'; readonly player: RoomPlayer }
  | { readonly t: 'playerLeft'; readonly persistentId: string }
  | { readonly t: 'hostChanged'; readonly persistentId: string }
  | { readonly t: 'gameStarted'; readonly state: GameStateUpdate }
  | ({ readonly t: 'gameStateUpdate' } & GameStateUpdate)
  | ({ readonly t: 'gameStateDelta' } & GameStateDelta)
  | { readonly t: 'gameComplete'; readonly tick: number; readonly completionTimeMs: number }
  | { readonly t: 'pong'; readonly timestamp: number }
  | { readonly t: 'roomError'; readonly code: string };

export type DeltaPathFrame =
  | { readonly kind: 'keyframe'; readonly state: GameStateUpdate }
  | { readonly kind: 'delta'; readonly frame: GameStateDelta };

function recordsEqual(a: WireSheep, b: WireSheep): boolean {
  return (
    Object.is(a.id, b.id) &&
    Object.is(a.x, b.x) &&
    Object.is(a.z, b.z) &&
    Object.is(a.vx, b.vx) &&
    Object.is(a.vz, b.vz) &&
    Object.is(a.state, b.state)
  );
}

/**
 * Cohortless protocol-v1 delta basis. The basis advances on every broadcast,
 * including empty deltas and degenerate keyframes.
 */
export class DeltaBasis {
  private basis: GameStateUpdate | null = null;

  reset(): void {
    this.basis = null;
  }

  next(state: GameStateUpdate, forceKeyframe = false): DeltaPathFrame {
    const previous = this.basis;
    this.basis = state;
    if (
      forceKeyframe ||
      previous === null ||
      state.tick % KEYFRAME_INTERVAL_TICKS === 0 ||
      previous.sheep.length !== state.sheep.length
    ) {
      return { kind: 'keyframe', state };
    }

    const changed: ChangedSheep[] = [];
    for (let i = 0; i < state.sheep.length; i++) {
      const current = state.sheep[i]!;
      const before = previous.sheep[i]!;
      if (!recordsEqual(current, before)) changed.push({ i, ...current });
    }
    if (changed.length > state.sheep.length * DELTA_DEGENERATE_FRACTION) {
      return { kind: 'keyframe', state };
    }
    return {
      kind: 'delta',
      frame: {
        v: PROTOCOL_VERSION,
        tick: state.tick,
        baseTick: previous.tick,
        timestamp: state.timestamp,
        sheepPenned: state.sheepPenned,
        totalSheep: state.totalSheep,
        gameCompleted: state.gameCompleted,
        changed,
        sheepdogs: state.sheepdogs,
      },
    };
  }
}

export interface ReconstructionResult {
  readonly state: GameStateUpdate | null;
  readonly requestKeyframe: boolean;
}

/**
 * Delta reconstruction is transport-only. It always produces a fresh sheep
 * array so the previous and current snapshots remain safe interpolation bases.
 */
export class DeltaReconstructor {
  private basis: GameStateUpdate | null = null;
  private awaitingKeyframe = false;

  get lastAppliedTick(): number | null {
    return this.basis?.tick ?? null;
  }

  reset(): void {
    this.basis = null;
    this.awaitingKeyframe = false;
  }

  applyKeyframe(state: GameStateUpdate): ReconstructionResult {
    this.basis = state;
    this.awaitingKeyframe = false;
    return { state, requestKeyframe: false };
  }

  applyDelta(delta: GameStateDelta): ReconstructionResult {
    if (
      this.awaitingKeyframe ||
      this.basis === null ||
      delta.baseTick !== this.basis.tick
    ) {
      const firstMiss = !this.awaitingKeyframe;
      this.awaitingKeyframe = true;
      return { state: null, requestKeyframe: firstMiss };
    }

    const sheep = this.basis.sheep.slice();
    for (const changed of delta.changed) {
      if (!Number.isInteger(changed.i) || changed.i < 0 || changed.i >= sheep.length) {
        this.awaitingKeyframe = true;
        return { state: null, requestKeyframe: true };
      }
      const { i, ...record } = changed;
      sheep[i] = record;
    }
    const state: GameStateUpdate = {
      v: PROTOCOL_VERSION,
      tick: delta.tick,
      timestamp: delta.timestamp,
      sheepPenned: delta.sheepPenned,
      totalSheep: delta.totalSheep,
      gameCompleted: delta.gameCompleted,
      sheepdogs: delta.sheepdogs,
      sheep,
    };
    this.basis = state;
    return { state, requestKeyframe: false };
  }
}

export function isSupportedFlockSize(value: unknown): value is FlockSize {
  return value === 25 || value === 75 || value === 200;
}
