// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import type { GamePhase, GameStore } from '@app/state/store';

export type AudioLifecycleCommand = 'suspend' | 'resume';

export const AUDIO_PREFERENCES_CHANGED = 1;
export const AUDIO_SCHEDULE_CHANGED = 2;

type AudioRelevantState = Pick<
  GameStore,
  | 'muted'
  | 'reduceMotion'
  | 'audioLevels'
  | 'gamePhase'
  | 'uiPanel'
  | 'acceptedBark'
  | 'penSerial'
  | 'penDelta'
  | 'pennedCount'
  | 'completionTick'
>;

/**
 * Classify a Zustand change without allocating snapshots. Debug presentation
 * receipts intentionally change none of these fields, so their 10 Hz sampling
 * never re-applies gains or runs the audio scheduler.
 */
export function audioStoreChangeMask(
  previous: AudioRelevantState,
  current: AudioRelevantState,
): number {
  let mask = 0;
  if (
    current.muted !== previous.muted
    || current.reduceMotion !== previous.reduceMotion
    || current.audioLevels !== previous.audioLevels
  ) mask |= AUDIO_PREFERENCES_CHANGED;
  if (
    current.gamePhase !== previous.gamePhase
    || current.uiPanel !== previous.uiPanel
    || current.acceptedBark !== previous.acceptedBark
    || current.penSerial !== previous.penSerial
    || current.penDelta !== previous.penDelta
    || current.pennedCount !== previous.pennedCount
    || current.completionTick !== previous.completionTick
  ) mask |= AUDIO_SCHEDULE_CHANGED;
  return mask;
}

/**
 * Audio context work belongs to phase edges, not arbitrary store updates.
 * Debug diagnostics and other transient state may publish every frame; treating
 * those writes as lifecycle changes can postpone a pause forever.
 */
export function audioLifecycleCommand(
  previous: GamePhase,
  current: GamePhase,
): AudioLifecycleCommand | null {
  if (previous === current) return null;
  return current === 'paused' ? 'suspend' : 'resume';
}
