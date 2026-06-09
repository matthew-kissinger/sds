// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// [P4-LOADTEST] Concurrent-room load harness for the Cloudflare Worker backend.
//
// Spins up `wrangler dev` (local miniflare/workerd, one process), then drives
// N rooms x M clients each through the REAL wire path: REST register ->
// create/join (protocolVersion 3) -> WS upgrade with admission ticket ->
// host startGame -> periodic playerInput for DURATION seconds. Per room and
// aggregate it measures: messages received, bytes received (egress proxy),
// keyframe/delta ratio, gap/recovery counts, client-observed evictions, and
// the worker's structured log lines (tick_overrun, tick_health_degraded,
// player_evicted, tick_error, ...). For a sample of rooms it runs a DESYNC
// check: every client in the room reconstructs the sheep state from the
// keyframe+delta stream (the NetworkManager apply rules) and hashes the
// canonicalized state per tick; at every tick the clients share, the hashes
// must be equal.
//
// This is a tool, not a vitest spec - run on demand:
//   node tools/loadtest/loadtest.mjs --rooms 100 --wave 25 --duration 60
//
// Options (all optional):
//   --rooms N        total distinct rooms to exercise (default 100)
//   --wave N         rooms per concurrent wave (default 25; 0 = all at once)
//   --clients N      WS clients per room, 2-4 (default 2; first is host)
//   --sheep N        requested sheepCount (default 200). NOTE: the DO
//                    validates against ALLOWED_SHEEP_COUNTS {200,250,500,
//                    1000,3000,5000}; anything else (e.g. 30) silently
//                    becomes the 200 default. 200 is the server minimum.
//   --duration N     seconds each wave plays (default 60)
//   --sample N       rooms per wave that run the full desync reconstruction
//                    (default 10; capped at wave size). Non-sampled clients
//                    only sniff the frame type (cheap) so the harness itself
//                    does not become the bottleneck.
//   --port N         wrangler dev port (default 8799)
//   --url URL        attach to an already-running worker instead of spawning
//   --survival-share F  fraction of rooms per wave that run survival mode on
//                    newsheepdogland (default 0.2). Rationale: an active
//                    cooperative flock rides the 85% degenerate-frame rule
//                    into 100% keyframes (delta-protocol-design.md,
//                    deviations section), so survival rooms (10-50 active of
//                    a 200 pool) are what exercise real gameStateDelta frames
//                    over the wire.
//   --setup-conc N   parallel room setups (default 12)
//   --input-ms N     per-client input send interval (default 100)
//   --out PATH       results JSON path (default tools/loadtest/results-<date>.json)
//
// LOCAL-RUNTIME CAVEAT (record honestly wherever results are quoted): local
// miniflare on one machine is NOT Cloudflare's distributed runtime. All rooms
// contend for one machine's CPU (and the harness itself runs on the same
// box), so absolute tick timings are pessimistic and CPU numbers are
// directional only. The desync check, protocol correctness under concurrency,
// and per-room egress ARE valid signals.

import { spawn, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

import WebSocket from 'ws';
import { decode, encode } from '@msgpack/msgpack';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const workerDir = join(repoRoot, 'worker');

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
function argNum(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= process.argv.length) return dflt;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : dflt;
}
function argStr(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || i + 1 >= process.argv.length ? dflt : process.argv[i + 1];
}

const CFG = {
  rooms: argNum('rooms', 100),
  wave: argNum('wave', 25),
  clients: Math.min(4, Math.max(2, argNum('clients', 2))),
  sheep: argNum('sheep', 200),
  durationS: argNum('duration', 60),
  sample: argNum('sample', 10),
  survivalShare: argNum('survival-share', 0.2),
  port: argNum('port', 8799),
  url: argStr('url', null),
  setupConc: argNum('setup-conc', 12),
  inputMs: argNum('input-ms', 100),
  out: argStr('out', join(here, `results-${new Date().toISOString().slice(0, 10)}.json`)),
};
if (CFG.wave <= 0) CFG.wave = CFG.rooms;

const HTTP_BASE = CFG.url ?? `http://127.0.0.1:${CFG.port}`;
const WS_BASE = HTTP_BASE.replace(/^http/, 'ws');

// ---------------------------------------------------------------------------
// worker process + structured-log capture
// ---------------------------------------------------------------------------
const serverLog = {
  // event name -> count (since process start)
  counts: new Map(),
  // event name -> first few full records (for the evidence file)
  samples: new Map(),
  // running extras
  tickOverrunsTotal: 0, // emitted lines + their `suppressed` counters
  maxP95Ms: 0,
  evictionsByReason: new Map(),
  rawUnparsed: 0,
};

function recordServerLine(line) {
  const i = line.indexOf('{');
  if (i === -1) return;
  let obj;
  try { obj = JSON.parse(line.slice(i)); } catch { serverLog.rawUnparsed++; return; }
  if (!obj || typeof obj.event !== 'string') return;
  serverLog.counts.set(obj.event, (serverLog.counts.get(obj.event) ?? 0) + 1);
  const s = serverLog.samples.get(obj.event) ?? [];
  if (s.length < 5) { s.push(obj); serverLog.samples.set(obj.event, s); }
  if (obj.event === 'tick_overrun') {
    serverLog.tickOverrunsTotal += 1 + (Number(obj.suppressed) || 0);
  }
  if (obj.event === 'tick_health_degraded') {
    serverLog.maxP95Ms = Math.max(serverLog.maxP95Ms, Number(obj.p95Ms) || 0);
  }
  if (obj.event === 'player_evicted') {
    const r = String(obj.reason ?? 'unknown');
    serverLog.evictionsByReason.set(r, (serverLog.evictionsByReason.get(r) ?? 0) + 1);
  }
}

function snapshotServerLog() {
  return {
    counts: Object.fromEntries(serverLog.counts),
    tickOverrunsTotal: serverLog.tickOverrunsTotal,
    maxP95Ms: serverLog.maxP95Ms,
    evictionsByReason: Object.fromEntries(serverLog.evictionsByReason),
  };
}

// Per-wave delta of two snapshots (counts are monotonic counters).
function diffLogSnapshots(before, after) {
  const counts = {};
  for (const [k, v] of Object.entries(after.counts)) {
    const d = v - (before.counts[k] ?? 0);
    if (d > 0) counts[k] = d;
  }
  const evictionsByReason = {};
  for (const [k, v] of Object.entries(after.evictionsByReason)) {
    const d = v - (before.evictionsByReason[k] ?? 0);
    if (d > 0) evictionsByReason[k] = d;
  }
  return {
    counts,
    tickOverrunsTotal: after.tickOverrunsTotal - before.tickOverrunsTotal,
    maxP95Ms: after.maxP95Ms, // max is global; per-wave attribution is approximate
    evictionsByReason,
  };
}

let workerProc = null;

async function startWorker() {
  if (CFG.url) {
    console.log(`[loadtest] attaching to existing worker at ${CFG.url}`);
    return;
  }
  console.log(`[loadtest] spawning wrangler dev on :${CFG.port} ...`);
  workerProc = spawn(
    'npx',
    ['wrangler', 'dev', '--port', String(CFG.port), '--ip', '127.0.0.1'],
    { cwd: workerDir, shell: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  for (const stream of [workerProc.stdout, workerProc.stderr]) {
    const rl = readline.createInterface({ input: stream });
    rl.on('line', recordServerLine);
  }
  workerProc.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[loadtest] FATAL: wrangler dev exited early (code ${code})`);
      process.exitCode = 1;
    }
  });
  // wait for healthz
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${HTTP_BASE}/healthz`);
      if (r.ok) { console.log('[loadtest] worker ready'); return; }
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('wrangler dev did not become ready within 60s');
}

let shuttingDown = false;
function stopWorker() {
  shuttingDown = true;
  if (!workerProc) return;
  try {
    // shell:true wraps in cmd.exe; kill the whole tree so workerd dies too.
    execSync(`taskkill /PID ${workerProc.pid} /T /F`, { stdio: 'ignore' });
  } catch { /* already gone */ }
  // workerd detaches from the wrangler process tree on Windows and survives
  // the tree-kill - find whatever still LISTENs on our port and kill that too,
  // so repeated runs don't accumulate stray workerd processes.
  try {
    const out = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (line.includes(`:${CFG.port}`) && line.includes('LISTENING')) {
        const pid = Number(line.trim().split(/\s+/).pop());
        if (pid > 0) pids.add(pid);
      }
    }
    for (const pid of pids) {
      try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* gone */ }
    }
  } catch { /* best-effort */ }
  workerProc = null;
}

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------
async function post(path, body, attempt = 0) {
  let res;
  try {
    res = await fetch(`${HTTP_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (attempt < 3) { await sleep(250 * (attempt + 1)); return post(path, body, attempt + 1); }
    throw e;
  }
  if (res.status === 429 && attempt < 5) {
    await sleep(1000);
    return post(path, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function register(name) {
  const data = await post('/api/register', { display_name: name, name_type: 'custom' });
  if (!data.token) throw new Error('register returned no token');
  return data.token;
}

// ---------------------------------------------------------------------------
// fast msgpack frame-type sniff. encodeMsg() always writes `t` as the first
// map key, so the type string sits at a fixed early offset: map header,
// fixstr(1) 't', fixstr(len) value. Falls back to null (caller full-decodes).
// ---------------------------------------------------------------------------
function sniffType(buf) {
  const b0 = buf[0];
  let off;
  if (b0 >= 0x80 && b0 <= 0x8f) off = 1;       // fixmap
  else if (b0 === 0xde) off = 3;                // map16
  else if (b0 === 0xdf) off = 5;                // map32
  else return null;
  if (buf[off] !== 0xa1 || buf[off + 1] !== 0x74) return null; // fixstr(1) 't'
  const vb = buf[off + 2];
  if (vb < 0xa0 || vb > 0xbf) return null;      // value must be a fixstr
  const len = vb & 0x1f;
  return buf.toString('utf8', off + 3, off + 3 + len);
}

// ---------------------------------------------------------------------------
// canonical hash for the desync check: stable-stringify (sorted keys) so key
// insertion order can never alias as agreement or disagreement.
// ---------------------------------------------------------------------------
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}
function hashState(state) {
  return createHash('sha1').update(stableStringify(state)).digest('hex');
}

// ---------------------------------------------------------------------------
// one WS client
// ---------------------------------------------------------------------------
class LoadClient {
  constructor(roomCode, playerId, ticket, { sampled }) {
    this.roomCode = roomCode;
    this.playerId = playerId;
    this.url = `${WS_BASE}/r/${roomCode}/ws?playerId=${encodeURIComponent(playerId)}&ticket=${encodeURIComponent(ticket)}`;
    this.sampled = sampled;
    this.ws = null;
    this.inputTimer = null;
    this.closing = false;
    this.seq = 0;
    this.phase = Math.random() * Math.PI * 2;

    // metrics
    this.msgs = 0;
    this.bytes = 0;
    this.byType = Object.create(null);
    this.keyframes = 0;
    this.deltas = 0;
    this.keyframeBytes = 0;
    this.deltaBytes = 0;
    this.evicted = null;       // { code, reason } when server closed us
    this.decodeErrors = 0;

    // desync reconstruction (sampled clients only)
    this.state = null;
    this.minTick = null; // sampled only: sim-tick advancement ground truth
    this.maxTick = null;
    this.lastAppliedTick = null;
    this.awaitingKeyframe = false;
    this.gaps = 0;             // baseTick mismatches (delta discarded)
    this.deltasIgnoredAwaiting = 0;
    this.tickHashes = new Map(); // tick -> sha1
    this.gameStartedAt = null;
    this.gameCompleted = false;

    this._waiters = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url, { perMessageDeflate: false });
      this.ws = ws;
      ws.on('open', resolve);
      ws.on('error', (e) => { if (ws.readyState !== WebSocket.OPEN) reject(e); });
      ws.on('message', (data) => this._onMessage(data));
      ws.on('close', (code, reason) => {
        // Only an abnormal close DURING the play window counts as a server-
        // initiated eviction signal (e.g. 1013 'backpressure'). After
        // leaveAndClose() a 1006 just means the close handshake lost the race
        // against our terminate() fallback on a contended box - the server-
        // side player_evicted log line is the authoritative eviction count.
        if (!this.closing && code !== 1000 && code !== 1005) {
          this.evicted = { code, reason: reason?.toString?.() ?? '' };
        }
      });
    });
  }

  send(msg) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const u8 = encode(msg);
    this.ws.send(Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength), { binary: true });
  }

  waitFor(type, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this._waiters.indexOf(w);
        if (i !== -1) this._waiters.splice(i, 1);
        reject(new Error(`waitFor(${type}) timed out in room ${this.roomCode}`));
      }, timeoutMs);
      const w = { type, resolve, timer };
      this._waiters.push(w);
    });
  }

  startInputs(intervalMs) {
    this.inputTimer = setInterval(() => {
      this.seq++;
      const a = this.phase + this.seq / 9;
      this.send({
        t: 'playerInput',
        direction: { x: Math.sin(a), z: Math.cos(a) },
        sprint: this.seq % 40 < 8,
        sequence: this.seq,
        timestamp: Date.now(),
      });
    }, intervalMs);
  }

  stop() {
    if (this.inputTimer) { clearInterval(this.inputTimer); this.inputTimer = null; }
  }

  async leaveAndClose() {
    this.stop();
    this.closing = true;
    try { this.send({ t: 'leaveRoom' }); } catch { /* socket gone */ }
    const ws = this.ws;
    if (!ws) return;
    await new Promise((resolve) => {
      const t = setTimeout(() => { try { ws.terminate(); } catch {} resolve(); }, 2000);
      ws.once('close', () => { clearTimeout(t); resolve(); });
      try { ws.close(1000, 'loadtest-done'); } catch { clearTimeout(t); resolve(); }
    });
  }

  _onMessage(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.msgs++;
    this.bytes += buf.length;
    let t = sniffType(buf);

    const needsDecode =
      this.sampled || t === null ||
      (t !== 'gameStateUpdate' && t !== 'gameStateDelta');
    let msg = null;
    if (needsDecode) {
      try { msg = decode(buf); t = msg.t; } catch { this.decodeErrors++; return; }
    }
    this.byType[t] = (this.byType[t] ?? 0) + 1;

    if (t === 'gameStateUpdate') { this.keyframes++; this.keyframeBytes += buf.length; }
    else if (t === 'gameStateDelta') { this.deltas++; this.deltaBytes += buf.length; }
    else if (t === 'gameStarted') this.gameStartedAt = Date.now();
    else if (t === 'gameComplete') this.gameCompleted = true;

    // waiters
    for (let i = 0; i < this._waiters.length; i++) {
      if (this._waiters[i].type === t) {
        const [w] = this._waiters.splice(i, 1);
        clearTimeout(w.timer);
        w.resolve(msg ?? true);
        break;
      }
    }

    if (!this.sampled || !msg) return;
    if (t === 'gameStateUpdate') this._applyKeyframe(msg);
    else if (t === 'gameStateDelta') this._applyDelta(msg);
  }

  // NetworkManager rule: any full gameStateUpdate is a keyframe - replace
  // wholesale, reset the applied-tick basis.
  _trackTick(tick) {
    if (this.minTick === null || tick < this.minTick) this.minTick = tick;
    if (this.maxTick === null || tick > this.maxTick) this.maxTick = tick;
  }

  _applyKeyframe(m) {
    if (typeof m.tick !== 'number') return; // legacy shape; not in this test
    this._trackTick(m.tick);
    const { t: _t, ...state } = m;
    this.state = state;
    this.lastAppliedTick = m.tick;
    this.awaitingKeyframe = false;
    this.tickHashes.set(m.tick, hashState(state));
  }

  // NetworkManager rule: a delta applies iff baseTick === lastAppliedTick;
  // a changed record REPLACES the sheep record wholesale (key presence
  // included); otherwise discard and wait for the next keyframe.
  _applyDelta(m) {
    if (typeof m.tick === 'number') this._trackTick(m.tick);
    if (this.lastAppliedTick === null || this.awaitingKeyframe) {
      this.deltasIgnoredAwaiting++;
      return;
    }
    if (m.baseTick !== this.lastAppliedTick) {
      this.gaps++;
      this.awaitingKeyframe = true; // recover on the next broadcast keyframe
      return;
    }
    const { t: _t, changed, baseTick: _b, ...rest } = m;
    const sheep = this.state.sheep.slice();
    for (const rec of changed) {
      const { i, ...fields } = rec;
      sheep[i] = fields;
    }
    const state = { ...rest, sheep };
    this.state = state;
    this.lastAppliedTick = m.tick;
    this.tickHashes.set(m.tick, hashState(state));
  }
}

// ---------------------------------------------------------------------------
// one room: register identities, create+join, connect sockets, start, play
// ---------------------------------------------------------------------------
class LoadRoom {
  constructor(index, sampled, mode = 'cooperative') {
    this.index = index;
    this.sampled = sampled;
    this.mode = mode; // 'cooperative' (field) or 'survival' (newsheepdogland)
    this.roomCode = null;
    this.clients = [];
    this.error = null;
  }

  async setup() {
    const tag = `lt${Date.now() % 100000}r${this.index}`;
    const hostToken = await register(`H${tag}`);
    const survival = this.mode === 'survival';
    const created = await post('/api/rooms', {
      token: hostToken,
      playerName: `H${tag}`,
      dogType: 'jep',
      protocolVersion: 3,
      roomSettings: {
        maxPlayers: 4,
        isPublic: false, // keep the lobby registry out of the hot path
        name: `loadtest-${this.index}`,
        gameMode: this.mode,
        sceneId: survival ? 'newsheepdogland' : 'field',
        // survival ignores this and pools to the scene's maxFlock (200)
        sheepCount: CFG.sheep,
      },
    });
    this.roomCode = created.roomCode;
    const members = [{ playerId: created.playerId, ticket: created.wsTicket }];
    for (let c = 1; c < CFG.clients; c++) {
      const gToken = await register(`G${tag}c${c}`);
      const joined = await post(`/api/rooms/${this.roomCode}/join`, {
        token: gToken,
        playerName: `G${tag}c${c}`,
        dogType: 'pip',
        protocolVersion: 3,
      });
      members.push({ playerId: joined.playerId, ticket: joined.wsTicket });
    }
    this.clients = members.map(
      (m) => new LoadClient(this.roomCode, m.playerId, m.ticket, { sampled: this.sampled }),
    );
    await Promise.all(this.clients.map((c) => c.connect()));
    // host starts; everyone must see gameStarted
    const started = Promise.all(this.clients.map((c) => c.waitFor('gameStarted', 15_000)));
    this.clients[0].send({ t: 'startGame' });
    await started;
  }

  startInputs() {
    for (const c of this.clients) c.startInputs(CFG.inputMs);
  }

  async teardown() {
    await Promise.all(this.clients.map((c) => c.leaveAndClose()));
  }

  // ---- per-room report ----------------------------------------------------
  report(durationS) {
    const clients = this.clients.map((c) => ({
      playerId: c.playerId,
      msgs: c.msgs,
      bytes: c.bytes,
      keyframes: c.keyframes,
      deltas: c.deltas,
      keyframeBytes: c.keyframeBytes,
      deltaBytes: c.deltaBytes,
      framesPerSec: +((c.keyframes + c.deltas) / durationS).toFixed(1),
      egressKBs: +(c.bytes / 1024 / durationS).toFixed(1),
      gaps: c.gaps,
      deltasIgnoredAwaiting: c.deltasIgnoredAwaiting,
      // sampled only: how fast the DO's sim actually advanced, measured from
      // the wire tick numbers. The local 60Hz setInterval fires at ~32Hz under
      // workerd local-mode timer clamping, so ~32 is the UNLOADED local
      // baseline; degradation under load shows up as a drop below it.
      simTicksPerSec: c.sampled && c.maxTick !== null
        ? +((c.maxTick - c.minTick) / durationS).toFixed(1)
        : null,
      evicted: c.evicted,
      decodeErrors: c.decodeErrors,
      gameCompleted: c.gameCompleted,
    }));
    const sum = (k) => clients.reduce((a, c) => a + c[k], 0);
    const out = {
      room: this.roomCode,
      mode: this.mode,
      error: this.error,
      sampled: this.sampled,
      clients,
      totals: {
        msgs: sum('msgs'),
        bytes: sum('bytes'),
        keyframes: sum('keyframes'),
        deltas: sum('deltas'),
        roomEgressKBs: +(sum('bytes') / 1024 / durationS).toFixed(1),
      },
    };
    if (this.sampled) out.desync = this.desyncCheck();
    return out;
  }

  // Compare reconstructed state hashes across all clients at every shared tick.
  desyncCheck() {
    const [first, ...rest] = this.clients;
    let commonTicks = 0;
    let mismatches = 0;
    let firstMismatchTick = null;
    for (const [tick, h] of first.tickHashes) {
      let shared = true;
      for (const other of rest) {
        const oh = other.tickHashes.get(tick);
        if (oh === undefined) { shared = false; break; }
        if (oh !== h) {
          mismatches++;
          if (firstMismatchTick === null) firstMismatchTick = tick;
          shared = false;
          break;
        }
      }
      if (shared) commonTicks++;
    }
    return {
      commonTicks,
      mismatches,
      firstMismatchTick,
      ticksReconstructedPerClient: this.clients.map((c) => c.tickHashes.size),
      desynced: mismatches > 0,
    };
  }
}

// ---------------------------------------------------------------------------
// wave runner
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pooled(items, conc, fn) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function runWave(waveIdx, roomIndices) {
  const sampleCount = Math.min(CFG.sample, roomIndices.length);
  console.log(`[wave ${waveIdx}] setting up ${roomIndices.length} rooms (${sampleCount} desync-sampled) ...`);
  const logBefore = snapshotServerLog();
  const setupStart = Date.now();

  const stride = CFG.survivalShare > 0 ? Math.max(1, Math.round(1 / CFG.survivalShare)) : 0;
  const rooms = roomIndices.map((ri, i) => new LoadRoom(
    ri,
    i < sampleCount,
    stride > 0 && i % stride === 0 ? 'survival' : 'cooperative',
  ));
  await pooled(rooms, CFG.setupConc, async (room) => {
    try { await room.setup(); }
    catch (e) { room.error = String(e?.message ?? e); }
  });
  const failed = rooms.filter((r) => r.error);
  const live = rooms.filter((r) => !r.error);
  console.log(`[wave ${waveIdx}] ${live.length}/${rooms.length} rooms in-game (setup ${(Date.now() - setupStart) / 1000}s)` +
    (failed.length ? ` - ${failed.length} FAILED setup` : ''));

  for (const r of live) r.startInputs();
  const playStart = Date.now();
  await sleep(CFG.durationS * 1000);
  const actualDurationS = (Date.now() - playStart) / 1000;

  console.log(`[wave ${waveIdx}] play window done (${actualDurationS.toFixed(1)}s), tearing down ...`);
  for (const r of live) for (const c of r.clients) c.stop();
  await pooled(live, 32, (r) => r.teardown());
  await sleep(3000); // let the DO finish empty-room cleanup before the next wave

  const logAfter = snapshotServerLog();
  const roomReports = rooms.map((r) => r.report(actualDurationS));
  const liveReports = roomReports.filter((r) => !r.error);

  const agg = aggregate(liveReports, actualDurationS);
  const serverDelta = diffLogSnapshots(logBefore, logAfter);
  const wave = {
    wave: waveIdx,
    rooms: rooms.length,
    roomsLive: live.length,
    roomsFailedSetup: failed.map((r) => ({ index: r.index, error: r.error })),
    durationS: +actualDurationS.toFixed(1),
    aggregate: agg,
    serverLogDelta: serverDelta,
    roomReports,
  };
  console.log(`[wave ${waveIdx}] sim ticks/s p50=${agg.simTicksPerSecP50} min=${agg.simTicksPerSecMin} (unloaded local baseline ~32); ` +
    `frames/s/client p50=${agg.framesPerSecP50} min=${agg.framesPerSecMin}; ` +
    `egress ${agg.egressKBsPerClientAvg} KB/s/client; kf:delta ${agg.keyframes}:${agg.deltas}; ` +
    `desync rooms ${agg.desyncRooms}/${agg.sampledRooms}; ` +
    `overruns ${serverDelta.tickOverrunsTotal}, health_degraded ${serverDelta.counts.tick_health_degraded ?? 0}, ` +
    `bp evictions ${serverDelta.evictionsByReason.backpressure ?? 0}`);
  return wave;
}

function aggregate(liveReports, durationS) {
  const clients = liveReports.flatMap((r) => r.clients);
  const fps = clients.map((c) => c.framesPerSec).sort((a, b) => a - b);
  const p = (arr, q) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(q * arr.length))] : 0);
  const sum = (arr, k) => arr.reduce((a, c) => a + c[k], 0);
  const sampled = liveReports.filter((r) => r.desync);
  const tickRates = clients.map((c) => c.simTicksPerSec).filter((v) => v !== null).sort((a, b) => a - b);
  return {
    simTicksPerSecP50: p(tickRates, 0.5),
    simTicksPerSecMin: tickRates[0] ?? null,
    clients: clients.length,
    msgs: sum(clients, 'msgs'),
    bytes: sum(clients, 'bytes'),
    keyframes: sum(clients, 'keyframes'),
    deltas: sum(clients, 'deltas'),
    keyframeShare: +(sum(clients, 'keyframes') / Math.max(1, sum(clients, 'keyframes') + sum(clients, 'deltas'))).toFixed(3),
    avgKeyframeBytes: Math.round(sum(clients, 'keyframeBytes') / Math.max(1, sum(clients, 'keyframes'))),
    avgDeltaBytes: Math.round(sum(clients, 'deltaBytes') / Math.max(1, sum(clients, 'deltas'))),
    framesPerSecP50: p(fps, 0.5),
    framesPerSecMin: fps[0] ?? 0,
    framesPerSecMax: fps[fps.length - 1] ?? 0,
    egressKBsPerClientAvg: +(sum(clients, 'bytes') / 1024 / durationS / Math.max(1, clients.length)).toFixed(1),
    egressKBsPerRoomAvg: +(sum(clients, 'bytes') / 1024 / durationS / Math.max(1, liveReports.length)).toFixed(1),
    gaps: sum(clients, 'gaps'),
    clientObservedEvictions: clients.filter((c) => c.evicted).length,
    decodeErrors: sum(clients, 'decodeErrors'),
    gamesCompleted: clients.filter((c) => c.gameCompleted).length,
    sampledRooms: sampled.length,
    desyncRooms: sampled.filter((r) => r.desync.desynced).length,
    desyncCommonTicks: sampled.reduce((a, r) => a + r.desync.commonTicks, 0),
    desyncMismatches: sampled.reduce((a, r) => a + r.desync.mismatches, 0),
    byMode: Object.fromEntries(['cooperative', 'survival'].map((mode) => {
      const rs = liveReports.filter((r) => r.mode === mode);
      const cs = rs.flatMap((r) => r.clients);
      return [mode, {
        rooms: rs.length,
        keyframes: sum(cs, 'keyframes'),
        deltas: sum(cs, 'deltas'),
        avgKeyframeBytes: Math.round(sum(cs, 'keyframeBytes') / Math.max(1, sum(cs, 'keyframes'))),
        avgDeltaBytes: Math.round(sum(cs, 'deltaBytes') / Math.max(1, sum(cs, 'deltas'))),
        egressKBsPerClientAvg: +(sum(cs, 'bytes') / 1024 / durationS / Math.max(1, cs.length)).toFixed(1),
      }];
    })),
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[loadtest] config: ${JSON.stringify(CFG)}`);
  await startWorker();

  const waves = [];
  const waveCount = Math.ceil(CFG.rooms / CFG.wave);
  const t0 = Date.now();
  for (let w = 0; w < waveCount; w++) {
    const start = w * CFG.wave;
    const indices = Array.from(
      { length: Math.min(CFG.wave, CFG.rooms - start) },
      (_, i) => start + i,
    );
    waves.push(await runWave(w + 1, indices));
  }

  const results = {
    task: 'P4-LOADTEST',
    date: new Date().toISOString(),
    config: CFG,
    caveat:
      'Local miniflare/workerd on one machine is NOT the Cloudflare distributed runtime: ' +
      'all rooms contend for one box (which also runs the harness), so tick timings are ' +
      'pessimistic and CPU-bound numbers are directional only. Desync verdicts, protocol ' +
      'correctness under concurrency, and per-room egress are valid signals. The front-door ' +
      'IP rate limiter is inert locally (no cf-connecting-ip in wrangler dev). Local workerd ' +
      'clamps the 60Hz setInterval to ~31ms, so the UNLOADED local sim rate is ~32 ticks/s ' +
      '(not 60) and the server-side tick_overrun/tick_health clocks under-measure; sim-rate ' +
      'degradation under load is therefore judged against the ~32/s local baseline via the ' +
      'wire tick numbers, not against 60.',
    totalRuntimeS: +((Date.now() - t0) / 1000).toFixed(1),
    waves,
    serverLogTotals: snapshotServerLog(),
    serverLogSamples: Object.fromEntries(serverLog.samples),
  };
  mkdirSync(dirname(CFG.out), { recursive: true });
  writeFileSync(CFG.out, JSON.stringify(results, null, 2));
  console.log(`[loadtest] results written to ${CFG.out}`);

  // final verdict line
  const desyncRooms = waves.reduce((a, w) => a + w.aggregate.desyncRooms, 0);
  const sampledRooms = waves.reduce((a, w) => a + w.aggregate.sampledRooms, 0);
  const bpEvictions = waves.reduce((a, w) => a + (w.serverLogDelta.evictionsByReason.backpressure ?? 0), 0);
  const failedSetups = waves.reduce((a, w) => a + w.roomsFailedSetup.length, 0);
  console.log(`[loadtest] VERDICT: rooms=${CFG.rooms} desync=${desyncRooms}/${sampledRooms} sampled, ` +
    `backpressure-evictions=${bpEvictions}, failed-setups=${failedSetups}, ` +
    `tick_overruns=${results.serverLogTotals.tickOverrunsTotal}, ` +
    `max tick p95=${results.serverLogTotals.maxP95Ms}ms`);
}

process.on('SIGINT', () => { stopWorker(); process.exit(130); });

main()
  .catch((e) => { console.error('[loadtest] FAILED:', e); process.exitCode = 1; })
  .finally(() => stopWorker());
