// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest';
import { CoopMatch } from '../realtime/CoopMatch';
import { newRoom, reserve, bind } from '../realtime/roomState';
import { createSimState } from '@sim/state';
import { HOME_FIELD } from '@sim/field';
import { createHerdingDriver } from './helpers/herding-driver';
it('herds from 20 Hz public snapshots through 30 Hz inputs', () => {
  const room = newRoom('na_' + 'a'.repeat(32), 'na', { mode: 'coop', flockSize: 25, visibility: 'private' }, 0);
  for (let i = 0; i < 2; i++) { reserve(room, { id: String(i), name: 'Dog' }, String(i), String(i), 0); bind(room, String(i), String(i), 0); }
  const match = new CoopMatch('a'.repeat(32), 25, [0, 1], 42, 0);
  const state = createSimState(HOME_FIELD, 25, 0, [0, 1]); const drive = createHerdingDriver();
  for (let t = 0; t < 18000 && !match.sim.completed; t++) {
    if (t % 3 === 0) {
      const frame = match.snapshot();
      frame.dogs.forEach((d, i) => { state.dogs[i]!.position.set(d.x, d.z); state.dogs[i]!.velocity.set(d.vx, d.vz); state.dogs[i]!.stamina = d.stamina; });
      state.sheep.forEach((s, i) => { s.position.set(frame.sheep[i * 4]!, frame.sheep[i * 4 + 1]!); s.state = frame.sheep[i * 4 + 3] === 0 ? 'active' : 'penned'; });
    }
    const now = 500 + t * 1000 / 60;
    if (t % 2 === 0) { const input = drive(state); match.input(0, t, input.direction.x * 0.5, input.direction.z * 0.5, false, 0, now); }
    match.advance(now, room);
  }
  expect(match.sim.pennedCount).toBe(25);
});
