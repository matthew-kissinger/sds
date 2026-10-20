// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FlockSim } from '@sim/FlockSim';
import type { PlayerInputs, SimState } from '@sim/types';
import type { AcceptedBark } from '@app/state/store';
/** Render/input contract. A remote view never advances the flock or awards a score. */
export interface ClientSim extends FlockSim {
  readonly state: SimState;
  readonly tick: number;
  readonly completed: boolean;
  readonly pennedCount: number;
  frame?(delta: number, input: PlayerInputs): void;
  barkForDog?(index: number): AcceptedBark | null;
}
