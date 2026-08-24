// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Presentation timing for one accepted bark.
 *
 * The sim already has the authoritative acceptance edge: its cooldown rises
 * only when `step` accepts a bark. Presentation observes that edge instead of
 * listening to raw input, so a held key and a rejected cooldown press cannot
 * start extra effects. Each visual consumer owns a tracker. There is no global
 * event bus and nothing can feed back into the deterministic sim.
 */

import * as THREE from 'three/webgpu';
import { DEFAULT_BARK_CONFIG } from '@sim/BarkImpulse';
import { TICK_HZ } from '@sim/tuning';
import type { AcceptedBark } from '@app/state/store';

/** The startle delay travels 0.25 ticks per metre in the sim. */
export const BARK_WAVE_SPEED = TICK_HZ / DEFAULT_BARK_CONFIG.rippleDelayTicksPerMetre;
export const BARK_WAVE_RANGE = DEFAULT_BARK_CONFIG.range;
export const BARK_WAVE_TRAVEL_SECONDS = BARK_WAVE_RANGE / BARK_WAVE_SPEED;
/** The visible ring remains as a soft after-image after the fast startle front. */
export const BARK_PULSE_SECONDS = 0.62;
export const BARK_WAVE_WIDTH = 4.5;
/** Readable presentation timing, deliberately slower than the sim's startle front. */
export const BARK_RING_SECONDS = 0.78;

export interface BarkOrigin {
  readonly x: number;
  readonly z: number;
  readonly tick: number;
}

export class BarkEdgeTracker {
  private serial = 0;
  private armed = false;

  sample(event: AcceptedBark | null): BarkOrigin | null {
    if (event === null) {
      this.armed = true;
      this.serial = 0;
      return null;
    }
    if (!this.armed) {
      // Mounting after a bark must not replay an old event.
      this.armed = true;
      this.serial = event.serial;
      return null;
    }
    if (event.serial === this.serial) return null;
    this.serial = event.serial;
    return { x: event.x, z: event.z, tick: event.tick };
  }
}

export interface BarkPulseFrame {
  readonly radius: number;
  readonly amplitude: number;
  readonly visible: boolean;
}

/** Pure timing shared by the shader texture and the geometry ring. */
export function barkPulseFrame(age: number, reducedMotion: boolean): BarkPulseFrame {
  if (age < 0 || age >= BARK_PULSE_SECONDS) {
    return { radius: 0, amplitude: 0, visible: false };
  }
  if (reducedMotion) {
    const fade = Math.max(0, 1 - age / 0.22);
    return {
      radius: DEFAULT_BARK_CONFIG.nearRadius,
      amplitude: fade * 0.22,
      visible: fade > 0,
    };
  }
  const radius = Math.min(BARK_WAVE_RANGE, age * BARK_WAVE_SPEED);
  const fadeStart = BARK_WAVE_TRAVEL_SECONDS;
  const fade = age <= fadeStart
    ? 1
    : Math.max(0, 1 - (age - fadeStart) / (BARK_PULSE_SECONDS - fadeStart));
  return { radius, amplitude: fade, visible: true };
}

/**
 * The gameplay ripple crosses the field in a fraction of a second. Rendering
 * that speed literally made the ordered bark ring disappear between ordinary
 * frames, so the visible echo uses its own presentation-only easing.
 */
export function barkRingFrame(age: number, reducedMotion: boolean): BarkPulseFrame {
  if (age < 0 || age >= BARK_RING_SECONDS) {
    return { radius: 0, amplitude: 0, visible: false };
  }
  if (reducedMotion) {
    const fade = Math.max(0, 1 - age / 0.24);
    return {
      radius: DEFAULT_BARK_CONFIG.nearRadius,
      amplitude: fade * 0.2,
      visible: fade > 0,
    };
  }

  const progress = Math.min(1, age / 0.64);
  const eased = 1 - (1 - progress) ** 2;
  const fade = age < 0.38 ? 1 : Math.max(0, 1 - (age - 0.38) / 0.4);
  return {
    radius: BARK_WAVE_RANGE * eased,
    amplitude: fade,
    visible: fade > 0,
  };
}

export interface BarkPulseField {
  /** RGBA32F 1 x 1: origin x, origin z, radius, amplitude. */
  readonly texture: THREE.DataTexture;
  update(dt: number, event: AcceptedBark | null, reducedMotion: boolean): void;
  dispose(): void;
}

export function createBarkPulseField(): BarkPulseField {
  const data = new Float32Array(4);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const edge = new BarkEdgeTracker();
  let age = BARK_PULSE_SECONDS;
  let x = 0;
  let z = 0;

  return {
    texture,
    update(dt, event, reducedMotion): void {
      const accepted = edge.sample(event);
      if (accepted !== null) {
        x = accepted.x;
        z = accepted.z;
        age = 0;
      } else {
        age += dt;
      }
      const frame = barkPulseFrame(age, reducedMotion);
      data[0] = x;
      data[1] = z;
      data[2] = frame.radius;
      data[3] = frame.amplitude;
      texture.needsUpdate = true;
    },
    dispose(): void {
      texture.dispose();
    },
  };
}
