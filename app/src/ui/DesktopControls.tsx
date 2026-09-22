// SPDX-License-Identifier: AGPL-3.0-or-later
import { useTouchPresent } from '@app/input/touchPresent';
import { useGameStore } from '@app/state/store';

function keyLabel(code: string): string {
  if (code === 'ShiftLeft') return 'Left Shift';
  if (code === 'ShiftRight') return 'Right Shift';
  return code.replace(/^(Key|Digit)/, '');
}

/** A quiet reminder; binding changes render once, never on the frame loop. */
export function DesktopControls() {
  // Complementary to the touch stick, from the same answer rather than from a
  // stylesheet rule that has to be kept in step with it by hand. A phone has
  // no keys to be reminded of, and the reminder sits exactly where the stick's
  // resting position is.
  const touch = useTouchPresent();
  const bindings = useGameStore((state) => state.inputBindings);
  const movement = [bindings.forward, bindings.left, bindings.backward, bindings.right]
    .map(keyLabel).join(' ');
  if (touch) return null;
  return (
    <div className="herd-desktop-controls" role="group" aria-label="Keyboard controls">
      <span><kbd>{movement}</kbd> Move</span>
      <span><kbd>{keyLabel(bindings.bark)}</kbd> Bark</span>
      <span><kbd>{keyLabel(bindings.sprint)}</kbd> Sprint</span>
      <span><kbd>{keyLabel(bindings.walk)}</kbd> Hold to walk</span>
      <span><kbd>{keyLabel(bindings.camera)}</kbd> Camera</span>
      <span><kbd>Esc</kbd> Pause</span>
    </div>
  );
}
