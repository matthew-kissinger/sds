// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import {
  useGameStore,
  type AudioBusPreference,
  type InputAction,
  type QualityPreference,
} from '@app/state/store';

const AUDIO_LABELS: Readonly<Record<AudioBusPreference, string>> = {
  ambient: 'Meadow', flock: 'Sheep', dog: 'Dog', world: 'Field', ui: 'Interface',
};

const BINDING_LABELS: Readonly<Record<InputAction, string>> = {
  forward: 'Move forward', backward: 'Move back', left: 'Move left',
  right: 'Move right', sprint: 'Sprint', bark: 'Bark', camera: 'Camera',
};

const KEY_OPTIONS: readonly { readonly code: string; readonly label: string }[] = [
  { code: 'KeyW', label: 'W' }, { code: 'KeyA', label: 'A' },
  { code: 'KeyS', label: 'S' }, { code: 'KeyD', label: 'D' },
  { code: 'KeyQ', label: 'Q' }, { code: 'KeyE', label: 'E' },
  { code: 'KeyC', label: 'C' }, { code: 'KeyF', label: 'F' },
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
              <option value="low">Low</option>
            </select>
          </label>
          <Toggle label="Reduce motion" checked={state.reduceMotion} onChange={state.setReduceMotion} />
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
