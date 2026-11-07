// SPDX-License-Identifier: AGPL-3.0-or-later
import { useTouchPresent } from '@app/input/touchPresent';
import { useGameStore } from '@app/state/store';
import { useT, type Translate } from '@app/i18n/store';

function keyLabel(code: string, t: Translate): string {
  if (code === 'ShiftLeft') return t('key.shiftLeft');
  if (code === 'ShiftRight') return t('key.shiftRight');
  if (code === 'Space') return t('key.space');
  return code.replace(/^(Key|Digit)/, '');
}

/** A quiet reminder; binding changes render once, never on the frame loop. */
export function DesktopControls() {
  // Complementary to the touch stick, from the same answer rather than from a
  // stylesheet rule that has to be kept in step with it by hand. A phone has
  // no keys to be reminded of, and the reminder sits exactly where the stick's
  // resting position is.
  const t = useT();
  const touch = useTouchPresent();
  const bindings = useGameStore((state) => state.inputBindings);
  const movement = [bindings.forward, bindings.left, bindings.backward, bindings.right]
    .map((code) => keyLabel(code, t)).join(' ');
  if (touch) return null;
  return (
    <div className="herd-desktop-controls" role="group" aria-label={t('keys.group')}>
      <span><kbd>{movement}</kbd> {t('keys.move')}</span>
      <span><kbd>{keyLabel(bindings.bark, t)}</kbd> {t('keys.bark')}</span>
      <span><kbd>{keyLabel(bindings.sprint, t)}</kbd> {t('keys.sprint')}</span>
      <span><kbd>{keyLabel(bindings.walk, t)}</kbd> {t('keys.walk')}</span>
      <span><kbd>{keyLabel(bindings.camera, t)}</kbd> {t('keys.camera')}</span>
      <span><kbd>{keyLabel(bindings.timer, t)}</kbd> {t('keys.timer')}</span>
      <span><kbd>Esc</kbd> {t('keys.pause')}</span>
    </div>
  );
}
