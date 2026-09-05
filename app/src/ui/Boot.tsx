// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useRef, useState } from 'react';
import {
  FLOCK_SIZES,
  useGameStore,
} from '@app/state/store';
import { useReducedMotion } from './useReducedMotion';
import { PlayerIdentity } from '@app/scores/PlayerIdentity';
import { LeaderboardPanel } from '@app/scores/LeaderboardPanel';
import { bootPercent, bootStatus } from '@app/boot/progress';

export function Boot() {
  const startGame = useGameStore((state) => state.startGame);
  const openSettings = useGameStore((state) => state.openSettings);
  const openCustomize = useGameStore((state) => state.openCustomize);
  const sceneReady = useGameStore((state) => state.sceneReady);
  const bootProgress = useGameStore((state) => state.bootProgress);
  const gamePhase = useGameStore((state) => state.gamePhase);
  const flockSize = useGameStore((state) => state.flockSize);
  const setFlockSize = useGameStore((state) => state.setFlockSize);
  const [leaving, setLeaving] = useState(false);
  const [showTimes, setShowTimes] = useState(false);
  const timeout = useRef<number | null>(null);
  const timesButton = useRef<HTMLButtonElement | null>(null);
  const reducedMotion = useReducedMotion();
  const percent = sceneReady ? 100 : bootPercent(bootProgress);
  const status = sceneReady ? 'Field ready' : bootStatus(bootProgress);

  const closeTimes = () => {
    setShowTimes(false);
    window.requestAnimationFrame(() => timesButton.current?.focus());
  };

  useEffect(() => () => {
    if (timeout.current !== null) window.clearTimeout(timeout.current);
  }, []);

  const play = () => {
    if (!sceneReady || leaving) return;
    const begin = () => startGame(flockSize);
    if (reducedMotion) {
      begin();
      return;
    }
    setLeaving(true);
    begin();
    timeout.current = window.setTimeout(() => setLeaving(false), 150);
  };

  if (gamePhase !== 'title' && !leaving) return null;

  return (
    <div
      className="herd-boot"
      data-ready={sceneReady}
      data-leaving={leaving}
      data-progress={percent}
      data-stage={status}
      aria-busy={!sceneReady}
    >
      <div className="herd-boot__wash" aria-hidden="true" />
      {!sceneReady ? (
        <section className="herd-loading-card" role="status" aria-live="polite">
          <div className="herd-loading-card__lockup">
            <h1>Sheepdog Sim</h1>
            <p>Preparing one field</p>
          </div>
          <div
            className="herd-loading-track"
            role="progressbar"
            aria-label="Loading the game"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="herd-loading-status">
            <span>{status}</span>
            <span>{percent}%</span>
          </p>
        </section>
      ) : null}
      <main className="herd-title-card" inert={showTimes ? true : undefined}>
        <div className="herd-title-lockup">
          <h1 className="herd-title">Sheepdog Sim</h1>
          <p className="herd-kicker">every sheep through the gate</p>
        </div>
        <PlayerIdentity />
        <div className="herd-size-row" aria-label="Flock size">
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
        <div className="herd-title-actions">
          <button
            type="button"
            className="herd-button herd-button--primary"
            disabled={!sceneReady || leaving}
            onClick={play}
          >
            Play
          </button>
          <button
            type="button"
            className="herd-button herd-button--quiet"
            onClick={openCustomize}
          >
            Customize
          </button>
          <button
            type="button"
            className="herd-button herd-button--quiet"
            onClick={openSettings}
          >
            Settings
          </button>
          <button
            ref={timesButton}
            type="button"
            className="herd-button herd-button--quiet"
            onClick={() => setShowTimes(true)}
          >
            Times
          </button>
        </div>
        <nav className="herd-title-links" aria-label="Game information">
          <a href="/about">About the game</a>
          <a href="/support">Controls and help</a>
        </nav>
      </main>
      {showTimes ? (
        <LeaderboardPanel initialFlockSize={flockSize} onClose={closeTimes} />
      ) : null}
    </div>
  );
}
