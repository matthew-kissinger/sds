// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { flockSizeFromPath } from '@app/boot/playPath';
import {
  absoluteShareUrl, completionShareText, formatCardClock, historyShareText, sendShare,
} from '@app/scores/share';
import { previousIsoWeek } from '@app/scores/week';

describe('play paths and share text', () => {
  it('starts only the three flock paths', () => {
    expect(flockSizeFromPath('/play/25')).toBe(25);
    expect(flockSizeFromPath('/play/75/')).toBe(75);
    expect(flockSizeFromPath('/play/200')).toBe(200);
    expect(flockSizeFromPath('/play/50')).toBeNull();
    expect(flockSizeFromPath('/play/25/extra')).toBeNull();
    expect(flockSizeFromPath('/')).toBeNull();
  });

  it('writes the week first, and names an older week by its Monday', () => {
    expect(formatCardClock(182.85)).toBe('3:02.9');
    expect(completionShareText({
      clock: '4:35.9', flockSize: 25, weekRank: 9, weekPlayers: 27, newBest: false,
    })).toBe('4:35.9 with 25 sheep. 9th of 27 this week.');
    expect(completionShareText({
      clock: '1:17.9', flockSize: 25, weekRank: 1, weekPlayers: 27, newBest: true,
    })).toBe('New best. 1:17.9 with 25 sheep. 1st of 27 this week.');
    expect(historyShareText({
      clock: '4:58.2', flockSize: 25, weekRank: 11, weekPlayers: 27, weekLabel: 'week of 12 Oct',
    })).toBe('4:58.2 with 25 sheep. 11th of 27 in the week of 12 Oct.');
  });

  it('steps back one ISO week and stops on a token that is not one', () => {
    expect(previousIsoWeek('2026-W43')).toBe('2026-W42');
    expect(previousIsoWeek('2026-W01')).toBe('2025-W52');
    expect(previousIsoWeek('this-week')).toBeNull();
  });

  it('copies the sentence and the absolute URL, and leaves a cancelled sheet alone', async () => {
    expect(absoluteShareUrl('/c/4.sig', 'https://sheepdogsim.com')).toBe('https://sheepdogsim.com/c/4.sig');
    const copied: string[] = [];
    expect(await sendShare(
      { title: '4:35.9 · 25 sheep', text: '4:35.9 with 25 sheep.', url: 'https://sheepdogsim.com/c/4.sig' },
      { writeText: async (value) => { copied.push(value); } },
    )).toBe('copied');
    expect(copied).toEqual(['4:35.9 with 25 sheep.\nhttps://sheepdogsim.com/c/4.sig']);

    expect(await sendShare(
      { title: 't', text: 'body', url: 'https://sheepdogsim.com/c/4.sig' },
      { share: async () => { throw new DOMException('cancelled', 'AbortError'); }, writeText: async () => { copied.push('no'); } },
    )).toBe('idle');
    expect(copied).toEqual(['4:35.9 with 25 sheep.\nhttps://sheepdogsim.com/c/4.sig']);
  });
});
