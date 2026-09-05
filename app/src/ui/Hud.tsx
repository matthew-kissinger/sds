// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useRef } from 'react';
import { useGameStore } from '@app/state/store';
import { DOG_MAX_STAMINA, TICK_HZ } from '@sim/tuning';
import { OnlineTimes } from '@app/scores/OnlineTimes';
import { formatRunTime } from './time';
import { GateIndicator } from './GateIndicator';

export { formatRunTime } from './time';

function SheepMark() {
  return (
    <svg className="herd-progress__icon" viewBox="0 0 32 24" aria-hidden="true">
      <path
        d="M6.5 11 C6 8.5 8.5 6.5 11 7 C13 4.8 17 4.8 19 7 C21.5 6 24 8 23.5 10.5 C25.5 12 25 15 22.5 16.5 C20 17.8 16 17.8 14 17 C11.5 18.2 8 17 7 15 C5.8 13.5 5.8 12.2 6.5 11 Z"
        fill="currentColor"
      />
      <circle cx="24" cy="9.5" r="3.4" fill="currentColor" />
      <ellipse
        cx="22.2"
        cy="11.8"
        rx="1.2"
        ry="2"
        transform="rotate(25 22.2 11.8)"
        fill="currentColor"
      />
      <path
        d="M10 17v4.5M18.5 17v4.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
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

/** Small, always-legible stamina receipt without a React render per frame. */
function DogStamina() {
  const ref = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const gamePhase = useGameStore((state) => state.gamePhase);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const { sim, gamePhase: phase } = useGameStore.getState();
      const dog = sim.state.dogs[0];
      const fraction = Math.max(0, Math.min(1, (dog?.stamina ?? 0) / DOG_MAX_STAMINA));
      const percent = Math.round(fraction * 100);
      if (fillRef.current) fillRef.current.style.width = `${percent}%`;
      if (ref.current) {
        ref.current.dataset.low = String(fraction <= 0.25);
        ref.current.dataset.sprinting = String(dog?.sprinting === true);
        ref.current.setAttribute('aria-valuenow', String(percent));
        ref.current.setAttribute('aria-valuetext', `${percent} percent stamina`);
      }
      if (phase === 'playing') frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [gamePhase]);

  return (
    <div
      ref={ref}
      className="herd-stamina"
      role="progressbar"
      aria-label="Dog stamina"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={100}
    >
      <span className="herd-stamina__label">Sprint</span>
      <span className="herd-stamina__track" aria-hidden="true">
        <span ref={fillRef} className="herd-stamina__fill" />
      </span>
    </div>
  );
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
      <GateIndicator />
      <div
        className="herd-progress"
        style={{ '--herd-progress-angle': progress } as React.CSSProperties}
        data-testid="penned-count"
        data-penned={pennedCount}
        data-flock-size={flockSize}
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
      {gamePhase === 'playing' || gamePhase === 'paused' ? <DogStamina /> : null}
      {gamePhase === 'playing' ? (
        <button type="button" className="herd-icon-button herd-pause-button" aria-label="Pause" onClick={pause}>II</button>
      ) : null}
      {gamePhase === 'paused' && uiPanel === 'pause' ? <PausePanel /> : null}
      {gamePhase === 'complete' ? <CompletionPanel /> : null}
    </div>
  );
}
