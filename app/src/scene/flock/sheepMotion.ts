// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Every motion the flock has, plus the one deformation that makes each sheep its
 * own animal, as a single TSL vertex displacement. Split from the colour so the
 * shaded sheep and its outline hull can run identical maths from one source: an
 * outline built on a second copy of it would drift off the body the first time
 * the numbers were retuned.
 *
 *   fleece   a seeded lump field, per instance, so no two sheep in the flock
 *            carry the same crease in the same place
 *   knee     a closed-form two-bone solve: each joint folds the way it is
 *            modelled, by exactly what the distance from shoulder to hoof asks
 *            for, so a hill and the stride bend the limb instead of stretching
 *            it
 *   jiggle   the fleece lags the body by about a third of a cycle, which is the
 *            only cue in the asset that says the wool has mass
 *   stride   diagonal leg pairs, amplitude from agitation
 *
 * THE FLEECE LUMP IS THE ONLY WAY THE PUFF LAYOUT CAN VARY. There is one
 * geometry for the whole flock and there is going to be one, so a per-instance
 * arrangement of wool clumps cannot come from the mesh. It comes from here
 * instead: two octaves of noise sampled at an offset drawn from the instance
 * seed, pushed along the surface normal and masked to the wool. The silhouette
 * and the outline both follow it, which is what parts a packed raft of sheep
 * into individual animals from above.
 *
 * THE LEAN LIVES HERE AND NOT IN THE INSTANCE MATRIX, and that is load-bearing:
 * the contact shadow reads the same matrix, and a decal that tips with a running
 * sheep drives one edge of itself through the ground.
 *
 * THE GAIT PHASE IS INTEGRATED ON THE CPU, not derived here from the clock. A
 * cycle written as `sin(time * rate)` with a rate that varies per instance is
 * stable only while the rate is constant: change the rate and the argument jumps
 * by `time` times the change, so a sheep forty seconds into a run that
 * accelerates over a tenth of a second sees its phase slew by thousands of
 * radians and its legs strobe. Flock.tsx therefore advances one phase per sheep
 * by rate times delta and hands it over in `motion.x`. Legs run at that phase,
 * the body bobs at exactly twice it, and both stay continuous through any
 * acceleration.
 *
 * Ear and tail cycles read from the clock at fixed per-instance rates. The head
 * itself is deliberately static: this compact procedural asset has no skinned
 * neck joint, so animating it independently opens the buried collar on the
 * title screen.
 */

import {
  clamp,
  cos,
  float,
  fract,
  length,
  max,
  min,
  mix,
  normalLocal,
  positionLocal,
  sin,
  smoothstep,
  sqrt,
  step,
  vec2,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import {
  BODY_BOB_RUN,
  BODY_BREATH,
  HOOF_LIFT,
  KNEE_COMPLIANCE,
  SHEEP_STANCE_BOUND,
  SHEEP_STANCE_WALK,
  STRIDE_OPEN_KNEE,
  STRIDE_RUN,
  STRIDE_WALK,
} from './flockTuning';
import {
  SHEEP_BACK_BONES,
  SHEEP_FRONT_BONES,
  type SheepLegBones,
} from './sheepParts';
import { SHEEP_TERRAIN_OFFSET_LIMIT } from './terrainPlanting';

/** The per-instance wool lump: two octaves in cycles per metre, and how far
 *  each pushes the surface along its normal, in metres. The broad octave is
 *  about a third of a puff radius, which moves whole clumps; the fine one only
 *  roughens the edge between them. */
const FLEECE_BROAD = 1.7;
const FLEECE_BROAD_AMP = 0.066;
const FLEECE_FINE = 4.7;
const FLEECE_FINE_AMP = 0.02;
const TAU = Math.PI * 2;

/**
 * A compact three-dimensional brush field in roughly [-1, 1]. Three crossed
 * strokes keep the wool from resolving into planar bands, while feeding each
 * stroke into the next breaks up the remaining repetition. The caller offsets
 * `point` with the per-instance seed, so body and outline share one field but
 * no two sheep share its phase.
 */
function paintedFleeceField(point: TSLNode): TSLNode {
  const primary = sin(
    point.x.mul(float(0.367))
      .add(point.y.mul(float(0.589)))
      .add(point.z.mul(float(0.72))),
  );
  const cross = sin(
    point.x.mul(float(0.831))
      .sub(point.y.mul(float(0.47)))
      .add(point.z.mul(float(0.294)))
      .add(primary.mul(float(0.71))),
  );
  const weave = sin(
    point.x.mul(float(0.527))
      .add(point.y.mul(float(0.506)))
      .sub(point.z.mul(float(0.682)))
      .add(cross.mul(float(0.53))),
  );
  return primary.mul(float(0.52)).add(cross.mul(float(0.31))).add(weave.mul(float(0.17)));
}

/** Leg weight at the bend ring, which is where the knee fold's tent profile
 *  peaks. Both pairs author it at the same ring, and a guard test holds them
 *  equal so this can be read from one of them. */
const KNEE_T = SHEEP_FRONT_BONES.kneeT;

/** How far moving fleece lags the body, radians, and how far it travels. Idle
 * sheep keep the collar and body vertically still on the live title scene. */
const JIGGLE_LAG = 1.9;
/** How far the fleece swells, AS A FRACTION OF THE LUMP it is swelling - not a
 *  distance. The wool moves along its own normals now, so the amount it can
 *  move is the amount of wool there is at that vertex, and a thin patch over
 *  the ribs necessarily moves less than a full puff over the haunch. That is
 *  the behaviour; a metre value would flatten it back out. At a run this is
 *  0.024 m of surface travel on a mean lump, against 0.032 m when the whole
 *  fleece translated vertically together. */
const FLEECE_SWELL_RUN = 0.55;

/** Fore-aft hoof travel, m, split between the walk knee and raw speed. A
 *  standing sheep gets zero of both, so its legs are still. */
/** Hoof lift as a fraction of stride. Enough to clear grass, not a dressage
 *  trot. */
/** Secondary life: deliberately smaller than the gait so it reads as follow-through. */
const EAR_FLICK = 0.026;
const EAR_STARTLE = 0.055;
const TAIL_WIGGLE = 0.035;
const FLEECE_SWELL_RESPONSE = 0.35;

export interface SheepMotion {
  /** Apply the whole animation to a local-space position node. Takes the
   *  position rather than closing over `positionLocal`, because the outline
   *  hull feeds in an outward-expanded copy and needs the same treatment. */
  readonly displace: (base: TSLNode) => TSLNode;
}

/**
 * Build the flock's vertex animation.
 *
 * @param masks uv: wool weight, graze weight.
 * @param legs uv1: leg sign, shoulder-to-hoof weight.
 * @param seed per-instance noise seed, 0..8.
 * @param gait integrated gait phase in radians.
 * @param agitation 0 at rest, 1 at the sim's top speed.
 * @param response short 0..1 envelope from acceleration, turns and gate entry.
 * @param motionScale accessibility gain for secondary movement.
 * @param clock the scene clock, in seconds.
 */
export function createSheepMotion(
  masks: TSLNode,
  legs: TSLNode,
  seed: TSLNode,
  gait: TSLNode,
  agitation: TSLNode,
  response: TSLNode,
  motionScale: TSLNode,
  clock: TSLNode,
  terrainOffsets: TSLNode,
): SheepMotion {
  const open = clamp(agitation.mul(float(STRIDE_OPEN_KNEE)), float(0), float(1));

  // The instance's own wool. Sampled from positionLocal rather than from the
  // incoming base, so the outline hull is displaced by exactly the field the
  // body is and the line cannot drift off the fleece it is drawing.
  const woolOffset = vec3(
    seed.mul(float(23.1)).add(float(4.2)),
    seed.mul(float(11.7)),
    seed.mul(float(31.3)).add(float(9.6)),
  );
  // THE LUMP ONLY ADDS WOOL. Both octaves are rectified to 0..1 before they are
  // scaled, so the field bulges outward and never carves inward.
  //
  // Signed, it did both, and that is what put legs outside the fleece. The
  // narrowest wool is the -x haunch at 0.33 against a 0.279 leg: a 0.051
  // margin, which a lump reaching -0.086 eats straight through, leaving the
  // limb standing proud of the body it hangs from. It was per-instance seeded,
  // so it happened to some sheep and not others, which is exactly how it was
  // described - "sometimes".
  //
  // Rectifying also WIDENS the fleece, by the half-amplitude it used to spend
  // digging: about 0.043 m of mean outward bulge. A sheep in full fleece is a
  // wide thing on narrow legs, so the margin and the silhouette improve
  // together rather than trading against each other.
  const broadLump = paintedFleeceField(
    positionLocal.mul(float(FLEECE_BROAD * TAU)).add(woolOffset),
  ).mul(float(0.5)).add(float(0.5));
  const fineLump = paintedFleeceField(
    positionLocal
      .mul(float(FLEECE_FINE * TAU))
      .add(woolOffset)
      .add(vec3(17.9, 3.1, 24.4)),
  ).mul(float(0.5)).add(float(0.5));
  const lump = broadLump
    .mul(float(FLEECE_BROAD_AMP))
    .add(fineLump.mul(float(FLEECE_FINE_AMP)));

  // Twice-gait phase is the body bob's own rate, and the bob is what the wool
  // hangs off, so it is the rate the wool answers at. Leg flex is derived from
  // the airborne recovery below instead, so it bends anatomically rather than
  // merely squashing the limb vertically.
  const bobArg = gait.mul(float(2));

  // Wool carrying a graze mask is the collar around the buried skull root.
  // Keep that join planted while the rest of the fleece retains its secondary
  // motion; lifting only the collar made the neck appear to telescope.
  const fleeceLifeMask = masks.x.mul(
    float(1).sub(smoothstep(float(0.1), float(0.14), masks.y)),
  );

  // THE FLEECE MOVES ALONG ITS OWN NORMALS, NOT UP THE WORLD AXIS. This was the
  // jitter. Every fleece vertex used to receive one scalar on +Y, so the whole
  // coat rose and fell as a rigid slab - and a rigid slab ticking up and down
  // is read as a vibration, however slow it is made, because nothing about it
  // is shaped like wool. Swelling the lump instead moves each vertex along the
  // surface it belongs to: the haunch swings out while the flank swings down,
  // the thin patch over the ribs barely moves, and the coat breathes rather
  // than pulses. It also means the fleece WIDENS as it moves, which a vertical
  // translation could never do.
  const fleeceSwell = sin(bobArg.sub(float(JIGGLE_LAG)))
    .mul(fleeceLifeMask)
    .mul(
      agitation.mul(float(FLEECE_SWELL_RUN))
        .add(response.mul(float(FLEECE_SWELL_RESPONSE))),
    )
    .mul(motionScale);
  const fleeceLump = normalLocal.mul(
    lump.mul(masks.x).mul(float(1).add(fleeceSwell)),
  );


  // The ears carry a constant graze mask of 0.85; the head is a gradient and
  // the poll is 0.5, so a narrow band selects both ear blades without another
  // vertex attribute. A sharp acceleration perks them before the body settles.
  const earMask = smoothstep(float(0.8), float(0.84), masks.y)
    .mul(float(1).sub(smoothstep(float(0.86), float(0.9), masks.y)));
  const earSide = step(float(0), positionLocal.x).mul(float(2)).sub(float(1));
  const earCycle = sin(clock.mul(float(2.1)).add(seed.mul(float(1.73))));
  const earFlick = earCycle
    .mul(float(EAR_FLICK).add(response.mul(float(EAR_STARTLE))))
    .mul(earMask)
    .mul(motionScale);

  // Only the off-centre wool nub reaches behind -0.64. The nearest rump lobe
  // fades out at the threshold, keeping this a tail and not a swaying haunch.
  const tailMask = masks.x.mul(float(1).sub(smoothstep(float(-0.69), float(-0.62), positionLocal.z)));
  const tailWiggle = sin(clock.mul(float(1.65)).add(seed.mul(float(2.31))))
    .mul(tailMask)
    .mul(float(0.012).add(agitation.mul(float(TAIL_WIGGLE))).add(response.mul(float(0.025))))
    .mul(motionScale);

  // Twin of sheepStrideForAgitation: opens over a twentieth of the range, then
  // grows with speed. A sheep that is moving at all takes a real step; only a
  // standing one takes none.
  const stride = open.mul(
    float(STRIDE_WALK).add(agitation.mul(float(STRIDE_RUN - STRIDE_WALK))),
  );
  // A short planted interval moves backward under the body; the longer recovery
  // moves forward while visibly airborne. The former symmetric sine made the
  // world-space foot travel forward with the sheep and read as reverse walking.
  const positivePair = step(float(0), legs.x);
  const pairOffset = float(1).sub(positivePair).mul(float(0.5));
  const legTurn = fract(gait.mul(float(1 / (Math.PI * 2))).add(pairOffset));
  // The share of the cycle a hoof holds the ground, falling with speed so a
  // bolt bounds rather than flickers. `sheepStanceShareForAgitation` mixes the
  // same two constants on the CPU, for terrain contact and the guard suite.
  const stanceShare = mix(
    float(SHEEP_STANCE_WALK),
    float(SHEEP_STANCE_BOUND),
    clamp(agitation, float(0), float(1)),
  );
  const recovery = step(stanceShare, legTurn);
  const stanceT = clamp(legTurn.div(stanceShare), float(0), float(1));
  const recoveryT = clamp(
    legTurn.sub(stanceShare).div(float(1).sub(stanceShare)),
    float(0),
    float(1),
  );

  // Four CPU samples, selected by authored leg quadrant. Applied only down the
  // leg and after the body pitch, so every stance sole lands on the visible
  // heightfield while a lifted hoof keeps its intentional gait clearance.
  // `front` also chooses which bone pair the knee solve uses, which is why the
  // quadrant is picked here rather than beside the displacement at the end.
  const positiveSide = step(float(0), positionLocal.x);
  const front = step(float(0), positionLocal.z);
  const frontOffset = mix(terrainOffsets.y, terrainOffsets.x, positiveSide);
  const backOffset = mix(terrainOffsets.w, terrainOffsets.z, positiveSide);
  const groundOffset = clamp(
    mix(backOffset, frontOffset, front),
    float(-SHEEP_TERRAIN_OFFSET_LIMIT),
    float(SHEEP_TERRAIN_OFFSET_LIMIT),
  );

  /** The authored chain for whichever pair this vertex belongs to. Front and
   *  back are measured separately in sheepParts because they differ: 0.425 and
   *  0.147 over a 0.560 m span in front, 0.449 and 0.154 over 0.590 behind, and
   *  they fold opposite ways. */
  const byPair = (pick: (bones: SheepLegBones) => number): TSLNode =>
    mix(float(pick(SHEEP_BACK_BONES)), float(pick(SHEEP_FRONT_BONES)), front);

  // EVERY TERM THAT MOVES THE HOOF IS AN AMPLITUDE FIRST and a displacement
  // second. The knee solve below needs the distance between the two endpoints,
  // and by the time a term has been faded along the limb by `legWeight` that
  // distance is no longer recoverable from it.
  //
  // The body bob, twinned in flockTuning's sheepBodyBob. Scaled by
  // (1 - legWeight), which is what that attribute was authored for: full on the
  // torso, zero at the sole, so a planted hoof stays planted and the limb takes
  // up the difference as compliance. The hoof-contact receipt therefore needs
  // no term for this, and neither does terrain planting.
  //
  // Not scaled by motionScale. This is locomotion, like `swing` and `hoof`
  // beside it, not secondary life: damping it would hand the reduced-motion
  // setting back the tapping that the setting has no opinion about.
  const bobAmplitude = cos(bobArg.sub(stanceShare.mul(float(TAU))))
    .negate()
    .mul(float(BODY_BREATH).add(agitation.mul(float(BODY_BOB_RUN))));
  const bodyBob = bobAmplitude.mul(float(1).sub(legs.y));

  const stanceTravel = float(1).sub(stanceT.mul(float(2)));
  const recoveryTravel = smoothstep(float(0), float(1), recoveryT)
    .mul(float(2))
    .sub(float(1));
  const swingAmplitude = mix(stanceTravel, recoveryTravel, recovery).mul(stride);
  const swing = swingAmplitude.mul(legs.y);
  const liftAmplitude = sin(recoveryT.mul(float(Math.PI)))
    .mul(recovery)
    .mul(stride)
    .mul(float(HOOF_LIFT));
  const hoof = liftAmplitude.mul(legs.y);
  const terrainLift = groundOffset.mul(legs.y);

  // THE KNEE IS SOLVED FROM WHERE THE HOOF IS, NOT PUT ON A TIMETABLE. The fold
  // used to be the swing arc times a hand-tuned half of stride, so the joint
  // bent when the clock said to and not because anything had moved. Which meant
  // the three terms that DO move an endpoint - terrain planting at +/-0.08 m,
  // the bob at +/-0.016, the fore-aft swing at +/-stride - changed the
  // shoulder-to-sole distance with no knee response whatever, and the limb
  // telescoped instead of folding: a sheep standing across a hummock stretched
  // one leg by a seventh of its length and nothing in the pose bent. That is the
  // rubber leg, and this is what replaces it.
  //
  // The old constant was not the wrong size, only blind. At full run the solve
  // returns 0.140 m of bend on the front chain and 0.154 on the back against the
  // authored 0.5 * 0.3 = 0.150, so the magnitude of the swing fold is kept, by
  // derivation rather than by coincidence. What the constant could not do was
  // answer a hill, or bend at all during stance, where it was gated off.
  //
  // The bob is deliberately NOT in the span. It is the thorax riding over the
  // scapula, not the shoulder joint translating, so it should not ask the knee
  // for anything - and a chain this close to straight would answer far too
  // loudly if it did: the 4 mm breath of an idle sheep would come back as 9 mm
  // of knee, which is a new idle motion on the title screen for no gain. What
  // it leaves behind is the 16 mm the shoulder ring rises at a dead run while
  // the sole holds, already carried and already named as compliance above.
  const spanRise = byPair((bones) => bones.restRise)
    .sub(liftAmplitude)
    .sub(groundOffset);
  const spanReach = byPair((bones) => bones.restReach).add(swingAmplitude);
  const span = max(length(vec2(spanRise, spanReach)), float(1e-4));
  const alongUpper = byPair((bones) => bones.upper ** 2 - bones.lower ** 2)
    .add(span.mul(span))
    .div(span.mul(float(2)));
  const bend = sqrt(
    max(
      byPair((bones) => bones.upper ** 2).sub(alongUpper.mul(alongUpper)),
      float(0),
    ).add(float(KNEE_COMPLIANCE * KNEE_COMPLIANCE)),
  );

  // Bones are rigid, so the rings between the joints ride straight lines: a
  // linear tent peaking at the bend ring, where the old fold used a sine. The
  // sine bowed both bones outward - 0.59 of full bend at the t=0.2 ring, where a
  // real chain gives 0.36 - which is its own share of why a folding leg read as
  // rubber. The tent is also cheaper than the sine it replaces.
  const alongLeg = min(
    legs.y.mul(float(1 / KNEE_T)),
    float(1).sub(legs.y).mul(float(1 / (1 - KNEE_T))),
  );
  // Each pair folds the way its own joint is modelled - the front carpus
  // forward, the hind hock back - and by the DIFFERENCE from the authored bend,
  // so a standing sheep on flat ground is exactly the sheep that was modelled.
  // The hind leg is already drawn with 0.053 m of hock and the front with 0.050
  // of carpus; subtracting those is what keeps the solve from folding them in a
  // second time, and taking the direction from the same rings is what keeps a
  // leg from folding through its own rest pose.
  const legFold = bend
    .sub(byPair((bones) => bones.restBend))
    .mul(alongLeg)
    .mul(byPair((bones) => bones.foldDirection));

  // Wool follow-through and mid-leg flex never translate either endpoint of a
  // leg. There is therefore no body-to-hoof span inflation hidden in the pose.
  const rise = hoof.add(bodyBob);

  return {
    displace(base: TSLNode): TSLNode {
      const woolly = base.add(fleeceLump);
      const life = vec3(tailWiggle.add(earSide.mul(earFlick)), 0, 0);
      const posed = woolly
        .add(vec3(0, rise, swing.add(legFold)))
        .add(life);
      return posed.add(vec3(0, terrainLift, 0));
    },
  };
}
