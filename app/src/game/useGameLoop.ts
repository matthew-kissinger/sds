// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The frame loop. One accumulator, one sim, no game logic.
 *
 * spec/01: "In the client, useFrame's variable delta accumulates into fixed
 * 1/60 s steps (same accumulator the server uses). Variable dt never enters
 * `step`." FlockSim.step throws if handed anything but FIXED_DT, so this is the
 * only place variable time exists.
 *
 * Ordering: this subscribes at a negative render priority, so it runs before
 * every other useFrame in the tree (R3F sorts subscribers ascending and only
 * takes rendering into its own hands for priorities above zero). Renderers
 * therefore always read buffers the sim has already filled this frame.
 *
 * Backlog: a hidden tab, a stalled main thread, or a slow first frame can hand
 * us a delta worth seconds. We run at most MAX_STEPS_PER_FRAME ticks and then
 * drop the remainder rather than spiral-of-death catching up. Solo play is
 * client-local so dropping ticks is a skipped moment.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { FIXED_DT, TICK_HZ } from '@sim/tuning';
import { clearBark, currentIntent, NEUTRAL_INTENT, resolveSprintForTick, resetSprintExhaustion, type PlayerIntent } from '@app/input/intent';
import { useGameStore, type GamePhase } from '@app/state/store';

/** Ticks per frame ceiling. 5 covers a 12 fps frame; beyond that we drop time. */
const MAX_STEPS_PER_FRAME = 5;

/** Below zero so the sim steps before anything reads its buffers. */
const LOOP_PRIORITY = -1;

export function advancesSoloSimulation(gamePhase: GamePhase): boolean {
  return gamePhase !== 'paused' && gamePhase !== 'title';
}

export function useGameLoop(): void {
  const accumulator = useRef(0);
  // One stable array, one stable intent object: the loop allocates nothing.
  const inputs = useRef<Readonly<PlayerIntent>[]>([NEUTRAL_INTENT]);
  const inputSim = useRef(useGameStore.getState().sim);

  useFrame((_, delta) => {
    const store = useGameStore.getState();
    const sim = store.sim;
    if (inputSim.current !== sim) {
      inputSim.current = sim;
      resetSprintExhaustion();
    }
    const playing = store.gamePhase === 'playing';

    // Pause is a true simulation freeze. Reset the partial fixed-step so a
    // long pause cannot leak one stale remainder into the first resumed frame.
    if (!advancesSoloSimulation(store.gamePhase)) {
      accumulator.current = 0;
      inputs.current[0] = NEUTRAL_INTENT;
      return;
    }

    // The dog only answers to the player while a run is live. The title keeps
    // its presentation-only grazing, wool and field motion, but the gameplay
    // sim stays at tick zero so Play cannot replace a visibly drifted flock.
    // After completion the penned flock keeps running its calm settle behavior.
    inputs.current[0] = playing ? currentIntent() : NEUTRAL_INTENT;

    accumulator.current += delta;
    let steps = 0;
    while (accumulator.current >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      if (playing) resolveSprintForTick(sim.state.dogs[0]?.stamina ?? 0);
      sim.step(inputs.current, FIXED_DT);
      // A bark request is spent on the first tick that sees it, so one press is
      // one bark no matter how many ticks this frame folded in.
      if (inputs.current[0]!.bark) clearBark();
      accumulator.current -= FIXED_DT;
      steps += 1;
    }
    if (accumulator.current > FIXED_DT * MAX_STEPS_PER_FRAME) accumulator.current = 0;

    if (!playing) return;
    if (
      sim.acceptedBarkSerial > 0 &&
      sim.acceptedBarkSerial !== store.acceptedBark?.serial
    ) {
      const dog = sim.acceptedBarkDog;
      store.barkAccepted({
        serial: sim.acceptedBarkSerial,
        tick: sim.acceptedBarkTick,
        dog,
        x: sim.dogPositions[dog * 2]!,
        z: sim.dogPositions[dog * 2 + 1]!,
      });
    }
    if (sim.pennedCount !== store.pennedCount) store.sheepPenned(sim.pennedCount);
    if (sim.completed) store.complete((sim.tick * 1000) / TICK_HZ, sim.tick);
  }, LOOP_PRIORITY);
}
