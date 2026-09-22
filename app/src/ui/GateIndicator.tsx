// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef } from 'react';
import { useGameStore } from '@app/state/store';

/**
 * The cue is an instrument, not a label: a sheer paper dial with one needle on
 * a pin, and a fine arc on the rim that closes as the dog closes on the gate.
 *
 * There is no word and no metres. The badge it replaces carried both, and at a
 * 148 px width sitting a fifth of the way into the field for 85% of a turn it
 * was the largest permanent thing on a phone screen. Distance is drawn on the
 * rim instead, which is the reading a runner actually wants - closing or not -
 * without asking them to parse a number while steering.
 *
 * Exactly ONE shape on the token points. A balanced compass needle, with its
 * hollow tail past the pivot, and a four-point rose both failed the only test
 * that matters at 44 px: at a glance you must not have to work out which end is
 * the tip. So the needle is a single lance, widest on the pivot line, with a
 * rounded heel that stops just below it and nothing tapering the other way.
 *
 * This component owns only what changes at human speed, which is now just
 * whether the cue exists at all. Position, needle angle, presence and the rim
 * arc are camera-driven and written per frame by GateGuidance.
 */

/** Eight graduations. Marks on the rim - no taper, so none of them is a point. */
const DIAL = 15.5;
const MARKS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4, sx = Math.sin(a), sy = -Math.cos(a);
  const inner = DIAL - 2.6, outer = DIAL - 0.6;
  return `M${(22 + sx * inner).toFixed(2)} ${(22 + sy * inner).toFixed(2)}`
    + `L${(22 + sx * outer).toFixed(2)} ${(22 + sy * outer).toFixed(2)}`;
}).join('');

export function GateIndicator() {
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let shown: boolean | null = null;
    const update = () => {
      const state = useGameStore.getState();
      const live = state.gateIndicator !== null && state.gamePhase === 'playing';
      if (live === shown) return;
      shown = live;
      const node = anchor.current;
      if (node) node.hidden = !live;
    };
    update();
    return useGameStore.subscribe(update);
  }, []);
  return <div ref={anchor} className="herd-gate-cue" hidden aria-label="Direction to gate">
    <svg viewBox="0 0 44 44" aria-hidden="true" focusable="false">
      <circle className="herd-gate-cue__dial" cx="22" cy="22" r={DIAL} />
      <path className="herd-gate-cue__marks" d={MARKS} />
      {/* pathLength normalises the rim to 1, so the dash is the closeness
          itself and no circumference has to be restated in the stylesheet. */}
      <circle className="herd-gate-cue__range" cx="22" cy="22" r="19"
        pathLength="1" transform="rotate(-90 22 22)" />
      <path className="herd-gate-cue__needle" d="M22 8.8L25.5 22.6Q22 25.4 18.5 22.6Z" />
      <circle className="herd-gate-cue__pin" cx="22" cy="22" r="2.1" />
      <circle className="herd-gate-cue__hub" cx="22" cy="22" r="0.9" />
    </svg>
  </div>;
}
