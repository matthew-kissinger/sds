// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import type { FlockSim } from '@sim/FlockSim';
import { SHEEP_STATE_FLAG } from '@sim/FlockSim';
import type { AcceptedBark, GamePhase, UiPanel } from '@app/state/store';
import { COMPLETION_RESOLVE, penNoteFrequency, UI_TONES } from './tones';
import type { AudioAssetId, AudioCommand } from './types';

const BARKS: readonly AudioAssetId[] = ['bark-01', 'bark-02', 'bark-03'];
const BAAS: readonly AudioAssetId[] = ['baa-01', 'baa-02', 'baa-03'];
const FOOTFALLS: readonly AudioAssetId[] = ['footfall-01', 'footfall-02'];
const MIN_BAA_SPACING_TICKS = 28;
const DOG_IDLE_HUFF_TICKS = 300;

export interface AudioStoreSnapshot {
  readonly gamePhase: GamePhase;
  readonly uiPanel: UiPanel;
  readonly acceptedBark: AcceptedBark | null;
  readonly penSerial: number;
  readonly penDelta: number;
  readonly pennedCount: number;
  readonly completionTick: number;
}

function hash32(value: number): number {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

function unitHash(value: number): number {
  return hash32(value) / 0x1_0000_0000;
}

export function scheduleStoreAudio(
  previous: AudioStoreSnapshot,
  next: AudioStoreSnapshot,
): readonly AudioCommand[] {
  const commands: AudioCommand[] = [];

  if (
    next.acceptedBark !== null &&
    next.acceptedBark.serial !== previous.acceptedBark?.serial
  ) {
    const event = next.acceptedBark;
    commands.push({
      kind: 'asset',
      assetId: BARKS[(event.serial - 1) % BARKS.length]!,
      bus: 'dog',
      gain: 0.72,
      point: { x: event.x, z: event.z },
      duckAmbient: true,
      transient: true,
    });
  }

  if (next.penSerial !== previous.penSerial && next.penDelta > 0) {
    const firstOrdinal = next.pennedCount - next.penDelta + 1;
    for (let i = 0; i < next.penDelta; i++) {
      commands.push({
        kind: 'tone',
        bus: 'world',
        frequencyHz: penNoteFrequency(firstOrdinal + i),
        gain: 0.18,
        durationSeconds: 0.82,
        delaySeconds: i * 0.07,
        point: { x: 0, z: 102 },
        transient: true,
      });
    }
  }

  if (
    next.gamePhase === 'complete' &&
    next.completionTick >= 0 &&
    next.completionTick !== previous.completionTick
  ) {
    commands.push({
      kind: 'asset',
      assetId: 'gate-creak',
      bus: 'world',
      gain: 0.2,
      point: { x: 0, z: 100 },
    });
    for (let i = 0; i < COMPLETION_RESOLVE.length; i++) {
      commands.push({
        kind: 'tone',
        bus: 'world',
        frequencyHz: COMPLETION_RESOLVE[i]!,
        gain: 0.13,
        durationSeconds: 2.2,
        delaySeconds: 0.32 + i * 0.18,
        point: { x: 0, z: 108 },
      });
    }
  }

  if (previous.gamePhase === 'complete' && next.gamePhase === 'title') {
    commands.push({
      kind: 'asset',
      assetId: 'gate-creak',
      bus: 'world',
      gain: 0.12,
      playbackRate: 0.84,
      point: { x: 0, z: 100 },
    });
  }

  if (previous.gamePhase === 'title' && next.gamePhase === 'playing') {
    commands.push({
      kind: 'tone', bus: 'ui', frequencyHz: UI_TONES.confirm,
      gain: 0.055, durationSeconds: 0.22, transient: true,
    });
  } else if (previous.gamePhase === 'playing' && next.gamePhase === 'paused') {
    commands.push({
      kind: 'tone', bus: 'ui', frequencyHz: UI_TONES.tap,
      gain: 0.04, durationSeconds: 0.16, transient: true,
    });
  } else if (previous.gamePhase === 'paused' && next.gamePhase === 'playing') {
    commands.push({
      kind: 'tone', bus: 'ui', frequencyHz: UI_TONES.back,
      gain: 0.04, durationSeconds: 0.18, transient: true,
    });
  } else if (previous.uiPanel === 'none' && next.uiPanel !== 'none') {
    commands.push({
      kind: 'tone', bus: 'ui', frequencyHz: UI_TONES.tap,
      gain: 0.035, durationSeconds: 0.14, transient: true,
    });
  } else if (previous.uiPanel !== 'none' && next.uiPanel === 'none') {
    commands.push({
      kind: 'tone', bus: 'ui', frequencyHz: UI_TONES.back,
      gain: 0.035, durationSeconds: 0.17, transient: true,
    });
  }

  return commands;
}

/**
 * Allocation-stable cadence state. It reads only the FlockSim presentation
 * buffers: the same scheduler works for the CPU and future GPU backends.
 */
export class FlockAudioScheduler {
  private readonly nextBaaTick: Uint32Array;
  private readonly previousPositions: Float32Array;
  private nextGlobalTick = 0;
  private nextFootfallTick = 0;
  private footfallSerial = 0;
  private nextBellTick: number;
  private nextFenceTick = 0;
  private idleStartTick = -1;
  private huffedThisIdle = false;
  private lastTick = -1;

  constructor(
    private readonly seed: number,
    flockSize: number,
  ) {
    this.nextBaaTick = new Uint32Array(flockSize);
    this.previousPositions = new Float32Array(flockSize * 2);
    this.nextBellTick = 360 + (hash32(seed ^ 0x51f15e) % 300);
    for (let i = 0; i < flockSize; i++) {
      this.nextBaaTick[i] = 180 + (hash32(seed ^ i) % 540);
    }
  }

  scheduleFrame(
    sim: FlockSim,
    tick: number,
    listenerX: number,
    listenerZ: number,
    commands: AudioCommand[],
  ): void {
    if (tick === this.lastTick) return;
    const firstFrame = this.lastTick < 0;
    this.lastTick = tick;
    const baa = this.scheduleBaa(sim, tick, listenerX, listenerZ);
    if (baa !== null) commands.push(baa);
    this.scheduleDog(sim, tick, commands);
    this.scheduleBell(sim, tick, commands);
    if (!firstFrame) this.scheduleFence(sim, tick, listenerX, listenerZ, commands);
    const copyCount = Math.min(this.previousPositions.length, sim.positions.length);
    for (let i = 0; i < copyCount; i++) this.previousPositions[i] = sim.positions[i]!;
  }

  private scheduleBaa(
    sim: FlockSim,
    tick: number,
    listenerX: number,
    listenerZ: number,
  ): AudioCommand | null {
    if (tick < this.nextGlobalTick) return null;
    const count = Math.min(this.nextBaaTick.length, sim.stateFlags.length);
    const dogX = sim.dogPositions[0] ?? 0;
    const dogZ = sim.dogPositions[1] ?? 0;
    let chosen = -1;
    let chosenScore = -Infinity;
    let chosenAgitation = 0;

    for (let i = 0; i < count; i++) {
      if (tick < this.nextBaaTick[i]!) continue;
      if (sim.stateFlags[i] === SHEEP_STATE_FLAG.penned) continue;
      const x = sim.positions[i * 2]!;
      const z = sim.positions[i * 2 + 1]!;
      const dogDx = x - dogX;
      const dogDz = z - dogZ;
      const cameraDx = x - listenerX;
      const cameraDz = z - listenerZ;
      const dogDistance = Math.sqrt(dogDx * dogDx + dogDz * dogDz);
      const agitation = Math.max(0, Math.min(1, 1 - dogDistance / 34));
      const cameraDistanceSq = cameraDx * cameraDx + cameraDz * cameraDz;
      const score = agitation * 3 + 1 / (1 + cameraDistanceSq * 0.015) + unitHash(this.seed ^ i) * 0.08;
      if (score > chosenScore) {
        chosen = i;
        chosenScore = score;
        chosenAgitation = agitation;
      }
    }

    if (chosen < 0) {
      this.nextGlobalTick = tick + MIN_BAA_SPACING_TICKS;
      return null;
    }

    const jitter = hash32(this.seed ^ chosen ^ tick) % 240;
    this.nextBaaTick[chosen] = tick + 210 + Math.round((1 - chosenAgitation) * 540) + jitter;
    this.nextGlobalTick = tick + MIN_BAA_SPACING_TICKS;
    const pitch = 0.91 + unitHash(this.seed ^ (chosen * 0x9e3779b9)) * 0.18;
    return {
      kind: 'asset',
      assetId: BAAS[hash32(this.seed ^ chosen) % BAAS.length]!,
      bus: 'flock',
      gain: 0.23 + chosenAgitation * 0.09,
      playbackRate: pitch,
      point: {
        x: sim.positions[chosen * 2]!,
        z: sim.positions[chosen * 2 + 1]!,
      },
      duckAmbient: chosenAgitation > 0.55,
    };
  }

  private scheduleDog(sim: FlockSim, tick: number, commands: AudioCommand[]): void {
    const vx = sim.dogVelocities[0] ?? 0;
    const vz = sim.dogVelocities[1] ?? 0;
    const speed = Math.sqrt(vx * vx + vz * vz);
    const point = { x: sim.dogPositions[0] ?? 0, z: sim.dogPositions[1] ?? 0 };
    if (speed > 1.3 && tick >= this.nextFootfallTick) {
      commands.push({
        kind: 'asset',
        assetId: FOOTFALLS[this.footfallSerial % FOOTFALLS.length]!,
        bus: 'dog',
        gain: Math.min(0.105, 0.045 + speed * 0.004),
        playbackRate: 0.96 + (this.footfallSerial % 3) * 0.025,
        point,
        transient: true,
      });
      this.footfallSerial += 1;
      this.nextFootfallTick = tick + Math.max(9, Math.round(31 - speed * 1.25));
    }

    if (speed < 0.22) {
      if (this.idleStartTick < 0) this.idleStartTick = tick;
      if (!this.huffedThisIdle && tick - this.idleStartTick >= DOG_IDLE_HUFF_TICKS) {
        commands.push({
          kind: 'asset', assetId: 'huff', bus: 'dog', gain: 0.16, point,
        });
        this.huffedThisIdle = true;
      }
    } else {
      this.idleStartTick = -1;
      this.huffedThisIdle = false;
    }
  }

  private scheduleBell(sim: FlockSim, tick: number, commands: AudioCommand[]): void {
    if (tick < this.nextBellTick || sim.stateFlags.length === 0) return;
    const index = hash32(this.seed ^ 0xbe115e) % sim.stateFlags.length;
    if (sim.stateFlags[index] !== SHEEP_STATE_FLAG.penned) {
      commands.push({
        kind: 'asset',
        assetId: 'bellwether',
        bus: 'flock',
        gain: 0.075,
        playbackRate: 0.96 + unitHash(this.seed ^ index) * 0.08,
        point: { x: sim.positions[index * 2]!, z: sim.positions[index * 2 + 1]! },
      });
    }
    this.nextBellTick = tick + 420 + (hash32(this.seed ^ tick) % 300);
  }

  private scheduleFence(
    sim: FlockSim,
    tick: number,
    listenerX: number,
    listenerZ: number,
    commands: AudioCommand[],
  ): void {
    if (tick < this.nextFenceTick) return;
    const count = Math.min(sim.stateFlags.length, this.previousPositions.length / 2);
    let chosen = -1;
    let nearest = Infinity;
    for (let i = 0; i < count; i++) {
      if (sim.stateFlags[i] !== SHEEP_STATE_FLAG.active) continue;
      const x = sim.positions[i * 2]!;
      const z = sim.positions[i * 2 + 1]!;
      const movedX = x - this.previousPositions[i * 2]!;
      const movedZ = z - this.previousPositions[i * 2 + 1]!;
      if (movedX * movedX + movedZ * movedZ < 0.000025) continue;
      const nearEdge = Math.max(Math.abs(x), Math.abs(z)) > 98.45;
      const inGate = z > 97.8 && Math.abs(x) < 5;
      if (!nearEdge || inGate) continue;
      const dx = x - listenerX;
      const dz = z - listenerZ;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < nearest) {
        nearest = distanceSq;
        chosen = i;
      }
    }
    if (chosen < 0) return;
    commands.push({
      kind: 'asset',
      assetId: 'fence-knock',
      bus: 'world',
      gain: 0.09,
      playbackRate: 0.92 + unitHash(this.seed ^ chosen ^ tick) * 0.12,
      point: { x: sim.positions[chosen * 2]!, z: sim.positions[chosen * 2 + 1]! },
      transient: true,
    });
    this.nextFenceTick = tick + 75;
  }
}
