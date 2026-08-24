// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * What the grass knows about the bodies moving through it, rebuilt every frame
 * and handed to the vertex shader as two small textures.
 *
 * THE PROBLEM. Half a million blades and up to two hundred and one bodies is a
 * hundred million footprint tests a frame if the shader loops over every
 * entity. So the CPU sorts the bodies into a uniform grid first, and a blade
 * only ever tests the four bodies nearest its own 2.5 m cell. Four is enough
 * because the fifth body only matters where four are already standing, and
 * grass under four bodies is flat either way.
 *
 * THE WAKE. Grass that springs back the instant a body leaves has no weight,
 * and a wake needs memory - which per-blade would mean per-blade state, which
 * would mean a compute pass, which the WebGL2 backend does not have (spec/01:
 * one renderer path, both backends, no forks). So the memory lives here, in
 * the only place there is little of it: each body drops a GHOST after travelling
 * a fixed world-space distance. A stationary body emits none, and a ghost is
 * just another interactor carrying its own age. The shader turns age into a
 * spring response that decays through
 * zero and comes back slightly negative - the grass overshoots as it stands up -
 * so a trail of ghosts IS the wake, with no state on the GPU at all and no
 * per-frame allocation on the CPU.
 *
 * A live ring record is never overwritten. It becomes reusable only after the
 * response curve reaches zero, so a wake cannot disappear with a step.
 *
 * ZERO ALLOCATION. Every buffer here is allocated once at the scoreable flock
 * ceiling. `update` reads the live typed-array length and allocates nothing.
 */

import * as THREE from 'three/webgpu';
import { SHEEP_STATE_FLAG } from '@sim/FlockSim';
import type { CpuDeterministicSim } from '@sim/FlockSim';
import type { AcceptedBark } from '@app/state/store';
import { createBarkPulseField } from '../juice/barkPulse';

// --- the footprint (spec/06 carried feel constants) --------------------------

/**
 * The dog's body, in its own frame: `halfLen` along its facing, `halfWid`
 * across it, and `falloff` metres of ring outside the body over which the push
 * fades to nothing. Carried numbers; they are not tuning knobs.
 */
export const DOG_FOOTPRINT = { halfLen: 1.16, halfWid: 0.48, falloff: 0.68 } as const;

/**
 * The sheep's body, as spec/06 states it: the dog's footprint scaled x1.25
 * across and z1.45 along. A sheep is wider and longer through the wool than a
 * collie is through the ribs, and the numbers land where the mesh does - 0.60 m
 * of half-width against the sim's 0.78 m collision radius, 1.68 m of half-length
 * against a 1.9 m body.
 */
export const SHEEP_SCALE = { x: 1.25, z: 1.45 } as const;
export const SHEEP_FOOTPRINT = {
  halfWid: DOG_FOOTPRINT.halfWid * SHEEP_SCALE.x,
  halfLen: DOG_FOOTPRINT.halfLen * SHEEP_SCALE.z,
  falloff: DOG_FOOTPRINT.falloff,
} as const;

/**
 * Carried as "radius 1.02". In the rounded-rect formulation it is the scale on
 * the body half-extents: how far from the body the grass counts itself as being
 * underneath it. Kept as a separate multiplier rather than folded into the
 * footprint numbers so both carried values stay legible against spec/06.
 */
export const INTERACTION_RADIUS = 1.02;

/** Carried as "strength 0.58": peak horizontal displacement at a tip, metres. */
export const INTERACTION_STRENGTH = 0.58;

/** The widest reach any single body has, metres. Sizes the grid insertion. */
const INFLUENCE =
  Math.max(SHEEP_FOOTPRINT.halfLen, SHEEP_FOOTPRINT.halfWid) * INTERACTION_RADIUS +
  SHEEP_FOOTPRINT.falloff;

// --- the trail --------------------------------------------------------------

/** World-space separation between wake samples. It is smaller than either
 * body's half-length, so a sprint cannot leave an uncovered gap. */
export const MIN_GHOST_DISTANCE = 0.58;
/** Seconds for a newly deposited sample to ease up to full strength. */
export const GHOST_BIRTH_DURATION = 0.135;
/** Dog trail slots. Its player-facing wake gets the larger ring. */
export const DOG_GHOSTS = 11;
/** Sheep trail slots. */
export const SHEEP_GHOSTS = 4;
/** Older than this and a ghost is not packed at all. */
export const MAX_AGE = 1.6;

/**
 * Texels in the interactor texture. One dog, its eleven ghosts, and five
 * records for each of at most two hundred sheep is 1012.
 */
export const MAX_INTERACTORS = 1024;
/** Highest shipped flock. The interaction field is sized to the public cap. */
export const MAX_INTERACTION_SHEEP = 200;

// --- the grid ---------------------------------------------------------------

/** Cell size, metres. Small enough that four slots hold the useful bodies. */
export const GRID_CELL = 2.5;
/** Half the grid's square footprint, metres. The interactive grass tier
 *  reaches 106 m and the sim clamps every body inside the 100 m fence, so a
 *  body's influence can never leave this. */
export const GRID_HALF_EXTENT = 106.25;
export const GRID_CELLS = Math.round((GRID_HALF_EXTENT * 2) / GRID_CELL);
/** Bodies a blade will ever test. */
export const SLOTS = 4;

/**
 * Added to a sheep's heading to say "sheep" in the same float. Headings are
 * bounded by pi, so this is unambiguous either way, and it costs the shader two
 * instructions instead of a second texture fetch per body per vertex. Exported
 * because grassMaterial.ts is the code that has to undo it.
 */
export const KIND_OFFSET = 64;
/** Subtracted from the dog's sort key so the player's own wake never loses a
 *  slot to a sheep standing marginally closer to a cell centre. */
const DOG_PRIORITY = 1000;

export interface InteractionField {
  /** RGBA32F, MAX_INTERACTORS x 1: (x, z, heading + kind * KIND_OFFSET, age). */
  readonly interactors: THREE.DataTexture;
  /** RGBA32F, GRID_CELLS square: four interactor texel-u values, 0 = empty. */
  readonly cells: THREE.DataTexture;
  /** RGBA32F 1 x 1: accepted bark origin, wave radius and soft amplitude. */
  readonly barkPulse: THREE.DataTexture;
  /** Advance the trails and repack. Allocates nothing. */
  update(
    dt: number,
    sim: CpuDeterministicSim,
    acceptedBark: AcceptedBark | null,
    reducedMotion: boolean,
  ): void;
  dispose(): void;
}

function dataTexture(data: Float32Array, width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createInteractionField(): InteractionField {
  const interactorData = new Float32Array(MAX_INTERACTORS * 4);
  const cellData = new Float32Array(GRID_CELLS * GRID_CELLS * 4);
  const interactors = dataTexture(interactorData, MAX_INTERACTORS, 1);
  const cells = dataTexture(cellData, GRID_CELLS, GRID_CELLS);
  const pulse = createBarkPulseField();
  /** Sort key per occupied slot: how far the body is from the cell centre. */
  const cellKeys = new Float32Array(GRID_CELLS * GRID_CELLS * SLOTS);

  // Trails: (x, z, heading) per slot plus the time it was written.
  const dogTrail = new Float32Array(DOG_GHOSTS * 3);
  const dogTrailTime = new Float32Array(DOG_GHOSTS).fill(-Infinity);
  const sheepTrail = new Float32Array(MAX_INTERACTION_SHEEP * SHEEP_GHOSTS * 3);
  const sheepTrailTime = new Float32Array(MAX_INTERACTION_SHEEP * SHEEP_GHOSTS).fill(-Infinity);

  // Spatial anchors are double precision so splitting one path into 30, 60 or
  // 120 presentation frames does not gain or lose a wake endpoint.
  let dogGhostX = 0;
  let dogGhostZ = 0;
  let dogGhostHeading = 0;
  let dogObservedX = 0;
  let dogObservedZ = 0;
  let dogGhostValid = false;
  let dogCursor = 0;
  const sheepGhostX = new Float64Array(MAX_INTERACTION_SHEEP);
  const sheepGhostZ = new Float64Array(MAX_INTERACTION_SHEEP);
  const sheepGhostHeading = new Float32Array(MAX_INTERACTION_SHEEP);
  const sheepObservedX = new Float64Array(MAX_INTERACTION_SHEEP);
  const sheepObservedZ = new Float64Array(MAX_INTERACTION_SHEEP);
  const sheepGhostValid = new Uint8Array(MAX_INTERACTION_SHEEP);
  const sheepCursor = new Uint32Array(MAX_INTERACTION_SHEEP);

  let elapsed = 0;
  let count = 0;
  let activeSim: CpuDeterministicSim | null = null;

  /** Write one interactor and file it into every cell it can reach. */
  function add(x: number, z: number, heading: number, isDog: boolean, age: number): void {
    if (count >= MAX_INTERACTORS) return;
    const index = count++;
    const base = index * 4;
    interactorData[base] = x;
    interactorData[base + 1] = z;
    interactorData[base + 2] = heading + (isDog ? 0 : KIND_OFFSET);
    interactorData[base + 3] = age;

    // Never 0: 0 is how an empty slot is spelled in the cell texture.
    const u = (index + 0.5) / MAX_INTERACTORS;
    const bias = isDog ? DOG_PRIORITY : 0;

    const ix0 = Math.max(0, Math.floor((x - INFLUENCE + GRID_HALF_EXTENT) / GRID_CELL));
    const ix1 = Math.min(GRID_CELLS - 1, Math.floor((x + INFLUENCE + GRID_HALF_EXTENT) / GRID_CELL));
    const iz0 = Math.max(0, Math.floor((z - INFLUENCE + GRID_HALF_EXTENT) / GRID_CELL));
    const iz1 = Math.min(GRID_CELLS - 1, Math.floor((z + INFLUENCE + GRID_HALF_EXTENT) / GRID_CELL));

    for (let iz = iz0; iz <= iz1; iz++) {
      const cz = -GRID_HALF_EXTENT + (iz + 0.5) * GRID_CELL;
      for (let ix = ix0; ix <= ix1; ix++) {
        const cx = -GRID_HALF_EXTENT + (ix + 0.5) * GRID_CELL;
        const key = Math.max(Math.abs(x - cx), Math.abs(z - cz)) - bias;
        const slot = (iz * GRID_CELLS + ix) * SLOTS;

        let target = -1;
        let worstKey = key;
        for (let s = 0; s < SLOTS; s++) {
          if (cellData[slot + s] === 0) {
            target = s;
            worstKey = key;
            break;
          }
          if (cellKeys[slot + s]! > worstKey) {
            worstKey = cellKeys[slot + s]!;
            target = s;
          }
        }
        if (target < 0) continue;
        cellData[slot + target] = u;
        cellKeys[slot + target] = key;
      }
    }
  }

  return {
    interactors,
    cells,
    barkPulse: pulse.texture,

    update(
      dt: number,
      sim: CpuDeterministicSim,
      acceptedBark: AcceptedBark | null,
      reducedMotion: boolean,
    ): void {
      if (activeSim !== sim) {
        activeSim = sim;
        elapsed = 0;
        dogGhostValid = false;
        dogCursor = 0;
        dogTrailTime.fill(-Infinity);
        sheepGhostValid.fill(0);
        sheepCursor.fill(0);
        sheepTrailTime.fill(-Infinity);
      }
      pulse.update(dt, acceptedBark, reducedMotion);
      elapsed += Math.max(0, dt);
      const { positions, headings, stateFlags } = sim;
      const sheepCount = Math.min(headings.length, MAX_INTERACTION_SHEEP);
      const dog = sim.state.dogs[0];
      // The sim keeps the dog's facing as a unit vector without ever taking a
      // trig call; the angle is presentation-only, exactly as in scene/Dog.tsx.
      const dogHeading = dog ? Math.atan2(dog.heading.z, dog.heading.x) : 0;

      if (dog) {
        const x = dog.position.x;
        const z = dog.position.z;
        if (!dogGhostValid) {
          dogGhostX = x;
          dogGhostZ = z;
          dogGhostHeading = dogHeading;
          dogObservedX = x;
          dogObservedZ = z;
          dogGhostValid = true;
        } else {
          const frameDx = x - dogObservedX;
          const frameDz = z - dogObservedZ;
          const frameDistanceSquared = frameDx * frameDx + frameDz * frameDz;
          let anchorDx = x - dogGhostX;
          let anchorDz = z - dogGhostZ;
          let anchorDistance = Math.sqrt(anchorDx * anchorDx + anchorDz * anchorDz);
          while (anchorDistance + MIN_GHOST_DISTANCE * 1e-4 >= MIN_GHOST_DISTANCE) {
            const slot = dogCursor % DOG_GHOSTS;
            if (elapsed - dogTrailTime[slot]! >= MAX_AGE) {
              const write = slot * 3;
              dogTrail[write] = dogGhostX;
              dogTrail[write + 1] = dogGhostZ;
              dogTrail[write + 2] = dogGhostHeading;
              const directionX = anchorDx / anchorDistance;
              const directionZ = anchorDz / anchorDistance;
              const crossingX = dogGhostX + directionX * MIN_GHOST_DISTANCE;
              const crossingZ = dogGhostZ + directionZ * MIN_GHOST_DISTANCE;
              const alongFrame = frameDistanceSquared > 0
                ? ((crossingX - dogObservedX) * frameDx + (crossingZ - dogObservedZ) * frameDz)
                  / frameDistanceSquared
                : 1;
              dogTrailTime[slot] = elapsed - Math.max(0, dt)
                * (1 - Math.max(0, Math.min(1, alongFrame)));
              dogCursor++;
            }
            const directionX = anchorDx / anchorDistance;
            const directionZ = anchorDz / anchorDistance;
            dogGhostX += directionX * MIN_GHOST_DISTANCE;
            dogGhostZ += directionZ * MIN_GHOST_DISTANCE;
            dogGhostHeading = dogHeading;
            anchorDx = x - dogGhostX;
            anchorDz = z - dogGhostZ;
            anchorDistance = Math.sqrt(anchorDx * anchorDx + anchorDz * anchorDz);
          }
          dogObservedX = x;
          dogObservedZ = z;
        }
      } else {
        dogGhostValid = false;
        dogTrailTime.fill(-Infinity);
      }

      for (let i = 0; i < sheepCount; i++) {
        if (stateFlags[i] === SHEEP_STATE_FLAG.penned) {
          if (sheepGhostValid[i] !== 0) {
            sheepGhostValid[i] = 0;
            for (let ghost = 0; ghost < SHEEP_GHOSTS; ghost++) {
              sheepTrailTime[i * SHEEP_GHOSTS + ghost] = -Infinity;
            }
          }
          continue;
        }
        const x = positions[i * 2]!;
        const z = positions[i * 2 + 1]!;
        const heading = headings[i]!;
        if (sheepGhostValid[i] === 0) {
          sheepGhostX[i] = x;
          sheepGhostZ[i] = z;
          sheepGhostHeading[i] = heading;
          sheepObservedX[i] = x;
          sheepObservedZ[i] = z;
          sheepGhostValid[i] = 1;
          continue;
        }
        const frameDx = x - sheepObservedX[i]!;
        const frameDz = z - sheepObservedZ[i]!;
        const frameDistanceSquared = frameDx * frameDx + frameDz * frameDz;
        let anchorDx = x - sheepGhostX[i]!;
        let anchorDz = z - sheepGhostZ[i]!;
        let anchorDistance = Math.sqrt(anchorDx * anchorDx + anchorDz * anchorDz);
        while (anchorDistance + MIN_GHOST_DISTANCE * 1e-4 >= MIN_GHOST_DISTANCE) {
          const slot = sheepCursor[i]! % SHEEP_GHOSTS;
          const trail = i * SHEEP_GHOSTS + slot;
          if (elapsed - sheepTrailTime[trail]! >= MAX_AGE) {
            const write = trail * 3;
            sheepTrail[write] = sheepGhostX[i]!;
            sheepTrail[write + 1] = sheepGhostZ[i]!;
            sheepTrail[write + 2] = sheepGhostHeading[i]!;
            const directionX = anchorDx / anchorDistance;
            const directionZ = anchorDz / anchorDistance;
            const crossingX = sheepGhostX[i]! + directionX * MIN_GHOST_DISTANCE;
            const crossingZ = sheepGhostZ[i]! + directionZ * MIN_GHOST_DISTANCE;
            const alongFrame = frameDistanceSquared > 0
              ? ((crossingX - sheepObservedX[i]!) * frameDx
                + (crossingZ - sheepObservedZ[i]!) * frameDz) / frameDistanceSquared
              : 1;
            sheepTrailTime[trail] = elapsed - Math.max(0, dt)
              * (1 - Math.max(0, Math.min(1, alongFrame)));
            sheepCursor[i] = sheepCursor[i]! + 1;
          }
          const directionX = anchorDx / anchorDistance;
          const directionZ = anchorDz / anchorDistance;
          sheepGhostX[i] = sheepGhostX[i]! + directionX * MIN_GHOST_DISTANCE;
          sheepGhostZ[i] = sheepGhostZ[i]! + directionZ * MIN_GHOST_DISTANCE;
          sheepGhostHeading[i] = heading;
          anchorDx = x - sheepGhostX[i]!;
          anchorDz = z - sheepGhostZ[i]!;
          anchorDistance = Math.sqrt(anchorDx * anchorDx + anchorDz * anchorDz);
        }
        sheepObservedX[i] = x;
        sheepObservedZ[i] = z;
      }

      count = 0;
      cellData.fill(0);

      // The dog first, live, then its trail: everything the player is looking
      // at is filed before anything else can take a slot from it.
      if (dog) {
        add(dog.position.x, dog.position.z, dogHeading, true, 0);
        for (let g = 0; g < DOG_GHOSTS; g++) {
          const age = elapsed - dogTrailTime[g]!;
          if (age < 0 || age > MAX_AGE) continue;
          add(
            dogTrail[g * 3]!,
            dogTrail[g * 3 + 1]!,
            dogTrail[g * 3 + 2]!,
            true,
            Math.max(age, 0.0002),
          );
        }
      }

      for (let i = 0; i < sheepCount; i++) {
        // Penned sheep stand on the pen floor, where the bake grows no grass.
        if (stateFlags[i] === SHEEP_STATE_FLAG.penned) continue;
        add(positions[i * 2]!, positions[i * 2 + 1]!, headings[i]!, false, 0);
        for (let g = 0; g < SHEEP_GHOSTS; g++) {
          const t = i * SHEEP_GHOSTS + g;
          const age = elapsed - sheepTrailTime[t]!;
          if (age < 0 || age > MAX_AGE) continue;
          const read = t * 3;
          add(
            sheepTrail[read]!,
            sheepTrail[read + 1]!,
            sheepTrail[read + 2]!,
            false,
            Math.max(age, 0.0002),
          );
        }
      }

      // Texels past `count` are last frame's leftovers and are deliberately not
      // cleared: the cell grid was blanked above, so no cell can name one, and
      // a thousand writes a frame to prove it again is work for nobody.
      interactors.needsUpdate = true;
      cells.needsUpdate = true;
    },

    dispose(): void {
      interactors.dispose();
      cells.dispose();
      pulse.dispose();
    },
  };
}
