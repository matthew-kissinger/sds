// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The camera the player gets, rather than the camera a module produces.
 *
 * This file exists because a blocker shipped past a full suite.
 * `camera-rotation-cap` holds `followFraming` to 25 deg/s at every frame rate,
 * on adversarial input, to twelve decimal places, and `camera-framing` pins the
 * geometry around it - and both measure `framing.bearing`, which is one term of
 * a pose that is then blended with Classic's, orbited toward the Studio, pulled
 * back on completion, held inside the frame's budget and handed to `lookAt`.
 * The composed view flipped half a turn in a single frame while every one of
 * those assertions stayed green.
 *
 * So the subject here is `camera.getWorldDirection()` and the camera's own right
 * vector, sampled after the whole pipeline, and the properties are the ones a
 * player would report:
 *
 *  - the view turns no faster than THE ONE budget that governs it,
 *  - it is never faster with Reduce motion on than with it off,
 *  - the view never comes near vertical. This is the assertion whose absence let
 *    the blocker through: within a few degrees of straight down, `up x forward`
 *    goes to zero, `lookAt` falls back on a nudge, and the horizon rolls,
 *  - the horizon stays level and does not spin,
 *  - and both ends of the swap are the framings themselves, exactly.
 *
 * ONE BUDGET, NOT A SUM OF CEILINGS. The bound above used to be assembled here
 * out of every stage's own ceiling added together, because that was the honest
 * bound on a rig where each stage capped itself against its own reference: a
 * total that exceeded every individual ceiling was the arithmetic working, not
 * a defect, and the number grew every time a path was added. `viewBudget` now
 * opens one allowance per frame against the pose the camera actually committed
 * to, every stage resolves its weight against that, and the commit clamps the
 * composed direction. So there is one number here, MODE_MAX_TURN_RATE, and a
 * stage added later cannot raise it.
 *
 * SIX PATHS REACH A NEAR-VERTICAL VIEW, AND THIS FILE ONCE DROVE ONE. That is
 * the same shape of gap as the one two paragraphs up, taken again: the sweep
 * asserted VERTICAL_FLOOR only over the mode blend, where nothing was ever in
 * danger, so the assertion read as a pass on a property it was not testing.
 * Every case below drives one of the six:
 *
 *   mode blend       Classic <-> Follow, `follow` on a leg,
 *   Studio blend     entering and leaving Customize, `panel`,
 *   Studio framing   a tab click, a preset click or an orbit drag INSIDE the
 *                    panel, where the Studio blend is settled at 1 and is not
 *                    resolving anything - the fifth singularity lived here and
 *                    the harness could not express it,
 *   `followCarry`    a re-armed Follow bearing, from `simChanged` or from the
 *                    player's own re-aim - the camera key twice, which at the
 *                    `off` end stop is the whole of their camera authority,
 *   completion in    the end-of-run pull-back being entered,
 *   completion out   and being left, which is the commonest transition in the
 *                    game: finish a run, press restart.
 *
 * `helpers/composedCamera` drives the shipped `composedRig` rather than a copy
 * of it, and carries the store's own Customize actions so the Studio states
 * below are ones the panel can actually reach. Its header carries what it still
 * does not cover.
 *
 * ONE ASSERTION IN THIS FILE IS RED, ON ALL THREE TURNING PROFILES, AND IT IS
 * THE RIG THAT IS WRONG. Reduce motion makes the restart out of the completion
 * phase FASTER than it is with the setting off - 49.0 deg/s against 26.7 at the
 * `off` end stop - because the pull-back's translation is zero under Reduce
 * motion, so the camera holds the pose the phase was entered on and has further
 * to come back at the exit. The cause is in `composedRig`'s completion block,
 * which is not this file. The assertion carries the measurements and says why
 * it is not being slackened to pass.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { HOME_FIELD } from '@sim/field';
import type { Dog } from '@sim/types';
import type { DogCameraAngle } from '@app/camera/customizeFraming';
import type { FollowTurning } from '@app/camera/followFraming';
import { MODE_BLEND_SECONDS, MODE_MAX_TURN_RATE } from '@app/camera/feel';
import {
  createComposedCamera,
  type ComposedOptions,
  type CustomizeTab,
  type SheepLike,
} from './helpers/composedCamera';

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Seconds a Classic <-> Follow swap takes with Reduce motion on, which is what
 * the rig scales the frame's rotation allowance by. 1.2 s.
 *
 * Restated as a literal rather than imported. It is private to `composedRig`,
 * and a test that read the value the rig reads could not fail if that value
 * were wrong - which is the whole failure this file is written against.
 */
const REDUCED_MODE_BLEND_SECONDS = 1.2;

/**
 * Slack on the composed rotation budget, rad/s. 0.5 deg/s.
 *
 * `viewBudget.commit` resolves the clamp by proportional backoff, because the
 * turn is not linear in the factor, and it stops at eight passes whether or not
 * the residue has gone. The carries resolve the same way in three. This is what
 * that residue is allowed to be, and it covers both.
 *
 * Measured this round over every case below at 30, 60 and 144 Hz on all three
 * turning profiles, the composed view peaks at 90.0000 deg/s against a 90 deg/s
 * budget and 60.0000 against the 60 that Reduce motion scales it to. Where a
 * carry's own 25 deg/s is what binds instead, the peak is 25.0002. So the
 * residue runs to 2e-4 deg/s, and this is three orders of magnitude of headroom
 * rather than a tuned figure.
 */
const BUDGET_SLACK = 0.5 * DEG;

/**
 * The rate a carry pays a step back at, rad/s. MAX_FOLLOW_YAW_RATE, 25 deg/s.
 *
 * Restated as a literal, like every other ceiling in this file. `followCarry`
 * and `completionCarry` are both built with it, so a test that imported it
 * could not fail if it were wrong.
 */
const CARRY_RATE = 25 * DEG;

/**
 * How near vertical the composed view may come, rad. 30 degrees.
 *
 * Measured worst over every case below, on all three turning profiles and with
 * Reduce motion both ways, is 45.000 degrees off straight down: the completion
 * pull-back at the south end in Follow, which is `COMPLETION_MIN_NADIR` doing
 * its one job and sitting exactly on its own bound. The three completion exits
 * come next at 45.007 to 45.023, and nothing else in the file - no swap, no
 * Studio tab, no preset, no flick, no re-arm - comes nearer than 45.102, which
 * is Classic's own settled pitch. So the Studio is never what binds this.
 *
 * The floor is set well under every one of those on purpose. The framing
 * numbers are art direction and the plan expects them to move; degeneracy is
 * not art direction, and this is the line that must hold whatever the rig
 * looks like.
 */
const VERTICAL_FLOOR = 30 * DEG;

/** Float slack on the roll, rad. The right vector of a y-up `lookAt` is exactly
 *  horizontal by construction, so the measured worst is 2.8e-16 rad. */
const ROLL_SLACK = 1e-9;

/**
 * Slack on the Reduce motion view comparison, rad/s. 2e-5, which is 1.1e-3 deg/s.
 *
 * The two runs are separate rigs over separate float paths, so a law resolved
 * twice agrees to a few ulps rather than exactly. That alone would justify
 * 1e-6. Both terms below are larger, and what they are sized for CHANGED when
 * Reduce motion stopped clamping the turning to the `off` end stop.
 *
 * It used to pin Follow's bearing, which made the two runs structurally
 * different: a re-arm handed the carry a bigger step, the carry unwound it at
 * the same capped rate for longer, and somewhere in the settling tail one run
 * was still turning after the other had stopped. Every residual was therefore
 * near zero, both runs' rates rounded to 0.000 deg/s, and an ABSOLUTE floor was
 * the right shape for it.
 *
 * Reduce motion now clamps to the slowest profile that still TRACKS, because
 * pinning the bearing also pinned the movement basis and took held-thumb
 * steering away from players who never chose the setting. The consequence here
 * is that on `gentle` and `off` the two runs now resolve the SAME turning
 * profile, differing only in blend length and budget scale, so the comparison
 * is between two live trajectories both turning at around 14.83 deg/s rather
 * than between one that turns and one that does not. Float divergence between
 * two long, nearly-identical curves scales with the rate they are running at,
 * so an absolute-only floor is the wrong shape: measured worst residual is
 * 4.36e-3 deg/s against rates of 14.826 and 14.831, which is 2.9e-4 of the
 * rate and invisible - one degree of accumulated difference every four minutes.
 *
 * Hence both terms. The floor still covers the near-zero tail the old mechanism
 * left. The relative term covers divergence proportional to the rate, at 1e-3,
 * which is three times the largest measured residual and still 0.015 deg/s at a
 * full 14.83. Neither can absorb anything a player could see: the breach this
 * assertion was written against was 22.3 deg/s, and the relative term would
 * have to be 1.5 rather than 1e-3 to hide it.
 */
const MONOTONE_SLACK = 2e-5;
const MONOTONE_RELATIVE = 1e-3;

function makeDog(x: number, z: number): Dog {
  return {
    position: { x, z },
    velocity: { x: 0, z: 0 },
    heading: { x: 0, z: 1 },
  } as unknown as Dog;
}

interface MutableSheep {
  position: { x: number; z: number };
}

/**
 * A deterministic flock for the Studio's flock and sheep tabs, drifting, so the
 * centre the flock tab frames and the member the sheep tab frames are both
 * moving rather than pinned. Two rings, so a sheep selection is a real step
 * across the pasture rather than a nudge along one circle.
 */
function makeFlock(count: number): MutableSheep[] {
  const sheep: MutableSheep[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2;
    const radius = i % 2 === 0 ? 7 : 19;
    sheep.push({
      position: { x: Math.sin(angle) * radius, z: -30 + Math.cos(angle) * radius },
    });
  }
  return sheep;
}

/** Metres per second the whole flock drifts, on a fixed heading. */
const FLOCK_DRIFT = 1.5;

/** One leg of a script: a store state, held for a number of seconds. */
interface Leg {
  follow: boolean;
  complete?: boolean;
  /**
   * What the panel does on this leg's first frame. 'open' runs the store's
   * `openCustomize`, which resets the tab to 'dog', the preset to 'hero' and
   * the orbit to zero - there is no other way into the panel, so there is no
   * such thing as entering it already orbited. 'hold' leaves it open, 'close'
   * shuts it, and omitting it changes nothing.
   */
  panel?: 'open' | 'hold' | 'close';
  /** Click a tab on the first frame. RESETS THE ORBIT, as the store does. */
  tab?: CustomizeTab;
  /** Click a dog preset on the first frame. Resets the orbit too. */
  preset?: DogCameraAngle;
  /** The sheep tab's arrows. No reset; the store has none here. */
  selectSheep?: number;
  /** Orbit by this much on the first frame: one pointer event's worth. A
   *  number is radians, 'swept' is the scenario's own orbit angle. */
  flick?: number | 'swept';
  /** Orbit at this rate for the whole leg, rad/s: a sustained drag. */
  drag?: number;
  /** Replace the sim on this leg's first frame: a run start or reset. */
  simChanged?: boolean;
  /** Put the dog back at its spawn on that frame, the way a reset does. */
  respawn?: boolean;
  /** Turn the dog's direction of travel by the swept angle on that frame. */
  reAim?: boolean;
  /** Report this leg's frames separately, for a test about one transition. */
  watch?: boolean;
  seconds: number;
}

interface Metrics {
  /** Worst view rotation between consecutive frames, rad/s. */
  view: number;
  /** Worst rotation of the camera's right vector, rad/s. The horizon. */
  horizon: number;
  /** Closest the view came to either pole, rad. */
  vertical: number;
  /** Worst roll: the right vector's angle off horizontal, rad. */
  roll: number;
  /** `view`, over the frames of legs marked `watch` and the frame that enters
   *  the first of them. Zero when the scenario marks none. */
  watchedView: number;
  /** Total view rotation over those same frames, rad. */
  watchedRotation: number;
}

/** The dog's ground speed through every script, m/s. A committed run. */
const SPEED = 15;

/**
 * Drive the composed camera through a scenario and report its worst frame. The
 * dog runs at `SPEED` on `bearing`, turning at the scenario's `spin`; a leg
 * marked `reAim` steps the dog's direction by `turn`, which is how the gap
 * between an armed bearing and a re-armed one is swept, and a leg with a
 * `flick` of 'swept' orbits the Studio by `orbit`, which is how the gap between
 * where a player dragged to and the zero a click resets them to is swept.
 */
function drive(
  hz: number,
  bearing: number,
  orbit: number,
  turn: number,
  scenario: Scenario,
  options: ComposedOptions,
): Metrics {
  const dt = 1 / hz;
  const rig = createComposedCamera({ startInFollow: false, ...options });
  const start = scenario.start ?? { x: 0, z: 0 };
  const dog = makeDog(start.x, start.z);
  const sheep = makeFlock(scenario.flock ?? 25);
  const direction = new THREE.Vector3();
  const right = new THREE.Vector3();
  const lastDirection = new THREE.Vector3();
  const lastRight = new THREE.Vector3();
  const worst: Metrics = {
    view: 0, horizon: 0, vertical: Math.PI, roll: 0, watchedView: 0, watchedRotation: 0,
  };
  let first = true;
  let elapsed = 0;
  let heading = bearing;

  for (const leg of scenario.legs) {
    if (leg.reAim) heading += turn;
    if (leg.respawn) {
      dog.position.x = HOME_FIELD.dogSpawn.x;
      dog.position.z = HOME_FIELD.dogSpawn.z;
    }
    if (leg.panel === 'open') rig.openCustomize();
    if (leg.tab !== undefined) rig.setTab(leg.tab);
    if (leg.preset !== undefined) rig.setDogAngle(leg.preset);
    if (leg.selectSheep !== undefined) rig.selectSheep(leg.selectSheep);
    if (leg.flick !== undefined) rig.orbitBy(leg.flick === 'swept' ? orbit : leg.flick);
    const customize = leg.panel === undefined ? undefined : leg.panel !== 'close';

    const frames = Math.max(1, Math.round(leg.seconds * hz));
    for (let frame = 0; frame < frames; frame += 1) {
      if (leg.drag !== undefined) rig.orbitBy(leg.drag * dt);
      const angle = heading + scenario.spin * elapsed;
      dog.velocity.x = Math.sin(angle) * SPEED;
      dog.velocity.z = Math.cos(angle) * SPEED;
      dog.heading.x = Math.sin(angle);
      dog.heading.z = Math.cos(angle);
      dog.position.x += dog.velocity.x * dt;
      dog.position.z += dog.velocity.z * dt;
      for (const one of sheep) one.position.z += FLOCK_DRIFT * dt;
      rig.frame({
        dt,
        dog,
        follow: leg.follow,
        complete: leg.complete,
        customize,
        simChanged: leg.simChanged === true && frame === 0,
        sheep: sheep as readonly SheepLike[],
      });

      rig.camera.getWorldDirection(direction);
      const basis = rig.camera.matrixWorld.elements;
      right.set(basis[0]!, basis[1]!, basis[2]!).normalize();
      const fromUp = direction.angleTo(UP);
      worst.vertical = Math.min(worst.vertical, fromUp, Math.PI - fromUp);
      worst.roll = Math.max(worst.roll, Math.abs(Math.asin(Math.max(-1, Math.min(1, right.y)))));
      if (!first) {
        const turned = lastDirection.angleTo(direction);
        worst.view = Math.max(worst.view, turned / dt);
        worst.horizon = Math.max(worst.horizon, lastRight.angleTo(right) / dt);
        if (leg.watch) {
          worst.watchedView = Math.max(worst.watchedView, turned / dt);
          worst.watchedRotation += turned;
        }
      }
      first = false;
      lastDirection.copy(direction);
      lastRight.copy(right);
      elapsed += dt;
    }
  }
  return worst;
}

/**
 * Follow bearings to swap at. The orbit sweep the mode blend has to cover is
 * exactly the Follow bearing, because Classic stands due south of its own aim,
 * so PI here is the half-turn case: a dog running straight down-field, the eye
 * required to travel the whole way around it. The near misses are the ones that
 * matter as much - either side of PI the shortest arc changes sign, and a rig
 * that resolved that with a Cartesian lerp would put the eye through the subject.
 */
const BEARINGS = [
  0, 0.5, 1.5, 2.9, -0.7, -2.0,
  Math.PI,
  Math.PI - 1e-9, Math.PI + 1e-9,
  Math.PI - 1e-4, Math.PI + 1e-4,
  Math.PI - 0.01, Math.PI + 0.01,
  Math.PI - 0.2, Math.PI + 0.2,
];

/** Six of them, for the cases that sweep a second angle on top. */
const FEW_BEARINGS = [0, 1.5, -2.0, Math.PI, Math.PI - 0.01, Math.PI + 0.2];

/**
 * Three of them, for the cases where the Follow bearing cannot reach the
 * picture: Classic is world-locked and stands due south of its own aim whatever
 * the dog is doing, so at weight zero the only angle that moves the geometry is
 * the Studio's own.
 */
const SPOT_BEARINGS = [0, Math.PI, -2.0];

/** Every orbit angle at five degrees, plus the two the Studio is authored at.
 *  The blocker's own figure is why the resolution is this fine: the Cartesian
 *  entry passed 0.158 degrees from straight down on 63 of 360 exit angles, so a
 *  coarse sweep can miss a band that a player cannot. */
const ORBITS_FINE = [
  ...Array.from({ length: 72 }, (_, i) => -Math.PI + (i * Math.PI) / 36),
  0.35, -0.35,
];

/** Every orbit angle at fifteen degrees. */
const ORBITS = [
  ...Array.from({ length: 24 }, (_, i) => -Math.PI + (i * Math.PI) / 12),
  0.35,
];

/** Every orbit angle at thirty degrees, for the cases that also carry a mode
 *  blend and so cost twice as much to run. */
const ORBITS_COARSE = [
  ...Array.from({ length: 12 }, (_, i) => -Math.PI + (i * Math.PI) / 6),
  0.35,
];

/**
 * How far the dog's direction of travel has moved by the time the bearing is
 * re-armed. PI is the case the carry exists for: an armed bearing and a
 * re-armed one exactly opposed, which is a half-turn orbit and the longest
 * recovery there is. The near misses are here for the same reason they are in
 * BEARINGS - either side of PI the shortest arc changes sign.
 */
const RE_AIMS = [
  0, 0.4, 1.0, 1.9, -0.7, -1.6, -2.5,
  Math.PI, Math.PI - 0.01, Math.PI + 0.01,
];

/** Four of them, for the cases that are already the product of two sweeps. */
const FEW_RE_AIMS = [0, 1.9, Math.PI, -2.5];

const RATES = [30, 60, 144];

/**
 * Milliseconds each sweep is given. One sweep is every case at every rate at
 * every angle it carries; the vertical assertion runs three of them and the
 * Reduce motion comparison runs six. Generous rather than tuned, because a
 * timeout that binds would turn a slow machine into a failing suite.
 */
const SWEEP_TIMEOUT = 300_000;

/**
 * The swap, both ways, and the things a player does to it: turn while it runs,
 * change their mind halfway through, open the Studio on top of it, click round
 * the Studio's tabs and presets, drag its orbit, reset the run underneath it,
 * re-aim the camera by hand, finish, and start again. The dog turns at 0.6
 * rad/s in the turning cases, which walks the Follow bearing across the opposed
 * line while a blend is in flight - the one moment the shortest arc would flip.
 */
interface Scenario {
  name: string;
  spin: number;
  legs: readonly Leg[];
  options?: ComposedOptions;
  /** Where the dog starts. The default is the middle of the field. */
  start?: { x: number; z: number };
  /** Sheep in the pasture. Only the Studio's flock and sheep tabs read them,
   *  and the flock tab's stand-off steps at 50 and at 100. */
  flock?: number;
  bearings?: readonly number[];
  orbits?: readonly number[];
  reAims?: readonly number[];
}

const CASES: Scenario[] = [
  {
    name: 'straight swap out and back',
    spin: 0,
    legs: [{ follow: false, seconds: 1.5 }, { follow: true, seconds: 3.5 },
      { follow: false, seconds: 3.5 }],
  },
  {
    name: 'swapping while the dog turns',
    spin: 0.6,
    legs: [{ follow: false, seconds: 1.5 }, { follow: true, seconds: 5 },
      { follow: false, seconds: 5 }],
  },
  {
    name: 'toggled again mid-swap',
    spin: 0.6,
    legs: [{ follow: false, seconds: 1.5 }, { follow: true, seconds: 0.6 },
      { follow: false, seconds: 0.6 }, { follow: true, seconds: 3.5 }],
  },
  {
    name: 'toggled again immediately',
    spin: 0.2,
    legs: [{ follow: false, seconds: 1.5 }, { follow: true, seconds: 0.1 },
      { follow: false, seconds: 0.1 }, { follow: true, seconds: 3.5 }],
  },
  {
    name: 'completing mid-swap',
    spin: 0.5,
    legs: [{ follow: false, seconds: 1 }, { follow: true, seconds: 0.35 },
      { follow: true, complete: true, seconds: 5 }],
  },
  {
    name: 'portrait',
    spin: 0.6,
    legs: [{ follow: false, seconds: 1.5 }, { follow: true, seconds: 5 },
      { follow: false, seconds: 5 }],
    options: { width: 390, height: 844 },
  },

  // --- the Studio blend -----------------------------------------------------
  {
    // The shipped entry path and the one the blocker was found on: the title
    // screen, Classic, the hero angle. The panel ALWAYS opens at orbit zero -
    // `openCustomize` is the only route to `uiPanel === 'customize'` and it
    // resets - so what the fine sweep covers here is the EXIT: the player drags
    // round to an arbitrary bearing and then closes the panel, and Classic
    // stands due south of its own aim, so the two are opposed once per turn.
    // The version of this case before this round held the orbit constant for
    // the whole script, which gave the exit the same coverage and gave the
    // entry coverage of a state the store cannot produce.
    name: 'Customize opened and left from Classic',
    spin: 0,
    legs: [{ follow: false, seconds: 1 }, { follow: false, panel: 'open', seconds: 2 },
      { follow: false, panel: 'hold', flick: 'swept', seconds: 2 },
      { follow: false, panel: 'close', seconds: 2.5 }],
    bearings: SPOT_BEARINGS,
    orbits: ORBITS_FINE,
  },
  {
    // The other entry: a player already in Follow opens the panel. Here the
    // gameplay bearing is the dog's, so both angles move.
    name: 'Customize opened and left from Follow',
    spin: 0.6,
    legs: [{ follow: true, seconds: 2 }, { follow: true, panel: 'open', seconds: 2 },
      { follow: true, panel: 'hold', flick: 'swept', seconds: 2 },
      { follow: true, panel: 'close', seconds: 2.5 }],
    options: { startInFollow: true },
    bearings: FEW_BEARINGS,
    orbits: ORBITS,
  },
  {
    // Entered 0.25 s into a Classic -> Follow swap, so the Studio blend seats on
    // a gameplay pose that is itself mid-orbit and still moving.
    name: 'Customize entered during a mode blend',
    spin: 0.6,
    legs: [{ follow: false, seconds: 1 }, { follow: true, seconds: 0.25 },
      { follow: true, panel: 'open', seconds: 1.5 },
      { follow: true, panel: 'hold', flick: 'swept', seconds: 1.5 },
      { follow: true, panel: 'close', seconds: 2.5 }],
    bearings: FEW_BEARINGS,
    orbits: ORBITS_COARSE,
  },
  {
    // And left into one: the panel closes on the same frame the camera key is
    // pressed, so both blends run against each other for the whole exit.
    name: 'Customize left into a mode blend',
    spin: 0.6,
    legs: [{ follow: false, seconds: 1 }, { follow: false, panel: 'open', seconds: 1.5 },
      { follow: false, panel: 'hold', flick: 'swept', seconds: 1.5 },
      { follow: true, panel: 'close', seconds: 3 }, { follow: true, seconds: 2 }],
    bearings: FEW_BEARINGS,
    orbits: ORBITS_COARSE,
  },

  // --- inside the Studio, where the blend is settled and is not resolving ---
  {
    // THE FIFTH SINGULARITY'S OWN PATH, which the harness could not express
    // before this round: it pinned the tab to 'dog' and had no notion of the
    // reset. A tab click moves the Studio pose between three subjects whose
    // stand-offs are 5 m, 4.6 m and 18 m and whose bearings differ by whatever
    // the player had dragged to, AND zeroes the orbit in the same frame. The
    // Studio blend is settled at 1 throughout, so it resolves nothing: the only
    // thing between that step and the screen is `customizeFraming`'s own ease,
    // which is polar now, and the frame's budget.
    name: 'the Studio tab clicks',
    spin: 0,
    legs: [{ follow: false, seconds: 1 }, { follow: false, panel: 'open', seconds: 1.5 },
      { follow: false, panel: 'hold', flick: 'swept', seconds: 1.5 },
      { follow: false, panel: 'hold', tab: 'flock', seconds: 2 },
      { follow: false, panel: 'hold', flick: 'swept', seconds: 1.5 },
      { follow: false, panel: 'hold', tab: 'sheep', seconds: 2 },
      { follow: false, panel: 'hold', flick: 'swept', seconds: 1.5 },
      { follow: false, panel: 'hold', tab: 'dog', seconds: 2 },
      { follow: false, panel: 'close', seconds: 2 }],
    bearings: SPOT_BEARINGS,
    orbits: ORBITS,
  },
  {
    // A preset click, the other half of the same reset. `top` is the vertex of
    // the dog tab's poses - 4.6 m out and 3.45 m up, 53.13 degrees off straight
    // down - so the hero -> top -> face sequence is the steepest pair of
    // adjacent Studio poses there is, taken with the orbit zeroed under it.
    name: 'the Studio preset clicks',
    spin: 0,
    legs: [{ follow: false, seconds: 1 }, { follow: false, panel: 'open', seconds: 1.5 },
      { follow: false, panel: 'hold', flick: 'swept', seconds: 1.5 },
      { follow: false, panel: 'hold', preset: 'top', seconds: 1.5 },
      { follow: false, panel: 'hold', flick: 'swept', seconds: 1.5 },
      { follow: false, panel: 'hold', preset: 'face', seconds: 1.5 },
      { follow: false, panel: 'hold', flick: 'swept', seconds: 1.5 },
      { follow: false, panel: 'hold', preset: 'rear', seconds: 1.5 },
      { follow: false, panel: 'close', seconds: 2 }],
    bearings: SPOT_BEARINGS,
    orbits: ORBITS_FINE,
  },
  {
    // The drag itself, with no click anywhere in it. A 0.22 s Cartesian lag did
    // not preserve a radius either, so the collapse was never something only the
    // reset could reach: a flick reached 4.4567 degrees off straight down on its
    // own. `flick` is one pointer event - 449 px at the panel's 0.007 rad per
    // pixel is a half turn, which a thumb can do - and `drag` is a hand that
    // keeps going, at 14 rad/s, past the rate at which the framing's own shared
    // step factor starts binding.
    name: 'a fast orbit flick and a sustained drag',
    spin: 0,
    legs: [{ follow: false, seconds: 1 }, { follow: false, panel: 'open', seconds: 1.5 },
      { follow: false, panel: 'hold', flick: Math.PI, seconds: 1 },
      { follow: false, panel: 'hold', flick: -Math.PI, seconds: 1 },
      { follow: false, panel: 'hold', drag: 14, seconds: 2 },
      { follow: false, panel: 'hold', drag: -40, seconds: 1.5 },
      { follow: false, panel: 'hold', seconds: 1.5 },
      { follow: false, panel: 'close', seconds: 2 }],
    bearings: SPOT_BEARINGS,
    orbits: [0],
  },
  {
    // The sheep tab over a flock big enough to move the flock tab's stand-off
    // two steps, with the arrows walking the selection across the pasture. The
    // sheep tab is the one Studio pose the ground can move, because its eye
    // clears the ground it stands over rather than the ground its subject
    // stands on.
    name: 'the Studio sheep and flock tabs at 200',
    spin: 0,
    flock: 200,
    legs: [{ follow: false, seconds: 1 }, { follow: false, panel: 'open', seconds: 1 },
      { follow: false, panel: 'hold', tab: 'sheep', seconds: 1.5 },
      { follow: false, panel: 'hold', selectSheep: 99, flick: 'swept', seconds: 1.5 },
      { follow: false, panel: 'hold', selectSheep: 100, seconds: 1.5 },
      { follow: false, panel: 'hold', tab: 'flock', flick: 'swept', seconds: 2 },
      { follow: false, panel: 'hold', tab: 'sheep', seconds: 1.5 },
      { follow: false, panel: 'close', seconds: 2 }],
    bearings: SPOT_BEARINGS,
    orbits: ORBITS,
  },

  // --- a re-armed Follow bearing --------------------------------------------
  {
    // A run reset under a settled Follow. The dog goes back to its spawn, up to
    // 160 m away, and the bearing re-arms from a direction of travel that can be
    // anywhere against the one the rig is holding.
    name: 'sim replaced under a settled Follow',
    spin: 0,
    legs: [{ follow: true, seconds: 2.5 },
      { follow: true, simChanged: true, respawn: true, reAim: true, seconds: 4 }],
    options: { startInFollow: true },
    reAims: RE_AIMS,
  },
  {
    // The same replacement part-way through a swap, where the weight is between
    // the two framings and the carry is unwinding underneath it. Reachable from
    // the store: `startRun`, `setFlockSize` and the return to title all replace
    // the sim and none of them touches `cameraMode`, so the blend can be
    // anywhere when the dog is put back at its spawn up to 160 m away.
    //
    // This is the case that was red when this round began, at 130.3 deg/s
    // against a 117.0 deg/s limit assembled out of per-stage ceilings. The
    // cause was the stage carrying the recentre - the travel ceiling at the
    // foot of the frame, which bounded METRES: eye and aim saturated at
    // MAX_RIG_SPEED and 33 m apart, marched along their own straight lines on
    // one shared factor, rotate the picture at 2 * speed / separation with
    // nothing measuring it. `viewBudget.commit` holds the eye and then turns
    // the view, and this case now measures 90.000 deg/s against the one budget.
    name: 'sim replaced mid-swap',
    spin: 0.6,
    legs: [{ follow: false, seconds: 1 }, { follow: true, seconds: 0.3 },
      { follow: true, simChanged: true, respawn: true, reAim: true, seconds: 4 }],
    bearings: FEW_BEARINGS,
    reAims: RE_AIMS,
  },
  {
    // And in Classic, where the rig re-arms without carrying anything, because
    // at weight zero the Follow pose is not part of the picture. What this
    // asserts is that the step stays out of the picture until the weight lifts.
    name: 'sim replaced under Classic',
    spin: 0,
    legs: [{ follow: false, seconds: 1 },
      { follow: false, simChanged: true, respawn: true, reAim: true, seconds: 2.5 },
      { follow: true, seconds: 3 }],
    bearings: SPOT_BEARINGS,
    reAims: FEW_RE_AIMS,
  },
  {
    // The player's own re-aim, and the documented whole of their camera
    // authority at the `off` end stop: the camera key twice, Follow to Classic
    // to Follow. The bearing re-arms on the second press, against a direction of
    // travel that has moved by the swept angle.
    name: 'the re-aim gesture, camera key twice',
    spin: 0,
    legs: [{ follow: true, seconds: 2.5 }, { follow: false, seconds: 0.1 },
      { follow: true, reAim: true, seconds: 5 }],
    options: { startInFollow: true },
    bearings: FEW_BEARINGS,
    reAims: RE_AIMS,
  },

  // --- the completion pull-back, entered and left ---------------------------
  {
    // The case the nadir bound exists for: the run ends with the dog at the
    // south end running away from the pen, so the aim swings 42 m north toward
    // the pen while the eye is pulled 11 m south and 3.5 m up, and the two
    // close on each other under a drop. It reached a fraction of a degree from
    // straight down before `COMPLETION_MIN_NADIR` held the closing term; it
    // measures 45.000 degrees here, which is that bound exactly.
    name: 'completing at the south end in Follow',
    spin: 0,
    legs: [{ follow: true, seconds: 1 }, { follow: true, complete: true, seconds: 5 }],
    options: { startInFollow: true },
    start: { x: 0, z: -80 },
  },
  {
    // The same run ending in Classic, which looks down at 50 degrees to begin
    // with and so has the least room of the two.
    name: 'completing at the south end in Classic',
    spin: 0,
    legs: [{ follow: false, seconds: 1 }, { follow: false, complete: true, seconds: 5 }],
    start: { x: 0, z: -80 },
  },
  {
    // LEAVING THE PHASE: finish a run, press restart. The commonest transition
    // in the game. It was REPORTED at 216 deg/s on every turning profile earlier
    // in this round, including at the `off` end stop whose stated ceiling is
    // zero, and 207 with Reduce motion on; that figure is the rig's own, not
    // one taken here, and what this file measures is on the assertions below.
    //
    // The camera is pinned to the pull-back's pose for the whole of the
    // completion leg while the dog keeps running, so the live blend it drops
    // back to can be most of a turn away; then the sim is replaced under it and
    // the dog is put back at its spawn in the same frame. `completionCarry`
    // absorbs the step and the frame's budget bounds what is left.
    name: 'the completion phase left by restart',
    spin: 0.3,
    legs: [{ follow: true, seconds: 1.5 }, { follow: true, complete: true, seconds: 4 },
      { follow: true, simChanged: true, respawn: true, reAim: true, watch: true,
        seconds: 6 }],
    options: { startInFollow: true },
    start: { x: 0, z: -80 },
    bearings: FEW_BEARINGS,
    reAims: FEW_RE_AIMS,
  },
  {
    // The exit with NO replacement, which is the one that made leaving the phase
    // a step rather than something `followCarry` would have covered:
    // `reportGraphicsLost` takes 'complete' straight to 'paused' with the same
    // sim in place. Nothing re-arms here, so the whole recovery is the
    // composition's own.
    name: 'the completion phase left with the same sim',
    spin: 0.3,
    legs: [{ follow: true, seconds: 1.5 }, { follow: true, complete: true, seconds: 4 },
      { follow: true, watch: true, seconds: 6 }],
    options: { startInFollow: true },
    start: { x: 0, z: -80 },
    bearings: FEW_BEARINGS,
  },
  {
    // And in Classic, where the pull-back starts from a 50 degree downward look
    // and the blend the exit drops back to is world-locked.
    name: 'the completion phase left in Classic',
    spin: 0.3,
    legs: [{ follow: false, seconds: 1.5 }, { follow: false, complete: true, seconds: 4 },
      { follow: false, simChanged: true, respawn: true, watch: true, seconds: 6 }],
    start: { x: 0, z: -80 },
    bearings: SPOT_BEARINGS,
  },
];

/**
 * Hand the event loop back between scenarios.
 *
 * A sweep is a few seconds of straight arithmetic, and vitest talks to its
 * worker over a channel that has to be serviced: a test that blocks for long
 * enough raises `Timeout calling "onTaskUpdate"` as an unhandled error, which
 * is reported beside the results and reads as a failure in the suite. Nothing
 * here is asynchronous; this is a yield and not a wait.
 */
function breathe(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

/** Every case, at every rate, at every angle it sweeps. `visit` sees each worst
 *  frame. */
async function sweep(
  options: ComposedOptions,
  visit: (metrics: Metrics, scenario: Scenario, where: string) => void,
): Promise<void> {
  for (const scenario of CASES) {
    await breathe();
    const bearings = scenario.bearings ?? BEARINGS;
    const orbits = scenario.orbits ?? [0];
    const reAims = scenario.reAims ?? [0];
    const merged = { ...scenario.options, ...options };
    for (const hz of RATES) {
      for (const bearing of bearings) {
        for (const orbit of orbits) {
          for (const reAim of reAims) {
            visit(
              drive(hz, bearing, orbit, reAim, scenario, merged),
              scenario,
              `${scenario.name} / ${hz} Hz / bearing ${bearing.toFixed(6)}`
              + ` / orbit ${orbit.toFixed(3)} / re-aim ${reAim.toFixed(3)}`,
            );
          }
        }
      }
    }
  }
}

/** The same sweep, run twice per configuration: Reduce motion off, then on. */
async function sweepBothWays(
  options: ComposedOptions,
  visit: (plain: Metrics, reduced: Metrics, scenario: Scenario, where: string) => void,
): Promise<void> {
  for (const scenario of CASES) {
    await breathe();
    const bearings = scenario.bearings ?? BEARINGS;
    const orbits = scenario.orbits ?? [0];
    const reAims = scenario.reAims ?? [0];
    const merged = { ...scenario.options, ...options };
    for (const hz of RATES) {
      for (const bearing of bearings) {
        for (const orbit of orbits) {
          for (const reAim of reAims) {
            visit(
              drive(hz, bearing, orbit, reAim, scenario, { ...merged, reducedMotion: false }),
              drive(hz, bearing, orbit, reAim, scenario, { ...merged, reducedMotion: true }),
              scenario,
              `${scenario.name} / ${hz} Hz / bearing ${bearing.toFixed(6)}`
              + ` / orbit ${orbit.toFixed(3)} / re-aim ${reAim.toFixed(3)}`,
            );
          }
        }
      }
    }
  }
}

/**
 * The composed view's whole rotation allowance, rad/s. ONE number, not a sum:
 * `viewBudget` opens `MODE_MAX_TURN_RATE * dt` of rotation per frame against
 * the pose the camera committed to last frame, every stage resolves its own
 * weight against what is left of that, and `commit` clamps whatever they
 * compose to. Reduce motion lengthens the swap and scales this with it.
 */
function viewLimit(reducedMotion: boolean): number {
  const scale = reducedMotion ? MODE_BLEND_SECONDS / REDUCED_MODE_BLEND_SECONDS : 1;
  return MODE_MAX_TURN_RATE * scale + BUDGET_SLACK;
}

describe('composed view rotation', () => {
  it.each(['off', 'gentle', 'quick'] as const)(
    'turns no faster than the one budget that governs it, on the %s rig',
    async (turning: FollowTurning) => {
      // The limit does not depend on the scenario, and that is the property
      // being asserted as much as the number is. It used to: every stage a
      // script ran through added its own ceiling to the bound, so a script that
      // did more was allowed more, and the total on screen legitimately
      // exceeded every individual ceiling. One budget removes the sum.
      await sweep({ turning }, (metrics, _scenario, where) => {
        expect(metrics.view, where).toBeLessThanOrEqual(viewLimit(false));
      });
    },
    SWEEP_TIMEOUT,
  );

  it('slows every transition under Reduce motion instead of leaving the peak alone', async () => {
    // Reduce motion lengthens the blend and scales the frame's whole rotation
    // allowance by the same factor, and forces the rig itself to the `off` end
    // stop. It used to SHORTEN the blend, which made the one camera event a
    // sick player triggers repeatedly the most violent one.
    await sweep({ reducedMotion: true }, (metrics, _scenario, where) => {
      expect(metrics.view, where).toBeLessThanOrEqual(viewLimit(true));
    });
  }, SWEEP_TIMEOUT);

  it.each(['off', 'gentle', 'quick'] as const)(
    'is never faster with Reduce motion on than off, on the %s rig',
    async (turning: FollowTurning) => {
      // THE PROPERTY, NOT A CASE. A setting labelled Reduce motion has exactly
      // one promise, and the way it is broken is never across the board - it is
      // one transition somewhere that the setting happens to make worse, which
      // a pair of independent ceilings will not catch because both of them
      // pass. So this compares the two runs of the SAME script, configuration
      // by configuration, over every transition the sweep covers, and the
      // margin is the thing asserted rather than either peak.
      //
      // The comparison holds the player's own turning profile fixed, because
      // that is what toggling the setting does: the rig clamps the turning to
      // the end stop while Reduce motion is on and hands the setting back when
      // it goes off, so the clamp is part of what is being compared.
      //
      // THE VIEW, AND DELIBERATELY NOT THE HORIZON. The horizon was compared
      // here too, on the reasoning that it is unbudgeted and so the quantity
      // most likely to move the wrong way without the view doing so. It is
      // unbudgeted, but it is not independent: under yaw the right vector and
      // the view turn about the same axis, so `horizon = view / sin(theta)`
      // for a view `theta` off vertical, and the horizon carries the view's
      // rate and the framing's elevation multiplied together.
      //
      // Reduce motion is entitled to change that elevation - it runs the rig
      // at the `off` end stop, which is a different framing, not a slower one -
      // so a horizon comparison charges the setting for the pose it is supposed
      // to choose. Measured at the configuration that failed last, `sim
      // replaced under a settled Follow` at 144 Hz, bearing 1.5, re-aim 0.4 on
      // the quick rig: the Reduce motion run turns the VIEW slower, 14.7704
      // against 14.8167 deg/s, and carries the horizon faster, 16.3642 against
      // 15.9581, purely because it sits 3.70 degrees steeper - 115.4976 off up
      // against 111.8014. The identity holds to four decimals on both runs
      // (1/sin gives 1.07705 and 1.10770; the measured ratios are 1.07703 and
      // 1.10791), so the whole of that 0.406 deg/s is the pose term and none of
      // it is rotation.
      //
      // Removing it costs no coverage, because the bound that matters was
      // never this one: `holds the horizon level and never spins it` caps the
      // horizon at `viewLimit / sin(VERTICAL_FLOOR)` - the same identity, at
      // its worst pose - and that cap now runs over the Reduce motion sweep as
      // well, which while the comparison lived here it did not.
      //
      // WHAT THIS CAUGHT, AND WHAT IS LEFT. The worst breach of each quantity
      // is reported rather than the first one the sweep reaches, because the
      // first one is not the informative one. When this test was first written
      // it failed on all three profiles, over 4,014 configurations per profile
      // and so 8,028 comparisons:
      //
      //   off      109 comparisons breach, all of them in `the completion
      //            phase left by restart`. Worst view 26.699 -> 49.028 deg/s,
      //            +22.328, at 144 Hz, bearing 1.5, re-aim -2.5; worst horizon
      //            28.751 -> 54.318, +25.567, at the same configuration.
      //   gentle   522 breach, worst view 39.378 -> 50.000, +10.622, at 30 Hz
      //            in the same case.
      //   quick    535 breach, worst view 39.878 -> 50.000, +10.122, likewise.
      //
      // Two mechanisms, both in `composedRig` and neither in this file. The
      // first was the whole of the `off` column and the bulk of the other two.
      // The completion pull-back's translation was ZERO under Reduce motion -
      // no 11 m back, no 3.5 m lift, no aim swing - but the phase still RAN,
      // so the camera held the pose the phase was entered on for its whole
      // length while the dog coasted on, and the live blend it dropped back to
      // at the exit was further away than it would have been had the pull-back
      // moved. Both carries were outstanding at once and the exit saturated
      // them together at 2 * the carry rate. Reduce motion was, in that phase,
      // a freeze followed by a lurch - which is the opposite of the setting.
      //
      // The fix was not to run the move more slowly. It was to stop entering a
      // phase with nothing in it: `completionPullBack` now arms only when the
      // move will actually be made, so under Reduce motion the rig tracks the
      // dog straight through the results screen, and the exit holds nothing
      // because there is no step to recover from. `off` passes clean.
      //
      // The second mechanism USED to be the setting itself. Reduce motion
      // clamped the turning to the `off` end stop, Follow's bearing did not
      // track, and a re-arm handed the carry a larger step which it unwound at
      // the same capped rate for longer. The two runs settled at different
      // moments, so somewhere in the tail one was still turning after the other
      // had stopped: 4 comparisons on gentle and 5 on quick, worst margin
      // 1.23e-4 and 1.74e-4 deg/s, both runs' rates rounding to 0.000.
      //
      // That mechanism is gone, and not because it was hidden. Pinning the
      // bearing also pinned the movement basis that tracks it, so a held thumb
      // turned the dog through one corner and then ran it straight - measured
      // at 88.5 degrees of total turn against 281.7 for the same hold. Players
      // mostly do not choose this setting; it follows the operating system, and
      // phones ship with it on. So Reduce motion now clamps to the slowest
      // profile that still TRACKS, and `off` remains available to anyone who
      // actually wants the bearing pinned.
      //
      // What that leaves here is a different shape of residual. On `gentle` and
      // `off` the two runs now resolve the SAME turning profile and differ only
      // in blend length and budget scale, so this compares two live curves both
      // running near 14.83 deg/s rather than one that turns against one that
      // does not. The divergence scales with the rate, which is why the slack
      // now has a relative term alongside the floor. Both are documented where
      // they are defined, and neither would have absorbed any number in the
      // table above: the smallest of those is still 1,700 times the largest
      // measured residual, so a green run here remains a receipt that the
      // phase-scale breaches are gone, which is the whole reason this exists.
      interface Breach {
        excess: number;
        line: string;
      }
      const worstView: Breach = { excess: 0, line: '' };
      let breaches = 0;
      let visits = 0;
      const note = (
        worst: Breach, excess: number, plain: number, reduced: number, where: string,
      ): void => {
        if (excess <= MONOTONE_SLACK + Math.abs(plain) * MONOTONE_RELATIVE) return;
        breaches += 1;
        if (excess <= worst.excess) return;
        worst.excess = excess;
        worst.line = `${(plain / DEG).toFixed(3)} -> ${(reduced / DEG).toFixed(3)} deg/s`
          + ` at ${where}`;
      };

      await sweepBothWays({ turning }, (plain, reduced, _scenario, where) => {
        visits += 1;
        note(worstView, reduced.view - plain.view, plain.view, reduced.view, where);
      });

      // The sweep has to have run, or the assertion below is a pass on an empty
      // set - the failure mode this file has now been caught in twice.
      expect(visits).toBeGreaterThan(3000);

      // toPrecision, not toFixed: a residual tie is a few ulps, and toFixed(3)
      // reported it as "0.000 deg/s", which reads as a passing comparison
      // inside a failing assertion and cost a reader real time.
      expect(worstView.line, `${breaches} of ${visits} comparisons are faster`
        + ` with Reduce motion ON; worst view margin`
        + ` ${(worstView.excess / DEG).toPrecision(3)} deg/s`).toBe('');
    },
    SWEEP_TIMEOUT,
  );
});

describe('composed view attitude', () => {
  it.each(['off', 'gentle', 'quick'] as const)(
    'never comes near vertical on the %s rig, at any bearing or frame rate',
    async (turning: FollowTurning) => {
      // THE ASSERTION WHOSE ABSENCE LET THE BLOCKER THROUGH, AND THE SWEEP
      // WHOSE NARROWNESS LET IT THROUGH TWICE MORE. A view within a few degrees
      // of straight down makes `up x forward` degenerate, and three.js resolves
      // that by nudging the direction, which reverses the frame's right vector.
      // The horizon does half a turn in one frame and no rate ceiling anywhere
      // can help, because travelling slowly through a singularity still goes
      // through it. The path has to not contain one - on all six of the paths
      // in this file's header, not only on the one it first drove and not only
      // on the four it drove after that.
      await sweep({ turning }, (metrics, _scenario, where) => {
        expect(metrics.vertical, where).toBeGreaterThan(VERTICAL_FLOOR);
      });
    },
    SWEEP_TIMEOUT,
  );

  it('never comes near vertical under Reduce motion, and holds its horizon', async () => {
    // Reduce motion is not a smaller version of the same path. It skips the
    // completion pull-back outright, so the rig tracks the dog through a phase
    // the other run spends on a rail, and it runs the whole rig at the `off`
    // end stop. Those are different geometries, and the sweep above drives
    // neither of them.
    //
    // THE HORIZON IS BOUNDED HERE AND NOT IN THE MONOTONE TEST. It used to be
    // the other way round, and that was wrong in both directions at once: it
    // asserted a comparison the setting is allowed to lose, while leaving the
    // bound that actually matters - the absolute one, below - unchecked on
    // every Reduce motion frame in the file. Same bound and same derivation as
    // the run with the setting off, because the ceiling is a property of the
    // geometry rather than of the setting.
    await sweep({ reducedMotion: true }, (metrics, _scenario, where) => {
      expect(metrics.vertical, where).toBeGreaterThan(VERTICAL_FLOOR);
      expect(metrics.roll, where).toBeLessThan(ROLL_SLACK);
      expect(metrics.horizon, where)
        .toBeLessThanOrEqual(viewLimit(false) / Math.sin(VERTICAL_FLOOR));
    });
  }, SWEEP_TIMEOUT);

  it('holds the horizon level and never spins it', async () => {
    // Roll is the symptom a player actually sees. Two halves: the right vector
    // stays horizontal, which a y-up `lookAt` gives by construction and which is
    // therefore a pin on nothing else ever writing the camera's attitude; and it
    // does not SWING, which is the half the blocker broke. A view `omega` rad/s
    // off vertical by `VERTICAL_FLOOR` can carry its horizon round no faster
    // than `omega / sin(VERTICAL_FLOOR)`, so the bound is derived from the floor
    // above rather than chosen.
    //
    // This one also counts what the sweep visited, which every other sweep in
    // the file relies on and none of them proves. A `sweep` that drove nothing -
    // an empty case list, a scenario whose angle list came back empty, a `for`
    // that lost its body in a rewrite - would report a pass on all six of them
    // at once, silently, and the two ways this file has already been found
    // blind were both a scenario not reaching a condition. Counted here because
    // it is free: the sweep is running anyway.
    const seen = new Set<string>();
    let visits = 0;
    await sweep({}, (metrics, scenario, where) => {
      visits += 1;
      seen.add(scenario.name);
      expect(metrics.roll, where).toBeLessThan(ROLL_SLACK);
      expect(metrics.horizon, where)
        .toBeLessThanOrEqual(viewLimit(false) / Math.sin(VERTICAL_FLOOR));
    });
    expect(seen.size).toBe(CASES.length);
    expect(visits).toBe(CASES.reduce((total, scenario) => total
      + RATES.length
      * (scenario.bearings ?? BEARINGS).length
      * (scenario.orbits ?? [0]).length
      * (scenario.reAims ?? [0]).length, 0));
    // And the product is a real sweep rather than one configuration per case.
    expect(visits).toBeGreaterThan(3000);
  }, SWEEP_TIMEOUT);
});

describe('leaving the completion phase', () => {
  /**
   * The three exits, driven on their own so the transition can be measured
   * apart from the run that led to it. `watch` marks the leg after the phase
   * ends, so what these report is the recovery and nothing else.
   */
  const EXITS = CASES.filter((scenario) => scenario.legs.some((leg) => leg.watch));

  it('has exits to measure', () => {
    // The guard on the guard. `watch` is a flag on a leg and the scenarios it
    // marks are the only thing the assertions below read; if a rewrite dropped
    // it they would all pass over an empty sweep and say nothing, which is the
    // exact failure mode this file has now been caught in twice.
    expect(EXITS.length).toBe(3);
    for (const scenario of EXITS) {
      expect(scenario.legs.filter((leg) => leg.watch).length, scenario.name).toBe(1);
      // And the watched leg must be the one AFTER the phase, or it is measuring
      // the pull-back rather than the exit.
      const index = scenario.legs.findIndex((leg) => leg.watch);
      expect(scenario.legs[index]?.complete ?? false, scenario.name).toBe(false);
      expect(scenario.legs[index - 1]?.complete, scenario.name).toBe(true);
    }
  });

  /** Drive the three exits at one turning profile and hand each worst frame to
   *  `visit`. `orbit` is nothing here: the panel is shut through all three. */
  async function exits(
    options: ComposedOptions,
    visit: (metrics: Metrics, where: string) => void,
  ): Promise<void> {
    for (const scenario of EXITS) {
      await breathe();
      const bearings = scenario.bearings ?? BEARINGS;
      const reAims = scenario.reAims ?? [0];
      const merged = { ...scenario.options, ...options };
      for (const hz of RATES) {
        for (const bearing of bearings) {
          for (const reAim of reAims) {
            visit(
              drive(hz, bearing, 0, reAim, scenario, merged),
              `${scenario.name} / ${hz} Hz / bearing ${bearing.toFixed(6)}`
              + ` / re-aim ${reAim.toFixed(3)}`,
            );
          }
        }
      }
    }
  }

  it.each(['off', 'gentle', 'quick'] as const)(
    'stays inside the budget the frame opened, on the %s rig',
    async (turning: FollowTurning) => {
      // Finish a run, press restart. Reported at 216 deg/s earlier in this round
      // on every turning profile INCLUDING `off`, whose stated ceiling is zero,
      // because leaving the phase dropped the composed pose straight back to the
      // live blend and no stage owned the step. That figure is the rig's own;
      // the ones below were taken here.
      //
      // Measured this round over the three exits at 30, 60 and 144 Hz: 64.52
      // deg/s at the worst, on the gentle rig with the dog turning under it,
      // and 50.00 at the `off` end stop. Reduce motion is driven too, because
      // it takes the pull-back's translation to zero and so makes the exit a
      // step from a DIFFERENT pose, not a smaller version of the same one.
      await exits({ turning }, (metrics, where) => {
        expect(metrics.watchedView, where).toBeLessThanOrEqual(viewLimit(false));
      });
      await exits({ turning, reducedMotion: true }, (metrics, where) => {
        expect(metrics.watchedView, `reduced / ${where}`)
          .toBeLessThanOrEqual(viewLimit(true));
      });
    },
    SWEEP_TIMEOUT,
  );

  it('costs the off end stop no more than the carries that can be outstanding', async () => {
    // THE TIGHT ONE, and the reason it is stated at the `off` end stop: that is
    // where the framing contributes nothing of its own, so what is left is
    // exactly the recovery. Two carries can be unwinding at once here -
    // `completionCarry` on the pose the phase left, `followCarry` on the
    // bearing the restart re-armed - and each pays its step back at its own
    // rate, so the honest bound is their sum. It is a sum of two and not of
    // six, and it sits well inside the frame's budget, which is the thing that
    // actually holds it whatever is outstanding.
    //
    // Measured this round over the three exits at 30, 60 and 144 Hz: a peak of
    // 50.000 deg/s with Reduce motion off and 50.0001 with it on, both of which
    // are the two carries saturated together, against the 216 deg/s the rig
    // reported for this transition earlier in the round.
    //
    // The TOTAL is asserted beside the peak because a bounded peak alone can be
    // satisfied by something a player would still report: the same half turn
    // spread thinly over six seconds. Measured 192.86 degrees over the six
    // seconds after the exit, most of which is the half-turn re-aim the carry
    // exists to pay back at 25 deg/s, and 141.35 with Reduce motion on.
    for (const reducedMotion of [false, true]) {
      await exits({ turning: 'off', reducedMotion }, (metrics, where) => {
        const label = `${reducedMotion ? 'reduced' : 'plain'} / ${where}`;
        expect(metrics.watchedView, label)
          .toBeLessThanOrEqual(2 * CARRY_RATE + BUDGET_SLACK);
        expect(metrics.watchedRotation / DEG, label).toBeLessThan(220);
      });
    }
  }, SWEEP_TIMEOUT);
});

describe('composed pose at the ends of the swap', () => {
  /** Settle at one end and return the composed pose beside the framing's own. */
  function settle(follow: boolean): {
    weight: number;
    eye: THREE.Vector3;
    aim: THREE.Vector3;
    camera: THREE.Vector3;
    framing: { position: THREE.Vector3; aim: THREE.Vector3 };
  } {
    const rig = createComposedCamera({ startInFollow: false });
    const dog = makeDog(0, 0);
    const dt = 1 / 60;
    dog.velocity.x = Math.sin(2.4) * SPEED;
    dog.velocity.z = Math.cos(2.4) * SPEED;
    for (let frame = 0; frame < 400; frame += 1) {
      dog.position.x += dog.velocity.x * dt;
      dog.position.z += dog.velocity.z * dt;
      rig.frame({ dt, dog, follow });
    }
    return {
      weight: rig.weight,
      eye: rig.position.clone(),
      aim: rig.aim.clone(),
      camera: rig.camera.position.clone(),
      framing: follow ? rig.follow : rig.classic,
    };
  }

  it.each([false, true])('is the framing itself, bit for bit, at follow=%s', (follow) => {
    // Neither the decomposition nor a lerp returns its endpoints exactly through
    // floating point, so the blend copies at both ends instead of computing
    // them. A seam at the moment a swap finishes is the thing the whole blend
    // exists to avoid, and "close enough" is how one gets there. At the Follow
    // end this pins `followCarry`'s pass-through as well: with nothing
    // outstanding the carry copies the framing's live pose rather than easing
    // toward it, or every settled frame would sit a little behind the rig. It
    // pins `viewBudget.commit`'s too, which rebuilds the pose only when it
    // actually held something back.
    const settled = settle(follow);
    expect(settled.weight).toBe(follow ? 1 : 0);
    expect(settled.eye.equals(settled.framing.position)).toBe(true);
    expect(settled.aim.equals(settled.framing.aim)).toBe(true);
    expect(settled.camera.equals(settled.framing.position)).toBe(true);
  });

  it('leaves the Studio blend at zero until the panel opens', () => {
    // The Studio blend seats on the gameplay pose every frame whether or not the
    // panel is open, and `pose` is only applied above zero. A weight that crept
    // would move the picture with the panel shut, which is the one state this
    // file's ends-are-exact assertions above would not notice. The orbit is
    // dragged while the panel is shut for the same reason: the Studio framing
    // runs regardless, and none of it may reach the picture.
    const rig = createComposedCamera({ startInFollow: true });
    const dog = makeDog(0, 0);
    const dt = 1 / 60;
    dog.velocity.x = Math.sin(1.1) * SPEED;
    dog.velocity.z = Math.cos(1.1) * SPEED;
    for (let frame = 0; frame < 200; frame += 1) {
      rig.orbitBy(0.05);
      dog.position.x += dog.velocity.x * dt;
      dog.position.z += dog.velocity.z * dt;
      rig.frame({ dt, dog, follow: true });
    }
    expect(rig.customizeWeight).toBe(0);
    expect(rig.position.equals(rig.follow.position)).toBe(true);
  });
});

describe('the Studio states the sweep reaches', () => {
  /**
   * The harness's own guard, and it is here because the failure it is written
   * against has now happened twice. An assertion that never reaches its
   * condition reads as a pass on a property it is not testing: the first
   * version of this file asserted VERTICAL_FLOOR without ever composing two
   * rigs, and the version before this round pinned the Studio to one tab with
   * no notion of the orbit reset, so the fifth singularity - which lives in
   * `customizeFraming` and is triggered by exactly that reset - could not have
   * been seen here however fine the sweep.
   *
   * So this asserts what the sweep REACHES, not what it measures.
   */
  function reached(): {
    tabs: Set<CustomizeTab>;
    presets: Set<DogCameraAngle>;
    resets: number;
    drags: number;
    nonZeroOrbits: number;
  } {
    const tabs = new Set<CustomizeTab>();
    const presets = new Set<DogCameraAngle>();
    let resets = 0;
    let drags = 0;
    let nonZeroOrbits = 0;
    for (const scenario of CASES) {
      // The swept orbit a flick uses, taken from the scenario's own list, so
      // this counts the states the sweep actually visits.
      const orbit = (scenario.orbits ?? [0])[0] ?? 0;
      const rig = createComposedCamera();
      let open = false;
      for (const leg of scenario.legs) {
        if (leg.panel === 'open') {
          rig.openCustomize();
          open = true;
        }
        if (leg.panel === 'close') open = false;
        if (leg.tab !== undefined) {
          rig.setTab(leg.tab);
          resets += 1;
        }
        if (leg.preset !== undefined) {
          rig.setDogAngle(leg.preset);
          resets += 1;
        }
        if (leg.selectSheep !== undefined) rig.selectSheep(leg.selectSheep);
        if (leg.flick !== undefined) {
          rig.orbitBy(leg.flick === 'swept' ? orbit : leg.flick);
          drags += 1;
        }
        if (leg.drag !== undefined) drags += 1;
        if (open) {
          tabs.add(rig.studio.tab);
          presets.add(rig.studio.dogAngle);
          if (Math.abs(rig.studio.orbitAngle) > 1e-12) nonZeroOrbits += 1;
        }
      }
    }
    return { tabs, presets, resets, drags, nonZeroOrbits };
  }

  it('opens all three tabs with the panel actually open', () => {
    // The mirror pinned this to 'dog'. Nothing else in the file would notice.
    expect([...reached().tabs].sort()).toEqual(['dog', 'flock', 'sheep']);
  });

  it('reaches every dog preset that is not the default, plus the default', () => {
    // `top` is the one that matters: it is the vertex of the tabs' own poses,
    // 53.13 degrees off straight down, and so the nearest the Studio ever
    // legitimately gets to the pole.
    const presets = reached().presets;
    expect(presets.has('hero')).toBe(true);
    expect(presets.has('top')).toBe(true);
    expect(presets.has('face')).toBe(true);
    expect(presets.has('rear')).toBe(true);
  });

  it('clicks through the orbit reset, and drags without one', () => {
    // Both halves of the fifth singularity's trigger. The reset is what puts
    // the pose the panel asks for on the far side of the subject while the live
    // pose is still on this side; the drag on its own is enough without it,
    // because a Cartesian lag does not preserve a radius either.
    const { resets, drags, nonZeroOrbits } = reached();
    expect(resets).toBeGreaterThanOrEqual(8);
    expect(drags).toBeGreaterThanOrEqual(8);
    expect(nonZeroOrbits).toBeGreaterThan(0);
  });

  it('opens the panel from Classic, from Follow and mid-swap', () => {
    // The Studio blend seats on whatever the gameplay pose is that frame, so
    // the three gameplay states it can seat on are three different geometries.
    const opens = CASES.flatMap((scenario) =>
      scenario.legs
        .map((leg, index) => ({ leg, index, scenario }))
        .filter((entry) => entry.leg.panel === 'open'));
    expect(opens.some((entry) => !entry.leg.follow)).toBe(true);
    expect(opens.some((entry) => entry.leg.follow)).toBe(true);
    // Mid-swap: the mode flipped on the leg before the open, and that leg is
    // shorter than MODE_BLEND_SECONDS, so the swap is still in flight when the
    // Studio blend seats on it.
    expect(opens.some((entry) => {
      const previous = entry.scenario.legs[entry.index - 1];
      const before = entry.scenario.legs[entry.index - 2];
      return previous !== undefined && before !== undefined
        && previous.follow === entry.leg.follow
        && before.follow !== previous.follow
        && previous.seconds < MODE_BLEND_SECONDS;
    })).toBe(true);
  });
});

