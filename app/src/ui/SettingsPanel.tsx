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

const AUDIO_LABELS: Readonly<Record<AudioBusPreference, string>> = {
  ambient: 'Meadow', flock: 'Sheep', dog: 'Dog', world: 'Field', ui: 'Interface',
};

const BINDING_LABELS: Readonly<Record<InputAction, string>> = {
  forward: 'Move forward', backward: 'Move back', left: 'Move left',
  right: 'Move right', sprint: 'Sprint', walk: 'Hold to walk', bark: 'Bark', camera: 'Camera',
};

const TURNING_LABELS: Readonly<Record<FollowTurning, string>> = {
  off: 'Off', gentle: 'Gentle', quick: 'Quick',
};

/**
 * One line for the selected value, so the row costs one line and not three.
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
const TURNING_NOTES: Readonly<Record<FollowTurning, string>> = {
  off: 'The camera follows the dog without turning.',
  gentle: 'The camera follows the dog, turning at up to 25 degrees a second.',
  quick: 'The camera follows the dog, turning at up to 40 degrees a second.',
};

const KEY_OPTIONS: readonly { readonly code: string; readonly label: string }[] = [
  { code: 'KeyW', label: 'W' }, { code: 'KeyA', label: 'A' },
  { code: 'KeyS', label: 'S' }, { code: 'KeyD', label: 'D' },
  { code: 'KeyQ', label: 'Q' }, { code: 'KeyE', label: 'E' },
  { code: 'KeyC', label: 'C' }, { code: 'KeyF', label: 'F' },
  { code: 'KeyV', label: 'V' },
  { code: 'Space', label: 'Space' }, { code: 'ShiftLeft', label: 'Left Shift' },
];

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
  const state = useGameStore();
  const actions = Object.keys(BINDING_LABELS) as InputAction[];
  // What the camera is actually doing, which is the clamp and not the store.
  const turning: FollowTurning = state.reduceMotion
    ? slowerTurning(state.followTurning, REDUCED_MOTION_TURNING)
    : state.followTurning;

  return (
    <div className="herd-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <section className="herd-panel">
        <header className="herd-panel__header">
          <h2 id="settings-title" className="herd-panel__title">Settings</h2>
          <button
            type="button"
            className="herd-icon-button"
            aria-label="Close settings"
            onClick={state.closeSettings}
          >
            Close
          </button>
        </header>
        <div className="herd-settings-list">
          <label className="herd-setting">
            <span className="herd-setting__label">Render quality</span>
            <select
              className="herd-select"
              value={state.quality}
              onChange={(event) => state.setQuality(event.target.value as QualityPreference)}
            >
              <option value="auto">Auto</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <div className="herd-setting">
            <Toggle label="Reduce motion" checked={state.reduceMotion} onChange={state.setReduceMotion} />
            {/* Until the player sets it, the value is the system's, and the row
                says so rather than presenting an inherited state as a choice. */}
            <span className="herd-setting__label">
              {state.reduceMotionChosen
                ? 'Steadier camera, softer effects.'
                : 'Steadier camera, softer effects. Following your system setting.'}
            </span>
          </div>
          {/* One .herd-setting for the row, as the Sound and Keyboard rows
              below do it: the row is the grid, and the heading, the control and
              the status line are its three children on one gap. The select
              carries its own aria-label rather than being wrapped in a <label>,
              which is how the Studio's selects are labelled, and which keeps
              the status line underneath out of its accessible name. */}
          <div className="herd-setting">
            <span className="herd-setting__label">Follow camera turning</span>
            <select
              className="herd-select"
              aria-label="Follow camera turning"
              value={state.followTurning}
              onChange={(event) => state.setFollowTurning(event.target.value as FollowTurning)}
            >
              {(Object.keys(TURNING_LABELS) as FollowTurning[]).map((value) => (
                <option key={value} value={value}>{TURNING_LABELS[value]}</option>
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
                ? `Reduce motion is limiting this to ${TURNING_LABELS[turning]}.`
                : TURNING_NOTES[turning]}
            </span>
          </div>
          <Toggle label="Blue dog marker" checked={state.colorblindMarker} onChange={state.setColorblindMarker} />
          <Toggle label="Show run timer" checked={state.showTimer} onChange={state.setShowTimer} />
          <div className="herd-setting">
            <span className="herd-setting__label">Sound</span>
            <Toggle label="Mute all sound" checked={state.muted} onChange={state.setMuted} />
            <div className="herd-audio-levels">
              {(Object.keys(AUDIO_LABELS) as AudioBusPreference[]).map((bus) => (
                <label key={bus} className="herd-audio-level">
                  <span>{AUDIO_LABELS[bus]}</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={state.audioLevels[bus]}
                    aria-label={`${AUDIO_LABELS[bus]} volume`}
                    onChange={(event) => state.setAudioLevel(bus, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="herd-setting">
            <span className="herd-setting__label">Keyboard</span>
            <div className="herd-bindings">
              {actions.map((action) => (
                <label key={action} className="herd-binding">
                  <span className="herd-setting__label">{BINDING_LABELS[action]}</span>
                  <select
                    className="herd-select"
                    value={state.inputBindings[action]}
                    onChange={(event) => state.setInputBinding(action, event.target.value)}
                  >
                    {KEY_OPTIONS.map((key) => (
                      <option key={key.code} value={key.code}>{key.label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <footer className="herd-legal">
            <span>Sheepdog Sim is free software under AGPL-3.0-or-later.</span>
            <span>
              <a href="https://github.com/matthew-kissinger/sds" target="_blank" rel="noreferrer">
                Source code
              </a>
              {' · '}
              <a href="/privacy">Privacy</a>
            </span>
          </footer>
        </div>
      </section>
    </div>
  );
}
