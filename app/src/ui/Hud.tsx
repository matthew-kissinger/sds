// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useRef } from 'react';
import { useGameStore } from '@app/state/store';
import { TICK_HZ } from '@sim/tuning';
import { OnlineTimes } from '@app/scores/OnlineTimes';
import { formatRunTime } from './time';

export { formatRunTime } from './time';

function SheepMark() {
  return (
    <svg className="herd-progress__icon" viewBox="0 0 32 24" aria-hidden="true">
      <path d="M8 6c2-4 7-4 9-1 3-2 7 0 7 4 3 1 3 6 0 7-1 3-5 4-8 2-4 2-10 0-10-5 0-3 3-6 6-7Z" fill="currentColor" />
      <circle cx="25" cy="8" r="4" fill="currentColor" />
      <path d="M9 18v5M21 18v5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Direct transient read: the timer never subscribes React to per-frame data. */
function RunTimer() {
  const ref = useRef<HTMLDivElement>(null);
  const gamePhase = useGameStore((state) => state.gamePhase);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const { sim, gamePhase } = useGameStore.getState();
      if (ref.current) {
        ref.current.textContent = formatRunTime((sim.tick * 1000) / TICK_HZ);
      }
      if (gamePhase === 'playing') frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [gamePhase]);
  return <div ref={ref} className="herd-timer" aria-label="Run time">0:00.0</div>;
}

function PausePanel() {
  const resume = useGameStore((state) => state.resume);
  const openSettings = useGameStore((state) => state.openSettings);
  const reset = useGameStore((state) => state.reset);
  return (
    <div className="herd-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <section className="herd-panel">
        <p className="herd-panel__kicker">the field is still</p>
        <h2 id="pause-title" className="herd-panel__title">Paused</h2>
        <div className="herd-panel-actions">
          <button type="button" className="herd-button herd-button--primary" onClick={resume}>Resume</button>
          <button type="button" className="herd-button" onClick={openSettings}>Settings</button>
          <button type="button" className="herd-button herd-button--quiet" onClick={reset}>End run</button>
        </div>
      </section>
    </div>
  );
}

function CompletionPanel() {
  const completionTimeMs = useGameStore((state) => state.completionTimeMs);
  const flockSize = useGameStore((state) => state.flockSize);
  const best = useGameStore((state) => state.personalBests[state.flockSize]);
  const isBest = useGameStore((state) => state.lastRunWasBest);
  const startGame = useGameStore((state) => state.startGame);
  const reset = useGameStore((state) => state.reset);
  return (
    <div className="herd-modal" data-testid="completion">
      <section className="herd-panel herd-panel--completion">
        <p className="herd-panel__kicker">every sheep is in</p>
        <p className="herd-completion-time">{formatRunTime(completionTimeMs)}</p>
        <p className="herd-best">
          {isBest ? 'New personal best' : best === null ? '' : `Best ${formatRunTime(best)}`}
        </p>
        <OnlineTimes />
        <div className="herd-panel-actions">
          <button type="button" className="herd-button herd-button--primary" onClick={() => startGame(flockSize)}>Play again</button>
          <button type="button" className="herd-button herd-button--quiet" onClick={reset}>Title</button>
        </div>
      </section>
    </div>
  );
}

export function Hud() {
  const gamePhase = useGameStore((state) => state.gamePhase);
  const uiPanel = useGameStore((state) => state.uiPanel);
  const pennedCount = useGameStore((state) => state.pennedCount);
  const flockSize = useGameStore((state) => state.flockSize);
  const showTimer = useGameStore((state) => state.showTimer);
  const pause = useGameStore((state) => state.pause);
  const progress = `${(pennedCount / flockSize) * 360}deg`;

  return (
    <div className="herd-hud">
      <div
        className="herd-progress"
        style={{ '--herd-progress-angle': progress } as React.CSSProperties}
        data-testid="penned-count"
        data-penned={pennedCount}
        aria-label={
          `${pennedCount} of ${flockSize} sheep penned`
        }
      >
        <div className="herd-progress__content">
          <SheepMark />
          <span className="herd-progress__count">
            {`${pennedCount} / ${flockSize}`}
          </span>
        </div>
      </div>
      {showTimer && (gamePhase === 'playing' || gamePhase === 'paused') ? <RunTimer /> : null}
      {gamePhase === 'playing' ? (
        <button type="button" className="herd-icon-button herd-pause-button" aria-label="Pause" onClick={pause}>II</button>
      ) : null}
      {gamePhase === 'paused' && uiPanel === 'pause' ? <PausePanel /> : null}
      {gamePhase === 'complete' ? <CompletionPanel /> : null}
    </div>
  );
}
