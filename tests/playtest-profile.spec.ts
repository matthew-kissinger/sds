// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  MAX_STARTUP_RAF_GAP_MS,
  drawCallsWithinBudget,
  evaluateFramePacing,
  failureCollectionsAreEmpty,
  requestedBackendMatches,
} from '../tools/playtest-profile-lib.mjs';

interface SummaryOverrides {
  readonly samples?: number;
  readonly p95?: number;
  readonly max?: number;
}

function summary({ samples = 600, p95 = 7, max = 14 }: SummaryOverrides = {}) {
  return { samples, p95, max };
}

describe('playtest profiler frame gates', () => {
  it('rejects a rare multi-second freeze even when p95 is green', () => {
    expect(evaluateFramePacing(
      summary({ p95: 7, max: 1_617.9 }),
      summary(),
      16.7,
    )).toEqual({ frames: true, freezeFree: false });
  });

  it('gates startup and Play-transition gaps separately from steady play', () => {
    expect(evaluateFramePacing(
      summary(),
      summary({ max: MAX_STARTUP_RAF_GAP_MS + 0.01 }),
      16.7,
    )).toEqual({ frames: true, freezeFree: false });
    expect(evaluateFramePacing(summary(), summary(), 16.7, true))
      .toEqual({ frames: true, freezeFree: false });
  });

  it('requires samples and preserves the percentile budget', () => {
    expect(evaluateFramePacing(summary({ samples: 0 }), summary(), 16.7))
      .toEqual({ frames: false, freezeFree: false });
    expect(evaluateFramePacing(summary({ p95: 16.8 }), summary(), 16.7))
      .toEqual({ frames: false, freezeFree: true });
  });

  it('requires the requested backend and a positive sub-100 draw count', () => {
    expect(requestedBackendMatches('webgpu', 'webgpu')).toBe(true);
    expect(requestedBackendMatches('webgpu', 'webgl2')).toBe(false);
    expect(drawCallsWithinBudget({ samples: 60, p95: 14 })).toBe(true);
    expect(drawCallsWithinBudget({ samples: 60, p95: 0 })).toBe(false);
    expect(drawCallsWithinBudget({ samples: 0, p95: 14 })).toBe(false);
    expect(drawCallsWithinBudget({ samples: 60, p95: 100 })).toBe(false);
  });

  it('fails stability when any fatal event collection is populated', () => {
    expect(failureCollectionsAreEmpty([], [], [])).toBe(true);
    expect(failureCollectionsAreEmpty([], ['page crashed'], [])).toBe(false);
  });
});
