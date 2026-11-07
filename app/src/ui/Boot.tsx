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
import { takePlayPathStart } from '@app/boot/playPath';
import { useLocale, useT } from '@app/i18n/store';
import { LanguageOfferLine, TitleLanguagePicker } from './LanguagePicker';

export function Boot({
  onMultiplayer,
  multiplayerLabel,
}: {
  readonly onMultiplayer?: () => void;
  readonly multiplayerLabel?: string;
}) {
  const t = useT();
  // The about and help pages exist in English only, and the links say so.
  const englishPage = useLocale() === 'en' ? '' : ' (EN)';
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
  const status = sceneReady ? t('boot.fieldReady') : bootStatus(bootProgress);

  const closeTimes = () => {
    setShowTimes(false);
    window.requestAnimationFrame(() => timesButton.current?.focus());
  };

  useEffect(() => () => {
    if (timeout.current !== null) window.clearTimeout(timeout.current);
  }, []);

  useEffect(() => {
    if (!sceneReady) return;
    const size = takePlayPathStart(window.location.pathname);
    if (size === null) return;
    setFlockSize(size);
    startGame(size);
  }, [sceneReady, setFlockSize, startGame]);

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
            <p>{t('boot.preparing')}</p>
          </div>
          <div
            className="herd-loading-track"
            role="progressbar"
            aria-label={t('boot.loadingLabel')}
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
      <main className="herd-title-card" inert={!sceneReady || showTimes ? true : undefined}>
        <div className="herd-title-lockup">
          <h1 className="herd-title">Sheepdog Sim</h1>
          <p className="herd-kicker">{t('title.kicker')}</p>
        </div>
        <PlayerIdentity />
        <div className="herd-size-row" aria-label={t('common.flockSize')}>
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
            {t('title.playSolo')}
          </button>
          {onMultiplayer ? (
            <button
              type="button"
              className="herd-button"
              aria-haspopup="dialog"
              disabled={!sceneReady || leaving || showTimes}
              onClick={onMultiplayer}
            >
              {multiplayerLabel ?? t('title.multiplayer')}
            </button>
          ) : null}
        </div>
        <LanguageOfferLine />
        <div className="herd-title-tools">
          <button
            type="button"
            className="herd-button herd-button--quiet"
            id="customize-trigger"
            aria-haspopup="dialog"
            aria-controls="customization-studio"
            onClick={openCustomize}
          >
            {t('title.customize')}
          </button>
          <button
            type="button"
            className="herd-button herd-button--quiet"
            onClick={openSettings}
          >
            {t('common.settings')}
          </button>
          <button
            ref={timesButton}
            type="button"
            className="herd-button herd-button--quiet"
            onClick={() => setShowTimes(true)}
          >
            {t('title.times')}
          </button>
          <TitleLanguagePicker />
        </div>
        <nav className="herd-title-links" aria-label={t('common.gameInfo')}>
          <a href="/about">{t('title.about')}{englishPage}</a>
          <a href="/support">{t('title.help')}{englishPage}</a>
        </nav>
        <nav className="herd-title-links herd-title-links--more" aria-label={t('title.moreFrom')}>
          <span>{t('title.moreFrom')}</span>
          <a href="https://instruktlabs.com/">instruktlabs.com</a>
          <a href="https://skisim.app/">ski sim</a>
          <a href="https://objekt62.com/">OBJEKT 62</a>
          <a href="https://vietnamwarsim.com/">Terror in the Jungle (pre-alpha)</a>
        </nav>
      </main>
      {showTimes ? (
        <LeaderboardPanel initialFlockSize={flockSize} onClose={closeTimes} />
      ) : null}
    </div>
  );
}
