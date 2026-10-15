// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Real bone hierarchy shared by coat and outline, with authored pose blending and foot contacts. */
import * as THREE from 'three/webgpu';
import type { Heightfield } from '@app/world/heightfield';
import { DOG_PAW_CONTACTS } from './dogGeometry';
import { DOG_JOINTS, DOG_LEG_ROOTS } from './dogRigDefinition';
import { DOG_MAX_PAW_REACH, type DogPawPose } from './dogGait';
import { DogLegSolver } from './dogLegSolver';
import type { DogMaterial } from './dogMaterial';
import { DOG_SPRINT_SPEED } from '@sim/tuning';
import { dogFootPose, DOG_MAX_BANK, type DogMotion } from './dogMotion';

// At full bank the inside fore-limb runs out of reach, and a real animal buys
// the same reach back the same way, by dropping its chest.
const BANK_ROOT_DROP = 0.1;
/**
 * How far the chest sits below the bind pose when the dog is standing still.
 *
 * BOTH CHAINS BIND ALL BUT STRAIGHT - the hind limb 0.17% short, the fore 0.77%
 * - so the bind pose is itself within a millimetre of the cusp where a two-bone
 * solve has infinite slope. The `-0.17 * moving` term below lowers a MOVING dog
 * and goes to nothing at a standstill, which used to be harmless only because
 * `dogStride` never quite reached zero and so a standing foot was never quite
 * at its rest contact. Now that a stopped dog's feet really are at rest, the
 * hind limb stands at 1.0000 of its bone and the solver clamps: measured over
 * the whole of a standstill, not as a transient. A centimetre of ground under
 * one paw is then tens of millimetres of knee.
 *
 * 0.045 m buys the fore limb back to 0.940 and the hind to 0.950, costs 4.5 cm
 * of a 1.05 m standing height, and is a FLOOR rather than an addition - above
 * 0.4 m/s the moving term is already deeper and nothing here applies, so no
 * speed the dog actually runs at is touched. It carries `upright` for the same
 * reason every other root term does: the seated pose is solved against the
 * ground it sits on and must not move.
 *
 * This is a floor on the symptom. The cure is an authored stifle angle, which
 * moves the bind pose and so the skinning; STATUS.md carries it.
 */
const STAND_DROP = 0.045;
// And past a trot the STRIDE runs the hind limb out of reach, for the same
// reason and with the same answer. The hind paw rests 0.08 m behind its hip, so
// at the end of a 0.4 m drive it is 0.55 m aft of the hip and 0.76 below it:
// 0.94 m of demand on 0.935 m of bone, and the body bob is near its peak at
// exactly that moment, which is what tips it over. Measured, the hind limb hits
// full extension from 8 m/s and is drawn up to 72 mm above the ground it is
// supposed to be driving against at DOG_MAX_SPEED, 133 at a sprint.
//
// A galloping dog is lower than a trotting one, so the chest comes down and
// buys the reach back. 0.085 m is what closes the gap at sprint with the bob at
// its worst, and it leaves 0.29 m of belly clearance at the deepest rib.
const GALLOP_DROP = 0.085;
// Where the trot ends. Below this the hind limb has reach to spare - 0.96 of
// the chain at 4 m/s - so there is nothing to buy and a crouch would only make
// the dog look furtive at a walk.
const GALLOP_GATE_SPEED = 5;
// Launching and braking both drop the centre of mass, about 11% of the 1.05 m
// rest pelvis height. Without it the fastest acceleration in the game is free.
const CROUCH_DROP = 0.12;
// Trunk length modulation at gait frequency, half of a 5% swing across the
// 1.79 m the rig spans from tail base to nose.
const TRUNK_STRETCH = 0.045;
// The scapula travels over the ribcage with the limb it carries, which is where
// a real dog gets stance length that leg length cannot supply.
const SCAPULA_SHARE = 0.25;
/**
 * The seated pose, chosen from where the dog TOUCHES THE GROUND rather than by
 * eye. A sitting dog rests on three things: both fore paws, the point of
 * buttock, and the hocks with the metatarsus lying flat from hock to foot. Two
 * of those are contacts this rig can be solved against.
 *
 * The point of buttock is `SPINE[0]` - rest-space z -0.96, y 1.00, half height
 * 0.17, so its underside sits at y 0.83 and skins to the pelvis. Ground is
 * y 0.20, where the paws contact. So a sit has to bring that point down 0.63 m,
 * and the pose that shipped brought it down 0.30 while the `-0.17 * moving` ride
 * height RAISED the root by 0.17 as the dog stopped: measured, the point of
 * buttock finished 206 mm in the air with the hock 174 mm above the ground and
 * the hind limb folded only to 0.69 of its bone. The dog was squatting, not
 * sitting, which is what "the butt hovers" looks like from the field.
 *
 * These four were solved against the contacts on the real rig - sensitivities
 * measured one lever at a time, then a grid - and what they produce is:
 *
 * | | shipped | now | wanted |
 * | --- | --- | --- | --- |
 * | point of buttock | 0.406 | 0.203 | 0.200, the ground |
 * | hock | 0.374 | 0.200 | 0.200, the ground |
 * | fore reach | 0.973 | 0.950 | near straight, off the cusp |
 * | hind reach | 0.692 | 0.564 | folded |
 * | chest | 1.028 | 0.994 | carried by straight fore legs |
 *
 * The hock lands on the ground without being put there: once the hip is low
 * enough and the foot is under it rather than ahead of it, the solver's own
 * backward pole puts the middle joint 0.41 m behind the hip at ground level,
 * which is the hock down with the metatarsus flat and the foot forward of it.
 * That is why `SIT_HIND_ADVANCE` is what it is - it is not how far the foot
 * should look advanced, it is what puts the hock on the ground.
 *
 * `SIT_PELVIS_PITCH` and `SIT_SPINE_PITCH` are a pair: the pelvis is the parent
 * of the chest here, so dropping it drops the fore legs with it. The pelvis
 * pitches nose-up to carry the chest back to where straight fore legs can hold
 * it, and the spine takes back enough of that to leave the back sloping rather
 * than hinged.
 */
export const SIT_DROP = 0.45;
export const SIT_PELVIS_PITCH = 0.55;
export const SIT_SPINE_PITCH = 0.42;
export const SIT_HIND_ADVANCE = 0.22;

export class DogRig {
  readonly bones: THREE.Bone[];
  readonly skeleton: THREE.Skeleton;
  readonly coat: THREE.SkinnedMesh;
  readonly outline: THREE.SkinnedMesh;
  private readonly restPositions: THREE.Vector3[];
  private readonly solvers: DogLegSolver[];
  private readonly target = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();
  private readonly rotationInverse = new THREE.Quaternion();
  private readonly paws: DogPawPose[] = Array.from({ length: 4 }, () => ({ travel: 0, lift: 0, planted: true, recovery: 0, stanceTravel: 0 }));
  private readonly locks = new Float64Array(8);
  /** Where the BODY was when each foot planted, so its sweep can be measured. */
  private readonly plants = new Float64Array(8);
  private readonly recoveryOffsets = new Float64Array(8);
  private readonly planted = [false, false, false, false];
  /** Last posed body position, for the travel one frame covers. */
  private lastX = NaN;
  private lastZ = NaN;
  constructor(geometry: THREE.BufferGeometry, material: DogMaterial) {
    this.bones = DOG_JOINTS.map((joint) => {
      const bone = new THREE.Bone();
      bone.name = joint.name;
      bone.position.fromArray(joint.position);
      if (joint.parent >= 0) bone.position.sub(new THREE.Vector3().fromArray(DOG_JOINTS[joint.parent]!.position));
      return bone;
    });
    for (let i = 1; i < this.bones.length; i++) this.bones[DOG_JOINTS[i]!.parent]!.add(this.bones[i]!);
    this.restPositions = this.bones.map((bone) => bone.position.clone());
    this.coat = new THREE.SkinnedMesh(geometry, material.material);
    this.outline = new THREE.SkinnedMesh(geometry, material.outlineMaterial);
    this.coat.name = 'collie-skinned-coat';
    this.outline.name = 'collie-skinned-outline';
    this.coat.add(this.bones[0]!);
    this.coat.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.coat.bind(this.skeleton);
    this.outline.bind(this.skeleton, this.coat.bindMatrix);
    // A single nearby player mesh: do not use rest-pose bounds to cull posed ears/feet.
    this.coat.frustumCulled = false;
    this.outline.frustumCulled = false;
    this.solvers = DOG_LEG_ROOTS.map((index) => new DogLegSolver(this.bones, index));
  }
  reset(): void {
    this.planted.fill(false);
    this.recoveryOffsets.fill(0);
    // A teleported dog has not travelled the gap it was moved across.
    this.lastX = NaN;
    this.lastZ = NaN;
    this.resetBones();
  }
  private resetBones(): void {
    for (let i = 0; i < this.bones.length; i++) {
      this.bones[i]!.position.copy(this.restPositions[i]!);
      this.bones[i]!.quaternion.identity();
      this.bones[i]!.scale.setScalar(1);
    }
  }
  pose(motion: DogMotion, field: Pick<Heightfield, 'groundY'>,
    x: number, z: number, ground: number, yaw: number, secondaryMotion: number): void {
    this.resetBones();
    const bones = this.bones;
    const moving = Math.min(1, motion.locomotionSpeed / 1.5);
    const upright = 1 - motion.sit;
    // A positive rotation.z tilts the top of a bone toward local -x, and
    // motion.bank is positive for a lean toward +x, so every bank term is
    // negated here. The rig shipped with them positive, which leaned the dog
    // out of its turns and yawed the chest and head out of them as well.
    const bank = motion.bank * upright;
    for (let foot = 0; foot < 4; foot++) dogFootPose(motion, foot, this.paws[foot]!);
    // Bend the body into its stride envelope so fixed-length limbs can reach,
    // instead of stretching a paw to compensate for a rigid high torso.
    const gallop = Math.min(1, Math.max(0,
      (motion.locomotionSpeed - GALLOP_GATE_SPEED) / (DOG_SPRINT_SPEED - GALLOP_GATE_SPEED)));
    bones[0]!.position.y = -Math.max(STAND_DROP, 0.17 * moving) * upright + motion.bob
      - GALLOP_DROP * gallop * upright
      - BANK_ROOT_DROP * Math.abs(bank) / DOG_MAX_BANK
      - CROUCH_DROP * motion.crouch * moving * upright;
    bones[1]!.position.y -= motion.sit * SIT_DROP;
    bones[1]!.position.z -= motion.sit * 0.06;
    bones[1]!.rotation.set(-motion.sit * SIT_PELVIS_PITCH, motion.leadPelvis * upright, -bank * 0.4);
    bones[2]!.rotation.x = motion.sit * SIT_SPINE_PITCH;
    // The trunk is longest once per stride, where the fore feet are reaching and
    // the hind feet are still behind, which is stance length legs cannot supply.
    bones[3]!.position.z += TRUNK_STRETCH * Math.cos(motion.gaitPhase)
      * motion.effort * moving * upright * secondaryMotion;
    // Yaw lead composes down the chain, so each bone carries only what the one
    // before it has not already supplied and the differences are the spine bend.
    bones[3]!.rotation.set(motion.lean, (motion.leadChest - motion.leadPelvis) * upright, -bank * 0.6);
    bones[4]!.rotation.x = -motion.bark * 0.12 - motion.sit * 0.09;
    // The head counter-rolls to half the trunk bank, because a running animal
    // keeps its eyes level, and it reaches the yaw lead before the trunk does.
    bones[5]!.rotation.set(motion.effort * 0.035 - motion.bark * 0.11,
      (motion.leadHead - motion.leadChest) * upright, motion.headTilt + bank * 0.5);
    const earSwing = (motion.bank - motion.earLag) * 0.5 * upright;
    bones[6]!.rotation.z = Math.sin(motion.clock * 0.7) * 0.035 * secondaryMotion + earSwing;
    bones[7]!.rotation.z = Math.sin(motion.clock * 0.7 + 1.7) * 0.035 * secondaryMotion + earSwing;
    // The tail hangs off the pelvis and trails the lean rather than following
    // it, with the tip carrying the end of the swing.
    bones[8]!.rotation.set(motion.effort * 0.06, Math.sin(motion.clock * 2.1) * 0.10 * secondaryMotion,
      bank * 0.4 - motion.tailSwing * upright);
    bones[9]!.rotation.set(0, Math.sin(motion.clock * 2.1 - 0.6) * 0.1 * secondaryMotion,
      -motion.tailSwing * 0.4 * upright);
    const scapula = SCAPULA_SHARE * moving * upright;
    bones[10]!.position.z += this.paws[0]!.travel * scapula;
    bones[13]!.position.z += this.paws[1]!.travel * scapula;
    this.coat.updateWorldMatrix(true, true);
    this.inverse.copy(this.coat.matrixWorld).invert();
    this.coat.getWorldQuaternion(this.rotationInverse).invert();
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // What one frame of travel is worth. Contact is decided once a frame, so
    // the stance ramp can only be observed to end within a frame of where it
    // should, and at a sprint that one frame is two thirds of a stride.
    const frameTravel = Number.isNaN(this.lastX)
      ? 0 : Math.hypot(x - this.lastX, z - this.lastZ);
    this.lastX = x;
    this.lastZ = z;
    for (let foot = 0; foot < 4; foot++) {
      const paw = this.paws[foot]!;
      const rest = DOG_PAW_CONTACTS[foot]!;
      const travel = paw.travel * (1 - motion.sit);
      const seatedAdvance = foot >= 2 ? motion.sit * SIT_HIND_ADVANCE : 0;
      const nominalX = rest.x;
      let localX = nominalX;
      let localZ = rest.z + travel + seatedAdvance;
      let worldX = x + localX * c + localZ * s;
      let worldZ = z - localX * s + localZ * c;
      // A FOOT ON THE GROUND IS ON THE GROUND, at any speed. The stance ramp
      // runs on the gait's clock, so the only thing holding it to the ground a
      // dog is actually standing on is this lock, and it used to be given up
      // below 0.08 m/s - which was safe only because `dogStride` collapsed with
      // the speed and took the ramp's amplitude to zero with it. Now that a
      // contact holds the stride it planted with, giving the lock up means the
      // ramp keeps sweeping 0.8 m on its own clock while the body stands still,
      // and the foot slides the whole of it: measured at 163.2 mm in one frame
      // on a brake to a dead stop, against 58.4 before. Held, a stopped dog's
      // feet simply stay where they are, and each one gathers to the standing
      // stance on its own next swing, which the cycle goes on providing.
      const lock = paw.planted && motion.sit < 0.05;
      if (lock && this.planted[foot]) {
        worldX = this.locks[foot * 2]!;
        worldZ = this.locks[foot * 2 + 1]!;
        const dx = worldX - x;
        const dz = worldZ - z;
        localX = dx * c - dz * s;
        localZ = dx * s + dz * c;
        // A STANCE IS A DISTANCE, NOT A STRETCH OF CLOCK, and the distance is
        // exactly `2 * motion.footStride`: the foot sweeps from +stride to
        // -stride while the body covers the same ground, which is why stance
        // slip measures zero at every steady speed. A contact now carries its
        // own stride and its own share of the cycle from the frame it planted
        // (see `DogMotion.footStance`), so the two agree through a speed change
        // and the body can no longer outrun a foot it has locked down.
        //
        // This stays as the backstop, because what the share buys is a contact
        // of the right LENGTH IN CYCLES and the body's speed still decides what
        // that is worth in metres. A foot that plants and then accelerates hard
        // covers more ground than its stride before its share runs out. Measured
        // through the rig, latching alone keeps the worst case under the stride,
        // so nothing reaches this - but the margin is not large, it is a
        // function of the acceleration the movement layer happens to allow, and
        // a limb snapping straight is not an acceptable way to find out it has
        // been raised. Past its stride the lock is carried forward with the body
        // and the foot slides, which is what a braking dog does on grass.
        //
        // Measured as the BODY'S OWN PATH since the foot planted, not as a
        // body-space coordinate. In a turn a locked foot's local Z falls behind
        // the straight-ahead line without the body having carried it any
        // further, and clamping on that broke the lift-off the turn tests pin.
        const sweep = Math.hypot(x - this.plants[foot * 2]!, z - this.plants[foot * 2 + 1]!);
        // Never less than the limb's own reach to give, because a STANDING
        // contact has no stride at all - `dogStride` is zero below a walk - and
        // twice nothing is an allowance of nothing. A dog spawned at rest and
        // accelerated therefore had `back` come out at the whole of the sweep on
        // its second frame, which does not bound the foot, it collapses it onto
        // the body root: 547 mm of paw in one frame with all four limbs pinned
        // straight, on the second frame of every standing start. A foot that has
        // no step to take is still a foot, and what it can be left behind by
        // before anything is pulled straight is DOG_MAX_PAW_REACH.
        const allowed = Math.max(2 * motion.footStride[foot]!, DOG_MAX_PAW_REACH);
        if (sweep > allowed) {
          // Carried ALONG the body's own displacement by exactly the excess,
          // rather than lerped toward the body root by the excess's share of the
          // sweep. The two agree while the excess is small and part company as
          // it grows, and the second has a root-collapsing singularity as the
          // allowance goes to nothing - which is how the above was found.
          const excess = sweep - allowed;
          const alongX = (x - this.plants[foot * 2]!) / sweep;
          const alongZ = (z - this.plants[foot * 2 + 1]!) / sweep;
          worldX += alongX * excess;
          worldZ += alongZ * excess;
          this.locks[foot * 2] = worldX;
          this.locks[foot * 2 + 1] = worldZ;
          this.plants[foot * 2] = this.plants[foot * 2]! + alongX * excess;
          this.plants[foot * 2 + 1] = this.plants[foot * 2 + 1]! + alongZ * excess;
          const dx = worldX - x;
          const dz = worldZ - z;
          localX = dx * c - dz * s;
          localZ = dx * s + dz * c;
        }
      } else if (!this.planted[foot] || paw.planted) {
        this.locks[foot * 2] = worldX;
        this.locks[foot * 2 + 1] = worldZ;
        this.plants[foot * 2] = x;
        this.plants[foot * 2 + 1] = z;
      }
      if (!paw.planted) {
        // A turning stance ends away from the straight-ahead foot line. Preserve
        // that actual lift-off target, then return smoothly over the swing.
        //
        // MEASURED AGAINST THE STANCE RAMP CARRIED ON, not against the swing
        // curve this frame has already switched to. The first airborne frame
        // lands a fraction of a frame past the handover, and over that fraction
        // a world-locked foot keeps travelling backward under the body while the
        // swing curve has it standing still at -stride. Against `travel` that
        // gap reads as drift: 93 mm of it at DOG_MAX_SPEED, held through the
        // start of the swing by `remaining`, applied at the one moment in the
        // cycle when the hind limb is already at full stretch. The paw was drawn
        // up to 133 mm off its commanded arc because the leg could not reach
        // what that asked for. Against `stanceTravel` the same gap reads as
        // zero, because a planted foot is exactly where the stance ramp says it
        // is, and a real turn's drift survives untouched.
        if (this.planted[foot]) {
          const dx = this.locks[foot * 2]! - x;
          const dz = this.locks[foot * 2 + 1]! - z;
          // The ramp ends where the stride ends, for the same reason the lock
          // does, plus the one frame contact is sampled at. `stanceTravel` is
          // deliberately unbounded so the sub-frame handover reads right, but a
          // stance carried past its stride makes it read the slide above as if
          // it were a turn's drift - and then carries that forward into the
          // swing, on top of the reach the swing already wants. The contact's
          // own stride, not this frame's: the foot committed to that when it
          // planted and the bound has to agree with the ramp it is bounding.
          const stride = motion.footStride[foot]!;
          const rampTravel = Math.max(paw.stanceTravel, -stride - frameTravel);
          const rampZ = rest.z + rampTravel * (1 - motion.sit) + seatedAdvance;
          this.recoveryOffsets[foot * 2] = dx * c - dz * s - nominalX;
          this.recoveryOffsets[foot * 2 + 1] = dx * s + dz * c - rampZ;
        }
        const remaining = 1 - paw.recovery * paw.recovery * (3 - 2 * paw.recovery);
        localX += this.recoveryOffsets[foot * 2]! * remaining;
        localZ += this.recoveryOffsets[foot * 2 + 1]! * remaining;
        worldX = x + localX * c + localZ * s;
        worldZ = z - localX * s + localZ * c;
      } else this.recoveryOffsets.fill(0, foot * 2, foot * 2 + 2);
      // NO GATHER HERE ANY MORE, and the absence is the point. A foot that
      // was nominally standing but not world-locked used to have to be slid
      // from where it had been drawn to where the pose now wanted it, under
      // a 0.35 s decay: 471.9 mm of paw and 249.7 mm of knee in a single frame
      // otherwise, because `dogStride` collapsed with the speed and so the
      // frame a dog stopped, all four feet were commanded to the standing
      // stance at once from wherever their cycles had them. A contact now holds
      // the stride it planted with and the lock is no longer given up below a
      // walk, so there is nothing to gather from: removing the decay entirely
      // leaves the measured standstill step where it already was.
      this.planted[foot] = lock;
      const lift = paw.lift * (1 - motion.sit);
      const terrain = field.groundY(worldX, worldZ) - ground;
      this.target.set(localX, 0.2 + terrain + lift, localZ - 0.068);
      this.solvers[foot]!.solve(this.target, this.inverse, this.rotationInverse);
    }
    this.coat.updateWorldMatrix(true, true);
    this.skeleton.update();
  }
  dispose(): void { this.skeleton.dispose(); }
}
