// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** One measured render tier, chosen during renderer boot and held for the session. */

import { useGameStore, type QualityPreference } from '@app/state/store';
import type { BackendName } from '@app/scene/glFactory';

export type RenderTier = 'high' | 'low';
export type RenderDpr = number | [number, number];

/**
 * Bound the drawing buffer independently of CSS size. A 1440 x 900 window at
 * device scale factor 2 previously rendered 2880 x 1800, or four times the
 * fragment work of the dSF1 performance receipt. The controlled production
 * profile measured p95 14.0 ms there versus 7.1 ms at DPR 1. High keeps a
 * visibly sharper buffer, but 1.5 is the stable ceiling for this full field.
 */
export function renderDprForTier(tier: RenderTier): RenderDpr {
  return tier === 'high' ? [1, 1.5] : 1;
}

export interface AutoTierReceipt {
  readonly backend: Exclude<BackendName, 'pending'>;
  readonly fillMs: number;
  readonly targetPixels: number;
  readonly tier: RenderTier;
}

export function chooseAutoTier(
  backend: Exclude<BackendName, 'pending'>,
  fillMs: number,
  targetPixels: number,
): AutoTierReceipt {
  // WebGPU carries less driver overhead for the same full-screen work. The
  // test target already scales with device pixel ratio, so this threshold is
  // a measured native-fill budget rather than a device or browser guess.
  // These are deliberately conservative native-fill thresholds. A 2 ms
  // WebGPU fill at this target leaves enough frame budget for the flock,
  // grass vertex work and post; slower devices take the reduced-grass tier.
  // WebGL2 receives less headroom because its main-thread submission cost is
  // not represented by this isolated draw.
  const budgetMs = backend === 'webgpu' ? 2 : 1.5;
  return {
    backend,
    fillMs,
    targetPixels,
    tier: Number.isFinite(fillMs) && fillMs <= budgetMs ? 'high' : 'low',
  };
}

/** Conservative receipt for a failed or timed-out one-shot fill measurement. */
export function fallbackAutoTier(
  backend: Exclude<BackendName, 'pending'>,
): AutoTierReceipt {
  return {
    backend,
    fillMs: Number.POSITIVE_INFINITY,
    targetPixels: 0,
    tier: 'low',
  };
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
