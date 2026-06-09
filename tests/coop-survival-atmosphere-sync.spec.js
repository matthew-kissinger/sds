// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';

import { DayNightCycle } from '../js/atmosphere/index.js';
import { syncCoopSurvivalAtmosphere } from '../js/boot/initNetwork.js';

describe('co-op survival atmosphere sync', () => {
  it('smoothly approaches the Worker survival clock instead of snapping', () => {
    const dn = new DayNightCycle({ initialT: 0.70 });
    const game = { atmosphere: { dayNight: dn } };

    syncCoopSurvivalAtmosphere(game, { t: 0.80 }, 0.05);

    expect(dn.getT()).toBeGreaterThan(0.70);
    expect(dn.getT()).toBeLessThan(0.80);
    expect(dn.getT()).toBeCloseTo(0.72, 5);
  });

  it('uses the shortest wrap-aware path across midnight', () => {
    const dn = new DayNightCycle({ initialT: 0.98 });
    const game = { atmosphere: { dayNight: dn } };

    syncCoopSurvivalAtmosphere(game, { t: 0.02 }, 0.05);

    expect(dn.getT()).toBeGreaterThan(0.98);
    expect(dn.getT()).toBeLessThan(1);
  });
});
