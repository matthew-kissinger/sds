// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared authoritative and predicted dog movement. Arithmetic/order preserved.
import { Vector2D } from './Vector2D';
import { applyAcceleration, updateStamina, validateEntityState } from './MovementPhysics';
import { applyHardBoundaryConstraints } from './boundary';
import { DOG_HEADING_MIN_SPEED, DOG_MAX_SPEED, DOG_MOVEMENT, DOG_SPRINT_SPEED,
  DOG_STAMINA, DOG_TURN_RATE, FIXED_DT, HARD_BOUNDARY } from './tuning';
import type { Dog, PlayerInputs, SimState } from './types';
const _dogTarget = new Vector2D(0, 0);
const _dogAccel = { ...DOG_MOVEMENT };
const _fallback = new Vector2D(0, 0);
/**
 * Slew the dog's heading toward its velocity direction without trig: lerp the
 * unit vector and renormalize. Opposing unit vectors otherwise normalize back
 * to the original heading forever at our fixed step. Start that ambiguous
 * reversal with a small, deterministic right turn, then use the usual slew.
 */
function updateHeading(dog: Dog, dt: number): void {
  const speed = dog.velocity.magnitude();
  if (speed <= DOG_HEADING_MIN_SPEED) return;

  const inv = 1 / speed;
  const dx = dog.velocity.x * inv;
  const dz = dog.velocity.z * inv;

  let k = DOG_TURN_RATE * dt;
  if (k > 1) k = 1;

  if (dog.heading.x * dx + dog.heading.z * dz < -0.999999) {
    const hx = dog.heading.x;
    dog.heading.x += dog.heading.z * k;
    dog.heading.z -= hx * k;
    dog.heading.normalize();
    return;
  }

  dog.heading.x += (dx - dog.heading.x) * k;
  dog.heading.z += (dz - dog.heading.z) * k;
  dog.heading.normalize();
  if (dog.heading.magnitude() < 0.5) dog.heading.set(dx, dz);
}

export function advanceDog(dog: Dog, input: PlayerInputs): void {
  const dt = FIXED_DT;
  if (dog.barkCooldownTicks > 0) dog.barkCooldownTicks -= 1;

  // sds gated the sprint on movement as well as on stamina; updateStamina
  // applies the same test internally, so the two agree by construction.
  const isMoving = dog.velocity.magnitude() > 0.1;
  const stamina = updateStamina(dog, input.sprint, dt, DOG_STAMINA);
  dog.sprinting = stamina.isConsuming && isMoving;

  const maxSpeed = dog.sprinting ? DOG_SPRINT_SPEED : DOG_MAX_SPEED;
  _dogAccel.maxSpeed = maxSpeed;
  _dogTarget.set(input.direction.x, input.direction.z);
  // Partial stick/thumb travel gives precise walking near the flock. Keep
  // unit/digital input on the exact existing full-speed arithmetic path.
  const intentLength = _dogTarget.magnitude();
  const effort = intentLength >= 0.9999 ? 1 : intentLength;
  _dogTarget.normalize().multiply(maxSpeed * effort);
  applyAcceleration(dog, _dogTarget, dt, _dogAccel);

  dog.position.x += dog.velocity.x * dt;
  dog.position.z += dog.velocity.z * dt;

  updateHeading(dog, dt);

}

export function containDog(dog: Dog, state: Pick<SimState, 'field' | 'penBarrier'>): void {
  state.penBarrier.containDog(dog.position, true, dog.penMemory);
  if (!dog.penMemory.inside) dog.position = applyHardBoundaryConstraints(dog, state.field.bounds, state.field.gate, HARD_BOUNDARY);
  _fallback.set(state.field.spawn.center.x, state.field.spawn.center.z);
  validateEntityState(dog, _fallback);
}
