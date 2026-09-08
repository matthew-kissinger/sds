// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installKeyboard, keyboardAxis, keyboardSprint } from '@app/input/keyboard';
import { clearIntent, currentIntent } from '@app/input/intent';
import { DEFAULT_INPUT_BINDINGS, useGameStore } from '@app/state/store';

let keyboard: EventTarget;
let detach: () => void;
const original = useGameStore.getState();
function key(code: string, interactive: boolean | 'button' = false, type = 'keydown') {
  const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat: false });
  if (interactive) Object.defineProperty(event, 'target', { value: {
    closest: (selector: string) => selector.includes(interactive === 'button' ? 'button' : 'input') ? {} : null,
  } });
  keyboard.dispatchEvent(event);
  return event;
}
beforeEach(() => {
  keyboard = new EventTarget();
  vi.stubGlobal('window', keyboard);
  vi.stubGlobal('document', new EventTarget());
  useGameStore.setState({ gamePhase: 'playing', uiPanel: 'none', cameraMode: 'classic', inputBindings: DEFAULT_INPUT_BINDINGS });
  clearIntent(); detach = installKeyboard();
});
afterEach(() => { detach(); clearIntent(); useGameStore.setState(original); vi.unstubAllGlobals(); });

describe('keyboard focus ownership', () => {
  it('leaves typing and native controls to the focused element', () => {
    key('KeyC', true); key('KeyW', true); key('ShiftLeft', true);
    const space = key('Space', true);
    expect(useGameStore.getState().cameraMode).toBe('classic');
    expect(keyboardAxis({ right: 0, forward: 0 })).toEqual({ right: 0, forward: 0 });
    expect(keyboardSprint()).toBe(false);
    expect(currentIntent().bark).toBe(false);
    expect(space.defaultPrevented).toBe(false);
  });
  it('retains field shortcuts when focus is on the game surface', () => {
    key('KeyC'); key('KeyW'); key('ShiftLeft'); key('Space');
    expect(useGameStore.getState().cameraMode).toBe('follow');
    expect(keyboardAxis({ right: 0, forward: 0 }).forward).toBe(1);
    expect(keyboardSprint()).toBe(true);
    expect(currentIntent().bark).toBe(true);
  });
  it('preserves native button activation without blocking movement or camera handoff', () => {
    const space = key('Space', 'button');
    expect(space.defaultPrevented).toBe(false);
    expect(currentIntent().bark).toBe(false);
    key('KeyW', 'button'); key('KeyC', 'button');
    expect(keyboardAxis({ right: 0, forward: 0 }).forward).toBe(1);
    expect(useGameStore.getState().cameraMode).toBe('follow');
  });
  it('still releases a held key when keyup arrives over a control', () => {
    key('KeyW'); key('ShiftLeft');
    key('KeyW', true, 'keyup'); key('ShiftLeft', true, 'keyup');
    expect(keyboardAxis({ right: 0, forward: 0 }).forward).toBe(0);
    expect(keyboardSprint()).toBe(false);
  });
  it('keeps Escape available while a settings control is focused', () => {
    useGameStore.getState().openSettings();
    key('Escape', true);
    expect(useGameStore.getState().uiPanel).toBe('pause');
    expect(useGameStore.getState().gamePhase).toBe('paused');
  });
  it('releases movement and sprint when the window loses focus', () => {
    key('KeyW'); key('ShiftLeft'); keyboard.dispatchEvent(new Event('blur'));
    expect(keyboardAxis({ right: 0, forward: 0 })).toEqual({ right: 0, forward: 0 });
    expect(keyboardSprint()).toBe(false);
  });
});
