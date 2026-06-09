// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P2-BACKPRESSURE: DO backpressure + tick-health hardening.
 *
 * Locks, with the socket-stub harness from delta-broadcast.spec.ts:
 *   - a client whose socket holds a standing backlog over
 *     BACKPRESSURE_MAX_BUFFERED_BYTES for BACKPRESSURE_EVICT_INTERVALS
 *     consecutive broadcast intervals is evicted (1013 close), and the
 *     eviction runs the NORMAL disconnect path: the 15s reconnect grace is
 *     armed, and host migration fires after it exactly as for a network drop;
 *   - a transient backlog does not evict (one healthy interval resets the
 *     streak);
 *   - while a socket is over the ceiling its broadcast send is skipped
 *     (backpressure relief) and resumes once it drains;
 *   - ws.send throwing counts toward the same eviction streak;
 *   - eviction emits a structured `player_evicted` log with reason
 *     `backpressure` and the measured bufferedAmount;
 *   - the TickHealthWindow ring buffer + the tick_health_degraded threshold
 *     and rate-limit logic in GameSimulation._recordTickHealth.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { decode } from '@msgpack/msgpack';
import {
  RoomDO,
  BACKPRESSURE_MAX_BUFFERED_BYTES,
  BACKPRESSURE_EVICT_INTERVALS,
} from '../../worker/src/RoomDO.ts';
import {
  GameSimulation,
  TickHealthWindow,
  TICK_HEALTH_P95_BOUND_MS,
} from '../../worker/src/GameSim.js';
import { PROTOCOL_VERSION } from '../../shared/protocol.js';

// ---- DurableObject mocks (mirror delta-broadcast.spec.ts) -------------------

class FakeStorage {
  map = new Map<string, unknown>();
  alarmAt: number | null = null;
  async get(key: string) { return this.map.get(key); }
  async put(key: string, val: unknown) { this.map.set(key, val); }
  async delete(key: string) { this.map.delete(key); }
  async getAlarm() { return this.alarmAt; }
  setAlarm(ts: number) { this.alarmAt = ts; }
}

function makeFakeState(storage = new FakeStorage()) {
  return {
    storage,
    blockConcurrencyWhile: async (fn: () => unknown) => { await fn(); },
  } as any;
}

function makeFakeEnv() {
  return { ROOM_DO: {}, LOBBY_DO: {}, DB: {}, JWT_SECRET: 'test-secret' } as any;
}

// Fake socket with a controllable standing backlog (bufferedAmount) and a
// controllable send failure, plus a record of the server-initiated close.
// Mirrors workerd: a server-side close() does NOT dispatch the local 'close'
// listener, so the eviction path must route the disconnect itself.
class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  bufferedAmount = 0;
  throwOnSend = false;
  closed: { code?: number; reason?: string } | null = null;
  listeners = new Map<string, ((evt: any) => void)[]>();
  addEventListener(type: string, cb: (evt: any) => void) {
    const arr = this.listeners.get(type) ?? [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }
  send(buf: ArrayBuffer | Uint8Array) {
    if (this.throwOnSend) throw new Error('send failed (fake)');
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
    this.sent.push(decode(bytes));
  }
  close(code?: number, reason?: string) { this.closed = { code, reason }; }
  framesOfType(t: string) { return this.sent.filter((m) => m && m.t === t); }
}

// ---- room setup --------------------------------------------------------------

async function initRoom(room: any) {
  const body = {
    roomCode: 'TESTRM',
    hostId: 'host-sess',
    hostName: 'Alice',
    hostDogType: 'jep',
    hostPersistentId: 'pid-host',
    hostDisplayName: 'Alice',
    hostProtocolVersion: PROTOCOL_VERSION,
    roomSettings: { isPublic: false, gameMode: 'cooperative', sceneId: 'field', sheepCount: 200 },
  };
  const res = await room.fetch(new Request('http://room/init', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
  expect(res.status).toBe(200);
}

async function joinRoom(room: any, sessionId: string) {
  const res = await room.fetch(new Request('http://room/join', {
    method: 'POST',
    body: JSON.stringify({
      playerId: sessionId,
      playerName: sessionId,
      dogType: 'jep',
      persistentId: `pid-${sessionId}`,
      displayName: sessionId,
      protocolVersion: PROTOCOL_VERSION,
    }),
    headers: { 'content-type': 'application/json' },
  }));
  expect(res.status).toBe(200);
}

function tickN(room: any, n: number) {
  room.simulation.isRunning = true;
  try {
    for (let i = 0; i < n; i++) room.simulation.tick();
  } finally {
    room.simulation.isRunning = false;
  }
}

// In-game two-player room with bound fake sockets, intervals stopped, one
// tick run so getLatestGameState() has a frame to broadcast.
async function startRoom() {
  const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
  await initRoom(room);
  await joinRoom(room, 'guest');
  const host = new FakeSocket();
  const guest = new FakeSocket();
  room.bindSocket('host-sess', host);
  room.bindSocket('guest', guest);
  room.handleClientMessage('host-sess', { t: 'startGame' });
  expect(room.simulation).not.toBeNull();
  // Stop the real intervals; tests drive broadcasts by hand.
  room.simulation.stop();
  room.stopBroadcastLoop();
  tickN(room, 1);
  return { room, host, guest };
}

function parsedLogLines(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls
    .map((call: any[]) => { try { return JSON.parse(call[0]); } catch { return null; } })
    .filter(Boolean) as any[];
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('P2-BACKPRESSURE: slow-client eviction', () => {
  it('evicts a sustained over-ceiling backlog after exactly BACKPRESSURE_EVICT_INTERVALS intervals, via the normal grace path', async () => {
    vi.useFakeTimers();
    const { room, guest } = await startRoom();
    guest.bufferedAmount = BACKPRESSURE_MAX_BUFFERED_BYTES + 1;

    for (let i = 0; i < BACKPRESSURE_EVICT_INTERVALS - 1; i++) room.broadcastGameFrame();
    expect(guest.closed).toBeNull();
    expect(room.sessions.has('guest')).toBe(true);
    expect(room.graceTimeouts.has('guest')).toBe(false);

    room.broadcastGameFrame();
    expect(guest.closed).toEqual({ code: 1013, reason: 'backpressure' });
    expect(room.sessions.has('guest')).toBe(false);
    // The NORMAL in-game disconnect path: reconnect grace armed, player kept.
    expect(room.graceTimeouts.has('guest')).toBe(true);
    expect(room.players.has('guest')).toBe(true);

    // Grace expiry runs the normal leave, same as any network drop.
    vi.advanceTimersByTime(15_000);
    expect(room.players.has('guest')).toBe(false);
    expect(room.graceTimeouts.has('guest')).toBe(false);
  });

  it('does not evict a transient backlog; one healthy interval resets the streak', async () => {
    const { room, guest } = await startRoom();

    guest.bufferedAmount = BACKPRESSURE_MAX_BUFFERED_BYTES + 1;
    for (let i = 0; i < BACKPRESSURE_EVICT_INTERVALS - 1; i++) room.broadcastGameFrame();
    expect(room.sendHealth.get('guest')).toBe(BACKPRESSURE_EVICT_INTERVALS - 1);

    // The socket drains: one healthy interval clears the streak entirely.
    guest.bufferedAmount = 0;
    room.broadcastGameFrame();
    expect(room.sendHealth.has('guest')).toBe(false);

    // A second near-miss stall still does not evict.
    guest.bufferedAmount = BACKPRESSURE_MAX_BUFFERED_BYTES + 1;
    for (let i = 0; i < BACKPRESSURE_EVICT_INTERVALS - 1; i++) room.broadcastGameFrame();
    expect(guest.closed).toBeNull();
    expect(room.sessions.has('guest')).toBe(true);
    expect(room.graceTimeouts.has('guest')).toBe(false);
  });

  it('skips broadcast sends while a socket is over the ceiling and resumes once it drains', async () => {
    const { room, host, guest } = await startRoom();
    host.sent.length = 0;
    guest.sent.length = 0;

    guest.bufferedAmount = BACKPRESSURE_MAX_BUFFERED_BYTES + 1;
    room.broadcastGameFrame();
    expect(guest.sent).toHaveLength(0); // skipped: no frame piled onto the backlog
    expect(host.sent).toHaveLength(1);  // healthy peer is unaffected

    guest.bufferedAmount = 0;
    room.broadcastGameFrame();
    expect(guest.sent).toHaveLength(1); // resumed
    expect(host.sent).toHaveLength(2);
  });

  it('counts ws.send throws toward the same eviction streak', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {}); // ws_broadcast_failed per interval
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { room, guest } = await startRoom();
    guest.throwOnSend = true;

    for (let i = 0; i < BACKPRESSURE_EVICT_INTERVALS; i++) room.broadcastGameFrame();
    expect(guest.closed).toEqual({ code: 1013, reason: 'backpressure' });
    expect(room.sessions.has('guest')).toBe(false);
    expect(room.graceTimeouts.has('guest')).toBe(true);

    const evicted = parsedLogLines(warnSpy).find(
      (l) => l.event === 'player_evicted' && l.reason === 'backpressure',
    );
    expect(evicted).toBeTruthy();
    expect(evicted.sendFailed).toBe(true);
  });

  it('host eviction runs host migration through the normal grace path', async () => {
    vi.useFakeTimers();
    const { room, host, guest } = await startRoom();
    host.bufferedAmount = BACKPRESSURE_MAX_BUFFERED_BYTES + 1;

    for (let i = 0; i < BACKPRESSURE_EVICT_INTERVALS; i++) room.broadcastGameFrame();
    expect(host.closed).toEqual({ code: 1013, reason: 'backpressure' });
    expect(room.graceTimeouts.has('host-sess')).toBe(true);
    // Host role is unchanged during the grace window (the host may reconnect).
    expect(room.meta.hostId).toBe('host-sess');

    vi.advanceTimersByTime(15_000);
    // Grace expired with no rebind: the normal leave migrated the host.
    expect(room.players.has('host-sess')).toBe(false);
    expect(room.meta.hostId).toBe('guest');
    expect(room.players.get('guest').isHost).toBe(true);
    expect(guest.framesOfType('hostChanged')).toHaveLength(1);
  });

  it('emits a structured player_evicted log with reason backpressure and the measured bufferedAmount', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { room, guest } = await startRoom();
    const measured = BACKPRESSURE_MAX_BUFFERED_BYTES + 4096;
    guest.bufferedAmount = measured;

    for (let i = 0; i < BACKPRESSURE_EVICT_INTERVALS; i++) room.broadcastGameFrame();

    const evicted = parsedLogLines(warnSpy).find(
      (l) => l.event === 'player_evicted' && l.reason === 'backpressure',
    );
    expect(evicted).toBeTruthy();
    expect(evicted.playerId).toBe('guest');
    expect(evicted.roomCode).toBe('TESTRM');
    expect(evicted.bufferedAmount).toBe(measured);
    expect(evicted.unhealthyIntervals).toBe(BACKPRESSURE_EVICT_INTERVALS);
    expect(evicted.maxBufferedBytes).toBe(BACKPRESSURE_MAX_BUFFERED_BYTES);
    expect(evicted.level).toBe('warn');
  });

  it('a rebind clears the streak (fresh socket, fresh slate)', async () => {
    const { room, guest } = await startRoom();
    guest.bufferedAmount = BACKPRESSURE_MAX_BUFFERED_BYTES + 1;
    for (let i = 0; i < BACKPRESSURE_EVICT_INTERVALS - 1; i++) room.broadcastGameFrame();
    expect(room.sendHealth.get('guest')).toBe(BACKPRESSURE_EVICT_INTERVALS - 1);

    room.bindSocket('guest', new FakeSocket());
    expect(room.sendHealth.has('guest')).toBe(false);
  });
});

// ---- tick variance -----------------------------------------------------------

describe('P2-BACKPRESSURE: TickHealthWindow ring buffer', () => {
  it('push reports a completed pass exactly every `size` samples and never allocates a new buffer', () => {
    const w = new TickHealthWindow(4);
    const buf = w.buf;
    const passes: boolean[] = [];
    for (let i = 0; i < 9; i++) passes.push(w.push(i));
    expect(passes).toEqual([false, false, false, true, false, false, false, true, false]);
    expect(w.buf).toBe(buf); // same preallocated ring throughout
  });

  it('computes nearest-rank p95 over full and partial windows', () => {
    const w = new TickHealthWindow(100);
    for (let i = 100; i >= 1; i--) w.push(i); // 100..1, order must not matter
    expect(w.p95()).toBe(96);

    const partial = new TickHealthWindow(100);
    partial.push(10);
    partial.push(50);
    expect(partial.p95()).toBe(50);

    expect(new TickHealthWindow(10).p95()).toBe(0); // empty window
  });

  it('p95 reflects only the most recent `size` samples (old samples age out)', () => {
    const w = new TickHealthWindow(4);
    for (const v of [100, 100, 100, 100]) w.push(v);
    expect(w.p95()).toBe(100);
    for (const v of [10, 10, 10, 10]) w.push(v);
    expect(w.p95()).toBe(10);
  });
});

describe('P2-BACKPRESSURE: tick_health_degraded threshold + rate limit', () => {
  // _recordTickHealth only touches these fields, so a hand-built `this` lets
  // the threshold logic run without constructing a full GameSimulation.
  function makeFakeSim(windowSize: number) {
    return {
      tickRate: 60,
      lastTickTime: 0,
      _tickOverrunLastLog: 0,
      _tickOverrunSuppressed: 0,
      _tickHealthWindow: new TickHealthWindow(windowSize),
      _tickHealthLastLog: 0,
      room: { roomCode: 'TICKHP' },
    } as any;
  }

  // Drive n ticks at a fixed inter-tick interval, keeping the fake clock at
  // each tick's start so intraMs reads 0 (matching production, where Workers
  // freeze the clock inside the tick body).
  function driveTicks(sim: any, intervalMs: number, n: number) {
    for (let i = 0; i < n; i++) {
      const t = Date.now() + intervalMs;
      vi.setSystemTime(t);
      (GameSimulation.prototype as any)._recordTickHealth.call(sim, t);
      sim.lastTickTime = t;
    }
  }

  function degradedLines(spy: ReturnType<typeof vi.spyOn>) {
    return parsedLogLines(spy).filter((l) => l.event === 'tick_health_degraded');
  }

  it('emits tick_health_degraded when the window p95 exceeds the bound, once per rate-limit window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sim = makeFakeSim(10);
    sim.lastTickTime = Date.now();

    // 30ms intervals: p95 = 30 > 24 bound, but each tick is individually
    // under the 16ms tick_overrun lateness threshold (30 - 16.7 = 13.3ms).
    driveTicks(sim, 30, 10); // first full pass over the ring
    let lines = degradedLines(warnSpy);
    expect(lines).toHaveLength(1);
    expect(lines[0].p95Ms).toBe(30);
    expect(lines[0].boundMs).toBe(TICK_HEALTH_P95_BOUND_MS);
    expect(lines[0].windowTicks).toBe(10);
    expect(lines[0].roomCode).toBe('TICKHP');
    expect(parsedLogLines(warnSpy).find((l) => l.event === 'tick_overrun')).toBeUndefined();

    // Subsequent passes inside the 5s rate-limit window stay silent...
    driveTicks(sim, 30, 100); // +3,000ms of degraded ticks, 10 more passes
    expect(degradedLines(warnSpy)).toHaveLength(1);

    // ...and exactly one more line fires once the window elapses.
    driveTicks(sim, 30, 80); // crosses the 5,000ms mark since the first line
    expect(degradedLines(warnSpy)).toHaveLength(2);
  });

  it('stays silent while the cadence is on budget', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sim = makeFakeSim(10);
    sim.lastTickTime = Date.now();

    driveTicks(sim, 17, 50); // p95 = 17 <= 24: five full passes, no emission
    expect(degradedLines(warnSpy)).toHaveLength(0);
  });

  it('a single spike inside an otherwise healthy window does not trip the p95 bound', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sim = makeFakeSim(100);
    sim.lastTickTime = Date.now();

    driveTicks(sim, 17, 50);
    driveTicks(sim, 200, 1); // one bad tick (tick_overrun territory, not variance)
    driveTicks(sim, 17, 49); // completes the pass: p95 of {17 x99, 200} = 17
    expect(degradedLines(warnSpy)).toHaveLength(0);
  });
});
