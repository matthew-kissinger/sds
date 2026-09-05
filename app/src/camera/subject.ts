// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CpuDeterministicSim } from '@sim/FlockSim';
import type { Dog } from '@sim/types';
import {
  advancePositionPresentationBuffers, createPositionPresentationBuffers,
  resetPositionPresentationBuffers,
} from '@app/scene/flock/presentationBuffers';

/** Follow the rendered dog between simulation ticks, not its stepped position.
 * Separate storage uses the same interpolation contract as the dog renderer. */
export function createCameraSubject() {
  const buffers = createPositionPresentationBuffers(1);
  let source: CpuDeterministicSim | null = null;
  let presented: Dog | null = null;
  return {
    sample(sim: CpuDeterministicSim, delta: number): Dog | null {
      const dog = sim.state.dogs[0];
      if (!dog) return null;
      if (source !== sim || !presented) {
        source = sim;
        presented = { ...dog, position: dog.position.clone() };
        resetPositionPresentationBuffers(buffers, sim.dogPositions, sim.tick);
      }
      advancePositionPresentationBuffers(buffers, sim.dogPositions, sim.tick, delta, true);
      const alpha = buffers.interpolationAlpha;
      presented.position.set(
        buffers.previousPositions[0]! + (buffers.currentPositions[0]! - buffers.previousPositions[0]!) * alpha,
        buffers.previousPositions[1]! + (buffers.currentPositions[1]! - buffers.previousPositions[1]!) * alpha,
      );
      presented.velocity = dog.velocity;
      presented.heading = dog.heading;
      return presented;
    },
  };
}
