// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { FLOCK_SIZES, type FlockSize } from '@app/state/store';
import type { PlayerRun } from './types';

/**
 * The shortest bar a run may draw, as a fraction of the track.
 *
 * A bar proportional to time alone gives the fastest run a sliver a few pixels
 * wide, which reads as a rendering fault rather than as "this one is quickest".
 * Flooring the scale keeps the best run's bar visibly a bar while the ordering
 * it encodes is unchanged.
 */
export const BAR_FLOOR = 0.22;

/** How many runs a size shows before it offers to show the rest. */
export const COLLAPSED_RUNS = 5;

export interface RankedRun {
  readonly run: PlayerRun;
  /** 1-based position among the player's own runs at this flock size. */
  readonly position: number;
  /** Seconds behind the player's own best at this size; 0 for the best itself. */
  readonly deltaSeconds: number;
  /** Bar length in 0..1, floored at BAR_FLOOR. */
  readonly fill: number;
}

export interface SizeGroup {
  readonly flockSize: FlockSize;
  readonly runs: readonly RankedRun[];
  /** Field size on that flock size's public board, when the server sent one. */
  readonly boardPlayers: number | null;
}

/**
 * The player's runs, split by flock size and ranked inside each one.
 *
 * Splitting is the whole point of the screen: a 200-sheep run and a 25-sheep
 * run are not comparable, so a single list ordered by time is meaningless and
 * a single list ordered by date is only a log. Every size the game offers gets
 * a group, including the ones with no runs, because "you have not run the big
 * field yet" is information and an absent section is not.
 *
 * Ordering inside a group is by time. This is a times screen, and the question
 * it answers first is how fast the player is; the delta against their own best
 * is what turns a column of absolute numbers into progress they can read.
 */
export function groupRunsByFlockSize(runs: readonly PlayerRun[]): readonly SizeGroup[] {
  return FLOCK_SIZES.map((flockSize) => {
    const mine = runs.filter((run) => run.flockSize === flockSize)
      .slice()
      .sort((a, b) => a.scoreSeconds - b.scoreSeconds);
    const best = mine[0]?.scoreSeconds ?? 0;
    const worst = mine[mine.length - 1]?.scoreSeconds ?? 0;
    const span = worst - best;
    return {
      flockSize,
      // Every run at a size carries the same field size, so the group reads it
      // off the first one rather than the server repeating it per row.
      boardPlayers: mine[0]?.boardPlayers ?? null,
      runs: mine.map((run, index) => ({
        run,
        position: index + 1,
        deltaSeconds: run.scoreSeconds - best,
        // A group whose runs are all the same time has no span to scale
        // against; dividing by it would be a division by zero, and every bar
        // is equally short because every run is equally fast.
        fill: span > 0 ? BAR_FLOOR + (1 - BAR_FLOOR) * ((run.scoreSeconds - best) / span) : BAR_FLOOR,
      })),
    };
  });
}

/** "+2.8", "+1:04.2" - a gap, not a clock, so it only grows a minute field when it needs one. */
export function formatDelta(seconds: number): string {
  if (seconds < 60) return `+${seconds.toFixed(1)}`;
  const minutes = Math.floor(seconds / 60);
  return `+${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, '0')}`;
}

/** "12th", "21st", "113th". */
export function formatOrdinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][value % 10] ?? 'th';
  return `${value}${suffix}`;
}
