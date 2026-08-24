// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { advancesSoloSimulation } from '@app/game/useGameLoop';

describe('solo frame-loop phases', () => {
  it('freezes gameplay ticks under the title and explicit pause', () => {
    expect(advancesSoloSimulation('paused')).toBe(false);
    expect(advancesSoloSimulation('title')).toBe(false);
    expect(advancesSoloSimulation('playing')).toBe(true);
    expect(advancesSoloSimulation('complete')).toBe(true);
  });
});
