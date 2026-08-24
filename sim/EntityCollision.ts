// SPDX-License-Identifier: AGPL-3.0-or-later
// Lifted from sds/shared/EntityCollision.js; same license and copyright holder.

/**
 * Deterministic hard-body separation between flock bodies.
 *
 * The soft flee steering force alone lets a dog charging a tight cluster
 * visibly pass through the flock. This module gives the dog a body the sheep
 * cannot occupy: a post-integration positional correction that pushes any
 * overlapping sheep out to the sum of body radii.
 *
 * Pure + deterministic (Math.sqrt only; no trig, no Math.random, no DOM), so
 * the authoritative tick, the client predictor/solo path, and the trace-fixture
 * harness all produce the identical correction.
 *
 * The correction is one-directional: the dog pushes sheep, sheep never push
 * the player-controlled dog (shoving the dog back would fight player input).
 */

/** Mutable XZ pair. `Vector2D` instances satisfy this structurally. */
export interface MutableVec2 {
  x: number;
  z: number;
}

/** Read-only XZ pair (a body centre passed in for a contact test). */
export interface ReadonlyVec2 {
  readonly x: number;
  readonly z: number;
}

// One sheep lifecycle enum is the single source of truth for "is this sheep in
// play" (spec/02). sds answered the same question with `state === 0` plus two
// booleans; the union collapses that with identical semantics. Type-only
// import: erased at runtime, so there is no cycle with types.ts.
import type { SheepLifecycle } from './types';

/** Minimal shape `resolveSheepSheepCollisions` needs from a flock member. */
export interface CollidableSheep {
  readonly id?: number;
  state: SheepLifecycle;
  position: MutableVec2;
  velocity?: MutableVec2;
}

/** Minimal shape `resolveDogSheepCollision` needs from its target. */
export interface PushableBody {
  readonly id?: number;
  position: MutableVec2;
  velocity?: MutableVec2;
}

/** Axis-aligned field rect. herd has one field shape, so this is the only one. */
export interface CollisionBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Body radii (metres). Dog/sheep contact gets a slightly more conservative
// sheep radius than obstacle avoidance because the visual sheep mesh is long
// front-to-back; a 0.6m centre radius still let heads/backs read through
// the dog.
export const DOG_BODY_RADIUS = 1.2;
export const SHEEP_BODY_RADIUS = 0.78;
export const DOG_SHEEP_MIN_DISTANCE = DOG_BODY_RADIUS + SHEEP_BODY_RADIUS;
export const SHEEP_SHEEP_MIN_DISTANCE = 1.35;

// Cap the per-tick positional correction so a deep overlap (a frame spike, a
// dog teleport, a sheep spawned under the dog) resolves over a few ticks
// instead of snapping. Keeps the separation from reading as a jitter/pop.
export const MAX_DOG_SHEEP_PUSH_PER_TICK = 0.42;
export const MAX_SHEEP_SHEEP_PUSH_PER_TICK = 0.14;

const COLLISION_EPSILON = 1e-6;
const INV_SQRT2 = 0.7071067811865476;
const MAX_DENSE_GRID_CELLS = 262144;

// Trig-free: the eight unit normals are precomputed literals, picked by a hash
// of the two entity ids so exactly-coincident bodies separate deterministically.
const FALLBACK_NORMALS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [INV_SQRT2, INV_SQRT2],
  [0, 1],
  [-INV_SQRT2, INV_SQRT2],
  [-1, 0],
  [-INV_SQRT2, -INV_SQRT2],
  [0, -1],
  [INV_SQRT2, -INV_SQRT2],
];

function stableEntityId(entity: { readonly id?: number } | null | undefined, fallback: number): number {
  const id = entity?.id;
  return Number.isFinite(id) ? (id as number) : fallback;
}

function fallbackNormal(a: number, b: number): readonly [number, number] {
  const mixed = ((a * 73856093) ^ (b * 19349663)) >>> 0;
  // mixed & 7 is provably 0..7 and FALLBACK_NORMALS has exactly 8 entries.
  return FALLBACK_NORMALS[mixed & 7]!;
}

function zigzag(n: number): number {
  return n >= 0 ? n * 2 : -n * 2 - 1;
}

function cellKey(cx: number, cz: number): number {
  const x = zigzag(cx);
  const z = zigzag(cz);
  const sum = x + z;
  return (sum * (sum + 1)) / 2 + z;
}

function finiteCollisionBounds(
  bounds: CollisionBounds | null | undefined,
  padding: number
): CollisionBounds | null {
  if (!bounds) return null;
  const minX = Number(bounds.minX);
  const maxX = Number(bounds.maxX);
  const minZ = Number(bounds.minZ);
  const maxZ = Number(bounds.maxZ);
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) ||
    !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }
  return {
    minX: minX - padding,
    maxX: maxX + padding,
    minZ: minZ - padding,
    maxZ: maxZ + padding,
  };
}

function prepareDenseGrid(
  scratch: SheepCollisionScratch,
  bounds: CollisionBounds | null | undefined,
  cellSize: number
): boolean {
  const rect = finiteCollisionBounds(bounds, cellSize * 4);
  if (!rect) return false;

  const minCellX = Math.floor(rect.minX / cellSize);
  const maxCellX = Math.floor(rect.maxX / cellSize);
  const minCellZ = Math.floor(rect.minZ / cellSize);
  const maxCellZ = Math.floor(rect.maxZ / cellSize);
  const width = maxCellX - minCellX + 1;
  const height = maxCellZ - minCellZ + 1;
  const totalCells = width * height;

  if (width <= 0 || height <= 0 || totalCells > MAX_DENSE_GRID_CELLS) {
    return false;
  }

  if (!scratch.denseHeads || scratch.denseHeads.length < totalCells) {
    scratch.denseHeads = new Int32Array(totalCells);
  }
  scratch.denseHeads.fill(-1, 0, totalCells);
  scratch.denseMinX = minCellX;
  scratch.denseMinZ = minCellZ;
  scratch.denseWidth = width;
  scratch.denseHeight = height;
  scratch.denseCells = totalCells;
  return true;
}

function denseCellIndex(scratch: SheepCollisionScratch, cx: number, cz: number): number {
  const x = cx - scratch.denseMinX;
  const z = cz - scratch.denseMinZ;
  if (x < 0 || z < 0 || x >= scratch.denseWidth || z >= scratch.denseHeight) {
    return -1;
  }
  return z * scratch.denseWidth + x;
}

function getCellHead(
  scratch: SheepCollisionScratch,
  cx: number,
  cz: number,
  useDenseGrid: boolean
): number {
  if (useDenseGrid) {
    const index = denseCellIndex(scratch, cx, cz);
    // useDenseGrid is only true after prepareDenseGrid allocated denseHeads,
    // and index !== -1 is inside [0, denseCells).
    if (index !== -1) return scratch.denseHeads![index]!;
  }
  const sparseHead = scratch.heads.get(cellKey(cx, cz));
  return sparseHead === undefined ? -1 : sparseHead;
}

function setCellHead(
  scratch: SheepCollisionScratch,
  cx: number,
  cz: number,
  head: number,
  useDenseGrid: boolean
): void {
  if (useDenseGrid) {
    const index = denseCellIndex(scratch, cx, cz);
    if (index !== -1) {
      scratch.denseHeads![index] = head;
      return;
    }
  }
  scratch.heads.set(cellKey(cx, cz), head);
}

function isCollidableSheep(sheep: CollidableSheep | null | undefined): sheep is CollidableSheep {
  return !!sheep &&
    sheep.state === 'active' &&
    !!sheep.position;
}

function resetScratch(scratch: SheepCollisionScratch, count: number): void {
  scratch.heads.clear();
  scratch.cellOccupancy.clear();
  scratch.activeIndices.length = 0;
  scratch.movedIndices.length = 0;
  scratch.result.pairs = 0;
  scratch.result.moved = 0;
  scratch.result.pairChecks = 0;
  scratch.result.active = 0;
  scratch.result.occupiedCells = 0;
  scratch.result.maxCellOccupancy = 0;

  for (let i = 0; i < count; i++) {
    scratch.next[i] = -1;
    scratch.cellX[i] = 0;
    scratch.cellZ[i] = 0;
    scratch.pushX[i] = 0;
    scratch.pushZ[i] = 0;
    scratch.velX[i] = 0;
    scratch.velZ[i] = 0;
  }
}

function applyCappedVector(x: number, z: number, maxMagnitude: number): [number, number] {
  const magSq = x * x + z * z;
  if (magSq <= maxMagnitude * maxMagnitude || magSq <= COLLISION_EPSILON) {
    return [x, z];
  }
  const scale = maxMagnitude / Math.sqrt(magSq);
  return [x * scale, z * scale];
}

/**
 * Push one sheep out of one dog's body. Corrects the position along the
 * contact normal, then removes the velocity component pointing into the dog so
 * the sheep settles against the body instead of grinding back through it next
 * tick. Mutates `sheep.position` and `sheep.velocity` in place.
 *
 * @param sheep body to push out
 * @param dogPos dog body centre
 * @param minDistance sum of body radii
 * @param maxPush per-tick correction cap (never snap)
 * @returns true when a correction was applied
 */
export function resolveDogSheepCollision(
  sheep: PushableBody | null | undefined,
  dogPos: ReadonlyVec2 | null | undefined,
  minDistance: number = DOG_SHEEP_MIN_DISTANCE,
  maxPush: number = MAX_DOG_SHEEP_PUSH_PER_TICK
): boolean {
  if (!sheep || !sheep.position || !dogPos) return false;

  const dx = sheep.position.x - dogPos.x;
  const dz = sheep.position.z - dogPos.z;
  const distSq = dx * dx + dz * dz;

  if (distSq >= minDistance * minDistance) return false;

  let dist = 0;
  let nx: number;
  let nz: number;
  if (distSq <= COLLISION_EPSILON) {
    [nx, nz] = fallbackNormal(stableEntityId(sheep, 0), -1);
  } else {
    dist = Math.sqrt(distSq);
    const inv = 1 / dist;
    nx = dx * inv;
    nz = dz * inv;
  }

  const overlap = Math.min(minDistance - dist, maxPush);

  sheep.position.x += nx * overlap;
  sheep.position.z += nz * overlap;

  if (sheep.velocity) {
    const vDotN = sheep.velocity.x * nx + sheep.velocity.z * nz;
    if (vDotN < 0) {
      sheep.velocity.x -= vDotN * nx;
      sheep.velocity.z -= vDotN * nz;
    }
  }

  return true;
}

/**
 * Resolve one sheep against every dog in an iterable. Deterministic given a
 * stable iteration order (Map.values() insertion order on the authoritative
 * side, the same dog order on the client).
 *
 * @returns true when any dog corrected the sheep
 */
export function resolveDogSheepCollisions(
  sheep: PushableBody | null | undefined,
  dogs: Iterable<{ position?: ReadonlyVec2 | null } | null | undefined> | null | undefined
): boolean {
  if (!dogs) return false;
  let pushed = false;
  for (const dog of dogs) {
    if (dog && dog.position && resolveDogSheepCollision(sheep, dog.position)) {
      pushed = true;
    }
  }
  return pushed;
}

/** Per-run counters, reused in place so the tick path allocates nothing. */
export interface SheepCollisionResult {
  pairs: number;
  moved: number;
  pairChecks: number;
  active: number;
  occupiedCells: number;
  maxCellOccupancy: number;
}

/**
 * Reusable buffers for `resolveSheepSheepCollisions`. Allocate one per sim
 * instance and pass it every tick; the function never allocates on the hot
 * path and never reads stale state (everything is reset up front).
 */
export interface SheepCollisionScratch {
  heads: Map<number, number>;
  cellOccupancy: Map<number, number>;
  denseHeads: Int32Array | null;
  denseMinX: number;
  denseMinZ: number;
  denseWidth: number;
  denseHeight: number;
  denseCells: number;
  next: number[];
  cellX: number[];
  cellZ: number[];
  pushX: number[];
  pushZ: number[];
  velX: number[];
  velZ: number[];
  activeIndices: number[];
  movedIndices: number[];
  result: SheepCollisionResult;
}

export interface SheepCollisionOptions {
  count?: number;
  scratch?: SheepCollisionScratch;
  minDistance?: number;
  maxPush?: number;
  maxVelocityCorrection?: number;
  profile?: boolean;
  bounds?: CollisionBounds | null;
}

export function createSheepCollisionScratch(): SheepCollisionScratch {
  return {
    heads: new Map<number, number>(),
    cellOccupancy: new Map<number, number>(),
    denseHeads: null,
    denseMinX: 0,
    denseMinZ: 0,
    denseWidth: 0,
    denseHeight: 0,
    denseCells: 0,
    next: [],
    cellX: [],
    cellZ: [],
    pushX: [],
    pushZ: [],
    velX: [],
    velZ: [],
    activeIndices: [],
    movedIndices: [],
    result: { pairs: 0, moved: 0, pairChecks: 0, active: 0, occupiedCells: 0, maxCellOccupancy: 0 },
  };
}

/**
 * Resolve active sheep against nearby active sheep using a deterministic
 * spatial hash. Mutates positions and velocities in place.
 *
 * Pushes accumulate into the scratch buffers and are applied once, capped, at
 * the end: a sheep wedged between several neighbours drifts out over a few
 * ticks instead of popping.
 */
export function resolveSheepSheepCollisions(
  sheepArray: CollidableSheep[],
  options: SheepCollisionOptions = {}
): SheepCollisionResult {
  if (!Array.isArray(sheepArray) || sheepArray.length === 0) {
    const scratch = options.scratch || createSheepCollisionScratch();
    scratch.result.pairs = 0;
    scratch.result.moved = 0;
    scratch.result.pairChecks = 0;
    scratch.result.active = 0;
    scratch.result.occupiedCells = 0;
    scratch.result.maxCellOccupancy = 0;
    scratch.movedIndices.length = 0;
    return scratch.result;
  }

  const count = Math.min(options.count ?? sheepArray.length, sheepArray.length);
  const minDistance = options.minDistance ?? SHEEP_SHEEP_MIN_DISTANCE;
  const maxPush = options.maxPush ?? MAX_SHEEP_SHEEP_PUSH_PER_TICK;
  const maxVelocityCorrection = options.maxVelocityCorrection ?? maxPush;
  const scratch = options.scratch || createSheepCollisionScratch();
  const profile = options.profile === true;
  const minDistanceSq = minDistance * minDistance;
  const cellSize = minDistance;

  resetScratch(scratch, count);
  const useDenseGrid = prepareDenseGrid(scratch, options.bounds, cellSize);

  for (let i = 0; i < count; i++) {
    const sheep = sheepArray[i];
    if (!isCollidableSheep(sheep)) continue;

    const cx = Math.floor(sheep.position.x / cellSize);
    const cz = Math.floor(sheep.position.z / cellSize);
    const head = getCellHead(scratch, cx, cz, useDenseGrid);

    scratch.cellX[i] = cx;
    scratch.cellZ[i] = cz;
    scratch.next[i] = head;
    setCellHead(scratch, cx, cz, i, useDenseGrid);
    scratch.activeIndices.push(i);
    scratch.result.active++;
    if (head === -1) scratch.result.occupiedCells++;

    if (profile) {
      const key = cellKey(cx, cz);
      const occupancy = (scratch.cellOccupancy.get(key) || 0) + 1;
      scratch.cellOccupancy.set(key, occupancy);
      if (occupancy > scratch.result.maxCellOccupancy) {
        scratch.result.maxCellOccupancy = occupancy;
      }
    }
  }

  for (const ai of scratch.activeIndices) {
    // activeIndices only holds indices that passed isCollidableSheep above,
    // and resetScratch seeded every scratch lane in [0, count).
    const a = sheepArray[ai]!;
    const cx = scratch.cellX[ai]!;
    const cz = scratch.cellZ[ai]!;

    for (let oz = -1; oz <= 1; oz++) {
      for (let ox = -1; ox <= 1; ox++) {
        let bi = getCellHead(scratch, cx + ox, cz + oz, useDenseGrid);
        while (bi !== -1) {
          if (bi > ai) {
            scratch.result.pairChecks++;
            const b = sheepArray[bi]!;
            const dx = a.position.x - b.position.x;
            const dz = a.position.z - b.position.z;
            const distSq = dx * dx + dz * dz;

            if (distSq < minDistanceSq) {
              let dist = 0;
              let nx: number;
              let nz: number;
              if (distSq <= COLLISION_EPSILON) {
                [nx, nz] = fallbackNormal(
                  stableEntityId(a, ai),
                  stableEntityId(b, bi)
                );
              } else {
                dist = Math.sqrt(distSq);
                const inv = 1 / dist;
                nx = dx * inv;
                nz = dz * inv;
              }

              const half = (minDistance - dist) * 0.5;
              scratch.pushX[ai]! += nx * half;
              scratch.pushZ[ai]! += nz * half;
              scratch.pushX[bi]! -= nx * half;
              scratch.pushZ[bi]! -= nz * half;

              const av = a.velocity;
              const bv = b.velocity;
              if (av && bv) {
                const rel = (av.x - bv.x) * nx + (av.z - bv.z) * nz;
                if (rel < 0) {
                  const impulse = -rel * 0.5;
                  scratch.velX[ai]! += nx * impulse;
                  scratch.velZ[ai]! += nz * impulse;
                  scratch.velX[bi]! -= nx * impulse;
                  scratch.velZ[bi]! -= nz * impulse;
                }
              }

              scratch.result.pairs++;
            }
          }
          bi = scratch.next[bi]!;
        }
      }
    }
  }

  for (const i of scratch.activeIndices) {
    const sheep = sheepArray[i]!;
    const [px, pz] = applyCappedVector(scratch.pushX[i]!, scratch.pushZ[i]!, maxPush);
    const [vx, vz] = applyCappedVector(scratch.velX[i]!, scratch.velZ[i]!, maxVelocityCorrection);

    if (px !== 0 || pz !== 0) {
      sheep.position.x += px;
      sheep.position.z += pz;
      scratch.movedIndices.push(i);
      scratch.result.moved++;
    }

    if (sheep.velocity && (vx !== 0 || vz !== 0)) {
      sheep.velocity.x += vx;
      sheep.velocity.z += vz;
    }
  }

  return scratch.result;
}
