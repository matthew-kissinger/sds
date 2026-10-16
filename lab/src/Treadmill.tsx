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
 *
 * IT ALSO HAS TO STEER, and that is the whole of why this file is longer than
 * one `useEffect`. A key is not a turn rate: the lab mounts no `CameraRig`, so
 * `cameraModeBlend` stays 0 and the basis is Classic's constant world forward,
 * +z - which points straight at the gate standing open at z = 100. Holding
 * `forward` therefore ran the dog off the north edge of the field in about
 * fourteen seconds, parked it in the pen, and sat it down, with the lab camera
 * following it out there. A treadmill whose subject leaves is not a treadmill.
 *
 * So the direction is chosen each frame from where the dog actually is, and
 * then expressed as the nearest of the eight compass points four movement keys
 * can describe. Straight shuttles back and forth across the field through the
 * flock; a held turn orbits it. Nothing but keys goes down: the conditioner
 * still decides how fast that direction may be taken up.
 */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore, type InputBindings } from '@app/state/store';
import { HOME_FIELD } from '@sim/field';
import { useLabStore } from './labStore';

/**
 * What the treadmill steers around: the middle of the flock's own ground, not
 * the middle of the field. The sheep spawn here, so the straight shuttle runs
 * through them and they break and run - which is the only way to watch a sheep
 * gait at all. It is also 80 m from the nearest fence, the margin every number
 * below is spent against.
 */
const HOME_X = HOME_FIELD.spawn.center.x;
const HOME_Z = HOME_FIELD.spawn.center.z;

/**
 * How far out the straight shuttle turns around, metres.
 *
 * 50 leaves 30 m of margin at the nearest fence. A reversal costs the dog that
 * margin: the conditioner's turn ceiling is 270 deg/s, so swinging 180 degrees
 * takes two thirds of a second, and at DOG_SPRINT_SPEED the dog covers 17 m of
 * it before the new heading is any use. The leg between two turnarounds is
 * about 100 m, which is twelve seconds of uninterrupted gait at a run.
 */
const TURN_BACK_RADIUS = 50;

/**
 * The circle a held turn orbits, metres.
 *
 * 35 m is a 25 deg/s turn at DOG_MAX_SPEED - a steady bank that can be studied,
 * well inside the conditioner's `A_LAT / v` ceiling at every speed, and a lap
 * every fifteen seconds.
 *
 * The aim is the tangent plus a radial term proportional to how wrong the
 * radius is, which is a control loop rather than a destination: on the circle
 * it is pure tangent, so the orbit is a fixed point rather than something the
 * dog keeps arriving at. The first version chased a point 60 degrees further
 * round the circle instead, and MEASURED a radius cycling between 11 m and
 * 27 m - the lead integrates the 22.5 degree key quantization below into a
 * radial error before any of it is corrected.
 */
const TURN_RADIUS = 35;

/**
 * How often the held keys are pressed again, seconds, whether or not the set
 * has changed.
 *
 * The set of codes this module believes are down is a cache of the one in
 * `keyboard.ts`, and the two come apart for reasons this file cannot enumerate:
 * `keyboard.ts` drops everything on blur and on tab-hide, and a hot update
 * leaves the replaced instance's keyup to land after the new one has already
 * recorded the key as held. Either way the diff below then sees no change and
 * never presses again - MEASURED as a dog standing still with KeyD down for
 * every one of 132 samples over 66 seconds, with the loop still rendering at
 * 13.9 ms, which is indistinguishable from the broken treadmill this file was
 * opened to fix. Re-asserting heals any of it within a quarter second, and a
 * movement keydown that is already held costs `onKeyDown` a set insert.
 */
const REASSERT_PERIOD = 0.25;

/**
 * sin(22.5 deg): half the width of one of the eight directions four keys can
 * describe. A desired bearing within this of an axis drops that key, so the
 * eight points are reached at the right boundaries rather than the diagonals
 * swallowing the axes.
 */
const OCTANT = Math.sin(Math.PI / 8);

function press(code: string, type: 'keydown' | 'keyup'): void {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

/**
 * The movement keys whose sum points nearest a world direction.
 *
 * `worldFromAxis` maps the screen's right to `cross(forward, up)`, which under
 * Classic's +z forward is world -x. So the key that reads as LEFT on screen
 * walks the dog toward +x, and the inversion here is the same correct framing
 * `tests/input-axis.spec.ts` pins, not a sign slip.
 */
function keysToward(
  dx: number,
  dz: number,
  bindings: InputBindings,
  out: Set<string>,
): void {
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return;
  const x = dx / length;
  const z = dz / length;
  if (z > OCTANT) out.add(bindings.forward);
  else if (z < -OCTANT) out.add(bindings.backward);
  if (x > OCTANT) out.add(bindings.left);
  else if (x < -OCTANT) out.add(bindings.right);
}

export function Treadmill() {
  const walking = useLabStore((state) => state.walking);
  const sprinting = useLabStore((state) => state.sprinting);
  const turnRate = useLabStore((state) => state.turnRate);

  const held = useRef<Set<string>>(new Set());
  const want = useRef<Set<string>>(new Set());
  /** Seconds until the held keys are pressed again regardless. */
  const reassert = useRef(0);
  /** The bearing the straight shuttle is carrying across the field. */
  const aimX = useRef(0);
  const aimZ = useRef(1);

  // Ahead of `IntentResolver` at -2, so the keys this frame chooses are the
  // keys this frame's intent is built from and the sim steps on at -1. At
  // priority 0 the whole loop would run a frame behind itself.
  useFrame((_state, delta) => {
    const next = want.current;
    next.clear();

    if (walking) {
      const state = useGameStore.getState();
      const { sim } = state;
      const x = sim.dogPositions[0] ?? HOME_X;
      const z = sim.dogPositions[1] ?? HOME_Z;
      const outX = x - HOME_X;
      const outZ = z - HOME_Z;

      const radius = Math.hypot(outX, outZ);

      if (turnRate !== 0) {
        // Tangent, plus however much of the radius is wrong. Rotating the
        // outward radial counter-clockwise in the x-z plane puts the centre on
        // the dog's right, which is what the right key asks for.
        const unitX = radius > 1e-3 ? outX / radius : 1;
        const unitZ = radius > 1e-3 ? outZ / radius : 0;
        const turn = Math.sign(turnRate);
        const pull = Math.max(-1, Math.min(1, (TURN_RADIUS - radius) / TURN_RADIUS));
        aimX.current = -unitZ * turn + unitX * pull;
        aimZ.current = unitX * turn + unitZ * pull;
      } else if (radius > TURN_BACK_RADIUS) {
        // Turn around. Re-aimed every frame while out here, so the heading keeps
        // correcting through the swing; once back inside, the bearing is carried
        // and the dog crosses the field dead straight and runs out the far side.
        aimX.current = -outX;
        aimZ.current = -outZ;
      }

      keysToward(aimX.current, aimZ.current, state.inputBindings, next);
      if (sprinting) next.add(state.inputBindings.sprint);
    }

    // Releases come off the cache, which is the only record of what to let go
    // of. Presses are re-asserted on `REASSERT_PERIOD` rather than only on a
    // change, which is what makes a desynced cache heal instead of stranding
    // the dog.
    reassert.current -= delta;
    const refresh = reassert.current <= 0;
    if (refresh) reassert.current = REASSERT_PERIOD;

    for (const code of held.current) {
      if (!next.has(code)) {
        press(code, 'keyup');
        held.current.delete(code);
      }
    }
    for (const code of next) {
      if (refresh || !held.current.has(code)) {
        press(code, 'keydown');
        held.current.add(code);
      }
    }
  }, -3);

  // Releasing on unmount is not tidiness: `held` in the keyboard module is a
  // set, and a keydown left unmatched would keep the dog running after the
  // treadmill was gone.
  useEffect(() => () => {
    for (const code of held.current) press(code, 'keyup');
    held.current.clear();
  }, []);

  return null;
}
