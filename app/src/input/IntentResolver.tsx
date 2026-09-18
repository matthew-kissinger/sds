// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * One system, once a frame: sample every device, merge them, project through
 * the camera basis, condition the result, write the single intent the loop
 * consumes. This is the only writer of movement intent in a shipped page;
 * devices own their own raw state and nothing else. Production and test tooling
 * drive these same device paths; there is no player-page input override or
 * scripted runtime controller.
 *
 * ORDER. It subscribes at priority -2, below `useGameLoop`'s -1, so intent is
 * fresh before the sim steps on it. R3F sorts subscribers ascending and only
 * takes rendering into its own hands above zero, so a negative priority is
 * purely an ordering statement.
 *
 * MERGE. Keyboard is the base. A gamepad stick with any deflection replaces it
 * outright: a stick already carries an angle, and summing a digital key into it
 * would corrupt that angle rather than add to it. A stick at rest contributes
 * zero, which is the additive result anyway, so the two rules agree everywhere
 * they overlap. Touch, when a thumb is down, is last and wins: a device you are
 * physically holding is never ambiguous. Sprint is the OR of all three.
 *
 * CAMERA BASIS. The basis is SAMPLED on the frame the axis leaves neutral and
 * then TRACKS the Follow bearing, so holding a direction through a turn keeps
 * curving with the camera rather than running off down the compass direction
 * the key meant when it was pressed. Steering live off the camera under a
 * camera that follows the dog is a feedback loop - the press turns the dog,
 * which turns the camera, which redefines the press - and this basis used to
 * cut that loop by freezing the sample for the whole hold. That was one brake
 * too many once the bearing itself became rate-capped, and `latchBasis` in
 * `conditioning.ts` carries the reasoning and the numbers; it owns the basis.
 *
 * The one motion of the basis that is NOT the player's is the mode blend, so
 * the sample is held for its length and eased back afterwards. This file owns
 * that flag, because the blend weight is this file's to read.
 *
 * The sample is dropped, and the next frame takes a fresh one, on four events:
 * the axis returning to neutral, the player asking for a screen direction far
 * enough off the sampled one (`latchBasis` owns that threshold), a camera-mode
 * change, and a new sim. This file owns the last two, because they are the two
 * discrete store events; the other two are properties of the axis itself.
 *
 * WHAT IS SAMPLED is one forward vector and no mode branch: the bearing the
 * mode BLEND is currently at, between Classic's constant world forward and the
 * Follow rig's compass. Classic's is constant because camera-relative input
 * from a top-down camera disorients (spec/06). Both ends are exact, and a
 * sample taken mid-blend lands between them on the eased weight the camera is
 * actually at, so it takes the framing on screen rather than one ahead of it.
 * Branching on `cameraMode` instead put the player's hand in the destination
 * framing for the whole 0.8 s the camera takes to get there, 1.2 s under Reduce
 * motion and longer still when the speed cap on the blended result engages. A
 * player holding a direction across the toggle meets that difference once, at
 * the re-sample the mode change forces, rather than as a basis sliding under
 * their thumb for the length of the blend.
 *
 * The bearing is built from the rigs' own published values, `followBearing` and
 * `cameraModeBlend`, and not from `camera.getWorldDirection()`. The camera
 * transform carries the completion move and the Studio blend on top of that
 * blend, and both are uncapped rotation paths in their own right: reading the
 * transform back would feed the rate-capped rig a basis that is not rate-capped
 * and would put the end-of-run pull-back and the Customize fly-in into the
 * controls. The mode blend is the one contribution that belongs here, because
 * it is the one that changes which framing the player is steering in. Both
 * values are published at priority 0 and read here at -2, so both are one frame
 * old, which is the right side to be on - the basis is a sample of where the
 * player was looking when they pressed, not a live transform.
 *
 * WEIGHT. `conditionMove` rate-limits a commanded direction and speed between
 * the devices and the sim, so `sim/` stays byte-identical for any given input
 * sequence and every committed trace fixture holds. It needs the frame delta,
 * the dog's own momentum and stamina, and the sprint the sim will actually
 * grant, which is why this file reads the dog once per frame through
 * `getState()` - a transient read, no subscription, no React state.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { FIXED_DT, MIN_STAMINA_TO_SPRINT, STAMINA_DRAIN_RATE } from '@sim/tuning';
import { cameraModeBlend } from '@app/camera/CameraRig';
import { lerpAngle } from '@app/camera/feel';
import { followBearing } from '@app/camera/followFraming';
import { barkPressed, toggleCameraMode } from './actions';
import {
  axisMagnitude,
  splitWorldMove,
  worldFromAxis,
  CLASSIC_FORWARD_X,
  CLASSIC_FORWARD_Z,
  type MoveAxis,
  type MoveSplit,
  type WorldMove,
} from './axis';
import {
  conditionMove,
  invalidateBasis,
  latchBasis,
  resetConditioning,
  type MoveRequest,
} from './conditioning';
import { pollGamepad } from './gamepad';
import { installKeyboard, keyboardAxis, keyboardSprint } from './keyboard';
import { isSprintExhausted, setMoveDirection, setSprint, setSprintCarry } from './intent';
import { touchActive, touchAxis, touchSprint } from './touch';
import { setSprintSource, sprintReleaseSerial } from './sprintSources';
import { useGameStore } from '@app/state/store';

/** Below useGameLoop's -1: intent is resolved before the sim reads it. */
const RESOLVE_PRIORITY = -2;

/**
 * The speed above which the sim counts the dog as moving, m/s.
 *
 * `step.ts` spends stamina only on a moving dog and gates `dog.sprinting` on
 * the same test, so a caller deciding which ceiling this frame is measured
 * against has to apply it too, or the first frames of a standing sprint start
 * would be scaled against a ceiling the sim is not using.
 */
const SIM_MOVING_SPEED = 0.1;

/**
 * Classic's fixed basis as a bearing, radians, so the blend has two angles to
 * move between. Derived from the vector `axis.ts` owns rather than written as a
 * zero, so the two cannot disagree about where up the field is.
 */
const CLASSIC_BEARING = Math.atan2(CLASSIC_FORWARD_X, CLASSIC_FORWARD_Z);

export function IntentResolver() {
  useEffect(() => installKeyboard(), []);
  const releaseSerial = useRef(sprintReleaseSerial());
  const cameraMode = useRef(useGameStore.getState().cameraMode);
  const sim = useRef(useGameStore.getState().sim);

  // Stable scratch, allocated once: this runs every frame and allocates nothing.
  const scratch = useMemo(
    () => ({
      axis: { right: 0, forward: 0 } as MoveAxis,
      pad: { right: 0, forward: 0 } as MoveAxis,
      world: { x: 0, z: 0 } as WorldMove,
      basis: { x: 0, z: 0 } as WorldMove,
      split: { dirX: 0, dirZ: 0, effort: 0 } as MoveSplit,
      request: {
        dirX: 0,
        dirZ: 0,
        effort: 0,
        sprintDevice: false,
        sprintAvailable: false,
        stamina: 0,
        velocityX: 0,
        velocityZ: 0,
        dt: 0,
      } as MoveRequest,
    }),
    [],
  );

  useFrame((_, delta) => {
    const reading = pollGamepad(scratch.pad);
    keyboardAxis(scratch.axis);
    let sprint = keyboardSprint();
    // Synchronize remapped keyboard bindings and the normally polled pad.
    // Keyboard/touch event paths retain intervening all-released edges.
    setSprintSource('keyboard', sprint);
    setSprintSource('gamepad', reading.present && reading.sprint);

    if (reading.present) {
      sprint = sprint || reading.sprint;
      if (axisMagnitude(scratch.pad) > 0) {
        scratch.axis.right = scratch.pad.right;
        scratch.axis.forward = scratch.pad.forward;
      }
      if (reading.barkPressed) barkPressed();
      if (reading.cameraPressed) toggleCameraMode();
    }

    if (touchActive()) {
      const thumb = touchAxis();
      scratch.axis.right = thumb.right;
      scratch.axis.forward = thumb.forward;
    }
    // Sprint owns its pointer independently. Lifting the steering thumb must
    // not manufacture a release/re-press of a still-held exhausted Sprint.
    sprint = sprint || touchSprint();

    // One store read, taken after the device presses that can change it, so a
    // camera toggle this frame is acted on this frame rather than the next.
    const store = useGameStore.getState();
    if (sim.current !== store.sim) {
      // A replacement sim is a new run: the dog is somewhere else and standing
      // still, so every commanded value from the old one is a lie.
      sim.current = store.sim;
      resetConditioning();
    }
    if (cameraMode.current !== store.cameraMode) {
      // The rig publishes its blend at priority 0, so the weight read below on
      // this frame is still the one from before the toggle: the re-sample takes
      // the framing that is on screen, not the one the camera is leaving for.
      // A hold then keeps that sample for the rest of the hold - the blend
      // reaches the basis at the NEXT sample, not during this one. Skipping the
      // invalidation instead would keep a basis taken under a camera the player
      // has just asked to leave, for as long as they keep holding.
      cameraMode.current = store.cameraMode;
      invalidateBasis();
    }

    // The ANGLE is what the weight interpolates, not the forward vector. Lerped
    // as vectors, two bearings 179 degrees apart collapse to 0.009 of unit
    // length at the crossing and swing nearly the whole difference in the two
    // frames either side of it, and at exactly 180 the vector is zero and
    // `worldFromAxis` falls back to the world axes: a snap in the middle of the
    // blend that exists to remove one. Interpolating the angle spreads the same
    // rotation evenly across the weight and can never be degenerate.
    //
    // A threshold crossing was the other candidate. It would keep one instant
    // re-map and put it at the midpoint, where the eased weight is moving
    // fastest, which is the worst frame of the transition to move the player's
    // hand on. Measured against a bearing blend over the 0.8 s: sampling the
    // destination on the flag frame, as this did, is off by the full framing
    // difference at the start and by half of it averaged over the blend, 45
    // degrees for a right-angle pair and 90 for an opposed one.
    const blend = cameraModeBlend();
    const bearing = lerpAngle(CLASSIC_BEARING, followBearing(), blend);
    // A blend strictly between the two framings is the basis moving for a
    // reason that is not the player's, so the sample is held across it. At
    // either end the only thing moving this bearing is the Follow rig chasing
    // the dog at the turning profile's ceiling, which the hand should have.
    latchBasis(
      delta,
      blend > 0 && blend < 1,
      scratch.axis.right,
      scratch.axis.forward,
      Math.sin(bearing),
      Math.cos(bearing),
      scratch.basis,
    );

    worldFromAxis(scratch.axis, scratch.basis.x, scratch.basis.z, scratch.world);
    splitWorldMove(scratch.world, scratch.split);

    // The latch takes the DEVICE sprint and takes it first, before anything
    // derived from it exists to be confused with it. The eased sprint ceiling
    // trails the device by design, so handing that to `setSprint` would fire
    // the release edge while it was still true, clear the exhaustion flag, and
    // give a player who exhausts sprint, releases above the walk ceiling and
    // re-presses a free burst. The trailing ceiling goes to `setSprintCarry`
    // below instead. Resolving the latch here also means the conditioner reads
    // this frame's latch rather than last frame's.
    const released = sprintReleaseSerial();
    setSprint(sprint, released !== releaseSerial.current);
    releaseSerial.current = released;

    const dog = store.sim.state.dogs[0];
    const velocityX = dog?.velocity.x ?? 0;
    const velocityZ = dog?.velocity.z ?? 0;
    const stamina = dog?.stamina ?? 0;
    const moving =
      Math.sqrt(velocityX * velocityX + velocityZ * velocityZ) > SIM_MOVING_SPEED;
    // The sim cuts a sprint on the tick whose stamina is below the floor AFTER
    // that tick's drain, so agreeing with it means looking one drain ahead.
    // Measured over a sprint held to exhaustion, agreeing costs 67 m/s^2 at the
    // cut, against 285 for a caller one tick behind and about 600 today.
    //
    // Availability rather than the granted sprint, because the conditioner
    // decides the trailing ceiling as well, and that is a sprint the sim would
    // grant to a dog whose device has already let go. Whether the device is
    // asking is `sprintDevice`, which it already has.
    const sprintAvailable =
      moving &&
      !isSprintExhausted() &&
      stamina - STAMINA_DRAIN_RATE * FIXED_DT >= MIN_STAMINA_TO_SPRINT;

    const request = scratch.request;
    request.dirX = scratch.split.dirX;
    request.dirZ = scratch.split.dirZ;
    request.effort = scratch.split.effort;
    request.sprintDevice = sprint;
    request.sprintAvailable = sprintAvailable;
    request.stamina = stamina;
    request.velocityX = velocityX;
    request.velocityZ = velocityZ;
    request.dt = delta;

    const move = conditionMove(request);
    // Both writes land after the conditioner and before the loop steps at
    // priority -1, so the tick the sim is about to run reads the ceiling and
    // the direction the same frame decided. The carry cannot be folded into
    // the `setSprint` call above: it stays true for a few ticks after the
    // device let go, and the latch would read that as a still-held sprint -
    // arming exhaustion against a player who is no longer pressing anything,
    // and spending the release edge on the wrong frame.
    setSprintCarry(move.sprintCarry);
    setMoveDirection(move.x, move.z);
  }, RESOLVE_PRIORITY);

  return null;
}
