// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useRef, useState } from 'react';
import {
  FLOCK_SIZES,
  useGameStore,
  type FlockSize,
} from '@app/state/store';
import { useReducedMotion } from './useReducedMotion';
import { PlayerIdentity } from '@app/scores/PlayerIdentity';

export function Boot() {
  const startGame = useGameStore((state) => state.startGame);
  const openSettings = useGameStore((state) => state.openSettings);
  const sceneReady = useGameStore((state) => state.sceneReady);
  const gamePhase = useGameStore((state) => state.gamePhase);
  const defaultFlockSize = useGameStore((state) => state.flockSize);
  const [flockSize, setFlockSize] = useState<FlockSize>(defaultFlockSize);
  const [leaving, setLeaving] = useState(false);
  const timeout = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

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
      aria-busy={!sceneReady}
    >
      <div className="herd-boot__wash" aria-hidden="true" />
      <main className="herd-title-card">
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
            onClick={openSettings}
          >
            Settings
          </button>
        </div>
      </main>
    </div>
  );
}
