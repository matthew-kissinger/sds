// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  autoTierReceipt,
  chooseAutoTier,
  fallbackAutoTier,
  renderDprForTier,
  resolvedRenderTier,
  type DeviceProfile,
} from '@app/quality/autoTier';
import { missesFrameBudget } from '@app/quality/RuntimeQualityGovernor';
import { measureRendererFill } from '@app/scene/glFactory';
import { useGameStore } from '@app/state/store';

beforeEach(() => {
  useGameStore.setState({ autoTierReceipt: null });
});

afterEach(() => {
  useGameStore.setState({ autoTierReceipt: null });
});

describe('boot quality tier', () => {
  const desktop: DeviceProfile = {
    deviceClass: 'desktop', hardwareConcurrency: 12, deviceMemory: 16,
  };
  const mobile: DeviceProfile = {
    deviceClass: 'mobile', hardwareConcurrency: 8, deviceMemory: 8,
  };

  it('uses backend-specific measured fill budgets', () => {
    expect(chooseAutoTier('webgpu', 1.9, 1_048_576, desktop).tier).toBe('high');
    expect(chooseAutoTier('webgpu', 2.1, 1_048_576, desktop).tier).toBe('medium');
    expect(chooseAutoTier('webgpu', 4.6, 1_048_576, desktop).tier).toBe('low');
    expect(chooseAutoTier('webgl2', 1.4, 1_048_576, desktop).tier).toBe('high');
    expect(chooseAutoTier('webgl2', 1.6, 1_048_576, desktop).tier).toBe('medium');
  });

  it('caps high quality, keeps medium at 1x, and lowers weak-device fill', () => {
    expect(renderDprForTier('high')).toEqual([1, 1.5]);
    expect(renderDprForTier('medium')).toBe(1);
    expect(renderDprForTier('low')).toBe(0.8);
  });

  it('caps a fast phone at medium and a weak device at low', () => {
    expect(chooseAutoTier('webgpu', 1, 1_048_576, mobile)).toMatchObject({
      tier: 'medium', reason: 'mobile-cap', deviceClass: 'mobile',
    });
    expect(chooseAutoTier('webgpu', 1, 1_048_576, {
      ...mobile, hardwareConcurrency: 4,
    })).toMatchObject({ tier: 'low', reason: 'weak-device-cap' });
  });

  it('publishes exactly one boot measurement through the game store', () => {
    let calls = 0;
    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.autoTierReceipt !== previous.autoTierReceipt) calls += 1;
    });
    useGameStore.getState().recordAutoTier(chooseAutoTier('webgpu', 1.2, 1_048_576));
    expect(autoTierReceipt()?.fillMs).toBe(1.2);
    expect(calls).toBe(1);
    useGameStore.getState().recordAutoTier(chooseAutoTier('webgpu', 1.1, 1_048_576));
    expect(autoTierReceipt()?.fillMs).toBe(1.2);
    expect(calls).toBe(1);
    unsubscribe();
  });

  it('keeps manual quality authoritative over the measured auto tier', () => {
    const measured = chooseAutoTier('webgpu', 1.2, 1_048_576);
    expect(resolvedRenderTier('auto', measured)).toBe('high');
    expect(resolvedRenderTier('medium', measured)).toBe('medium');
    expect(resolvedRenderTier('low', measured)).toBe('low');
    expect(resolvedRenderTier('high', fallbackAutoTier('webgpu'))).toBe('high');
  });

  it('falls back low, restores the target, and ignores a late timestamp result', async () => {
    let resolveTimestamp!: () => void;
    const timestamp = new Promise<void>((resolve) => { resolveTimestamp = resolve; });
    const previousTarget = { name: 'canvas' };
    const renderer = {
      backend: { trackTimestamp: true },
      getRenderTarget: vi.fn(() => previousTarget),
      setRenderTarget: vi.fn(),
      render: vi.fn(),
      resolveTimestampsAsync: vi.fn(() => timestamp),
    };

    const receipt = await measureRendererFill(renderer as never, 'webgpu', 1);
    expect(receipt).toEqual(fallbackAutoTier('webgpu'));
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(previousTarget);
    expect(renderer.backend.trackTimestamp).toBe(false);

    resolveTimestamp();
    await Promise.resolve();
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it('demotes auto tier only, one step at a time', () => {
    useGameStore.setState({ quality: 'auto' });
    useGameStore.getState().recordAutoTier(chooseAutoTier('webgpu', 1, 1_048_576, desktop));
    useGameStore.getState().demoteAutoTier();
    expect(useGameStore.getState().autoTierReceipt).toMatchObject({
      tier: 'medium', reason: 'runtime-frame-budget', runtimeDemotions: 1,
    });
    useGameStore.getState().demoteAutoTier();
    expect(useGameStore.getState().autoTierReceipt).toMatchObject({
      tier: 'low', runtimeDemotions: 2,
    });
  });

  it('requires sustained slow frames before runtime demotion', () => {
    expect(missesFrameBudget({ samples: 300, elapsed: 5, slowFrames: 20 })).toBe(false);
    expect(missesFrameBudget({ samples: 300, elapsed: 5, slowFrames: 60 })).toBe(true);
  });
});
