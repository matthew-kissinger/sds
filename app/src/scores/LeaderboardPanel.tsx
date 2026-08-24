// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useRef, useState } from 'react';
import { FLOCK_SIZES, type FlockSize } from '@app/state/store';
import { formatRunTime } from '@app/ui/time';
import { scoresController } from './controller';
import { useScoreStore } from './store';

export function LeaderboardPanel({
  initialFlockSize,
  onClose,
}: {
  readonly initialFlockSize: FlockSize;
  readonly onClose: () => void;
}) {
  const [flockSize, setFlockSize] = useState(initialFlockSize);
  const panel = useRef<HTMLElement | null>(null);
  const status = useScoreStore((state) => state.boardStatus);
  const entries = useScoreStore((state) => state.boardEntries);
  const message = useScoreStore((state) => state.boardMessage);

  useEffect(() => {
    void scoresController.loadBoard(flockSize);
  }, [flockSize]);

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
              aria-pressed={size === flockSize}
              onClick={() => setFlockSize(size)}
            >
              {size}
            </button>
          ))}
        </div>
        <p className="herd-board-caption">Fastest runs with {flockSize} sheep.</p>
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
      </section>
    </div>
  );
}
