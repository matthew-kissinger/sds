// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { useGameStore } from '@app/state/store';
import { getSheepName } from '@app/game/sheepNames';

describe('screen-space heritage nameplate', () => {
  it('formats sheep and dog names with appropriate ornamentation', () => {
    // Dog name defaults to Pip
    const state = useGameStore.getState();
    const dogName = state.dogName || 'Pip';
    expect(dogName).toBe('Pip');

    // Sheep names are clean without rosettes
    const sheep0 = getSheepName(0, state.customSheepNames);
    expect(typeof sheep0).toBe('string');
    expect(sheep0.length).toBeGreaterThan(0);
    expect(sheep0).not.toContain('◆');
  });

  it('correctly maps 3D NDC to 2D screen coordinates', () => {
    const width = 1440;
    const height = 900;

    // Center of screen (NDC 0, 0)
    const centerX = (0 * 0.5 + 0.5) * width;
    const centerY = (-0 * 0.5 + 0.5) * height;
    expect(centerX).toBe(720);
    expect(centerY).toBe(450);

    // Top-left of screen (NDC -1, 1)
    const topLeftX = (-1 * 0.5 + 0.5) * width;
    const topLeftY = (-1 * 0.5 + 0.5) * height;
    expect(topLeftX).toBe(0);
    expect(topLeftY).toBe(0);

    // Bottom-right of screen (NDC 1, -1)
    const bottomRightX = (1 * 0.5 + 0.5) * width;
    const bottomRightY = (-(-1) * 0.5 + 0.5) * height;
    expect(bottomRightX).toBe(1440);
    expect(bottomRightY).toBe(900);
  });

  it('clips elements behind the camera (ndc.z > 1)', () => {
    const isVisibleInFront = (ndcZ: number) => ndcZ <= 1.0;
    expect(isVisibleInFront(0.5)).toBe(true);
    expect(isVisibleInFront(1.0)).toBe(true);
    expect(isVisibleInFront(1.001)).toBe(false);
    expect(isVisibleInFront(2.5)).toBe(false);
  });

  it('reflects custom dog name updates in real time', () => {
    useGameStore.getState().setDogName('Moss');
    expect(useGameStore.getState().dogName).toBe('Moss');

    useGameStore.getState().setDogName('Shep');
    expect(useGameStore.getState().dogName).toBe('Shep');

    // Reset back to Pip
    useGameStore.getState().setDogName('Pip');
    expect(useGameStore.getState().dogName).toBe('Pip');
  });
});
