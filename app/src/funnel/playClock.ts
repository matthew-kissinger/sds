// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Active play time not yet reported, for the run_end and run_heartbeat counts
// (docs/operations/funnel.md). Each report takes what has built up since the last
// one, so adding up every report gives total play time with nothing to link the rows.

/** How a run ended. `title` is a quit to the menu; `hidden` and `left` are the page going away mid-run. */
export type RunEndReason = 'complete' | 'restart' | 'title' | 'hidden' | 'left';

/** A crash or a killed phone tab loses at most this much play time. */
export const HEARTBEAT_MS = 60_000;

export interface PlayClock {
  /** Whether play time is building up now. */
  readonly running: () => boolean;
  start(): void;
  stop(): void;
  /** Whole seconds since the last take. The part under a second carries to the next, so none is lost to rounding. */
  take(): number;
}

export function createPlayClock(now: () => number): PlayClock {
  let banked = 0;
  let since: number | null = null;
  const bank = () => {
    if (since === null) return;
    const at = now();
    banked += Math.max(0, at - since);
    since = at;
  };
  return {
    running: () => since !== null,
    start() {
      since ??= now();
    },
    stop() {
      bank();
      since = null;
    },
    take() {
      bank();
      const seconds = Math.floor(banked / 1000);
      banked -= seconds * 1000;
      return seconds;
    },
  };
}
