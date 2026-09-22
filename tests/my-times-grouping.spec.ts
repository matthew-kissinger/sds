// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The "My times" tab groups a player's runs by flock size and ranks them
// inside each group. The flat list it replaced interleaved all three sizes in
// submission order, so a 200-sheep run sat directly above a 25-sheep one and
// the only reading available was a comparison that means nothing. These are
// the rules the new layout depends on being true.

import { describe, it, expect } from 'vitest';
import {
  BAR_FLOOR, COLLAPSED_RUNS, formatDelta, formatOrdinal, groupRunsByFlockSize,
} from '../app/src/scores/runGroups';
import type { PlayerRun } from '../app/src/scores/types';

const run = (
  flockSize: 25 | 75 | 200,
  scoreSeconds: number,
  submittedAt = 0,
  standing?: { boardRank: number; boardPlayers: number },
): PlayerRun => ({ flockSize, scoreSeconds, submittedAt, ...standing });

describe('My times grouping', () => {
  it('gives every flock size a section, including the ones never played', () => {
    const groups = groupRunsByFlockSize([run(25, 40)]);
    expect(groups.map((g) => g.flockSize)).toEqual([25, 75, 200]);
    expect(groups[1]!.runs).toEqual([]);
    expect(groups[2]!.runs).toEqual([]);
  });

  it('orders each section by time, not by when it was submitted', () => {
    const groups = groupRunsByFlockSize([
      run(25, 52.6, 5), run(25, 38.4, 1), run(25, 44.9, 9),
    ]);
    expect(groups[0]!.runs.map((r) => r.run.scoreSeconds)).toEqual([38.4, 44.9, 52.6]);
    expect(groups[0]!.runs.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it('never mixes sizes into one section', () => {
    const groups = groupRunsByFlockSize([run(200, 298), run(25, 38), run(75, 112)]);
    expect(groups.map((g) => g.runs.length)).toEqual([1, 1, 1]);
    expect(groups[2]!.runs[0]!.run.scoreSeconds).toBe(298);
  });

  it('measures the delta against the best at that size, not the best overall', () => {
    const groups = groupRunsByFlockSize([run(25, 40), run(25, 46.5), run(75, 200)]);
    expect(groups[0]!.runs.map((r) => r.deltaSeconds)).toEqual([0, 6.5]);
    // The 75 section's only run is its own best, so it is 0 behind - and not
    // 160 behind the faster 25-sheep run it is not competing with.
    expect(groups[1]!.runs[0]!.deltaSeconds).toBe(0);
  });

  it('floors the fastest run bar so it is still a bar', () => {
    const groups = groupRunsByFlockSize([run(25, 38.4), run(25, 63.8)]);
    const [best, worst] = groups[0]!.runs;
    expect(best!.fill).toBe(BAR_FLOOR);
    expect(worst!.fill).toBe(1);
  });

  it('does not divide by zero when every run at a size is the same time', () => {
    const groups = groupRunsByFlockSize([run(25, 40, 1), run(25, 40, 2)]);
    expect(groups[0]!.runs.map((r) => r.fill)).toEqual([BAR_FLOOR, BAR_FLOOR]);
    expect(groups[0]!.runs.every((r) => Number.isFinite(r.fill))).toBe(true);
  });

  it('carries the board field size per section, and null when the server sent none', () => {
    const groups = groupRunsByFlockSize([
      run(25, 38.4, 1, { boardRank: 12, boardPlayers: 340 }),
      run(75, 112, 2),
    ]);
    expect(groups[0]!.boardPlayers).toBe(340);
    expect(groups[1]!.boardPlayers).toBeNull();
  });

  it('collapses only where there is something to collapse', () => {
    const many = Array.from({ length: COLLAPSED_RUNS + 3 }, (_, i) => run(25, 40 + i, i));
    const exact = Array.from({ length: COLLAPSED_RUNS }, (_, i) => run(75, 100 + i, i));
    const groups = groupRunsByFlockSize([...many, ...exact]);
    expect(groups[0]!.runs.length).toBeGreaterThan(COLLAPSED_RUNS);
    expect(groups[1]!.runs.length).toBe(COLLAPSED_RUNS);
  });
});

describe('My times formatting', () => {
  it('writes a gap as a gap, growing a minute field only when it needs one', () => {
    expect(formatDelta(0.4)).toBe('+0.4');
    expect(formatDelta(6.5)).toBe('+6.5');
    expect(formatDelta(59.94)).toBe('+59.9');
    expect(formatDelta(64.2)).toBe('+1:04.2');
    expect(formatDelta(125)).toBe('+2:05.0');
  });

  it('gets the awkward ordinals right', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(formatOrdinal))
      .toEqual([
        '1st', '2nd', '3rd', '4th', '11th', '12th', '13th',
        '21st', '22nd', '23rd', '101st', '111th', '112th',
      ]);
  });
});
