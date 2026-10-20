// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../roomCommands';
import { bind, disconnect, expire, GRACE_MS, newRoom, reserve, RESERVATION_MS, START_MS } from '../roomState';
import { command, packet } from '../protocol';
const initial = () => newRoom(`na_${'a'.repeat(32)}`, 'na', { mode: 'coop', flockSize: 25, visibility: 'public' }, 1000);
function add(room: ReturnType<typeof initial>, id: string, now = 1000) {
  reserve(room, { id, name: id }, `initial-${id}`, `ticket-${id}`, now);
  return bind(room, `ticket-${id}`, `session-${id}`, now);
}
describe('room lifecycle deadlines and authority', () => {
  it('holds a seat for exactly 15 seconds after transport loss', () => {
    const r = initial(); add(r, 'a'); add(r, 'b');
    disconnect(r, 'a', 'session-a', 2000);
    expect(r.host).toBe('b'); expect(r.members[0].ready).toBe(false);
    expire(r, 2000 + GRACE_MS - 1); expect(r.members).toHaveLength(2);
    expire(r, 2000 + GRACE_MS); expect(r.members.map(m => m.id)).toEqual(['b']);
  });
  it('does not let repeated rejoin requests extend disconnected grace', () => {
    const r = initial(); add(r, 'a'); disconnect(r, 'a', 'session-a', 2000);
    reserve(r, { id: 'a', name: 'A' }, 'unused', 'new-ticket', 16_000);
    expect(r.members[0].deadline).toBe(17_000);
    expire(r, 17_000); expect(r.members).toHaveLength(0);
  });
  it('reconnect replaces the socket and cannot steal back host authority', () => {
    const r = initial(); add(r, 'a'); add(r, 'b');
    disconnect(r, 'a', 'session-a', 2000);
    reserve(r, { id: 'a', name: 'A' }, 'unused', 'again', 3000); bind(r, 'again', 'replacement', 3000);
    disconnect(r, 'a', 'session-a', 4000);
    expect(r.members[0].connected).toBe(true); expect(r.host).toBe('b');
  });
  it('expires an unbound reservation and clears a reusable ticket', () => {
    const r = initial(); reserve(r, { id: 'a', name: 'A' }, 's', 't', 1000);
    expire(r, 1000 + RESERVATION_MS);
    expect(() => bind(r, 't', 's', 1000 + RESERVATION_MS)).toThrow('invalid_ticket');
  });
  it('a single ready player cannot start; every present seat must be connected and ready', () => {
    const r = initial(); const a = add(r, 'a'); a.ready = true;
    expect(() => applyCommand(r, 'a', a.session, { type: 'start', seq: 0 }, 2000, 'round')).toThrow('not_ready');
    add(r, 'b');
    expect(() => applyCommand(r, 'a', a.session, { type: 'start', seq: 1 }, 2000, 'round')).toThrow('not_ready');
  });
  it('changing settings clears all readiness; a non-host cannot change them', () => {
    const r = initial(); const a = add(r, 'a'); const b = add(r, 'b'); a.ready = b.ready = true;
    const cmd = { type: 'settings', seq: 0, value: { ...r.settings, flockSize: 75 } } as const;
    expect(() => applyCommand(r, 'b', b.session, cmd, 2000, 'round')).toThrow('host_only');
    applyCommand(r, 'a', a.session, cmd, 2000, 'round');
    expect(r.members.every(m => !m.ready)).toBe(true); expect(r.settings.flockSize).toBe(75);
  });
  it('freezes settings and rejects removal/join during starting; timeout returns to waiting', () => {
    const r = initial(); const a = add(r, 'a'); const b = add(r, 'b'); a.ready = b.ready = true;
    applyCommand(r, 'a', a.session, { type: 'start', seq: 0 }, 2000, 'round');
    expect(() => applyCommand(r, 'a', a.session, { type: 'remove', slot: b.slot, seq: 1 }, 2000, '')).toThrow('not_waiting');
    expect(() => reserve(r, { id: 'c', name: 'C' }, 's', 't', 2000)).toThrow('round_in_progress');
    expire(r, 2000 + START_MS);
    expect(r.phase).toBe('waiting'); expect(r.interruption).toBe('start_timeout');
    expect(r.members.every(m => !m.ready)).toBe(true);
  });
  it('explicit leave releases a waiting seat immediately without reconnect grace', () => {
    const r = initial(); const a = add(r, 'a'); add(r, 'b');
    applyCommand(r, 'a', a.session, { type: 'leave', seq: 0 }, 2000, '');
    expect(r.members.map(m => m.id)).toEqual(['b']); expect(r.host).toBe('b');
  });
  it('an empty room and room-scoped exclusions expire', () => {
    const r = initial(); r.removed.push('a'); expire(r, r.idleExpires);
    expect(r.phase).toBe('closed'); expect(r.removed).toEqual([]);
  });
});
describe('versioned MessagePack command boundary', () => {
  it.each([
    [3, 'start', 0], [2, 'ready', -1, true], [2, 'ready', 0, 'true'],
    [2, 'remove', 0, 4], [2, 'settings', 0, 'coop', 5000, 'public'],
    [2, 'settings', 0, 'unknown', 25, 'public'], [2, 'start', Number.MAX_SAFE_INTEGER + 1],
    [2, 'input', 0, 100, 100], [2, 'ready', 0, true, 'extra'],
    [2, 'loaded', 0, 'wrong-round'], [2, 'ack', 0, NaN],
  ])('rejects invalid command %#', (...frame) => {
    expect(() => command(packet(frame))).toThrow();
  });
  it('rejects text, oversized and malformed binary frames', () => {
    expect(() => command('{}')).toThrow();
    expect(() => command(new ArrayBuffer(1025))).toThrow();
    expect(() => command(new Uint8Array([0xc1]).buffer)).toThrow();
  });
  it('preserves a valid command without trusting client position or time', () => {
    expect(command(packet([2, 'ready', 17, true]))).toEqual({ seq: 17, type: 'ready', value: true });
  });
});
