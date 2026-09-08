// SPDX-License-Identifier: AGPL-3.0-or-later
import { useGameStore } from '@app/state/store';

function keyLabel(code: string): string {
  if (code === 'ShiftLeft') return 'Left Shift';
  if (code === 'ShiftRight') return 'Right Shift';
  return code.replace(/^(Key|Digit)/, '');
}

/** A quiet reminder; binding changes render once, never on the frame loop. */
export function DesktopControls() {
  const bindings = useGameStore((state) => state.inputBindings);
  const movement = [bindings.forward, bindings.left, bindings.backward, bindings.right]
    .map(keyLabel).join(' ');
  return (
    <div className="herd-desktop-controls" role="group" aria-label="Keyboard controls">
      <span><kbd>{movement}</kbd> Move</span>
      <span><kbd>{keyLabel(bindings.bark)}</kbd> Bark</span>
      <span><kbd>{keyLabel(bindings.sprint)}</kbd> Sprint</span>
      <span><kbd>{keyLabel(bindings.camera)}</kbd> Camera</span>
      <span><kbd>Esc</kbd> Pause</span>
    </div>
  );
}
