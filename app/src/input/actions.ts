// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The discrete things a device can ask for that are not movement. Keys, the
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

/**
 * Show or hide the run clock. Available in every phase, like the camera toggle,
 * so it can be set from the title as well as mid-run.
 *
 * The setting it writes is the one the settings panel writes, not a second
 * flag: spec/06 carries exactly one run-timer toggle and this is a second way
 * to reach it, not a second thing to be out of step with.
 */
export function toggleRunTimer(): void {
  const { showTimer, setShowTimer } = useGameStore.getState();
  setShowTimer(!showTimer);
}

/** True while the field is taking input. Devices use it to gate preventDefault. */
export function isPlaying(): boolean {
  return useGameStore.getState().gamePhase === 'playing';
}
