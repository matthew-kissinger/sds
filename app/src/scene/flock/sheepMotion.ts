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
 *   flex     the middle leg rings take weight while shoulder and sole stay fixed
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
  max as tslMax,
  mix,
  normalLocal,
  positionLocal,
  sin,
  smoothstep,
  step,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import { HOOF_LIFT, STRIDE_RUN, STRIDE_WALK } from './flockTuning';
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

/** Agitation at which the walk cycle is fully open. Low, so a sheep drifting at
 *  half a metre per second still visibly steps. */
const WALK_KNEE = 4;

/** Mid-leg flex at rest and the extra at a full bolt, m. Endpoints stay fixed. */
const FLEX_REST = 0.008;
const FLEX_RUN = 0.035;

/** How far moving fleece lags the body, radians, and how far it travels. Idle
 * sheep keep the collar and body vertically still on the live title scene. */
const JIGGLE_LAG = 1.9;
const JIGGLE_RUN = 0.05;

/** Fore-aft hoof travel, m, split between the walk knee and raw speed. A
 *  standing sheep gets zero of both, so its legs are still. */
/** Hoof lift as a fraction of stride. Enough to clear grass, not a dressage
 *  trot. */
/** Secondary life: deliberately smaller than the gait so it reads as follow-through. */
const EAR_FLICK = 0.026;
const EAR_STARTLE = 0.055;
const TAIL_WIGGLE = 0.035;
const RESPONSE_JIGGLE = 0.036;

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
  const walk = clamp(agitation.mul(float(WALK_KNEE)), float(0), float(1));

  // The instance's own wool. Sampled from positionLocal rather than from the
  // incoming base, so the outline hull is displaced by exactly the field the
  // body is and the line cannot drift off the fleece it is drawing.
  const woolOffset = vec3(
    seed.mul(float(23.1)).add(float(4.2)),
    seed.mul(float(11.7)),
    seed.mul(float(31.3)).add(float(9.6)),
  );
  const lump = paintedFleeceField(
    positionLocal.mul(float(FLEECE_BROAD * TAU)).add(woolOffset),
  )
    .mul(float(FLEECE_BROAD_AMP))
    .add(
      paintedFleeceField(
        positionLocal
          .mul(float(FLEECE_FINE * TAU))
          .add(woolOffset)
          .add(vec3(17.9, 3.1, 24.4)),
      ).mul(float(FLEECE_FINE_AMP)),
    );
  const fleeceLump = normalLocal.mul(lump.mul(masks.x));

  // Flex at twice the gait: endpoints remain fixed while the middle rings take
  // the weight shift. Moving the barrel upward while pinning only the sole
  // stretched the thin dark legs into stilts in gameplay captures.
  const bobArg = gait.mul(float(2));
  const legFlex = tslMax(sin(bobArg), float(0))
    .mul(sin(legs.y.mul(float(Math.PI))))
    .mul(tslMax(legs.x, legs.x.mul(float(-1))))
    .mul(float(FLEX_REST).add(agitation.mul(float(FLEX_RUN))))
    .mul(float(-1));
  // Wool carrying a graze mask is the collar around the buried skull root.
  // Keep that join planted while the rest of the fleece retains its secondary
  // motion; lifting only the collar made the neck appear to telescope.
  const fleeceLifeMask = masks.x.mul(
    float(1).sub(smoothstep(float(0.1), float(0.14), masks.y)),
  );
  const jiggle = sin(bobArg.sub(float(JIGGLE_LAG)))
    .mul(fleeceLifeMask)
    .mul(agitation)
    .mul(float(JIGGLE_RUN))
    .mul(motionScale);

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

  const responseJiggle = sin(gait.mul(float(3)).add(seed))
    .mul(response)
    .mul(fleeceLifeMask)
    .mul(float(RESPONSE_JIGGLE))
    .mul(motionScale);
  const stride = walk.mul(float(STRIDE_WALK)).add(agitation.mul(float(STRIDE_RUN)));
  const swing = sin(gait).mul(legs.x).mul(legs.y).mul(stride);
  const hoof = tslMax(cos(gait).mul(legs.x), float(0))
    .mul(legs.y)
    .mul(stride)
    .mul(float(HOOF_LIFT));

  // Wool follow-through and mid-leg flex never translate either endpoint of a
  // leg. There is therefore no body-to-hoof span inflation hidden in the pose.
  const rise = jiggle
    .add(responseJiggle)
    .add(legFlex.mul(motionScale))
    .add(hoof);

  // Four CPU samples, selected by authored leg quadrant. Applied only down the
  // leg and after the body pitch, so every stance sole lands on the visible
  // heightfield while a lifted hoof keeps its intentional gait clearance.
  const positiveSide = step(float(0), positionLocal.x);
  const front = step(float(0), positionLocal.z);
  const frontOffset = mix(terrainOffsets.y, terrainOffsets.x, positiveSide);
  const backOffset = mix(terrainOffsets.w, terrainOffsets.z, positiveSide);
  const terrainLift = clamp(
    mix(backOffset, frontOffset, front),
    float(-SHEEP_TERRAIN_OFFSET_LIMIT),
    float(SHEEP_TERRAIN_OFFSET_LIMIT),
  ).mul(legs.y);

  return {
    displace(base: TSLNode): TSLNode {
      const woolly = base.add(fleeceLump);
      const life = vec3(tailWiggle.add(earSide.mul(earFlick)), 0, 0);
      const posed = woolly
        .add(vec3(0, rise, swing))
        .add(life);
      return posed.add(vec3(0, terrainLift, 0));
    },
  };
}
