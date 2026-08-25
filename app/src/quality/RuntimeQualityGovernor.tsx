// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '@app/state/store';

export const QUALITY_WARMUP_SECONDS = 6;
export const QUALITY_WINDOW_SECONDS = 5;
export const SLOW_FRAME_SECONDS = 1 / 45;
export const SLOW_FRAME_RATIO = 0.18;

export interface FrameBudgetReceipt {
  readonly samples: number;
  readonly elapsed: number;
  readonly slowFrames: number;
}

export function missesFrameBudget(receipt: FrameBudgetReceipt): boolean {
  if (receipt.samples < 90 || receipt.elapsed < QUALITY_WINDOW_SECONDS) return false;
  return receipt.slowFrames / receipt.samples >= SLOW_FRAME_RATIO;
}

/**
 * Demotion-only and allocation-free. The boot probe picks a starting tier;
 * this checks the real field after warmup and steps Auto down only when a
 * sustained share of frames miss 45 FPS. Manual settings remain authoritative.
 */
export function RuntimeQualityGovernor() {
  const sample = useRef({ warmup: 0, elapsed: 0, samples: 0, slowFrames: 0 });

  useFrame((_, delta) => {
    const state = useGameStore.getState();
    const receipt = state.autoTierReceipt;
    if (
      state.gamePhase !== 'playing'
      || state.quality !== 'auto'
      || receipt === null
      || receipt.tier === 'low'
    ) {
      sample.current = { warmup: 0, elapsed: 0, samples: 0, slowFrames: 0 };
      return;
    }
    if (document.visibilityState !== 'visible' || delta <= 0 || delta > 0.1) {
      sample.current = { warmup: 0, elapsed: 0, samples: 0, slowFrames: 0 };
      return;
    }

    const current = sample.current;
    if (current.warmup < QUALITY_WARMUP_SECONDS) {
      current.warmup += delta;
      return;
    }

    current.elapsed += delta;
    current.samples += 1;
    if (delta > SLOW_FRAME_SECONDS) current.slowFrames += 1;
    if (current.elapsed < QUALITY_WINDOW_SECONDS) return;

    if (missesFrameBudget(current)) state.demoteAutoTier();
    sample.current = { warmup: 0, elapsed: 0, samples: 0, slowFrames: 0 };
  });

  return null;
}
