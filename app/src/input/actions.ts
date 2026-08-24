// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The two discrete things a device can ask for that are not movement. Keys, the
 * bark button and the gamepad all call these, so the phase guard and the camera
 * toggle each exist exactly once.
 *
 * These read the store with `getState()` from event handlers, which is a
 * discrete read, not a per-frame one: no subscription, no re-render.
 */

import { requestBark } from './intent';
import { useGameStore } from '@app/state/store';

/**
 * A bark press. Ignored unless a run is live, so a press on the title does not
 * sit latched in the intent and fire on the first tick of the next run.
 */
export function barkPressed(): void {
  if (useGameStore.getState().gamePhase !== 'playing') return;
  requestBark();
}

/** Swap Classic and Follow framing. Available in every phase. */
export function toggleCameraMode(): void {
  const { cameraMode, setCameraMode } = useGameStore.getState();
  setCameraMode(cameraMode === 'classic' ? 'follow' : 'classic');
}

/** True while the field is taking input. Devices use it to gate preventDefault. */
export function isPlaying(): boolean {
  return useGameStore.getState().gamePhase === 'playing';
}
