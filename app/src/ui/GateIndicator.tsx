// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef } from 'react';
import { useGameStore } from '@app/state/store';

export function GateIndicator() {
  const anchor = useRef<HTMLDivElement>(null);
  const distance = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let previousCue = useGameStore.getState().gateIndicator;
    let previousPhase = '';
    const update = () => {
      const state = useGameStore.getState();
      const cue = state.gateIndicator;
      if (cue === previousCue && state.gamePhase === previousPhase) return;
      previousCue = cue;
      previousPhase = state.gamePhase;
      const node = anchor.current;
      if (!node) return;
      node.hidden = !cue || state.gamePhase !== 'playing' || (cue.onScreen && !cue.obscured);
      if (!cue) return;
      node.style.transform = `translate(${cue.x}px, ${cue.y}px) translate(-50%, -100%)`;
      node.style.setProperty('--gate-angle', `${cue.angle}rad`);
      node.dataset.onscreen = String(cue.onScreen);
      node.dataset.obscured = String(cue.obscured);
      if (distance.current) distance.current.textContent = `${cue.distance} m`;
    };
    update();
    return useGameStore.subscribe(update);
  }, []);
  return <div ref={anchor} className="herd-gate-cue" hidden aria-label="Direction to gate">
    <svg className="herd-gate-cue__arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12h15M13 5l7 7-7 7" />
    </svg>
    <span>Gate</span><span ref={distance} className="herd-gate-cue__distance" />
  </div>;
}
