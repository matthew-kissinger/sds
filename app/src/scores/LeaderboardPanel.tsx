// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useRef, useState } from 'react';
import { FLOCK_SIZES, type FlockSize } from '@app/state/store';
import { formatRunTime } from '@app/ui/time';
import { MyTimes } from './MyTimes';
import { scoresController } from './controller';
import { useScoreStore } from './store';
import { previousIsoWeek } from './week';

/**
 * The board tab: a flock size, or the player's own history across all three.
 *
 * "mine" sits in the same control group as the sizes because it answers the
 * same question from the other side - the sizes ask who is fastest, this asks
 * what the player has actually run. A player reported a second run as missing;
 * it was recorded, but the board aggregates to one row per player, so only
 * their best was ever visible.
 */
type BoardTab = FlockSize | 'mine';

export function LeaderboardPanel({
  initialFlockSize,
  onClose,
}: {
  readonly initialFlockSize: FlockSize;
  readonly onClose: () => void;
}) {
  const [tab, setTab] = useState<BoardTab>(initialFlockSize);
  // null is all-time. 'current' is this week. Any other value is an ISO week.
  const [weekToken, setWeekToken] = useState<string | null>(null);
  const flockSize = tab === 'mine' ? initialFlockSize : tab;
  const panel = useRef<HTMLElement | null>(null);
  const status = useScoreStore((state) => state.boardStatus);
  const entries = useScoreStore((state) => state.boardEntries);
  const message = useScoreStore((state) => state.boardMessage);
  const runsStatus = useScoreStore((state) => state.runsStatus);
  const runs = useScoreStore((state) => state.runs);
  const runsMessage = useScoreStore((state) => state.runsMessage);
  const boardWeek = useScoreStore((state) => state.boardWeek);
  const boardWeekLabel = useScoreStore((state) => state.boardWeekLabel);

  useEffect(() => {
    if (tab === 'mine') void scoresController.loadMyRuns();
    else void scoresController.loadBoard(tab, weekToken ?? undefined);
  }, [tab, weekToken]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const controls = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!controls || controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="herd-modal" role="dialog" aria-modal="true" aria-labelledby="times-title">
      <section ref={panel} className="herd-panel herd-board-panel">
        <header className="herd-panel__header">
          <div>
            <p className="herd-panel__kicker">Fastest complete runs</p>
            <h2 id="times-title" className="herd-panel__title">Solo times</h2>
          </div>
          <button
            type="button"
            className="herd-icon-button"
            aria-label="Close solo times"
            autoFocus
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="herd-board-tabs" aria-label="Flock size">
          {FLOCK_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className="herd-size"
              aria-pressed={size === tab}
              onClick={() => setTab(size)}
            >
              {size}
            </button>
          ))}
          <button
            type="button"
            className="herd-size"
            aria-pressed={tab === 'mine'}
            onClick={() => setTab('mine')}
          >
            My times
          </button>
        </div>
        {tab === 'mine' ? (
          <>
            <p className="herd-board-caption">Every run you have finished, by flock size.</p>
            {runsStatus !== 'ready' || runs.length === 0 ? (
              <p className="herd-board-message" role="status">{runsMessage}</p>
            ) : (
              <MyTimes runs={runs} />
            )}
          </>
        ) : (
          <>
            <div className="herd-board-tabs" aria-label="Board">
              <button
                type="button"
                className="herd-size"
                aria-pressed={weekToken === null}
                onClick={() => setWeekToken(null)}
              >
                All-time
              </button>
              <button
                type="button"
                className="herd-size"
                aria-pressed={weekToken !== null}
                onClick={() => setWeekToken('current')}
              >
                This week
              </button>
            </div>
            <p className="herd-board-caption">
              {weekToken === null
                ? `Fastest runs with ${flockSize} sheep.`
                : weekToken === 'current'
                  ? `This week, with ${flockSize} sheep.`
                  : `${boardWeekLabel || 'That week'}, with ${flockSize} sheep.`}
            </p>
            {status === 'loading' || status === 'offline' || entries.length === 0 ? (
              <p className="herd-board-message" role="status">{message}</p>
            ) : (
              <ol className="herd-board-list" aria-label={`${flockSize}-sheep solo times`}>
                {entries.slice(0, 10).map((entry) => (
                  <li key={entry.persistentId}>
                    <span><span className="herd-board-rank">{entry.rank}.</span> {entry.displayName}</span>
                    <span>{formatRunTime(entry.scoreSeconds * 1000)}</span>
                  </li>
                ))}
              </ol>
            )}
            {weekToken !== null && boardWeek ? (
              <button
                type="button"
                className="herd-mine-more"
                onClick={() => {
                  const previous = previousIsoWeek(boardWeek);
                  if (previous) setWeekToken(previous);
                }}
              >
                Previous week
              </button>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
