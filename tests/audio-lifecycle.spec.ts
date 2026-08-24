// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  AUDIO_PREFERENCES_CHANGED,
  AUDIO_SCHEDULE_CHANGED,
  audioLifecycleCommand,
  audioStoreChangeMask,
} from '@app/audio/lifecycle';

describe('audio lifecycle', () => {
  it('reacts only to phase edges so transient store writes cannot starve pause', () => {
    expect(audioLifecycleCommand('playing', 'paused')).toBe('suspend');
    expect(audioLifecycleCommand('paused', 'paused')).toBeNull();
    expect(audioLifecycleCommand('paused', 'playing')).toBe('resume');
    expect(audioLifecycleCommand('playing', 'playing')).toBeNull();
  });

  it('ignores unrelated diagnostic store publications', () => {
    const state = {
      muted: false,
      reduceMotion: false,
      audioLevels: { ambient: 1 },
      gamePhase: 'playing',
      uiPanel: 'none',
      acceptedBark: null,
      penSerial: 0,
      penDelta: 0,
      pennedCount: 0,
      completionTick: -1,
    } as const;
    expect(audioStoreChangeMask(state as never, state as never)).toBe(0);
    expect(audioStoreChangeMask(state as never, {
      ...state,
      audioLevels: { ambient: 0.5 },
      acceptedBark: { serial: 1 },
    } as never)).toBe(
      AUDIO_PREFERENCES_CHANGED | AUDIO_SCHEDULE_CHANGED,
    );
  });
});
