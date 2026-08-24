// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * What a camera framing is: a smoothed place to stand and a smoothed place to
 * look, updated from the dog every frame.
 *
 * Both framings run every frame, whichever one is on screen. That is the whole
 * trick behind the mode swap never jumping: neither rig is ever cold, so the
 * transition is a blend between two already-settled poses rather than a rig
 * waking up at a stale position and snapping.
 */

import type { Vector3 } from 'three/webgpu';
import type { Dog } from '@sim/types';

export interface CameraFraming {
  /** Where the camera stands. Smoothed, safe to read every frame. */
  readonly position: Vector3;
  /** What the camera looks at. Smoothed on its own time constant. */
  readonly aim: Vector3;
  /** Advance by `dt` seconds against the dog's current sim state. */
  update(dt: number, dog: Dog): void;
}
