// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { RemoteView } from '@app/multiplayer/RemoteView';
import { createCameraSubject } from '@app/camera/subject';
import { RoomMatch } from '../realtime/RoomMatch';
import { FIXED_DT } from '@sim/tuning';
import { useGameStore } from '@app/state/store';
import { createScoresController } from '@app/scores/controller';
import { resetScoreStore } from '@app/scores/store';
const idle = { direction: { x: 0, z: 0 }, bark: false, sprint: false };
describe('co-op presentation', () => {
  it.each(['coop', 'competitive'] as const)('does not submit %s completion to solo scores', async mode => {
    resetScoreStore();
    const submit = vi.fn(async () => undefined);
    const controller = createScoresController({
      register: async () => ({ token: 'local', authSecret: 'proof', playerProfile: { persistentId: 'test', displayName: 'Dog', fullName: 'Dog#0001' } }),
      submit, rename: async () => { throw new Error('unused'); }, myRuns: async () => [], leaderboard: async () => ({ entries: [] }),
    }, { load: () => null, save: () => {}, clear: () => {} });
    const before = useGameStore.getState();
    const view = new RemoteView(new RoomMatch('a'.repeat(32), 25, [0, 1], 42, 0, mode).snapshot(), 0, () => 0, () => {});
    useGameStore.setState({ sim: view, gamePhase: 'playing' });
    const stop = controller.start();
    try {
      await controller.ensureIdentity();
      useGameStore.setState({ gamePhase: 'complete', completionTick: 600, completionTimeMs: 10000 });
      await Promise.resolve(); expect(submit).not.toHaveBeenCalled();
    } finally { stop(); useGameStore.setState(before); resetScoreStore(); }
  });
  it.each([2, 3, 4])('renders the received flock and follows the local dog among %i players', count => {
    const frame = new RoomMatch('a'.repeat(32), 75, Array.from({ length: count }, (_, i) => i), 42, 0).snapshot();
    const view = new RemoteView(frame, count - 1, () => 0, () => {});
    expect(view.authoritative).toBe(false);
    expect(view.state.dogs[0]!.id).toBe(count - 1);
    expect(Array.from(view.positions)).toEqual(frame.sheep.filter((_, i) => i % 4 < 2).map(Math.fround));
    expect(createCameraSubject().sample(view, FIXED_DT)?.position).toEqual(view.state.dogs[0]!.position);
    expect(() => view.step()).toThrow('server-owned');
  });
  it('does not predict flock motion, deduplicates simultaneous bark receipts and ignores old frames', () => {
    const first = new RoomMatch('a'.repeat(32), 25, [0, 1], 42, 0).snapshot();
    const accepted = vi.fn(); let sequence = 0;
    const view = new RemoteView(first, 0, () => sequence++, accepted);
    const original = Array.from(view.positions);
    for (let t = 0; t < 12; t++) view.frame(FIXED_DT, { ...idle, direction: { x: 0, z: 1 } });
    expect(Array.from(view.positions)).toEqual(original);
    expect(view.state.dogs[0]!.position.z).toBeGreaterThan(first.dogs[0]!.z);
    const next = { ...first, tick: 20, barks: [0, 1].map(slot => ({ serial: slot + 1, tick: 20, slot, x: 0, z: 0 })) };
    view.receive(next); view.receive(next); view.receive(first);
    expect(accepted).toHaveBeenCalledTimes(2);
    expect(view.barkForDog(0)?.serial).toBe(1); expect(view.barkForDog(1)?.serial).toBe(2);
    expect(view.acceptedBarkSerial).toBe(2);
  });
  it('freezes local prediction when disconnected and does not replay old bark audio on rejoin', () => {
    const frame = new RoomMatch('a'.repeat(32), 25, [0, 1], 42, 0).snapshot();
    frame.barks = [{ serial: 8, tick: 0, slot: 0, x: 0, z: 0 }];
    const accepted = vi.fn(), send = vi.fn(() => 0);
    const view = new RemoteView(frame, 0, send, accepted, 8); view.enabled = false;
    const before = view.state.dogs[0]!.position.clone();
    view.frame(0.1, { ...idle, direction: { x: 0, z: 1 }, bark: true });
    expect(view.state.dogs[0]!.position).toEqual(before); expect(accepted).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
    expect(view.barkId).toBe(8);
  });
});
