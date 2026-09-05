// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installKeyboard, keyboardSprint } from '@app/input/keyboard';
import { beginTouchStick, endAllTouch, endTouchStick, setTouchSprint, touchSprint } from '@app/input/touch';
import { setSprintSource, sprintReleaseSerial } from '@app/input/sprintSources';
import { clearIntent, currentIntent, resolveSprintForTick, setSprint } from '@app/input/intent';

let keyboard: EventTarget;
let detach: () => void;
const key = (type: string, code: string) => keyboard.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
const exhaust = () => { setSprint(true); resolveSprintForTick(0); };
const sample = (serial: number, held: boolean) => {
  setSprint(held, sprintReleaseSerial() !== serial);
  resolveSprintForTick(100);
};

beforeEach(() => {
  keyboard = new EventTarget();
  vi.stubGlobal('window', keyboard);
  vi.stubGlobal('document', new EventTarget());
  detach = installKeyboard();
  endAllTouch(); setSprintSource('gamepad', false); clearIntent();
});
afterEach(() => { detach(); endAllTouch(); setSprintSource('gamepad', false); clearIntent(); vi.unstubAllGlobals(); });

describe('sprint release edges between resolver frames', () => {
  it('retains keyboard keyup/repress before the next frame', () => {
    key('keydown', 'ShiftLeft'); exhaust();
    const serial = sprintReleaseSerial();
    key('keyup', 'ShiftLeft'); key('keydown', 'ShiftLeft');
    expect(keyboardSprint()).toBe(true);
    sample(serial, keyboardSprint());
    expect(currentIntent().sprint).toBe(true);
  });

  it('does not rearm when the other keyboard sprint key remains held', () => {
    key('keydown', 'ShiftLeft'); key('keydown', 'ShiftRight'); exhaust();
    const serial = sprintReleaseSerial();
    key('keyup', 'ShiftLeft'); key('keydown', 'ShiftLeft');
    sample(serial, keyboardSprint());
    expect(currentIntent().sprint).toBe(false);
  });

  it('retains touch sprint release/repress but not a steering release', () => {
    setTouchSprint(true); beginTouchStick(); exhaust();
    const serial = sprintReleaseSerial();
    endTouchStick(); beginTouchStick();
    sample(serial, touchSprint());
    expect(currentIntent().sprint).toBe(false);
    setTouchSprint(false); setTouchSprint(true);
    sample(serial, touchSprint());
    expect(currentIntent().sprint).toBe(true);
  });

  it('requires every device to release rather than rearming on one device edge', () => {
    key('keydown', 'ShiftLeft'); setTouchSprint(true); setSprintSource('gamepad', true); exhaust();
    const serial = sprintReleaseSerial();
    key('keyup', 'ShiftLeft'); setTouchSprint(false); setTouchSprint(true);
    sample(serial, true);
    expect(currentIntent().sprint).toBe(false);
    setTouchSprint(false); setSprintSource('gamepad', false);
    setTouchSprint(true);
    sample(serial, touchSprint());
    expect(currentIntent().sprint).toBe(true);
  });

  it('does not reuse an already consumed release on a later exhausted hold', () => {
    setTouchSprint(true); const previous = sprintReleaseSerial();
    setTouchSprint(false); setTouchSprint(true); sample(previous, true);
    const consumed = sprintReleaseSerial();
    resolveSprintForTick(0); sample(consumed, true);
    expect(currentIntent().sprint).toBe(false);
  });
});
