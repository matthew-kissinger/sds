// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 57 P8 — client half of the leaderboard-recording fix.
//
// The worker only credits paused time if the client actually sends `pausedMs`
// in the submit payload (otherwise it skips the skew check). If a future
// refactor drops that field, the worker silently stops protecting paused runs
// and the incident can recur. This locks the contract: a solo win threads the
// pause window (and the client wall-clock window) into the payload handed to
// `window.submitGameScore`, and the existing sandbox/practice gates still block.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mutable fake timer so a test can model "no timer available" → pausedMs 0.
const state = vi.hoisted(() => ({ timer: { pausedTime: 14_000 } as { pausedTime: number } | null }));
vi.mock('../js/GameBridge.js', () => ({ getGameTimer: () => state.timer }));
// Telemetry is a fire-and-forget dynamic import; stub it so the test doesn't
// pull the real (browser-oriented) module or leak an unhandled rejection.
vi.mock('../js/telemetry.js', () => ({ emitEvent: () => {} }));

import { submitScoreToLeaderboard } from '../js/gamestate/completion.js';

describe('completion submit payload — pausedMs contract (Cycle 57 P8)', () => {
  let submitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state.timer = { pausedTime: 14_000 };
    submitSpy = vi.fn();
    (globalThis as any).window = { submitGameScore: submitSpy };
  });
  afterEach(() => {
    delete (globalThis as any).window;
    vi.restoreAllMocks();
  });

  const soloState = (over: Record<string, unknown> = {}) => ({
    gameMode: 'solo',
    singlePlayerMode: 'classic',
    sceneId: 'rolling-hills',
    totalSheep: 200,
    _clientStartedAt: 1_700_000_000_000,
    ...over,
  });

  it('threads pausedMs and the client window into the soloClassic submit', () => {
    submitScoreToLeaderboard(soloState(), 759);

    expect(submitSpy).toHaveBeenCalledTimes(1);
    const [mode, score, payload] = submitSpy.mock.calls[0];
    expect(mode).toBe('soloClassic');
    expect(score).toBe(759);
    expect(payload).toMatchObject({
      pausedMs: 14_000,
      clientStartedAt: 1_700_000_000_000,
      sceneId: 'rolling-hills',
      sheepCount: 200,
      totalSheep: 200,
    });
    expect(typeof payload.clientFinishedAt).toBe('number');
    expect(payload.clientFinishedAt).toBeGreaterThanOrEqual(payload.clientStartedAt);
  });

  it('defaults pausedMs to 0 when no timer is available', () => {
    state.timer = null;
    submitScoreToLeaderboard(soloState(), 759);

    const [, , payload] = submitSpy.mock.calls[0];
    expect(payload.pausedMs).toBe(0);
  });

  it('does not submit for sandbox (no leaderboard)', () => {
    submitScoreToLeaderboard(soloState({ gameMode: 'sandbox' }), 120);
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('does not submit for local two-player rounds', () => {
    submitScoreToLeaderboard(soloState({ gameMode: 'local' }), 120);
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('does not submit for practice mode', () => {
    submitScoreToLeaderboard(soloState({ singlePlayerMode: 'practice' }), 120);
    expect(submitSpy).not.toHaveBeenCalled();
  });
});
