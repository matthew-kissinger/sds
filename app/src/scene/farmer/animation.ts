// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Distance-driven stance/swing and two quiet chore poses on the actual rig. */
import type { FarmerBones } from './geometry';
import type { FarmerMotion } from './route';
const LEG = 0.53;
const CYCLE_DISTANCE = 1.1;
const STANCE = 0.60;
/** Reused scalar outputs avoid allocating foot targets in the frame loop. */
export function poseFarmer(bones: FarmerBones, motion: FarmerMotion, reduced: boolean,
  sample: (x: number, z: number) => number, ground: number): void {
  const effort = Math.min(1, motion.speed / 0.50);
  const choreEnvelope = motion.activity === 'walk' ? 0
    : Math.min(1, motion.activityTime / 1.2) * Math.min(1,
      motion.waitRemaining / 1.2);
  const inspect = motion.activity === 'inspect' ? Math.max(0, choreEnvelope) : 0;
  const look = motion.activity === 'look' ? Math.max(0, choreEnvelope) : 0;
  // Leave knee bend for the forward/back stance target. At the 1.10 m rest
  // height the straight legs already exhaust their reach before any stride.
  bones.hips.position.y = 1.04 - inspect * 0.13;
  bones.spine.rotation.x = inspect * 0.45;
  bones.spine.rotation.z = reduced ? 0 : Math.sin(motion.distance / CYCLE_DISTANCE * Math.PI * 2) * 0.018 * effort;
  bones.head.rotation.x = inspect * 0.15 - look * 0.09;
  bones.head.rotation.y = reduced ? 0 : Math.sin(motion.activityTime * 0.38) * 0.18 * look;
  const phaseBase = motion.distance / CYCLE_DISTANCE;
  const c = Math.cos(motion.yaw); const s = Math.sin(motion.yaw);
  for (let side = 0; side < 2; side++) {
    const left = side === 0;
    const phase = (phaseBase + side * 0.5) % 1;
    const recovery = Math.max(0, (phase - STANCE) / (1 - STANCE));
    const z = (phase < STANCE ? 0.33 - 0.66 * phase / STANCE
      : -0.33 + 0.66 * recovery * recovery * (3 - 2 * recovery)) * effort;
    const lift = phase < STANCE ? 0 : Math.sin(recovery * Math.PI) * 0.16 * effort;
    const x = left ? 0.18 : -0.18;
    const contact = sample(motion.x + x * c + z * s, motion.z - x * s + z * c) - ground;
    const down = bones.hips.position.y - (0.04 + lift + contact);
    const distance = Math.min(LEG * 2 - 0.001, Math.max(0.4, Math.hypot(down, z)));
    const bend = Math.acos(distance / (2 * LEG));
    const upper = left ? bones.leftLeg : bones.rightLeg;
    const knee = left ? bones.leftKnee : bones.rightKnee;
    const foot = left ? bones.leftFoot : bones.rightFoot;
    upper.rotation.x = -Math.atan2(z, down) - bend;
    knee.rotation.x = bend * 2;
    foot.rotation.x = -upper.rotation.x - knee.rotation.x;
    const arm = left ? bones.leftArm : bones.rightArm;
    const elbow = left ? bones.leftElbow : bones.rightElbow;
    arm.rotation.x = Math.sin(phase * Math.PI * 2) * 0.24 * effort - inspect * 0.7;
    arm.rotation.z = left ? 0.09 : -0.09;
    elbow.rotation.x = -0.22 - inspect * 0.45;
  }
  // Right hand comes to the hat brim while checking the far field.
  bones.rightArm.rotation.x -= look * 1.65;
  bones.rightArm.rotation.z -= look * 0.25;
  bones.rightElbow.rotation.x -= look * 1.05;
}
