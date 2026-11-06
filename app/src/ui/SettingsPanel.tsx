// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import {
  useGameStore,
  type AudioBusPreference,
  type InputAction,
  type QualityPreference,
} from '@app/state/store';
import {
  REDUCED_MOTION_TURNING,
  slowerTurning,
  type FollowTurning,
} from '@app/camera/followFraming';
import { localeInfo } from '@app/i18n/resolve';
import { useLocale, useT } from '@app/i18n/store';
import { LanguageSetting } from './LanguagePicker';

const AUDIO_BUSES: readonly AudioBusPreference[] = ['ambient', 'flock', 'dog', 'world', 'ui'];

const BINDING_ACTIONS: readonly InputAction[] = [
  'forward', 'backward', 'left', 'right', 'sprint', 'walk', 'bark', 'camera', 'timer',
];

/**
 * One line for the selected value (`turningNote.*` in the dictionary), so the
 * row costs one line and not three.
 *
 * A RATE RATHER THAN A DURATION, and the durations these replace are why. "A
 * quarter turn takes about two seconds" was 90 degrees divided by the profile's
 * rate cap, which is the only term of the bearing law that is a duration. Two
 * things sit ahead of that cap - a dead zone taken off the bearing error, 20
 * degrees at gentle and 25 at quick, and a 1.0 s lag - so the quotient is a
 * floor, and the row presented it as typical.
 *
 * Measured this round through the shipped rig, dog at a full run around a 90
 * degree corner, at 30, 60 and 144 Hz in landscape and portrait: the view's
 * bearing turns 75.0 degrees at gentle and 71.2 at quick, not 90, because it
 * settles inside the dead zone rather than closing it, and it reaches 95% of
 * that in 4.17 s and 3.60 s. Turning the view a full 90 degrees needs a 135
 * degree course change, and takes 3.87 s and 2.72 s. So the panel quoted two
 * seconds for something nearer three, and promised a quarter turn that a
 * quarter-turn corner does not produce at either value.
 *
 * The ceilings below are exact rather than approximate: the view's bearing
 * peaks at 25.00 and 40.00 deg/s in every one of those runs, which is the
 * turning profile's own `rate` in `followFraming.ts`. The view direction is
 * pitched down, so it turns slightly slower still, 23.1 and 37.1 deg/s. The
 * numbers are restated here as prose because that table is private to the rig;
 * a profile whose rate moves moves this line with it.
 */
const TURNING_OPTIONS: readonly FollowTurning[] = ['off', 'gentle', 'quick'];

const LETTER_KEYS: readonly string[] = ['W', 'A', 'S', 'D', 'Q', 'E', 'C', 'F', 'V', 'T'];

function Toggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  return (
    <label className="herd-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="herd-toggle__track" aria-hidden="true">
        <span className="herd-toggle__knob" />
      </span>
    </label>
  );
}

export function SettingsPanel() {
  const t = useT();
  const credit = localeInfo(useLocale()).credit;
  const state = useGameStore();
  // What the camera is actually doing, which is the clamp and not the store.
  const turning: FollowTurning = state.reduceMotion
    ? slowerTurning(state.followTurning, REDUCED_MOTION_TURNING)
    : state.followTurning;

  return (
    <div className="herd-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <section className="herd-panel">
        <header className="herd-panel__header">
          <h2 id="settings-title" className="herd-panel__title">{t('common.settings')}</h2>
          <button
            type="button"
            className="herd-icon-button"
            aria-label={t('settings.close')}
            onClick={state.closeSettings}
          >
            {t('common.close')}
          </button>
        </header>
        <div className="herd-settings-list">
          <LanguageSetting />
          <label className="herd-setting">
            <span className="herd-setting__label">{t('settings.quality')}</span>
            <select
              className="herd-select"
              value={state.quality}
              onChange={(event) => state.setQuality(event.target.value as QualityPreference)}
            >
              <option value="auto">{t('quality.auto')}</option>
              <option value="high">{t('quality.high')}</option>
              <option value="medium">{t('quality.medium')}</option>
              <option value="low">{t('quality.low')}</option>
            </select>
          </label>
          <div className="herd-setting">
            <Toggle label={t('settings.reduceMotion')} checked={state.reduceMotion} onChange={state.setReduceMotion} />
            {/* Until the player sets it, the value is the system's, and the row
                says so rather than presenting an inherited state as a choice. */}
            <span className="herd-setting__label">
              {state.reduceMotionChosen
                ? t('settings.reduceMotionNote')
                : t('settings.reduceMotionSystem')}
            </span>
          </div>
          {/* One .herd-setting for the row, as the Sound and Keyboard rows
              below do it: the row is the grid, and the heading, the control and
              the status line are its three children on one gap. The select
              carries its own aria-label rather than being wrapped in a <label>,
              which is how the Studio's selects are labelled, and which keeps
              the status line underneath out of its accessible name. */}
          <div className="herd-setting">
            <span className="herd-setting__label">{t('settings.followTurning')}</span>
            <select
              className="herd-select"
              aria-label={t('settings.followTurning')}
              value={state.followTurning}
              onChange={(event) => state.setFollowTurning(event.target.value as FollowTurning)}
            >
              {TURNING_OPTIONS.map((value) => (
                <option key={value} value={value}>{t(`turning.${value}`)}</option>
              ))}
            </select>
            {/* The camera is clamped, not rewritten, so the select keeps
                showing the player's own choice and this line says what the
                clamp is doing to it. The control stays enabled on purpose:
                Reduce motion lowers the profile but never raises it, so Off is
                still reachable, and this is the row where taking an
                accessibility option away would cost the most. */}
            <span className="herd-setting__label">
              {state.reduceMotion && turning !== state.followTurning
                ? t('settings.turningLimited', { value: t(`turning.${turning}`) })
                : t(`turningNote.${turning}`)}
            </span>
          </div>
          <Toggle label={t('settings.marker')} checked={state.colorblindMarker} onChange={state.setColorblindMarker} />
          <Toggle label={t('settings.showTimer')} checked={state.showTimer} onChange={state.setShowTimer} />
          <div className="herd-setting">
            <span className="herd-setting__label">{t('settings.sound')}</span>
            <Toggle label={t('settings.mute')} checked={state.muted} onChange={state.setMuted} />
            <div className="herd-audio-levels">
              {AUDIO_BUSES.map((bus) => (
                <label key={bus} className="herd-audio-level">
                  <span>{t(`audio.${bus}`)}</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={state.audioLevels[bus]}
                    aria-label={t('settings.volume', { name: t(`audio.${bus}`) })}
                    onChange={(event) => state.setAudioLevel(bus, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="herd-setting">
            <span className="herd-setting__label">{t('settings.keyboard')}</span>
            <div className="herd-bindings">
              {BINDING_ACTIONS.map((action) => (
                <label key={action} className="herd-binding">
                  <span className="herd-setting__label">{t(`binding.${action}`)}</span>
                  <select
                    className="herd-select"
                    value={state.inputBindings[action]}
                    onChange={(event) => state.setInputBinding(action, event.target.value)}
                  >
                    {LETTER_KEYS.map((key) => (
                      <option key={key} value={`Key${key}`}>{key}</option>
                    ))}
                    <option value="Space">{t('key.space')}</option>
                    <option value="ShiftLeft">{t('key.shiftLeft')}</option>
                  </select>
                </label>
              ))}
            </div>
          </div>
          <footer className="herd-legal">
            <span>{t('settings.legal', { licence: 'AGPL-3.0-or-later' })}</span>
            <span>
              <a href="https://github.com/matthew-kissinger/sds" target="_blank" rel="noreferrer">
                {t('settings.source')}
              </a>
              {' · '}
              <a href="/privacy">{t('settings.privacy')}</a>
            </span>
            {credit ? <span><a href={credit.url} target="_blank" rel="noreferrer">{credit.text}</a></span> : null}
          </footer>
        </div>
      </section>
    </div>
  );
}
