// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Measured boot tier plus a lightweight, demotion-only runtime safety net. */

import { useGameStore, type QualityPreference } from '@app/state/store';
import type { BackendName } from '@app/scene/glFactory';

export type RenderTier = 'high' | 'medium' | 'low';
export type RenderDpr = number | [number, number];
export type DeviceClass = 'desktop' | 'mobile';

export interface DeviceProfile {
  readonly deviceClass: DeviceClass;
  readonly hardwareConcurrency: number;
  readonly deviceMemory: number | null;
}

export function detectDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { deviceClass: 'desktop', hardwareConcurrency: 8, deviceMemory: null };
  }
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return {
    deviceClass: window.matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop',
    hardwareConcurrency: Math.max(1, navigator.hardwareConcurrency || 4),
    deviceMemory: Number.isFinite(memory) ? memory ?? null : null,
  };
}

/**
 * Bound the drawing buffer independently of CSS size. A 1440 x 900 window at
 * device scale factor 2 previously rendered 2880 x 1800, or four times the
 * fragment work of the dSF1 performance receipt. The controlled production
 * profile measured p95 14.0 ms there versus 7.1 ms at DPR 1. High keeps a
 * visibly sharper buffer, but 1.5 is the stable ceiling for this full field.
 */
export function renderDprForTier(tier: RenderTier): RenderDpr {
  if (tier === 'high') return [1, 1.5];
  if (tier === 'medium') return 1;
  return 0.8;
}

export interface AutoTierReceipt {
  readonly backend: Exclude<BackendName, 'pending'>;
  readonly fillMs: number;
  readonly targetPixels: number;
  readonly tier: RenderTier;
  readonly deviceClass: DeviceClass;
  readonly reason: 'measured' | 'mobile-cap' | 'weak-device-cap' | 'fallback' | 'runtime-frame-budget';
  readonly runtimeDemotions: number;
}

export function chooseAutoTier(
  backend: Exclude<BackendName, 'pending'>,
  fillMs: number,
  targetPixels: number,
  profile: DeviceProfile = detectDeviceProfile(),
): AutoTierReceipt {
  // WebGPU carries less driver overhead for the same full-screen work. The
  // test target already scales with device pixel ratio, so this threshold is
  // a measured native-fill budget rather than a device or browser guess.
  // These are deliberately conservative native-fill thresholds. A 2 ms
  // WebGPU fill at this target leaves enough frame budget for the flock,
  // grass vertex work and post; slower devices take the reduced-grass tier.
  // WebGL2 receives less headroom because its main-thread submission cost is
  // not represented by this isolated draw.
  const highBudgetMs = backend === 'webgpu' ? 2 : 1.5;
  const mediumBudgetMs = backend === 'webgpu' ? 4.5 : 3.5;
  let tier: RenderTier = Number.isFinite(fillMs) && fillMs <= highBudgetMs
    ? 'high'
    : Number.isFinite(fillMs) && fillMs <= mediumBudgetMs
      ? 'medium'
      : 'low';
  let reason: AutoTierReceipt['reason'] = 'measured';

  if (
    tier !== 'low'
    && (profile.hardwareConcurrency <= 4
      || (profile.deviceMemory !== null && profile.deviceMemory <= 4))
  ) {
    tier = 'low';
    reason = 'weak-device-cap';
  } else if (tier === 'high' && profile.deviceClass === 'mobile') {
    // A fullscreen fill pass underpredicts the real field's grass vertex work
    // and flock submission on phones. Start at the balanced tier and let the
    // passive frame-budget check demote if the full scene still misses budget.
    tier = 'medium';
    reason = 'mobile-cap';
  }

  return {
    backend,
    fillMs,
    targetPixels,
    tier,
    deviceClass: profile.deviceClass,
    reason,
    runtimeDemotions: 0,
  };
}

/** Conservative receipt for a failed or timed-out one-shot fill measurement. */
export function fallbackAutoTier(
  backend: Exclude<BackendName, 'pending'>,
  profile: DeviceProfile = detectDeviceProfile(),
): AutoTierReceipt {
  return {
    backend,
    fillMs: Number.POSITIVE_INFINITY,
    targetPixels: 0,
    tier: 'low',
    deviceClass: profile.deviceClass,
    reason: 'fallback',
    runtimeDemotions: 0,
  };
}

export function demoteRenderTier(tier: RenderTier): RenderTier {
  if (tier === 'high') return 'medium';
  return 'low';
}

export function autoTierReceipt(): AutoTierReceipt | null {
  return useGameStore.getState().autoTierReceipt;
}

export function resolvedRenderTier(
  preference: QualityPreference,
  receipt: AutoTierReceipt | null = autoTierReceipt(),
): RenderTier {
  if (preference !== 'auto') return preference;
  return receipt?.tier ?? 'low';
}
