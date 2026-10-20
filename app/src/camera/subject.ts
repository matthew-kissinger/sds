// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ClientSim } from '@app/game/ClientSim';
import type { Dog } from '@sim/types';
import {
  advancePositionPresentationBuffers, createPositionPresentationBuffers,
  resetPositionPresentationBuffers,
} from '@app/scene/flock/presentationBuffers';

/** Follow the rendered dog between simulation ticks, not its stepped position.
 * Separate storage uses the same interpolation contract as the dog renderer. */
export function createCameraSubject() {
  const buffers = createPositionPresentationBuffers(1);
  let source: ClientSim | null = null;
  let presented: Dog | null = null;
  let positions: Float32Array = new Float32Array(2);
  return {
    sample(sim: ClientSim, delta: number): Dog | null {
      const dog = sim.state.dogs[0];
      if (!dog) return null;
      if (source !== sim || !presented) {
        source = sim;
        positions = sim.dogPositions.subarray(0, 2);
        presented = { ...dog, position: dog.position.clone() };
        resetPositionPresentationBuffers(buffers, positions, sim.tick);
      }
      advancePositionPresentationBuffers(buffers, positions, sim.tick, delta, true);
      const alpha = buffers.interpolationAlpha;
      presented.position.set(
        buffers.previousPositions[0]! + (buffers.currentPositions[0]! - buffers.previousPositions[0]!) * alpha,
        buffers.previousPositions[1]! + (buffers.currentPositions[1]! - buffers.previousPositions[1]!) * alpha,
      );
      if (!sim.authoritative) presented.position.set(dog.position.x, dog.position.z);
      presented.velocity = dog.velocity;
      presented.heading = dog.heading;
      return presented;
    },
  };
}
