// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The camera's per-frame body: run both framings, blend between them by the
 * mode the caller is in, and commit one pose. `CameraRig` is the component that
 * feeds this from the store and writes the result to a `THREE.Camera`; nothing
 * here touches React, the store or a camera, so the pipeline the player looks
 * through is the pipeline a test can drive.
 *
 * THAT SPLIT IS THE POINT OF THE FILE. This body used to live inside the
 * component, where a node test could not reach it, so the suite drove a MIRROR
 * of it instead. A blocker shipped straight through a green suite because the
 * mirror and the component had drifted, and a mirror is prone to exactly one
 * failure: being wrong in the way the thing it mirrors is not.
 *
 * NOTHING SNAPS, ANYWHERE. That is the design brief and it is why this holds a
 * blend value instead of a mode:
 *
 *  - Mode toggle. Both rigs are live every frame, so neither is ever stale.
 *    The swap moves a 0..1 blend at 1 / MODE_BLEND_SECONDS and shapes it with a
 *    smoothstep, so the blend adds no velocity of its own at either end - the
 *    rig is still tracking the dog throughout - and a second toggle mid-swap
 *    turns around instead of jumping. The two poses are blended in POLAR form
 *    about the aim and not in Cartesian form, because the straight line between
 *    them runs through the `lookAt` singularity; `createOrbitBlend` carries the
 *    arithmetic. Reduce motion lengthens the blend and lowers the frame's
 *    rotation budget with it; it used to shorten it, which
 *    REDUCED_MODE_BLEND_SECONDS explains.
 *  - Game start and reset. Both replace the sim, so the dog can move
 *    discontinuously - a reset from the gate puts it back at the spawn 161 m
 *    away - and both re-arm Follow's bearing, which is a step in a pose rather
 *    than travel toward one. `followCarry` takes that step out of the picture
 *    and pays it back as an orbit at MAX_FOLLOW_YAW_RATE, because a shared
 *    metres-per-second factor resolving it instead is a Cartesian co-lerp and
 *    ran the view through the pole. The player's own re-aim, the camera key
 *    twice, is the same step and gets the same orbit.
 *  - A long frame. Position blends are capped at MAX_POSITION_K and dt is
 *    capped at MAX_FRAME_DT, so a backgrounded tab resumes without a lurch.
 *  - Customize. The Studio blend runs between framings whose bearings can differ
 *    by half a turn, so it is the same polar blend as the mode swap.
 *  - The result. ONE budget, `viewBudget`, opened on the committed pose at the
 *    top of the frame and spent by every stage below it. Each stage resolves
 *    its own weight against what the WHOLE composed pose would cost against
 *    that one allowance, and `commit` holds the composed pose inside it
 *    whatever the stages did. Nothing here carries a rate ceiling of its own,
 *    so there is nothing left to compose additively. MODE_MAX_TURN_RATE carries
 *    the figures.
 *
 * Ordering: `CameraRig` leaves priority at 0, so this runs after `useGameLoop`
 * (-1) and `IntentResolver` (-2) and reads a dog the sim has already stepped.
 */

import * as THREE from 'three/webgpu';
import type { Dog } from '@sim/types';
import { createClassicFraming } from './classicFraming';
import {
  createCustomizeFraming,
  type DogCameraAngle,
} from './customizeFraming';
import {
  REDUCED_MOTION_TURNING,
  createFollowFraming,
  slowerTurning,
  type FollowTurning,
} from './followFraming';
import { createRidgeClamp } from './ridgeClamp';
import type { FollowViewProfile } from './viewProfile';
import {
  MAX_FOLLOW_YAW_RATE,
  MAX_FRAME_DT,
  MODE_BLEND_SECONDS,
  MODE_MAX_TURN_RATE,
  createOrbitBlend,
  createOrbitCarry,
  easeInOut,
  isFinitePoint,
} from './feel';
import { createViewBudget } from './viewBudget';
import {
  COMPLETION_CAMERA_SECONDS,
  advanceCompletion,
  smoothArrival,
} from '@app/scene/juice/completionMotion';

/**
 * Seconds for a Classic <-> Follow swap while Reduce motion is on. This was
 * 0.15 s, five times faster than the default, so the setting a sick player
 * reaches for made the one camera event they trigger repeatedly far more
 * violent: with the current rigs a 22 m move in 0.15 s, on the order of
 * 150 m/s, plus a field-of-view change in portrait over the same interval.
 */
const REDUCED_MODE_BLEND_SECONDS = 1.2;

/**
 * Seconds for the Studio blend into and out of Customize, from 0.4 s.
 *
 * Its ends are the gameplay eye, 26 m back along whatever bearing the player was
 * chasing on, and the studio eye a few metres from the dog on a fixed one. Those
 * bearings can be opposed, and lerping the two poses in Cartesian space then put
 * the eye through the subject: on the shipped default entry - the title screen,
 * Classic, the hero angle - the round that found it measured the composed view
 * at 784 deg/s at 60 Hz and 791 at 144, passing 0.158 degrees from straight
 * down, with the horizon flipped at up to 22,613 deg/s on 63 of 360 exit
 * angles. It is an orbit now, on the same
 * `createOrbitBlend` the mode blend uses, so the nominal duration is the only
 * thing this constant has to be.
 *
 * It is nominal rather than real, and always was: what an entry costs is what
 * the frame's budget allows, not what this asks for. MODE_MAX_TURN_RATE carries
 * the measured durations.
 */
const CUSTOMIZE_BLEND_SECONDS = 0.6;

/**
 * How near straight down the completion pull-back may bring the view, rad.
 * 45 degrees.
 *
 * It bounds ONE term of one move - the completion aim's travel along the line of
 * sight - and it is worth being exact about what that does and does not promise.
 *
 * The eye and the aim both run from their start to their target on one settle
 * value, so the gap between them along the sight line and the drop from eye to
 * aim are both LINEAR in that value, and the angle off vertical, whose tangent
 * is gap over drop, is therefore monotone across the whole move. Its smallest
 * value is at one of the two ends. This bounds the far end at 45 degrees by
 * holding the only term that closes the gap; the near end is the angle the run
 * happened to finish on, which no clamp here can lift.
 *
 * SO THE PROMISE IS: the move never brings the view nearer straight down than
 * the angle it started at, and never nearer than 45 degrees when it started
 * further off than that. Where there is no room, the closing term is held at
 * zero; the eye's own 11 m pull-back and 3.5 m of lift still run, and so does
 * whatever part of the aim swing lies ACROSS the line of sight, so the shot
 * does not keep the angle it had - it only never loses ground on it.
 *
 * Measured over the completion at every bearing from the south end, the north
 * end and mid-field, the shot bottoms out at exactly 45.000 degrees off
 * straight down in Follow, against 0.115 degrees and a full horizon flip before
 * this bound existed, and at 43.100 in Classic, which is the angle Classic's
 * own framing arrives at the end of a run holding.
 */
const COMPLETION_MIN_NADIR = (45 * Math.PI) / 180;

/** What the store is telling the rig this frame. Mutated in place by the
 *  caller: a fresh object per frame would allocate in a `useFrame` path, which
 *  is why the dog and the delta are arguments and everything else lives here. */
export interface ComposedRigInput {
  /** The sim object. Identity only: a new one is a run start or a reset. */
  sim: object;
  /** `cameraMode === 'follow'`, or the sanctioned debug override. */
  follow: boolean;
  reducedMotion: boolean;
  turning: FollowTurning;
  /** `gamePhase === 'complete'`. */
  complete: boolean;
  /** `uiPanel === 'customize'`. Drives the Studio blend. */
  customize: boolean;
  customizeTab: 'dog' | 'flock' | 'sheep';
  customizeDogAngle: DogCameraAngle;
  customizeOrbitAngle: number;
  customizeSelectedSheep: number;
  sheep: readonly { readonly position: { readonly x: number; readonly z: number } }[];
}

export interface ComposedRig {
  /** The committed eye. What the caller copies to `camera.position`. */
  readonly position: THREE.Vector3;
  /** The committed aim. What the caller passes to `camera.lookAt`. */
  readonly aim: THREE.Vector3;
  /** The eased Classic <-> Follow weight. 0 is Classic, 1 is Follow. */
  readonly modeWeight: number;
  /** The eased Studio weight. 0 is gameplay, 1 is Customize. */
  readonly customizeWeight: number;
  /** The live framings, for a caller that needs to pin an end of the swap. */
  readonly classic: { readonly position: THREE.Vector3; readonly aim: THREE.Vector3 };
  readonly follow: { readonly position: THREE.Vector3; readonly aim: THREE.Vector3 };
  /** Follow's geometry, which changes with the canvas aspect. */
  setFollowView(view: FollowViewProfile): void;
  /** `studioLayout(...).distanceScale`, which changes with the canvas size. */
  setStudioDistance(scale: number): void;
  /** Advance `dt` seconds against `dog` in the state `input` describes. */
  frame(dt: number, dog: Dog, input: ComposedRigInput): void;
}

export interface ComposedRigOptions {
  /** The framing the page loaded in, so the first frame is not a transition. */
  readonly follow: boolean;
  /** The sim the rig is built against: one it has not had replaced under it. */
  readonly sim: object;
  readonly view?: FollowViewProfile;
  readonly turning?: FollowTurning;
}

export function createComposedRig(options: ComposedRigOptions): ComposedRig {
  const classic = createClassicFraming();
  const follow = createFollowFraming(options.view, options.turning);
  const customize = createCustomizeFraming();
  const transitionFloor = createRidgeClamp();
  const modeBlend = createOrbitBlend();
  const studioBlend = createOrbitBlend();
  // Follow is the one framing that is ever handed a pose rather than reaching
  // it, so it is the one that carries its own recovery. The rig frames from the
  // carry's output, which is Follow's own pose whenever nothing is outstanding.
  const followCarry = createOrbitCarry(MAX_FOLLOW_YAW_RATE);
  // The composition's own recovery, for the one pose it is ever handed rather
  // than reaches: the end-of-run pull-back being left. See the exit below.
  const completionCarry = createOrbitCarry(MAX_FOLLOW_YAW_RATE);
  const budget = createViewBudget();

  const followEye = new THREE.Vector3();
  const followAim = new THREE.Vector3();
  const studioEye = new THREE.Vector3();
  const position = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const candidate = new THREE.Vector3();
  const completionPosition = new THREE.Vector3();
  const completionAim = new THREE.Vector3();
  const completionTargetPosition = new THREE.Vector3();
  const completionTargetAim = new THREE.Vector3();
  const completionDirection = new THREE.Vector3();
  const heldPosition = new THREE.Vector3();
  const heldAim = new THREE.Vector3();

  // Seated from the mode the page loaded in, and the target with it, or the
  // first frame reads as an entry into Follow and re-arms a bearing the rig is
  // about to arm anyway.
  const seatedMode = options.follow ? 1 : 0;
  let blend = seatedMode;
  let modeTarget = seatedMode;
  let simSource = options.sim;
  let customizeBlend = 0;
  let weight = easeInOut(blend);
  let cWeight = 0;
  let studioDistance = 1;
  let completion = 0;
  let wasComplete = false;
  /** Whether THIS completion phase is running a pull-back. Latched at entry. */
  let completionPullBack = false;
  /** Whether `heldPosition` and `heldAim` hold a pose that was ever good. */
  let poseHeld = false;

  return {
    position,
    aim,
    classic,
    follow,
    get modeWeight(): number {
      return weight;
    },
    get customizeWeight(): number {
      return cWeight;
    },
    setFollowView(view: FollowViewProfile): void {
      follow.setView(view);
    },
    setStudioDistance(scale: number): void {
      studioDistance = scale;
    },
    frame(delta: number, dog: Dog, input: ComposedRigInput): void {
      const { reducedMotion } = input;
      // Clamped at BOTH ends. The cap is the long frame a backgrounded tab
      // hands back. The floor is the frame worth no time at all - a duplicated
      // frame, a paused clock, a delta that arrives as NaN - which buys no
      // rotation and no travel and must therefore advance nothing. Written as
      // `delta > 0` rather than `Math.max(0, ...)` because that comparison is
      // false for NaN and the clamp is false for it too.
      const dt = delta > 0 ? Math.min(delta, MAX_FRAME_DT) : 0;

      // Reduce motion clamps the turning rather than writing to the setting, so
      // the player's own choice is still there when they switch it back off.
      //
      // It clamps to the slowest TRACKING profile, and deliberately not to
      // `off`. `off` pins the bearing where it was armed, which is a reasonable
      // thing for a player to ASK for and the wrong thing to hand someone who
      // never asked. Most of them never did: the setting follows the operating
      // system's `prefers-reduced-motion` until the player touches the toggle,
      // and phones ship with that on far more often than desktops do.
      //
      // It also stopped being only a camera preference. The movement basis
      // tracks this bearing, so a pinned bearing pins the basis too, and a held
      // thumb turns the dog through one corner and then runs it straight. That
      // is the defect this replaces, measured at 88.5 degrees of total turn
      // against 281.7 with the same hold and the same profile.
      //
      // Reduce motion still means less motion: the clamp can only ever lower
      // the profile, so a player on `quick` gets `gentle` and a player who
      // chose `off` keeps it.
      follow.setTurning(reducedMotion
        ? slowerTurning(input.turning, REDUCED_MOTION_TURNING)
        : input.turning);

      // ONE SCALE FOR EVERY ROTATION ALLOWANCE THIS FILE OWNS. Reduce motion
      // lengthens the swap, and the same factor is applied to the frame's
      // rotation budget and to both carries' pay-back rates, so the player who
      // asked for less motion gets less of it from every stage rather than a
      // longer blend sitting on top of everyone else's recovery rate. The
      // carries were the one allowance it used to miss, and a recovery under
      // Reduce motion was measured faster than the same recovery without it.
      const blendSeconds = reducedMotion ? REDUCED_MODE_BLEND_SECONDS : MODE_BLEND_SECONDS;
      const motionScale = MODE_BLEND_SECONDS / blendSeconds;
      followCarry.setScale(motionScale);
      completionCarry.setScale(motionScale);

      // Follow arms its bearing from the dog's direction of travel, and there
      // are two moments where the armed bearing has stopped being a fact about
      // anything: entering the mode, and the sim being replaced underneath it.
      // At the `off` end stop the first of those is the whole of the player's
      // camera authority - the documented gesture is the camera key twice,
      // Follow to Classic to Follow - so it re-arms when the target flips
      // rather than when the blend that follows finishes.
      const target = input.follow ? 1 : 0;
      const simChanged = input.sim !== simSource;
      if ((target === 1 && modeTarget === 0) || simChanged) {
        follow.reseat();
        // The pose the next update writes is one the rig did not travel to, and
        // the picture is not the place to resolve that. `followCarry` takes the
        // step out and pays it back as an orbit; see its own header.
        //
        // Only while Follow is on screen, though, and the blend weight is what
        // says whether it is. A step in a framing the picture is not made of
        // costs nothing to take now and something to carry: a re-aim from a
        // settled Classic re-arms at weight zero, where the jump is worth
        // exactly nothing, and carrying it there would keep the discrepancy
        // alive into the frames where the weight has risen and made it visible.
        // That is a slower way of showing the same step, which is the opposite
        // of the point.
        if (blend > 0) followCarry.hold();
      }
      modeTarget = target;
      simSource = input.sim;

      classic.update(dt, dog);
      follow.update(dt, dog);
      followCarry.track(dt, follow.position, follow.aim, followEye, followAim);
      customize.update(
        dt,
        input.customizeTab,
        input.customizeDogAngle,
        input.customizeOrbitAngle,
        input.customizeSelectedSheep,
        dog,
        input.sheep,
      );

      // ONE budget for the frame, opened on the pose the camera was left at,
      // and scaled by the frame's motion scale like every other allowance.
      budget.open(dt, MODE_MAX_TURN_RATE * motionScale);

      const held = easeInOut(blend);
      modeBlend.seat(classic.position, classic.aim, followEye, followAim, held);
      const step = dt / blendSeconds;
      let advance = Math.max(-step, Math.min(step, target - blend));
      if (advance !== 0) {
        // The passes are how the stage picks its OWN shape. The rotation is
        // far from linear in the weight, so one estimate of the excess is only
        // an estimate, and whatever a stage leaves over, the commit at the foot
        // of the frame takes off as a clamp. Three is a convergence detail and
        // NOT the guarantee: measured this round at 30 fps over a swap at 24
        // bearings on all three turning profiles, the composed peak is
        // 90.00 deg/s and the longest swap 4.30 s at one, two, three, four or
        // six passes alike. The bound is `budget.commit`, which is the point of
        // having put it there. What each pass measures is the COMPOSED pose the
        // weight would produce, against the budget the frame opened with, so
        // the framings' own motion is inside the weight's budget rather than
        // added to it and the blend yields to them instead of stacking on top.
        for (let pass = 0; pass < 3; pass += 1) {
          const next = easeInOut(blend + advance);
          const excess = Math.max(
            budget.spend(modeBlend.view(next, candidate)),
            modeBlend.reach(next, budget.eye) / budget.travel,
          );
          if (excess <= 1) break;
          advance /= excess;
        }
      }
      blend += advance;

      weight = easeInOut(blend);
      modeBlend.pose(weight, position, aim);
      studioEye.copy(customize.position).sub(customize.aim)
        .multiplyScalar(studioDistance).add(customize.aim);

      // Seated on the gameplay pose this frame and the Studio pose this frame,
      // and blended about the aim rather than across it, exactly as the mode
      // blend above is: the two bearings can be opposed, and the straight line
      // between opposed poses runs through the `lookAt` singularity. Its weight
      // draws from the same budget, and because the Studio blend is seated ON
      // the composed gameplay pose, what it measures already contains the mode
      // blend's share: the later stage subsumes the earlier one rather than
      // adding to it.
      const cHeld = easeInOut(customizeBlend);
      studioBlend.seat(position, aim, studioEye, customize.aim, cHeld);
      const customizeTarget = input.customize ? 1 : 0;
      const customizeStep = dt / CUSTOMIZE_BLEND_SECONDS;
      const customizeRemaining = customizeTarget - customizeBlend;
      let customizeAdvance = Math.max(-customizeStep, Math.min(customizeStep, customizeRemaining));
      if (customizeAdvance !== 0) {
        for (let pass = 0; pass < 3; pass += 1) {
          const next = easeInOut(customizeBlend + customizeAdvance);
          const excess = Math.max(
            budget.spend(studioBlend.view(next, candidate)),
            studioBlend.reach(next, budget.eye) / budget.travel,
          );
          if (excess <= 1) break;
          customizeAdvance /= excess;
        }
      }
      customizeBlend += customizeAdvance;
      cWeight = easeInOut(customizeBlend);
      if (cWeight > 0) studioBlend.pose(cWeight, position, aim);

      const complete = input.complete;
      // REDUCE MOTION HAS NO CAMERA MOVE HERE AT ALL, AND THAT IS THE WHOLE OF
      // WHAT IT DOES TO THE PHASE. The pull-back is a dramatic move and is
      // correctly suppressed; what used to happen is that the suppressed move
      // was still COMMITTED, as a lerp from the entry pose to a target equal
      // to it, so the picture froze on the entry pose for the length of the
      // phase while the dog coasted on. That is not less motion, it is
      // deferred motion: the gap between the frozen pose and where the live
      // rig belonged grew for seconds and was paid off in one transition at
      // the exit, by the two carries together, at up to 50.000 deg/s against
      // the 26.699 the same exit cost with the setting OFF. An accessibility
      // setting made the commonest transition in the game - finish a run,
      // press restart - more violent than leaving it alone. With the setting
      // on the rig is simply left tracking the dog: nothing is committed here,
      // no pose is handed to the composition, no debt accumulates and there is
      // nothing to pay off at the exit.
      //
      // AND IT IS SEATED ON A SETTLED FRAMING, not on whatever pose the first
      // frame of the phase happened to hold. A run can finish while a swap or
      // a Studio entry is in flight, and freezing a half-blended pose abandons
      // the transition the player started at a pose that is neither framing,
      // then pays the rest of it at the exit - the same shape of defect, in a
      // different place. It also seats the bound below on a pose whose pitch
      // is a blend of two framings' rather than a framing's own, which is what
      // that bound's reasoning assumes it has. So the move waits for the blends
      // to arrive, which they do within MODE_BLEND_SECONDS of the last input
      // that moved them, and the rig tracks the dog until they do.
      //
      // Read per frame rather than latched, so the two settings agree about
      // what is running: turning Reduce motion off during the results screen
      // seats the move from there, and turning it on during the move leaves it
      // running inside the reduced allowance rather than cutting it.
      const settledFraming = (blend === 0 || blend === 1)
        && (customizeBlend === 0 || customizeBlend === 1);
      if (complete && !completionPullBack && !reducedMotion && settledFraming) {
        completionPullBack = true;
        completion = 0;
        completionPosition.copy(position);
        completionAim.copy(aim);
        completionDirection.subVectors(completionPosition, completionAim).normalize();
        completionTargetPosition.copy(completionPosition)
          .addScaledVector(completionDirection, 11);
        completionTargetPosition.y += 3.5;
        completionTargetAim.copy(completionAim);
        // The aim swings toward the pen, up to 42 m of it, while the eye is
        // pulled back from the aim; both then move on one settle value along
        // their own straight lines. A run that ends with the dog at the south
        // end running away from the pen closes the ground gap between the two
        // to 0.08 m under a 19.6 m drop: the view a fifth of a degree from
        // straight down, measured at 0.115 on the frames the camera actually
        // drew, with the horizon flipping through it. The END of that move is
        // degenerate, not only the path, so the move is BOUNDED rather than
        // re-shaped: an orbit to a pose that points at the ground is still a
        // picture that points at the ground.
        //
        // What is bounded is the only term that closes the gap, the aim's
        // travel along the line of sight. The eye's own pull opens it, and the
        // aim never changes height, so holding the closing term holds every
        // frame of the path and not just its end.
        let toPenX = (0 - completionAim.x) * 0.2;
        let toPenZ = (106 - completionAim.z) * 0.2;
        const ground = Math.hypot(completionDirection.x, completionDirection.z);
        if (ground > 0) {
          const sightX = completionDirection.x / ground;
          const sightZ = completionDirection.z / ground;
          const gap = (completionTargetPosition.x - completionAim.x) * sightX
            + (completionTargetPosition.z - completionAim.z) * sightZ;
          const drop = completionTargetPosition.y - completionAim.y;
          const closing = toPenX * sightX + toPenZ * sightZ;
          const room = gap - drop * Math.tan(COMPLETION_MIN_NADIR);
          // Only the closing component is held. What is left of the swing is
          // across the line of sight, which can only widen the gap, and it is
          // the half of the move that is doing the visible work: a run that
          // ends at the gate is recentred on the gate whatever this bounds.
          const allowed = Math.min(closing, Math.max(0, room));
          toPenX -= (closing - allowed) * sightX;
          toPenZ -= (closing - allowed) * sightZ;
        }
        completionTargetAim.x += toPenX;
        completionTargetAim.z += toPenZ;
      }
      // Leaving the phase drops the pose straight back to the live blend, on
      // the commonest transition in the game - finish a run, press restart.
      // Measured this round, the six seconds after the exit carry 36.15 degrees
      // of view rotation at the `off` end stop and 97.81 at gentle, and the
      // round before this one measured the step itself at up to 14.5 m at the
      // eye and 21 m at the aim. It used to be left as a step on the
      // grounds that the sim is always replaced on the way out, which would
      // hand it to `followCarry`. That was false twice over. `reportGraphicsLost`
      // takes 'complete' straight to 'paused' with the same sim in place, so
      // there is an exit with no replacement at all; and Follow's carry only
      // ever covered Follow's own share of the pose, never the pull-back's.
      //
      // So the composition carries its own recovery, on the same orbit Follow
      // uses and for the same reason: this is a pose the rig was handed rather
      // than one it travelled to, and a shared metres-per-second factor
      // marching eye and aim along their own straight lines is a Cartesian
      // co-lerp. With this there is no such lerp left anywhere in the rig.
      //
      // Only a pull-back leaves a pose to recover from. With Reduce motion on
      // the rig tracked the dog for the whole phase, so what the exit drops
      // back to is the pose it is already holding: nothing is held, because
      // holding a step of zero would still cost a frame of the carry's own
      // resolution and there is no step.
      if (!complete && wasComplete) {
        completion = 0;
        if (completionPullBack) completionCarry.hold();
        completionPullBack = false;
      }
      wasComplete = complete;

      if (complete && completionPullBack) {
        // `false` rather than `reducedMotion`, and it is not a stray argument.
        // `advanceCompletion` shortens a reduced transition to 0.18 s against
        // this 3.2 s, which is right for the bloom and the gate - a state
        // change the player should still see, taken quickly - and wrong for a
        // camera, where 17.8x the speed is 17.8x the rotation. This branch only
        // runs when Reduce motion was OFF at the entry, and if it is switched
        // on mid-move the answer is not to sprint the rest of the pull-back:
        // the frame's budget has already dropped to the reduced allowance and
        // the commit holds the move inside it.
        completion = advanceCompletion(completion, true, dt, COMPLETION_CAMERA_SECONDS, false);
        const settle = smoothArrival(completion);
        position.lerpVectors(completionPosition, completionTargetPosition, settle);
        aim.lerpVectors(completionAim, completionTargetAim, settle);
      }
      // Pass-through bit for bit whenever nothing is outstanding, so a settled
      // end of a swap is still the framing itself.
      completionCarry.track(dt, position, aim, position, aim);

      // Safe endpoints do not imply a safe path between camera modes.
      if (weight > 0 && weight < 1 && cWeight === 0) {
        position.y = transitionFloor.clamp(position.y, position.x, position.z,
          dog.position.x, dog.position.z, dt);
      }
      // The one place the picture is decided. Every stage above resolved its
      // own weight against this same budget, measured from where the camera
      // actually is, so on a swap, an entry or a recovery this is at or near a
      // no-op and the shape of the path is the stage's own. It still has real
      // work on the moves no stage owns - the completion phase being entered
      // and left, and a frame long enough for the dt cap to bite - which is
      // what a budget on the result is for.

      // THE GUARD IS ON THE CLASS, NOT ON AN INSTANCE OF IT. Everything above
      // is float arithmetic, and a non-finite value anywhere in it does not
      // cost one frame: it is written to `camera.position` and `lookAt`, and
      // `budget.commit` records it as the pose the NEXT frame is measured
      // against, so it reproduces itself for the rest of the session. One
      // zero-length frame with a carry outstanding used to be enough to start
      // that. The divisions that produced it are fixed where they live, in
      // `createOrbitCarry` and in the dt clamp at the top of this frame; this
      // is the backstop for the ones nobody has found yet. The picture holds
      // its last good pose, and the budget is never handed a pose it cannot
      // measure the next frame against.
      if (poseHeld && !(isFinitePoint(position) && isFinitePoint(aim))) {
        position.copy(heldPosition);
        aim.copy(heldAim);
      }
      budget.commit(position, aim);
      if (isFinitePoint(position) && isFinitePoint(aim)) {
        heldPosition.copy(position);
        heldAim.copy(aim);
        poseHeld = true;
      }
    },
  };
}
