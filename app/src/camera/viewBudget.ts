// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * ONE budget for the composed view, opened and spent once a frame.
 *
 * WHY THIS EXISTS. The camera is a chain: two framings, a Follow recovery, a
 * mode blend, a Studio blend, a completion move, a floor clamp. Each of those
 * used to carry its own rate ceiling, and each was measured against its own
 * reference - the blend against the pose the blend itself had last, not against
 * the picture the player was looking at. Two things follow from that, and both
 * shipped. Independently capped rotations COMPOSE ADDITIVELY, so the total on
 * screen exceeded every individual ceiling. And a stage that was slowed by a
 * ceiling downstream left a backlog its own budget could not see, which came
 * back as a spike on the frame the downstream ceiling stopped binding.
 *
 * The thing a player's inner ear responds to is the rotation of the FINAL view
 * direction, and that exists in exactly one place: the end of the frame, after
 * every contributor. So there is one budget, it belongs to the frame rather
 * than to any stage, and it is measured from the picture:
 *
 *  - `open` reads the pose the camera was left at and sets the frame's
 *    allowance: how far the eye may travel and how far the view may turn.
 *  - a contributor resolving a weight asks `spend` and `travel` what the
 *    COMPOSED pose it is about to produce would cost against that one
 *    allowance, and backs its own step off until it fits. Later stages
 *    subsume earlier ones, because each measures the composed result and not
 *    its own share of it.
 *  - `commit` holds the composed pose inside the allowance whatever the stages
 *    did. That is the guarantee; the stages resolving first is only what keeps
 *    the commit from having to distort the shape of a path.
 *
 * A stage added later is bounded whether or not its author reads this file,
 * which is the property four rounds of capping paths one at a time never got.
 *
 * TURNING IS POLAR, FOR THE REASON `createOrbitBlend` IS. Rotating the view
 * along the shortest great-circle arc toward a target on the far side of the
 * sky can pass through straight down, where `lookAt` against a world up is
 * degenerate and the horizon flips in one frame. `turnToward` interpolates the
 * bearing and the horizontal radius of the direction instead, exactly as the
 * orbit blend interpolates a pose about its aim: the radius runs linearly
 * between two values, so the height-to-radius ratio is monotone in `k` and the
 * result's angle off vertical stays BETWEEN its two endpoints' angles. The
 * limiter can therefore never be the thing that puts the view near a pole.
 */

import * as THREE from 'three/webgpu';
import { MAX_RIG_SPEED, lerpAngle } from './feel';

/**
 * Interpolate a unit direction from `from` toward `to` by `k`, in polar form,
 * into `out`. Returns `out`, normalized. Both inputs must be unit vectors.
 */
function turnToward(
  from: THREE.Vector3,
  to: THREE.Vector3,
  k: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const fromRadius = Math.hypot(from.x, from.z);
  const toRadius = Math.hypot(to.x, to.z);
  const bearing = lerpAngle(Math.atan2(from.x, from.z), Math.atan2(to.x, to.z), k);
  const radius = fromRadius + (toRadius - fromRadius) * k;
  out.set(
    Math.sin(bearing) * radius,
    from.y + (to.y - from.y) * k,
    Math.cos(bearing) * radius,
  );
  const length = out.length();
  return length > 0 ? out.divideScalar(length) : out.copy(from);
}

export interface ViewBudget {
  /**
   * The eye the frame opened on. A contributor measuring its own travel passes
   * this as the anchor, so the framings' drift and anything the eye did not
   * manage to cover last frame are INSIDE the budget rather than added to it.
   */
  readonly eye: THREE.Vector3;
  /** Metres the eye may cover this frame. Infinity until the first commit. */
  readonly travel: number;
  /** Open the frame on the committed pose. `turnRate` is rad/s. */
  open(dt: number, turnRate: number): void;
  /**
   * The share of the frame's rotation a candidate COMPOSED view direction would
   * spend: 1 is all of it. `view` must be a unit vector.
   */
  spend(view: THREE.Vector3): number;
  /**
   * Hold a composed pose inside this frame's allowance, in place, and record it
   * as the pose the next frame opens on.
   *
   * The eye is held first and on its own, then the view direction is turned no
   * further than the allowance and the aim is rebuilt along it at its own range.
   * Eye and aim are NOT marched along their own straight lines on one shared
   * factor: that is a Cartesian co-lerp, it rotates the picture by
   * 2 * speed / separation with nothing measuring it, and it is what this
   * replaced.
   */
  commit(eye: THREE.Vector3, aim: THREE.Vector3): void;
}

/**
 * One budget per rig. It holds the committed pose between frames, so there is
 * no separate `seated` flag anywhere else: the first frame of the page has no
 * picture to move from and seats, and every frame after it is bounded.
 */
export function createViewBudget(): ViewBudget {
  const eye = new THREE.Vector3();
  /** Last committed view direction, unit. What `spend` and `commit` measure. */
  const view = new THREE.Vector3();
  const step = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const turned = new THREE.Vector3();
  let seated = false;
  let travel = Infinity;
  let turn = Infinity;

  return {
    eye,
    get travel(): number {
      return travel;
    },
    open(dt: number, turnRate: number): void {
      travel = seated ? MAX_RIG_SPEED * dt : Infinity;
      turn = seated ? turnRate * dt : Infinity;
    },
    spend(candidate: THREE.Vector3): number {
      return turn === Infinity ? 0 : view.angleTo(candidate) / turn;
    },
    commit(outEye: THREE.Vector3, outAim: THREE.Vector3): void {
      if (seated) {
        // The direction the stages composed, read BEFORE the eye is held back.
        // Reading it after would make the committed view the line from a
        // lagging eye to a moving aim, which is a direction no stage produced
        // and no stage bounds: it pitches down as the eye falls behind, and
        // the rate limit then walks the picture into it a few degrees a frame.
        // Measured that way the view reached 23.8 degrees off straight down,
        // against the 45 the framings and the orbit blend hold between them.
        direction.subVectors(outAim, outEye);
        const range = direction.length();
        step.subVectors(outEye, eye);
        const covered = step.length();
        const heldBack = covered > travel;
        if (heldBack) outEye.copy(eye).addScaledVector(step, travel / covered);
        if (range > 0) {
          direction.divideScalar(range);
          let spent = view.angleTo(direction);
          const turning = spent > turn;
          if (turning) {
            // Proportional backoff, the way every weight in the rig resolves,
            // because the displacement is not linear in `k`. The 0.999 is what
            // makes it terminate rather than converge: each pass strictly
            // shrinks `k`, and `k` at zero spends nothing.
            let k = turn / spent;
            for (let pass = 0; pass < 8; pass += 1) {
              spent = view.angleTo(turnToward(view, direction, k, turned));
              if (spent <= turn) break;
              k *= Math.min(0.999, turn / spent);
            }
            direction.copy(turned);
          }
          // Rebuilt only when something was actually held, so a frame inside
          // the budget passes through bit for bit. A settled swap ends on the
          // framing's own pose, and "close enough" is how a seam gets there.
          if (heldBack || turning) outAim.copy(outEye).addScaledVector(direction, range);
          view.copy(direction);
        }
      } else {
        view.subVectors(outAim, outEye);
        if (view.lengthSq() > 0) view.normalize();
        seated = true;
      }
      eye.copy(outEye);
    },
  };
}
