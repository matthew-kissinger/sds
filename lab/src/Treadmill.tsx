// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Hold a key down so a gait can actually be watched.
 *
 * Animation review needs the dog trotting for a minute at one speed, or turning
 * steadily, which is not something you can hold by hand while also studying the
 * hocks.
 *
 * IT HOLDS KEYS, it does not write intent. The first version called
 * `setMoveDirection` directly and the dog never moved, for two reasons worth
 * keeping written down:
 *
 *  - ORDER. `IntentResolver` writes intent at priority -2 and `useGameLoop`
 *    steps the sim at -1, so a write from an ordinary component at priority 0
 *    lands after the sim has already read the frame, and is overwritten before
 *    the next one.
 *  - DETERMINISM. `conditionMove` rate-limits direction and speed between the
 *    devices and the sim precisely so `sim/` stays byte-identical for a given
 *    input sequence and the committed trace fixtures hold. Writing intent
 *    directly steps around it, which is exactly the "scripted runtime
 *    controller" `IntentResolver` says does not exist.
 *
 * Dispatching real key events on the bound codes keeps the whole path -
 * keyboard, basis, conditioner, intent, sim - so the dog in the lab moves as
 * the player's dog moves. It is also what the probes in `tools/` do.
 */

import { useEffect } from 'react';
import { useGameStore } from '@app/state/store';
import { useLabStore } from './labStore';

function press(code: string, type: 'keydown' | 'keyup'): void {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

export function Treadmill() {
  const walking = useLabStore((state) => state.walking);
  const sprinting = useLabStore((state) => state.sprinting);
  const turnRate = useLabStore((state) => state.turnRate);

  useEffect(() => {
    if (!walking) return;
    const bindings = useGameStore.getState().inputBindings;
    const held = [bindings.forward];
    if (sprinting) held.push(bindings.sprint);
    if (turnRate < 0) held.push(bindings.left);
    if (turnRate > 0) held.push(bindings.right);

    for (const code of held) press(code, 'keydown');
    // Releasing on cleanup is not tidiness: `held` in the keyboard module is a
    // set, and a keydown left unmatched would keep the dog running after the
    // treadmill was switched off.
    return () => {
      for (const code of held) press(code, 'keyup');
    };
  }, [walking, sprinting, turnRate]);

  return null;
}
