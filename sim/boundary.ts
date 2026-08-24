// SPDX-License-Identifier: AGPL-3.0-or-later
// Lifted from sds/shared/BoundaryCollision.js (rect branch only); same license and copyright holder.

import { Vector2D } from './Vector2D';

/**
 * Rectangular field boundary: margin-based steering force, gate-gap force
 * suppression, and the hard position clamp. Stateless, deterministic, trig-free
 * on the tick path (Math.sqrt only, inside Vector2D).
 *
 * The float math below is byte-identical to the sds rect branch. Any change to
 * it is a sim behavior change and will move the trace fixtures.
 */

/** Axis-aligned field rect. */
export interface RectBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** A point in the XZ plane (Vector2D satisfies this). */
export interface Point2D {
  readonly x: number;
  readonly z: number;
}

/** Gate opening in the perimeter, centered on `position`, `width` metres wide. */
export interface Gate {
  readonly position: Point2D;
  readonly width: number;
}

/** Anything the steering force reads: a position and a velocity. */
export interface BoundaryEntity {
  readonly position: Vector2D;
  readonly velocity: Vector2D;
}

/** Anything the hard clamp reads: a position. */
export interface PositionedEntity {
  readonly position: Vector2D;
}

/**
 * Optional per-side predicates that suppress the boundary force on one edge.
 * A predicate is evaluated only inside its own `dist < margin` branch and
 * performs comparisons only — it never feeds a float op into `steer`.
 */
export interface BoundarySuppress {
  readonly minX?: (position: Vector2D) => boolean;
  readonly maxX?: (position: Vector2D) => boolean;
  readonly minZ?: (position: Vector2D) => boolean;
  readonly maxZ?: (position: Vector2D) => boolean;
}

export interface BoundaryAvoidanceConfig {
  readonly margin?: number;
  readonly maxSpeed?: number;
  readonly maxForce?: number;
  readonly forceMultiplier?: number;
}

export interface GateAvoidanceConfig {
  readonly margin?: number;
  readonly maxSpeed?: number;
  readonly maxForce?: number;
}

export interface HardConstraintConfig {
  readonly margin?: number;
  readonly allowGatePassage?: boolean;
}

/**
 * Shared rect-force core. Executes the EXACT float operations, in the same
 * order, as the sds inline copies. The per-call-site differences are
 * parameterized, never harmonized:
 *
 * - margin / maxSpeed / maxForce / forceMultiplier come in as plain numbers
 *   (each caller keeps its own config destructuring and defaults).
 * - `suppress` holds optional per-side predicates (minX/maxX/minZ/maxZ) that
 *   replace the inline gate-carve-out booleans.
 *
 * @param forceMultiplier factor in the final `maxSpeed * forceMultiplier`
 */
export function rectBoundarySteer(
  entity: BoundaryEntity,
  bounds: RectBounds,
  margin: number,
  maxSpeed: number,
  maxForce: number,
  forceMultiplier: number,
  suppress?: BoundarySuppress
): Vector2D {
  const steer = new Vector2D(0, 0);
  const position = entity.position;

  const distToMinX = position.x - bounds.minX;
  const distToMaxX = bounds.maxX - position.x;
  const distToMinZ = position.z - bounds.minZ;
  const distToMaxZ = bounds.maxZ - position.z;

  if (distToMinX < margin) {
    if (!(suppress && suppress.minX && suppress.minX(position))) {
      const force = (margin - distToMinX) / margin;
      steer.x = maxSpeed * force * 1.2;
    }
  } else if (distToMaxX < margin) {
    if (!(suppress && suppress.maxX && suppress.maxX(position))) {
      const force = (margin - distToMaxX) / margin;
      steer.x = -maxSpeed * force * 1.2;
    }
  }

  if (distToMinZ < margin) {
    if (!(suppress && suppress.minZ && suppress.minZ(position))) {
      const force = (margin - distToMinZ) / margin;
      steer.z = maxSpeed * force * 1.2;
    }
  } else if (distToMaxZ < margin) {
    if (!(suppress && suppress.maxZ && suppress.maxZ(position))) {
      const force = (margin - distToMaxZ) / margin;
      steer.z = -maxSpeed * force * 1.2;
    }
  }

  if (steer.magnitude() > 0) {
    steer.normalize();
    steer.multiply(maxSpeed * forceMultiplier);
    steer.subtract(entity.velocity);
    steer.limit(maxForce * 2.5);
  }

  return steer;
}

/**
 * Boundary avoidance force with no gate carve-out and a config-driven
 * forceMultiplier. Field defaults: margin 10, forceMultiplier 1.5.
 */
export function calculateRectAvoidance(
  entity: BoundaryEntity,
  bounds: RectBounds,
  config: BoundaryAvoidanceConfig = {}
): Vector2D {
  const {
    margin = 10,
    maxSpeed = 1.5,
    maxForce = 0.05,
    forceMultiplier = 1.5
  } = config;

  return rectBoundarySteer(entity, bounds, margin, maxSpeed, maxForce, forceMultiplier);
}

/**
 * Boundary avoidance force that excludes the gate gap, so sheep pressed toward
 * the opening are not pushed back off it. The carve-out rides in as suppression
 * predicates (comparisons only) on whichever Z edge the gate sits on: a gate
 * within 5 m of an edge suppresses that edge's force for entities within
 * `width / 2 + 2` of the gate centre in X.
 *
 * This site hardcodes the final multiplier at 1.5 (not config-driven) — keep it.
 */
export function calculateBoundaryAvoidanceWithGate(
  entity: BoundaryEntity,
  bounds: RectBounds,
  gate: Gate | null | undefined,
  config: GateAvoidanceConfig = {}
): Vector2D {
  const {
    margin = 3,
    maxSpeed = 0.1,
    maxForce = 0.02
  } = config;

  return rectBoundarySteer(entity, bounds, margin, maxSpeed, maxForce, 1.5, {
    minZ: (position) => gate && gate.position.z <= bounds.minZ + 5 ?
      Math.abs(position.x - gate.position.x) < gate.width / 2 + 2 : false,
    maxZ: (position) => gate && gate.position.z >= bounds.maxZ - 5 ?
      Math.abs(position.x - gate.position.x) < gate.width / 2 + 2 : false
  });
}

/**
 * Hard position clamp: nothing leaves the rect (inset by `margin`). When
 * `allowGatePassage` is set and the entity is standing in the gate mouth, the
 * rect clamp is skipped and X is clamped to the gate width instead, letting the
 * entity cross the boundary line through the opening.
 *
 * Note the gate-area test uses `Math.abs(position.x)` — it assumes the gate is
 * centred on x = 0, exactly as sds did. Preserved verbatim.
 *
 * @returns a NEW Vector2D; the entity is not mutated.
 */
export function applyHardBoundaryConstraints(
  entity: PositionedEntity,
  bounds: RectBounds,
  gate: Gate | null = null,
  config: HardConstraintConfig = {}
): Vector2D {
  const {
    margin = 0.2,
    allowGatePassage = false
  } = config;

  const position = entity.position.clone();

  const inGateArea = allowGatePassage && gate &&
    Math.abs(position.x) <= gate.width / 2 &&
    position.z >= gate.position.z - 2 &&
    position.z <= gate.position.z + 2;

  if (!inGateArea) {
    position.x = Math.max(bounds.minX + margin, Math.min(bounds.maxX - margin, position.x));
    position.z = Math.max(bounds.minZ + margin, Math.min(bounds.maxZ - margin, position.z));
  } else if (gate) {
    position.x = Math.max(-gate.width / 2, Math.min(gate.width / 2, position.x));
  }

  return position;
}

/** Whether a position lies inside an axis-aligned area (inclusive on all edges). */
export function isWithinArea(position: Point2D, area: RectBounds): boolean {
  return position.x >= area.minX &&
         position.x <= area.maxX &&
         position.z >= area.minZ &&
         position.z <= area.maxZ;
}
