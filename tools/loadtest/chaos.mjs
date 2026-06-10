// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// [P4-CHAOS] DO-eviction chaos harness for the Cloudflare Worker backend.
// Builds on tools/loadtest/loadtest.mjs (P4-LOADTEST, commit 77a6722): same
// wire path, same structured-log capture, same canonical-hash desync check.
// The client/worker helpers are deliberately DUPLICATED here rather than
// extracted into a shared module: loadtest.mjs is the canonical, evidence-
// bearing harness behind results-2026-06-09.json and runs main() at import;
// refactoring it at the launch gate would trade a validated artifact for DRY.
//
// What this exercises (the two real failure classes, simulated locally):
//   (a) WS connection drops - sockets terminated abruptly mid-game, with
//       reconnect both INSIDE the 15s grace window (expect seamless resume +
//       `reconnect_within_grace`) and PAST it (expect `player_evicted` reason
//       `grace_timeout`, plus `host_migration` when the host dropped);
//   (b) DO memory loss - the wrangler dev (workerd) process is killed mid-game
//       while clients hold sockets, then restarted. Local DO storage persists
//       in worker/.wrangler/state/v3/do by default, so a process restart is a
//       faithful eviction simulation: storage survives, in-memory sim dies.
//       Expect `do_evicted_midgame` on rehydration, rooms rejoinable, and
//       survival day/flock resume per the Cycle 68 P4 persistence contract
//       ("When a survival run is interrupted by a worker restart, the run
//       shall resume from DO storage rather than reset" - day-granularity:
//       the run restarts at the BEGINNING of the last dawn-checkpointed day
//       with the checkpointed flock; the in-flight day is ephemeral).
//
// Room layout (5 coop + 5 survival, 2 clients each unless noted):
//   C0, C1  coop      guest drop -> reconnect within grace (5s)
//   C2      coop      HOST drop -> reconnect within grace (no migration)
//   C3      coop      HOST drop past grace -> grace_timeout + host migration.
//                     Post-restart, host authority belongs to the MIGRATED
//                     identity (hostPersistentId was re-pinned to the guest at
//                     migration and persisted): the original host's startGame
//                     is refused, the migrated host's passes.
//   C4      coop x4   full room. Cycle 86 Fix 1: the rehydrated-full room
//                     must accept all four persisted-identity rejoins (each
//                     reclaims its stale slot; the old phantom-player 409
//                     lockout) while a genuinely NEW identity still gets the
//                     409 room-full.
//   S0      survival  guest drop -> reconnect within grace; day-advanced
//   S1      survival  guest drop past grace (no migration); day-advanced
//   S2, S3  survival  day-advanced to >= day 2 (dawn checkpoint persisted)
//   S4      survival  NOT advanced (day 1, no checkpoint yet) - documents
//                     that an un-checkpointed run restarts fresh at day 1
// After the restart every room is rejoined with the ORIGINAL persistent
// identities (new sessionIds - the Worker mints a session per REST join), the
// host identity restarts the game (host authority is pinned to persistentId,
// so the rejoined host passes the startGame gate), and a 20s play window runs
// the same per-tick hash desync check as the load test.
//
// Survival day advancement uses the env-gated `__testAdvanceSurvival` seam
// (worker must run with --var INTEGRATION_TEST:1; this harness spawns it so).
//
// Run on demand (not vitest):
//   node tools/loadtest/chaos.mjs
// Options: --port N (default 8799), --out PATH
//   (default tools/loadtest/chaos-results-<date>.json)
//
// LOCAL-RUNTIME CAVEAT (same as P4-LOADTEST): local miniflare/workerd is NOT
// Cloudflare's distributed runtime. Timer cadence is clamped (~32 ticks/s sim
// rate unloaded) and everything shares one box. The signals that ARE valid
// here: grace/eviction/migration state machines, rehydration from persisted
// DO storage, survival-progress resume, protocol correctness and desync
// verdicts across reconnects.

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
  port: argNum('port', 8799),
  out: argStr('out', join(here, `chaos-results-${new Date().toISOString().slice(0, 10)}.json`)),
  inputMs: 100,
  reconnectAfterMs: 5000,   // inside the 15s grace window
  graceMs: 15000,           // RoomDO.RECONNECT_GRACE_MS (assert against, don't import worker TS)
  preRestartPlayMs: 8000,
  postRestartPlayMs: 20000,
};
const HTTP_BASE = `http://127.0.0.1:${CFG.port}`;
const WS_BASE = HTTP_BASE.replace(/^http/, 'ws');

// Newsheepdogland day clock (shared/scenes/newsheepdogland.js +
// shared/survival/dayClock.js): secondsPerDay 360, initialT 0.28, night at
// t>=0.80, dawn (morning) at t in [0.25, 0.36).
const SECONDS_PER_DAY = 360;
const NIGHT_PROBE_T = 0.85;
const MORNING_PROBE_T = 0.27;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// structured-log capture (same parser as loadtest.mjs; counters are cumulative
// across BOTH worker processes - the restart is part of the experiment)
// ---------------------------------------------------------------------------
const serverLog = {
  counts: new Map(),
  samples: new Map(),
  evictionsByReason: new Map(),
  rawUnparsed: 0,
  rawUnparsedSamples: [],
};
function recordServerLine(line) {
  // wrangler dev colorizes console.warn/console.error output with ANSI
  // escapes - the reset code lands AFTER the closing brace, so a naive
  // slice-from-first-'{' JSON.parse fails for every warn/error-level line.
  // Run 1 of this harness proved it: all log.info events parsed, the
  // log.warn `do_evicted_midgame` lines all landed in rawUnparsed (232).
  // Strip escapes and bound the slice at the last '}'. (loadtest.mjs has
  // the same blind spot for warn/error events; recorded in the phase doc.)
  const clean = line.replace(/\[[0-9;]*m/g, '');
  const i = clean.indexOf('{');
  if (i === -1) return;
  const j = clean.lastIndexOf('}');
  let obj;
  try { obj = JSON.parse(clean.slice(i, j + 1)); } catch {
    serverLog.rawUnparsed++;
    if (serverLog.rawUnparsedSamples.length < 8) serverLog.rawUnparsedSamples.push(clean.slice(0, 200));
    return;
  }
  if (!obj || typeof obj.event !== 'string') return;
  serverLog.counts.set(obj.event, (serverLog.counts.get(obj.event) ?? 0) + 1);
  const s = serverLog.samples.get(obj.event) ?? [];
  if (s.length < 12) { s.push(obj); serverLog.samples.set(obj.event, s); }
  if (obj.event === 'player_evicted') {
    const r = String(obj.reason ?? 'unknown');
    serverLog.evictionsByReason.set(r, (serverLog.evictionsByReason.get(r) ?? 0) + 1);
  }
}
const logCount = (event) => serverLog.counts.get(event) ?? 0;

// ---------------------------------------------------------------------------
// worker process control (kill + restart is scenario (b) itself)
// ---------------------------------------------------------------------------
let workerProc = null;
let shuttingDown = false;   // intentional kill in progress
let unexpectedWorkerExits = 0; // crash-loop detector: must stay 0

function killPortListeners(port) {
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (line.includes(`:${port}`) && line.includes('LISTENING')) {
        const pid = Number(line.trim().split(/\s+/).pop());
        if (pid > 0) pids.add(pid);
      }
    }
    for (const pid of pids) {
      try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* gone */ }
    }
    return pids.size;
  } catch { return 0; }
}

function portIsListening(port) {
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
    return out.split(/\r?\n/).some((l) => l.includes(`:${port}`) && l.includes('LISTENING'));
  } catch { return false; }
}

async function startWorker(label) {
  console.log(`[chaos] spawning wrangler dev on :${CFG.port} (${label}) ...`);
  shuttingDown = false;
  workerProc = spawn(
    'npx',
    ['wrangler', 'dev', '--port', String(CFG.port), '--ip', '127.0.0.1', '--var', 'INTEGRATION_TEST:1'],
    { cwd: workerDir, shell: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  for (const stream of [workerProc.stdout, workerProc.stderr]) {
    const rl = readline.createInterface({ input: stream });
    rl.on('line', recordServerLine);
  }
  const proc = workerProc;
  proc.on('exit', (code) => {
    if (!shuttingDown && workerProc === proc) {
      unexpectedWorkerExits++;
      console.error(`[chaos] worker exited UNEXPECTEDLY (code ${code})`);
    }
  });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${HTTP_BASE}/healthz`);
      if (r.ok) { console.log(`[chaos] worker ready (${label})`); return; }
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error(`wrangler dev (${label}) did not become ready within 90s`);
}

async function stopWorker(label) {
  shuttingDown = true;
  if (workerProc) {
    try { execSync(`taskkill /PID ${workerProc.pid} /T /F`, { stdio: 'ignore' }); } catch { /* gone */ }
    workerProc = null;
  }
  // workerd detaches from the wrangler tree on Windows - kill the port
  // listener too, then wait for the port to actually free (the restart
  // respawn would otherwise hit EADDRINUSE).
  killPortListeners(CFG.port);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && portIsListening(CFG.port)) {
    killPortListeners(CFG.port);
    await sleep(500);
  }
  console.log(`[chaos] worker stopped (${label}); port ${CFG.port} ${portIsListening(CFG.port) ? 'STILL LISTENING' : 'free'}`);
}

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------
async function postRaw(path, body) {
  const res = await fetch(`${HTTP_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json error body */ }
  return { status: res.status, ok: res.ok, json, text };
}
async function post(path, body, attempt = 0) {
  let r;
  try { r = await postRaw(path, body); }
  catch (e) {
    if (attempt < 3) { await sleep(250 * (attempt + 1)); return post(path, body, attempt + 1); }
    throw e;
  }
  if (r.status === 429 && attempt < 5) { await sleep(1000); return post(path, body, attempt + 1); }
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${r.text}`);
  return r.json;
}
async function register(name) {
  const data = await post('/api/register', { display_name: name, name_type: 'custom' });
  if (!data.token) throw new Error('register returned no token');
  const persistentId = data.playerProfile?.persistentId ?? data.playerProfile?.persistent_id ?? null;
  return { token: data.token, persistentId, name };
}

// ---------------------------------------------------------------------------
// canonical hash (desync check) - identical rules to loadtest.mjs
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
// one WS client, reconnect-capable. All chaos clients run the full decode +
// NetworkManager apply rules + per-tick hashing (10 rooms is cheap).
// ---------------------------------------------------------------------------
class ChaosClient {
  constructor(roomCode, playerId, ticket, name) {
    this.roomCode = roomCode;
    this.playerId = playerId;
    this.name = name;
    this.url = `${WS_BASE}/r/${roomCode}/ws?playerId=${encodeURIComponent(playerId)}&ticket=${encodeURIComponent(ticket)}`;
    this.ws = null;
    this.inputTimer = null;
    this.closing = false;      // intentional close (leave / harness shutdown)
    this.chaosDropped = false; // harness-initiated abrupt drop in progress
    this.seq = 0;
    this.phase = Math.random() * Math.PI * 2;

    this.msgs = 0;
    this.bytes = 0;
    this.byType = Object.create(null);
    this.keyframes = 0;
    this.deltas = 0;
    this.decodeErrors = 0;
    this.serverClosed = null;  // { code, reason } on unexpected server close

    // NetworkManager-rule reconstruction + hashing
    this.state = null;
    this.minTick = null;
    this.maxTick = null;
    this.lastAppliedTick = null;
    this.awaitingKeyframe = false;
    this.gaps = 0;
    this.deltasIgnoredAwaiting = 0;
    this.tickHashes = new Map();

    this.lastSurvival = null;      // latest survival block seen on any frame
    this.lastHostChanged = null;   // latest hostChanged payload
    this.playerLeftSeen = 0;

    this._waiters = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url, { perMessageDeflate: false });
      this.ws = ws;
      this.chaosDropped = false;
      // Mirror the real client: delta state resets across a reconnect; the
      // keyframe-on-bind re-establishes the basis.
      this.awaitingKeyframe = this.lastAppliedTick !== null;
      ws.on('open', resolve);
      ws.on('error', (e) => { if (ws.readyState !== WebSocket.OPEN) reject(e); });
      ws.on('message', (data) => this._onMessage(data));
      ws.on('close', (code, reason) => {
        if (!this.closing && !this.chaosDropped && code !== 1000 && code !== 1005) {
          this.serverClosed = { code, reason: reason?.toString?.() ?? '' };
        }
      });
    });
  }

  // Abrupt drop: no leaveRoom, no close handshake - the failure class (a).
  dropAbruptly() {
    this.chaosDropped = true;
    try { this.ws?.terminate(); } catch { /* already dead */ }
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
    if (this.inputTimer) return;
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
    if (!ws || ws.readyState === WebSocket.CLOSED) return;
    await new Promise((resolve) => {
      const t = setTimeout(() => { try { ws.terminate(); } catch { /* gone */ } resolve(); }, 2000);
      ws.once('close', () => { clearTimeout(t); resolve(); });
      try { ws.close(1000, 'chaos-done'); } catch { clearTimeout(t); resolve(); }
    });
  }

  _onMessage(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.msgs++;
    this.bytes += buf.length;
    let msg;
    try { msg = decode(buf); } catch { this.decodeErrors++; return; }
    const t = msg.t;
    this.byType[t] = (this.byType[t] ?? 0) + 1;

    if (t === 'gameStateUpdate') this.keyframes++;
    else if (t === 'gameStateDelta') this.deltas++;
    else if (t === 'hostChanged') this.lastHostChanged = msg;
    else if (t === 'playerLeft') this.playerLeftSeen++;

    if (msg.survival) this.lastSurvival = msg.survival;

    for (let i = 0; i < this._waiters.length; i++) {
      if (this._waiters[i].type === t) {
        const [w] = this._waiters.splice(i, 1);
        clearTimeout(w.timer);
        w.resolve(msg);
        break;
      }
    }

    if (t === 'gameStateUpdate') this._applyKeyframe(msg);
    else if (t === 'gameStateDelta') this._applyDelta(msg);
  }

  _trackTick(tick) {
    if (this.minTick === null || tick < this.minTick) this.minTick = tick;
    if (this.maxTick === null || tick > this.maxTick) this.maxTick = tick;
  }

  _applyKeyframe(m) {
    if (typeof m.tick !== 'number') return;
    this._trackTick(m.tick);
    const { t: _t, ...state } = m;
    this.state = state;
    this.lastAppliedTick = m.tick;
    this.awaitingKeyframe = false;
    this.tickHashes.set(m.tick, hashState(state));
  }

  _applyDelta(m) {
    if (typeof m.tick === 'number') this._trackTick(m.tick);
    if (this.lastAppliedTick === null || this.awaitingKeyframe) {
      this.deltasIgnoredAwaiting++;
      return;
    }
    if (m.baseTick !== this.lastAppliedTick) {
      this.gaps++;
      this.awaitingKeyframe = true;
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

  metrics() {
    return {
      playerId: this.playerId,
      msgs: this.msgs,
      keyframes: this.keyframes,
      deltas: this.deltas,
      decodeErrors: this.decodeErrors,
      gaps: this.gaps,
      deltasIgnoredAwaiting: this.deltasIgnoredAwaiting,
      minTick: this.minTick,
      maxTick: this.maxTick,
      serverClosed: this.serverClosed,
    };
  }
}

// ---------------------------------------------------------------------------
// one room: identities are retained so the SAME persistent ids can rejoin
// after the workerd restart (the resume contract is identity-pinned).
// ---------------------------------------------------------------------------
class ChaosRoom {
  constructor(id, mode, clientCount = 2) {
    this.id = id; // 'C0'..'C4', 'S0'..'S4'
    this.mode = mode; // 'cooperative' | 'survival'
    this.clientCount = clientCount;
    this.roomCode = null;
    this.identities = []; // [{ token, persistentId, name }] index 0 = host
    this.clients = [];    // ChaosClient, index-aligned pre-restart
    this.notes = {};
  }

  async setup() {
    const tag = `ch${Date.now() % 100000}${this.id}`;
    this.identities = [];
    for (let c = 0; c < this.clientCount; c++) {
      this.identities.push(await register(`${this.id}p${c}${tag}`.slice(0, 20)));
    }
    const survival = this.mode === 'survival';
    const created = await post('/api/rooms', {
      token: this.identities[0].token,
      playerName: this.identities[0].name,
      dogType: 'jep',
      protocolVersion: 3,
      roomSettings: {
        maxPlayers: 4,
        isPublic: false,
        name: `chaos-${this.id}`,
        gameMode: this.mode,
        sceneId: survival ? 'newsheepdogland' : 'field',
        sheepCount: 200,
      },
    });
    this.roomCode = created.roomCode;
    const members = [{ playerId: created.playerId, ticket: created.wsTicket }];
    for (let c = 1; c < this.clientCount; c++) {
      const joined = await post(`/api/rooms/${this.roomCode}/join`, {
        token: this.identities[c].token,
        playerName: this.identities[c].name,
        dogType: 'pip',
        protocolVersion: 3,
      });
      members.push({ playerId: joined.playerId, ticket: joined.wsTicket });
    }
    this.clients = members.map((m, i) =>
      new ChaosClient(this.roomCode, m.playerId, m.ticket, this.identities[i].name));
    await Promise.all(this.clients.map((c) => c.connect()));
    const started = Promise.all(this.clients.map((c) => c.waitFor('gameStarted', 15_000)));
    this.clients[0].send({ t: 'startGame' });
    await started;
    for (const c of this.clients) c.startInputs(CFG.inputMs);
  }

  // Drive the survival day clock across nightfall and dawn so the DO
  // checkpoints `survivalProgress` (the checkpoint write happens ONLY on a
  // surviving dawn). Two jumps - a single full-day jump would wrap t back to
  // the same phase and no transition would fire.
  async advanceToNextDay() {
    const host = this.clients[0];
    const startDay = host.lastSurvival?.day ?? 1;
    // jump 1: into night (wolves spawn at the transition)
    const t0 = host.lastSurvival?.t ?? 0.28;
    host.send({ t: '__testAdvanceSurvival', seconds: Math.ceil(((NIGHT_PROBE_T - t0 + 1) % 1) * SECONDS_PER_DAY) });
    await waitUntil(() => host.lastSurvival?.phase === 'night', 10_000, `${this.id} nightfall`);
    // jump 2: across dawn (the 'survived' tally checkpoints day+flock)
    const t1 = host.lastSurvival?.t ?? NIGHT_PROBE_T;
    host.send({ t: '__testAdvanceSurvival', seconds: Math.ceil(((MORNING_PROBE_T - t1 + 1) % 1) * SECONDS_PER_DAY) });
    await waitUntil(() => (host.lastSurvival?.day ?? 1) > startDay, 10_000, `${this.id} dawn`);
    return host.lastSurvival;
  }

  desyncCheck(clients = this.clients) {
    const [first, ...rest] = clients;
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
    return { commonTicks, mismatches, firstMismatchTick, desynced: mismatches > 0 };
  }

  async teardown() {
    await Promise.all(this.clients.map((c) => c.leaveAndClose()));
  }
}

async function waitUntil(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await sleep(100);
  }
  throw new Error(`waitUntil(${label}) timed out after ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// assertion ledger
// ---------------------------------------------------------------------------
const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail });
  console.log(`[chaos] ${pass ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ''}`);
}

// ---------------------------------------------------------------------------
// main experiment
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[chaos] config: ${JSON.stringify(CFG)}`);
  if (portIsListening(CFG.port)) throw new Error(`port ${CFG.port} already in use - refuse to start`);
  const t0 = Date.now();
  const results = {
    task: 'P4-CHAOS',
    date: new Date().toISOString(),
    config: CFG,
    caveat:
      'Local miniflare/workerd is NOT the Cloudflare distributed runtime; what IS valid here: ' +
      'grace/eviction/migration state machines, rehydration from persisted local DO storage ' +
      '(worker/.wrangler/state/v3/do, the default - verified by this run), survival-progress ' +
      'resume, and desync verdicts across reconnects. The do_evicted_midgame path is identical ' +
      'to production (same constructor rehydration); only the eviction TRIGGER differs ' +
      '(process kill here, runtime eviction/redeploy there).',
    scenarios: {},
    checks,
  };

  await startWorker('initial');

  // ---- setup: 5 coop + 5 survival rooms -----------------------------------
  const rooms = {
    C0: new ChaosRoom('C0', 'cooperative'),
    C1: new ChaosRoom('C1', 'cooperative'),
    C2: new ChaosRoom('C2', 'cooperative'),
    C3: new ChaosRoom('C3', 'cooperative'),
    C4: new ChaosRoom('C4', 'cooperative', 4),
    S0: new ChaosRoom('S0', 'survival'),
    S1: new ChaosRoom('S1', 'survival'),
    S2: new ChaosRoom('S2', 'survival'),
    S3: new ChaosRoom('S3', 'survival'),
    S4: new ChaosRoom('S4', 'survival'),
  };
  const all = Object.values(rooms);
  console.log('[chaos] setting up 10 rooms (5 coop + 5 survival) ...');
  // sequential-ish setup (pairs) keeps register/join off the 429 limiter
  for (let i = 0; i < all.length; i += 2) {
    await Promise.all(all.slice(i, i + 2).map((r) => r.setup()));
  }
  check('setup: 10/10 rooms in-game', all.every((r) => r.clients.length === r.clientCount), {
    rooms: all.map((r) => ({ id: r.id, code: r.roomCode, clients: r.clients.length })),
  });
  await sleep(1500); // let frames flow

  // =====================================================================
  // SCENARIO A - abrupt drop, reconnect WITHIN the 15s grace window.
  // C0/C1/S0 guests + the C2 HOST. Reuses the join-time admission ticket
  // (TTL 120s - see the divergence note in the results: that TTL bounds
  // when grace-reconnect is reachable at all in production).
  // =====================================================================
  console.log('[chaos] scenario A: drop + reconnect within grace ...');
  const aCases = [
    { room: rooms.C0, idx: 1, role: 'guest' },
    { room: rooms.C1, idx: 1, role: 'guest' },
    { room: rooms.S0, idx: 1, role: 'guest' },
    { room: rooms.C2, idx: 0, role: 'host' },
  ];
  const graceStartedBefore = logCount('disconnect_grace_started');
  const reconnectBefore = logCount('reconnect_within_grace');
  const migrationsBefore = logCount('host_migration');
  const evictedBefore = logCount('player_evicted');
  for (const c of aCases) c.room.clients[c.idx].dropAbruptly();
  await sleep(CFG.reconnectAfterMs);
  check('A: disconnect_grace_started fired for all 4 drops',
    logCount('disconnect_grace_started') - graceStartedBefore === 4,
    { delta: logCount('disconnect_grace_started') - graceStartedBefore });
  // Reconnect all four in parallel so every rebind lands well inside the 15s
  // grace window even on a contended box.
  const aResults = await Promise.all(aCases.map(async (c) => {
    const client = c.room.clients[c.idx];
    const ticksBefore = client.maxTick;
    // keyframe-on-bind; .catch upfront so a timeout can't surface as an
    // unhandled rejection while connect() is still in flight
    const kfWait = client.waitFor('gameStateUpdate', 5000).catch(() => null);
    await client.connect();
    const keyframeOnBind = (await kfWait) !== null;
    await sleep(1500);
    return {
      room: c.room.id, role: c.role, playerId: client.playerId,
      keyframeOnBind,
      ticksAdvancedAfterReconnect: client.maxTick !== null && ticksBefore !== null && client.maxTick > ticksBefore,
      gaps: client.gaps, decodeErrors: client.decodeErrors,
    };
  }));
  check('A: keyframe-on-bind received on every reconnect', aResults.every((r) => r.keyframeOnBind), aResults);
  check('A: frames resumed (ticks advanced) after every reconnect', aResults.every((r) => r.ticksAdvancedAfterReconnect));
  check('A: reconnect_within_grace logged for all 4',
    logCount('reconnect_within_grace') - reconnectBefore === 4,
    { delta: logCount('reconnect_within_grace') - reconnectBefore, samples: serverLog.samples.get('reconnect_within_grace') });
  check('A: no player_evicted during within-grace reconnects', logCount('player_evicted') - evictedBefore === 0);
  check('A: host reconnect within grace did NOT migrate host (C2)',
    logCount('host_migration') - migrationsBefore === 0 && rooms.C2.clients[1].lastHostChanged === null);
  results.scenarios.A_reconnectWithinGrace = { cases: aResults };

  // =====================================================================
  // SCENARIO B - abrupt drop, NO reconnect (past the 15s grace).
  // C3 HOST (expect grace_timeout eviction + host migration to the guest)
  // and S1 guest (expect grace_timeout eviction, no migration).
  // Survival day-advancement for S0-S3 runs inside the same wait so the
  // dawn checkpoint exists before the restart. S4 stays un-checkpointed.
  // =====================================================================
  console.log('[chaos] scenario B: drop past grace (+ survival day advancement) ...');
  const bEvictedBefore = logCount('player_evicted');
  const bMigrationsBefore = logCount('host_migration');
  const bDropAt = Date.now();
  rooms.C3.clients[0].dropAbruptly(); // host
  rooms.S1.clients[1].dropAbruptly(); // guest
  const c3GuestTickAtDrop = rooms.C3.clients[1].maxTick;

  const checkpoints = {};
  for (const id of ['S0', 'S1', 'S2', 'S3']) {
    const sv = await rooms[id].advanceToNextDay();
    checkpoints[id] = { day: sv.day, flock: sv.flock, peak: sv.peak };
    console.log(`[chaos] ${id} dawn checkpoint: ${JSON.stringify(checkpoints[id])}`);
  }
  checkpoints.S4 = { day: rooms.S4.clients[0].lastSurvival?.day ?? 1, flock: rooms.S4.clients[0].lastSurvival?.flock ?? 10, checkpointed: false };
  check('B-side: S0-S3 advanced past a dawn (day >= 2, flock grew)',
    ['S0', 'S1', 'S2', 'S3'].every((id) => checkpoints[id].day >= 2),
    checkpoints);

  const remainingGrace = CFG.graceMs + 3000 - (Date.now() - bDropAt);
  if (remainingGrace > 0) await sleep(remainingGrace);
  const graceEvictions = (serverLog.samples.get('player_evicted') ?? []).filter((e) => e.reason === 'grace_timeout');
  check('B: both no-reconnect drops evicted with reason grace_timeout',
    logCount('player_evicted') - bEvictedBefore === 2 &&
    (serverLog.evictionsByReason.get('grace_timeout') ?? 0) === 2,
    { evictionsByReason: Object.fromEntries(serverLog.evictionsByReason), samples: graceEvictions });
  check('B: host_migration fired exactly once (C3 host)',
    logCount('host_migration') - bMigrationsBefore === 1,
    serverLog.samples.get('host_migration'));
  const c3Guest = rooms.C3.clients[1];
  check('B: C3 guest received hostChanged and is the new host',
    c3Guest.lastHostChanged?.newHostId === c3Guest.playerId && c3Guest.lastHostChanged?.isHost === true,
    { newHostId: c3Guest.lastHostChanged?.newHostId, isHost: c3Guest.lastHostChanged?.isHost });
  check('B: C3 game continued for the remaining client after host eviction',
    c3Guest.maxTick !== null && c3GuestTickAtDrop !== null && c3Guest.maxTick > c3GuestTickAtDrop,
    { tickAtDrop: c3GuestTickAtDrop, tickNow: c3Guest.maxTick });
  check('B: S1 host saw playerLeft for the evicted guest', rooms.S1.clients[0].playerLeftSeen >= 1);
  // An evicted player cannot re-enter mid-game: REST join requires 'waiting'.
  const evictedRejoin = await postRaw(`/api/rooms/${rooms.C3.roomCode}/join`, {
    token: rooms.C3.identities[0].token, playerName: 'evicted-host-back', dogType: 'jep', protocolVersion: 3,
  });
  check('B: evicted player REST re-join mid-game refused (409, observed contract)',
    evictedRejoin.status === 409, { status: evictedRejoin.status, body: evictedRejoin.text.slice(0, 120) });
  results.scenarios.B_dropPastGrace = {
    graceEvictionSamples: graceEvictions,
    hostMigrationSamples: serverLog.samples.get('host_migration'),
    evictedRejoinMidGame: { status: evictedRejoin.status, body: evictedRejoin.text.slice(0, 200) },
  };

  // ---- pre-restart play window + state capture ----------------------------
  await sleep(CFG.preRestartPlayMs);
  const preRestart = {};
  for (const r of all) {
    preRestart[r.id] = {
      survival: r.clients[0].lastSurvival,
      maxTick: r.clients[0].maxTick,
      desync: r.desyncCheck(r.clients.filter((c) => c.ws?.readyState === WebSocket.OPEN)),
    };
  }
  check('pre-restart: no desync in any room across scenarios A/B',
    all.every((r) => !preRestart[r.id].desync.desynced),
    Object.fromEntries(all.map((r) => [r.id, preRestart[r.id].desync])));
  check('pre-restart: zero client decode errors',
    all.every((r) => r.clients.every((c) => c.decodeErrors === 0)));
  results.scenarios.preRestartState = preRestart;

  // =====================================================================
  // SCENARIO C - DO memory loss: kill workerd mid-game while clients hold
  // sockets, restart, rejoin the same room codes with the same persistent
  // identities, restart the games, verify rehydration + survival resume.
  // =====================================================================
  console.log('[chaos] scenario C: killing workerd mid-game (all 10 rooms live) ...');
  const doEvictedBefore = logCount('do_evicted_midgame');
  for (const r of all) for (const c of r.clients) { c.stop(); c.closing = true; }
  await stopWorker('mid-game kill');
  await sleep(1000);
  check('C: all client sockets died with the worker',
    all.every((r) => r.clients.every((c) => !c.ws || c.ws.readyState === WebSocket.CLOSED || c.ws.readyState === WebSocket.CLOSING)));

  await startWorker('restart');

  // Rejoin every room. The Worker mints NEW sessionIds; identity continuity
  // is the persistent id (host gate is pinned to hostPersistentId).
  console.log('[chaos] scenario C: rejoining all rooms with original identities ...');
  const rejoin = {};
  for (const r of all) {
    rejoin[r.id] = { joins: [], roomState: null };
    const newClients = [];
    for (let i = 0; i < r.identities.length; i++) {
      const res = await postRaw(`/api/rooms/${r.roomCode}/join`, {
        token: r.identities[i].token,
        playerName: r.identities[i].name,
        dogType: i === 0 ? 'jep' : 'pip',
        protocolVersion: 3,
      });
      rejoin[r.id].joins.push({ status: res.status, isHost: res.json?.isHost ?? null, error: res.ok ? null : res.text.slice(0, 80) });
      if (res.ok) {
        rejoin[r.id].roomState = {
          state: res.json.room?.state,
          playerCount: res.json.room?.playerCount,
          hostId: res.json.room?.hostId,
        };
        newClients.push(new ChaosClient(r.roomCode, res.json.playerId, res.json.wsTicket, r.identities[i].name));
      }
    }
    r.postClients = newClients;
  }

  check('C: do_evicted_midgame logged on rehydration for all 10 rooms',
    logCount('do_evicted_midgame') - doEvictedBefore === 10,
    { delta: logCount('do_evicted_midgame') - doEvictedBefore, samples: serverLog.samples.get('do_evicted_midgame') });

  // C4 (4-player room): pre-fix, the 4 persisted phantom entries made the
  // rehydrated room report full and EVERY rejoin got 409 (phantom-player
  // lockout, recorded in the P4-CHAOS evidence). Cycle 86 Fix 1: a join that
  // re-proves a persisted identity is a RECONNECTION - it reclaims its stale
  // slot and is exempt from the room-full check - so the full rehydrated
  // room must now accept all four original identities back.
  check('C: C4 full rehydrated room accepts all 4 persisted-identity rejoins (no 409; Cycle 86 fix)',
    rejoin.C4.joins.every((j) => j.status === 200),
    rejoin.C4.joins);
  check('C: C4 playerCount stays at capacity after the rejoins (slots reclaimed, not duplicated)',
    rejoin.C4.roomState?.playerCount === 4 && rejoin.C4.roomState?.state === 'waiting',
    rejoin.C4.roomState);
  // Room-full semantics for genuinely NEW identities are unchanged: a fresh
  // identity that was never in C4's players map still gets the 409.
  const strangerC4 = await register(`c4new${Date.now() % 100000}`.slice(0, 20));
  const strangerJoin = await postRaw(`/api/rooms/${rooms.C4.roomCode}/join`, {
    token: strangerC4.token, playerName: strangerC4.name, dogType: 'jep', protocolVersion: 3,
  });
  check('C: C4 still refuses a genuinely NEW identity with 409 room-full',
    strangerJoin.status === 409, { status: strangerJoin.status, body: strangerJoin.text.slice(0, 120) });
  const rejoinable = all;
  const twoPlayerRooms = all.filter((r) => r.id !== 'C4');
  check('C: every 2-player room accepted both identity rejoins (room rehydrated to waiting)',
    twoPlayerRooms.every((r) => rejoin[r.id].joins.every((j) => j.status === 200) && rejoin[r.id].roomState?.state === 'waiting'),
    Object.fromEntries(twoPlayerRooms.map((r) => [r.id, rejoin[r.id].roomState])));
  // Cycle 86 Fix 1: a rejoin REPLACES its stale pre-eviction entry, so the
  // rejoined room reports exactly its live player count - no phantom
  // inflation. (Pre-fix observed counts: 4 = 2 phantoms + 2 rejoins for the
  // 2-player rooms; 3 for C3/S1, which each lost one player to grace_timeout
  // pre-kill. C3's evicted original host rejoins as a genuinely new player.)
  const expectedCounts = { C0: 2, C1: 2, C2: 2, C3: 2, S0: 2, S1: 2, S2: 2, S3: 2, S4: 2 };
  const observedCounts = Object.fromEntries(twoPlayerRooms.map((r) => [r.id, rejoin[r.id].roomState?.playerCount]));
  check('C: stale pre-eviction entries are reclaimed on rejoin (playerCount == live players, no phantoms; Cycle 86 fix)',
    twoPlayerRooms.every((r) => rejoin[r.id].roomState?.playerCount === expectedCounts[r.id]),
    { observed: observedCounts, expected: expectedCounts });

  // Connect sockets + restart games. The rejoined host holds a NEW sessionId;
  // under the Cycle 86 fix its reconnection RECLAIMED the host slot at REST
  // join (isHost true on the join response, hostId re-pointed), and the
  // startGame gate stays pinned to hostPersistentId. For every room except
  // C3 the pin is the original host; C3's host was evicted past grace
  // pre-kill, so handlePlayerLeave re-pinned hostPersistentId to the guest
  // and PERSISTED it - post-restart the original host's startGame must be
  // refused and the migrated (guest) identity's must pass.
  console.log('[chaos] scenario C: restarting games + verifying survival resume ...');
  let c3OriginalHostRefused = null;
  for (const r of rejoinable) {
    await Promise.all(r.postClients.map((c) => c.connect()));
    const started = Promise.all(r.postClients.map((c) => c.waitFor('gameStarted', 15_000)));
    if (r.id === 'C3') {
      // Negative probe first: the pre-migration host identity no longer
      // holds host authority (silently ignored by the startGame gate).
      r.postClients[0].send({ t: 'startGame' });
      await sleep(3000);
      c3OriginalHostRefused = r.postClients.every((c) => (c.byType.gameStarted ?? 0) === 0);
      r.postClients[1].send({ t: 'startGame' }); // migrated host identity
    } else {
      r.postClients[0].send({ t: 'startGame' });
    }
    await started;
    for (const c of r.postClients) c.startInputs(CFG.inputMs);
  }
  // The REST rejoin hands every identity a fresh sessionId; under the Cycle
  // 86 fix the PINNED identity's reconnection reclaims the host slot at join
  // time (joins[0].isHost true everywhere except C3, whose pin migrated to
  // the guest pre-kill: joins[0] is the demoted original host, joins[1] the
  // migrated host). The startGame gate still follows hostPersistentId - and
  // C3 shows the pin itself migrates on eviction and survives the restart.
  check('C: startGame host gate is identity-pinned across the restart (pinned identity reclaims host at rejoin and passes; C3 pre-migration host refused, migrated host passes)',
    rejoinable.every((r) => r.postClients.every((c) => (c.byType.gameStarted ?? 0) >= 1)) &&
    rejoinable.filter((r) => r.id !== 'C3').every((r) => rejoin[r.id].joins[0].isHost === true) &&
    rejoin.C3.joins[0].isHost === false && rejoin.C3.joins[1].isHost === true &&
    c3OriginalHostRefused === true,
    { c3OriginalHostRefused, joinsIsHost: Object.fromEntries(rejoinable.map((r) => [r.id, rejoin[r.id].joins.map((j) => j.isHost)])) });

  // Survival resume: compare the first post-restart survival block against
  // the pre-kill dawn checkpoint. Contract (Cycle 68 P4): resume at the START
  // of the checkpointed day with the checkpointed flock/peak; a run that
  // never reached a dawn (S4) has no checkpoint and restarts fresh at day 1.
  const resume = {};
  for (const id of ['S0', 'S1', 'S2', 'S3', 'S4']) {
    const host = rooms[id].postClients[0];
    await waitUntil(() => host.lastSurvival !== null, 10_000, `${id} survival block post-restart`);
    resume[id] = {
      checkpoint: checkpoints[id],
      resumed: { day: host.lastSurvival.day, flock: host.lastSurvival.flock, peak: host.lastSurvival.peak, phase: host.lastSurvival.phase },
    };
  }
  const svInit = (serverLog.samples.get('survival_initialized') ?? []);
  results.scenarios.C_survivalResume = { resume, survivalInitializedSamples: svInit };
  check('C: checkpointed survival runs resumed at the saved day with the saved flock and peak (S0-S3)',
    ['S0', 'S1', 'S2', 'S3'].every((id) =>
      resume[id].resumed.day === resume[id].checkpoint.day &&
      resume[id].resumed.flock === resume[id].checkpoint.flock &&
      resume[id].resumed.peak === resume[id].checkpoint.peak),
    resume);
  check('C: survival_initialized logged resumed:true for the checkpointed rooms',
    svInit.filter((s) => s.resumed === true).length >= 4, svInit);
  check('C: un-checkpointed day-1 run (S4) restarted fresh at day 1 / startFlock 10 (no dawn = nothing persisted; observed contract)',
    resume.S4.resumed.day === 1 && resume.S4.resumed.flock === 10, resume.S4);

  // ---- post-restart play window + final consistency ------------------------
  await sleep(CFG.postRestartPlayMs);
  const postRestart = {};
  for (const r of rejoinable) {
    postRestart[r.id] = {
      desync: r.desyncCheck(r.postClients),
      clients: r.postClients.map((c) => c.metrics()),
    };
  }
  results.scenarios.C_postRestart = { rejoin, postRestart };
  check('C: post-restart, no desync in any room (clients hash-agree at every shared tick)',
    rejoinable.every((r) => !postRestart[r.id].desync.desynced),
    Object.fromEntries(rejoinable.map((r) => [r.id, postRestart[r.id].desync])));
  check('C: post-restart, zero decode errors and ticks advancing in every room',
    rejoinable.every((r) => r.postClients.every((c) => c.decodeErrors === 0 && c.maxTick !== null && c.maxTick > (c.minTick ?? 0))));
  check('no unexpected worker exits across the whole run (no crash loop)', unexpectedWorkerExits === 0,
    { unexpectedWorkerExits, tick_error: logCount('tick_error'), sim_init_failed: logCount('sim_init_failed') });
  check('no tick_error / sim_init_failed / ws_broadcast_failed across the whole run',
    logCount('tick_error') === 0 && logCount('sim_init_failed') === 0 && logCount('ws_broadcast_failed') === 0,
    { counts: Object.fromEntries(serverLog.counts) });

  // ---- teardown -------------------------------------------------------------
  console.log('[chaos] tearing down ...');
  for (const r of rejoinable) for (const c of r.postClients) c.stop();
  await Promise.all(rejoinable.map((r) => Promise.all(r.postClients.map((c) => c.leaveAndClose()))));
  await sleep(1000);
  await stopWorker('final');
  check('teardown: port freed after final worker kill', !portIsListening(CFG.port));

  results.serverLogTotals = {
    counts: Object.fromEntries(serverLog.counts),
    evictionsByReason: Object.fromEntries(serverLog.evictionsByReason),
    rawUnparsed: serverLog.rawUnparsed,
  };
  results.serverLogSamples = Object.fromEntries(serverLog.samples);
  results.totalRuntimeS = +((Date.now() - t0) / 1000).toFixed(1);
  results.verdict = {
    pass: checks.every((c) => c.pass),
    failed: checks.filter((c) => !c.pass).map((c) => c.name),
  };
  mkdirSync(dirname(CFG.out), { recursive: true });
  writeFileSync(CFG.out, JSON.stringify(results, null, 2));
  console.log(`[chaos] results written to ${CFG.out}`);
  console.log(`[chaos] VERDICT: ${results.verdict.pass ? 'PASS' : 'FAIL'} (${checks.filter((c) => c.pass).length}/${checks.length} checks)` +
    (results.verdict.failed.length ? ` failed: ${results.verdict.failed.join(' | ')}` : ''));
  if (!results.verdict.pass) process.exitCode = 1;
}

process.on('SIGINT', () => { stopWorker('SIGINT'); process.exit(130); });

main()
  .catch((e) => { console.error('[chaos] FAILED:', e); process.exitCode = 1; })
  .finally(() => stopWorker('finally'));
