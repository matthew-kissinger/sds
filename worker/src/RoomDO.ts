// RoomDO: one Durable Object per active game room.
// Owns the sim, the WS connections, and the broadcast loop.

// @ts-ignore - JS module with no types
import { GameSimulation, isValidInputDirection, coerceInputSequence } from './GameSim.js';
import { encode, Decoder } from '@msgpack/msgpack';
import { submitScore as d1SubmitScore } from './d1.js';
import { listScenes, DEFAULT_SCENE_ID } from '../../shared/scenes/index.js';

// P-SEC-4 (a): DoS-hardened inbound decode. A client controls the raw bytes on
// the WS message channel, so an unbounded decode is an amplification lever: a
// few hundred bytes of nested maps/arrays can expand into millions of allocated
// objects (a "billion-laughs"-style blow-up), and a multi-megabyte string field
// can pin memory. We bound the decode three ways, all applied BEFORE we hand the
// message to handleClientMessage:
//   1. a pre-decode byte-length cap (cheapest reject — never even start decode);
//   2. an explicit Decoder with maxStr/maxArray/maxMap/maxBin/maxExt limits so a
//      hostile length prefix is rejected by the decoder itself;
//   3. a post-decode recursion/depth bound (the decoder caps breadth per level
//      but not total nesting depth; a small byte cap already bounds depth to a
//      few thousand worst-case, but we assert an explicit ceiling too).
// Every limit is generous relative to the real protocol: the largest legitimate
// inbound frame is a `playerInput` (a flat object with a 2-number `direction`, a
// 2-number `clientPosition`, a few scalars) — well under 1KB and depth 2.
const MAX_INBOUND_BYTES = 8 * 1024; // 8KB — orders of magnitude over any real frame
const MAX_DECODE_DEPTH = 8; // real frames nest 2 deep; 8 is slack
// Shared bounded decoder. @msgpack/msgpack's Decoder is reusable across calls
// (decode() is synchronous + stateless between top-level calls) so one instance
// per DO is fine and avoids per-message allocation.
const inboundDecoder = new Decoder({
  maxStrLength: 4 * 1024,   // longest string field (room/dog/player ids) is tiny
  maxBinLength: 4 * 1024,
  maxArrayLength: 256,      // no inbound frame carries a large array
  maxMapLength: 256,        // object key-count ceiling
  maxExtLength: 256,
});

// P-SEC-4 (a): reject a decoded value whose nesting exceeds MAX_DECODE_DEPTH.
// Cheap iterative walk; bails the instant it goes too deep. Scalars are depth 0.
function exceedsMaxDepth(value: unknown, max: number): boolean {
  const stack: Array<{ v: unknown; d: number }> = [{ v: value, d: 0 }];
  while (stack.length) {
    const { v, d } = stack.pop()!;
    if (v === null || typeof v !== 'object') continue;
    if (d >= max) return true;
    if (Array.isArray(v)) {
      for (const item of v) stack.push({ v: item, d: d + 1 });
    } else {
      for (const key of Object.keys(v as Record<string, unknown>)) {
        stack.push({ v: (v as Record<string, unknown>)[key], d: d + 1 });
      }
    }
  }
  return false;
}

interface PlayerInfo {
  id: string;
  name: string;
  dogType: string;
  isHost: boolean;
  isReady: boolean;
  persistentId?: string;
  displayName?: string;
  joinedAt: number;
}

interface RoomMeta {
  roomCode: string;
  hostId: string;
  // P-SEC-2: host authority is pinned to the persistent identity, not the
  // ephemeral session id. hostId stays as the *current* host's sessionId (used
  // for the per-recipient `isHost` broadcast flag and as a legacy fallback when
  // a room has no persistent ids), but every host-only gate and host migration
  // decision derives from hostPersistentId. Pinning to (persistentId) lets a
  // reconnecting original host reclaim the role from whoever held it meanwhile.
  // Optional so rooms persisted before P-SEC-2 (and solo dev rooms with no
  // identity) still hydrate; backfilled from the host player on hydration.
  hostPersistentId?: string;
  name: string;
  maxPlayers: number;
  isPublic: boolean;
  gameMode: string;
  sceneId: string;
  // Cycle 8 Phase 5: room-level sheep count, picked at room creation. The
  // worker GameSim is sized to this value at start. 200 (current default)
  // remains the back-compat default for rooms persisted before Cycle 8.
  sheepCount: number;
  // P-DET-1 (option c): per-game seed for reproducible spawn + retirement
  // placement. Drawn once at room creation, persisted here so a replay can
  // reproduce the exact layout. Server-side only — deliberately absent from
  // getSerializableState() and every wire payload (clients copy positions
  // from the snapshot, so they never need it). Backfilled on hydration for
  // rooms persisted before P-DET-1.
  seed: number;
  modeLocked: boolean;
  state: 'waiting' | 'in-game' | 'finished';
  createdAt: number;
  lastActivity: number;
}

// Cycle 8 Phase 5: allow-list of sheep counts hosts can pick.
// Cycle 23 Phase E (Q5): extended to include Insane (3000) + Chaos (5000)
// matching the solo-mode roster. RoomDO already runs the same per-tick
// physics + spatial-hash as solo, so 5000-sheep MP is feasible at 60Hz on
// desktop. Mobile guests at >1000 sheep are gated below.
const ALLOWED_SHEEP_COUNTS = new Set([200, 250, 500, 1000, 3000, 5000]);
const DEFAULT_SHEEP_COUNT = 200;
// Cycle 23 Phase E: counts above this require all guests on desktop. Wire
// + render bandwidth at 3000/5000 was measured for solo only; mobile
// guests join only at <= MOBILE_GUEST_MAX_SHEEP_COUNT.
const MOBILE_GUEST_MAX_SHEEP_COUNT = 1000;

// P-SEC-4 (d): minimum-connected-players gate for the heavy sheep counts. The
// sim is O(n^2)-ish in the flocking neighbour scan, so a 3,000/5,000-sheep room
// is a real CPU load on the DO; letting one client open a private high-count
// room and walk away (or never connect a second player) is a cheap way to pin a
// DO's CPU. At or above HIGH_SHEEP_COUNT_THRESHOLD we require at least
// MIN_PLAYERS_FOR_HIGH_SHEEP connected players at start; a room that can't meet
// it is transparently capped down to HIGH_SHEEP_COUNT_CAP rather than refused,
// so solo/under-filled rooms still start (just at a sane size). The threshold is
// generous: 200/250/500/1000-sheep rooms (the common case) are never gated.
const HIGH_SHEEP_COUNT_THRESHOLD = 3000; // Insane (3000) + Chaos (5000) gate
const MIN_PLAYERS_FOR_HIGH_SHEEP = 2;
const HIGH_SHEEP_COUNT_CAP = 1000;

// P-SEC-4 (c): per-connection inbound message-rate limit. A client can send WS
// frames as fast as it likes; without a ceiling that's a CPU/decode DoS lever on
// the single-threaded DO. We use a fixed-window counter per connection: up to
// MAX_MSGS_PER_WINDOW frames per RATE_WINDOW_MS, then drop excess; a sustained
// flood past CLOSE_FACTOR× the limit closes the socket. The cap is generous
// relative to a real client: input is sent per-frame while moving (~144/s on a
// 144Hz display) plus a 5s ping, so ~150 msgs/s peak. 600/s leaves 4x headroom.
const RATE_WINDOW_MS = 1000;
const MAX_MSGS_PER_WINDOW = 600;
const RATE_CLOSE_FACTOR = 4; // close at 4x the drop threshold (sustained abuse)

// P-SEC-4 (e): idle-room cleanup. A room is created (initRoom) before any socket
// binds; if nobody ever connects (a create-and-abandon flood) the DO + its
// persisted row leak. An alarm set at init deletes the room if no WebSocket has
// bound within IDLE_ROOM_TIMEOUT_MS. Cancelled the moment the first socket binds.
const IDLE_ROOM_TIMEOUT_MS = 60_000;

interface Env {
  ROOM_DO: DurableObjectNamespace;
  LOBBY_DO: DurableObjectNamespace;
  DB: D1Database;
  JWT_SECRET: string;
}

const DOG_TYPES = new Set(['jep', 'pip', 'sally', 'shiloh', 'george_washington']);

// P-DET-1 (option c): draw a per-game seed. This is the single intentionally
// non-deterministic entropy draw — it seeds the GameSim's mulberry32 so spawn
// + retirement placement are reproducible for replay while still differing per
// game. Returns an unsigned 32-bit int (the domain mulberry32 expects).
function generateSeed(): number {
  return ((Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0);
}

function encodeMsg(t: string, data: Record<string, unknown> = {}): ArrayBuffer {
  const buf = encode({ t, ...data });
  // @msgpack/msgpack returns Uint8Array; convert to ArrayBuffer for WS send.
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export class RoomDO {
  private state: DurableObjectState;
  private env: Env;

  // Room metadata
  private meta: RoomMeta | null = null;
  private players = new Map<string, PlayerInfo>();

  // WS sessions: playerId -> WebSocket
  private sessions = new Map<string, WebSocket>();

  // Sim
  private simulation: GameSimulation | null = null;
  private broadcastInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
  private restored = false;

  // Cycle 24 Phase 3: 15s reconnect grace for in-game disconnects. Per
  // playerId we keep the timeout handle + the wall-clock when the grace
  // started — bindSocket clears the handle if the player rebinds in time.
  // Lobby-state disconnects evict immediately (no grace).
  private graceTimeouts = new Map<string, { handle: ReturnType<typeof setTimeout>; startedAt: number }>();
  private static readonly RECONNECT_GRACE_MS = 15_000;

  // P-SEC-4 (c): per-WebSocket inbound rate-limit window. Keyed by the bound
  // WebSocket so a reconnect (new socket) gets a fresh window and a closed
  // socket's entry is dropped. windowStart is the ms-epoch the current fixed
  // window opened; count is frames seen in it.
  private rateWindows = new WeakMap<WebSocket, { windowStart: number; count: number }>();

  // P-SEC-4 (e): set true once any socket binds. The idle-room alarm only tears
  // a room down if this is still false when it fires (create-and-abandon).
  private socketEverBound = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    // Hydrate from DO storage so the room survives worker redeploys.
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<{
        meta: RoomMeta;
        players: [string, PlayerInfo][];
      }>('room');
      if (stored?.meta) {
        this.meta = stored.meta;
        // Backfill sceneId for rooms persisted before Cycle 3 Track 3 shipped.
        if (!this.meta.sceneId) this.meta.sceneId = DEFAULT_SCENE_ID;
        // Backfill sheepCount for rooms persisted before Cycle 8 Phase 5.
        if (typeof (this.meta as any).sheepCount !== 'number') {
          this.meta.sheepCount = DEFAULT_SHEEP_COUNT;
        }
        // P-DET-1: backfill seed for rooms persisted before this shipped.
        // A hydrated room with no seed gets a fresh one so the next game it
        // starts is still reproducible (and so RoomMeta always carries one).
        if (typeof (this.meta as any).seed !== 'number') {
          this.meta.seed = generateSeed();
        }
        this.players = new Map(stored.players);
        // P-SEC-2: backfill hostPersistentId for rooms persisted before this
        // shipped. Derive it from the current host player's persistentId so
        // post-restore host gates keep matching the same person.
        if (!this.meta.hostPersistentId) {
          const hostPlayer = this.players.get(this.meta.hostId);
          if (hostPlayer?.persistentId) this.meta.hostPersistentId = hostPlayer.persistentId;
        }
        // If a sim was running, it's lost; snap back to 'waiting'.
        if (this.meta.state === 'in-game') this.meta.state = 'waiting';
      }
      this.restored = true;
    });
  }

  private async persist(): Promise<void> {
    if (!this.meta) {
      await this.state.storage.delete('room');
      return;
    }
    await this.state.storage.put('room', {
      meta: this.meta,
      players: Array.from(this.players.entries()),
    });
  }

  // P-SEC-4 (e): schedule the idle-room cleanup alarm. Guarded + try/caught so
  // the node test runtime (no storage.setAlarm) doesn't throw. Idempotent: the
  // DO has a single pending alarm, so this just (re)sets it.
  private scheduleIdleCleanup(): void {
    try {
      const storage: any = this.state.storage;
      if (typeof storage?.setAlarm === 'function') {
        storage.setAlarm(Date.now() + IDLE_ROOM_TIMEOUT_MS);
      }
    } catch {
      /* no alarm support in this runtime */
    }
  }

  // P-SEC-4 (e): idle-room cleanup alarm handler. Fires IDLE_ROOM_TIMEOUT_MS
  // after init. If a socket bound in the meantime (socketEverBound) or the room
  // is already gone, it's a no-op. Otherwise the room was created and abandoned
  // with no connection — delete it so the DO + persisted row don't leak. Also
  // releases the room's lobby ownership so an abandoning host isn't charged for
  // it against their per-pid concurrent-room cap.
  async alarm(): Promise<void> {
    if (this.socketEverBound) return; // room is in real use
    if (!this.meta) return; // already torn down
    if (this.sessions.size > 0) return; // a live socket exists (belt-and-suspenders)
    const roomCode = this.meta.roomCode;
    console.log(`[RoomDO ${roomCode}] idle-room cleanup: no socket bound within ${IDLE_ROOM_TIMEOUT_MS}ms, deleting`);
    if (this.simulation) {
      this.simulation.cleanup?.();
      this.simulation = null;
    }
    this.stopBroadcastLoop();
    this.meta = null;
    this.players.clear();
    await this.persist();
    // Best-effort: drop the lobby entry + release the concurrent-room slot.
    try {
      await this.releaseLobbyRoom(roomCode);
    } catch (e) {
      console.warn(`[RoomDO ${roomCode}] lobby release on idle cleanup failed:`, e);
    }
  }

  // P-SEC-4 (e): tell the singleton lobby DO to drop this room + release its
  // per-pid concurrent-room slot. Used on idle cleanup and on full teardown.
  private async releaseLobbyRoom(roomCode: string): Promise<void> {
    const lobby: any = this.env.LOBBY_DO;
    if (!lobby || typeof lobby.idFromName !== 'function') return; // node test env
    const id = lobby.idFromName('global');
    const stub = lobby.get(id);
    await stub.fetch(new Request('https://do/release-room', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomCode }),
    }));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/init' && request.method === 'POST') {
      const body = await request.json<any>();
      return this.initRoom(body);
    }
    if (path === '/join' && request.method === 'POST') {
      const body = await request.json<any>();
      return this.joinRoom(body);
    }
    if (path === '/meta' && request.method === 'GET') {
      return new Response(JSON.stringify(this.getSerializableState()), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (path === '/ws') {
      return this.handleWebSocket(request);
    }

    return new Response('not found', { status: 404 });
  }

  // Create a new room (called once by the router via init).
  private initRoom(body: {
    roomCode: string;
    hostId: string;
    hostName: string;
    hostDogType: string;
    hostPersistentId?: string;
    hostDisplayName?: string;
    roomSettings: {
      name?: string;
      maxPlayers?: number;
      isPublic?: boolean;
      gameMode?: string;
      sceneId?: string;
      sheepCount?: number;
      modeLocked?: boolean;
    };
  }): Response {
    if (this.meta) {
      return new Response(JSON.stringify({ error: 'Room already initialized' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    }

    const s = body.roomSettings || {};
    const gameMode = s.gameMode || 'cooperative';
    if (!['cooperative', 'competitive', 'timed'].includes(gameMode)) {
      return new Response(JSON.stringify({ error: 'invalid gameMode' }), { status: 400 });
    }
    const validScenes = listScenes() as Array<{ id: string; allowedModes?: string[] }>;
    const validSceneIds = validScenes.map(sc => sc.id);
    const sceneId = s.sceneId && validSceneIds.includes(s.sceneId) ? s.sceneId : DEFAULT_SCENE_ID;
    // Cycle 34 Phase 4: cross-check gameMode against scene.allowedModes.
    // Defensive guard so a host can't open a competitive room on Open
    // Country (which declares allowedModes: ['cooperative', 'timed']).
    // Short-circuits when the scene didn't declare allowedModes (Field
    // is missing the field today; Phase 4 is a no-op for it).
    const sceneDef = validScenes.find(sc => sc.id === sceneId);
    if (sceneDef?.allowedModes && !sceneDef.allowedModes.includes(gameMode)) {
      return new Response(
        JSON.stringify({
          error: 'mode_not_allowed_on_scene',
          sceneId,
          gameMode,
          allowedModes: sceneDef.allowedModes
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }
    const maxPlayers = Math.min(4, Math.max(2, s.maxPlayers || 4));
    // Cycle 8 Phase 5: validate sheepCount against allow-list.
    const sheepCount = (typeof s.sheepCount === 'number' && ALLOWED_SHEEP_COUNTS.has(s.sheepCount))
      ? s.sheepCount
      : DEFAULT_SHEEP_COUNT;

    this.meta = {
      roomCode: body.roomCode,
      hostId: body.hostId,
      // P-SEC-2: pin host authority to the persistent identity at creation.
      hostPersistentId: body.hostPersistentId,
      name: s.name || 'Sheepdog Game',
      maxPlayers,
      isPublic: !!s.isPublic,
      gameMode,
      sceneId,
      sheepCount,
      // P-DET-1: per-game seed drawn at creation, persisted for replay.
      seed: generateSeed(),
      modeLocked: !!s.modeLocked,
      state: 'waiting',
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.players.set(body.hostId, {
      id: body.hostId,
      name: body.hostName,
      dogType: DOG_TYPES.has(body.hostDogType) ? body.hostDogType : 'jep',
      isHost: true,
      isReady: true,
      persistentId: body.hostPersistentId,
      displayName: body.hostDisplayName,
      joinedAt: Date.now(),
    });
    this.persist();

    // P-SEC-4 (e): arm the idle-room cleanup alarm. If no socket binds within
    // IDLE_ROOM_TIMEOUT_MS the alarm tears the room down (create-and-abandon
    // flood mitigation). bindSocket clears socketEverBound's guard the moment a
    // real connection arrives, so a normally-used room is never touched.
    this.scheduleIdleCleanup();

    return new Response(
      JSON.stringify({
        roomCode: body.roomCode,
        playerId: body.hostId,
        isHost: true,
        room: this.getSerializableState(),
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  }

  private joinRoom(body: {
    playerId: string;
    playerName: string;
    dogType: string;
    persistentId?: string;
    displayName?: string;
  }): Response {
    if (!this.meta) {
      return new Response(JSON.stringify({ error: 'Room not found' }), { status: 404 });
    }
    if (this.meta.state !== 'waiting') {
      return new Response(JSON.stringify({ error: 'Room is not accepting new players' }), { status: 409 });
    }
    if (this.players.size >= this.meta.maxPlayers) {
      return new Response(JSON.stringify({ error: 'Room is full' }), { status: 409 });
    }
    if (this.players.has(body.playerId)) {
      // Idempotent: treat re-join as success. Broadcast update so peers refresh.
      this.meta.lastActivity = Date.now();
      return new Response(
        JSON.stringify({
          roomCode: this.meta.roomCode,
          playerId: body.playerId,
          isHost: this.meta.hostId === body.playerId,
          room: this.getSerializableState(),
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }

    this.players.set(body.playerId, {
      id: body.playerId,
      name: body.playerName,
      dogType: DOG_TYPES.has(body.dogType) ? body.dogType : 'jep',
      isHost: false,
      isReady: true,
      persistentId: body.persistentId,
      displayName: body.displayName,
      joinedAt: Date.now(),
    });

    this.meta.lastActivity = Date.now();
    this.persist();

    this.broadcast('playerJoined', {
      playerId: body.playerId,
      playerName: body.playerName,
      room: this.getSerializableState(),
    });

    return new Response(
      JSON.stringify({
        roomCode: this.meta.roomCode,
        playerId: body.playerId,
        isHost: false,
        room: this.getSerializableState(),
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade');
    if (upgrade !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    if (!this.meta) return new Response('room not initialized', { status: 404 });

    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId');
    if (!playerId || !this.players.has(playerId)) {
      return new Response('unknown playerId', { status: 403 });
    }

    // P-SEC-2: bind the socket to the verified identity. The Worker's WS router
    // verified the admission ticket and put the authenticated persistent_id on
    // this internal header (the DO is only reachable via that router). Assert it
    // matches the persistentId we stored for this session at REST join time —
    // this stops a client from opening a socket against someone else's session
    // id. Rooms/players with no persistentId (legacy / solo dev) skip the check:
    // there's no identity to bind against, and the bare-id guard above stands.
    const player = this.players.get(playerId)!;
    const authPid = request.headers.get('X-Auth-Persistent-Id');
    if (player.persistentId && player.persistentId !== authPid) {
      return new Response('identity mismatch', { status: 403 });
    }

    // Cycle 23 Phase E: gate mobile guests on Insane/Chaos rooms (>1000
    // sheep). Same wire/render reasoning as Q5: those modes were measured
    // for solo desktop only; mobile clients can't reliably keep up at the
    // resulting per-tick bandwidth and render cost.
    if (this.meta.sheepCount > MOBILE_GUEST_MAX_SHEEP_COUNT) {
      const ua = request.headers.get('user-agent') ?? '';
      const isMobileUA = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      if (isMobileUA) {
        return new Response('Insane/Chaos rooms require all guests on desktop', { status: 403 });
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    server.accept();
    this.bindSocket(playerId, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  // P-SEC-4 (c): fixed-window per-connection rate limiter. Returns true if the
  // frame is allowed, false to drop it. Past RATE_CLOSE_FACTOR× the per-window
  // ceiling the connection is closed (sustained abuse, not a momentary burst).
  // A connection with no window record (shouldn't happen — bindSocket seeds one)
  // is allowed and lazily seeded so we never hard-fail a legitimate frame.
  private checkRateLimit(ws: WebSocket, playerId: string): boolean {
    const now = Date.now();
    let win = this.rateWindows.get(ws);
    if (!win) {
      win = { windowStart: now, count: 0 };
      this.rateWindows.set(ws, win);
    }
    // Roll the window if it elapsed.
    if (now - win.windowStart >= RATE_WINDOW_MS) {
      win.windowStart = now;
      win.count = 0;
    }
    win.count++;
    if (win.count <= MAX_MSGS_PER_WINDOW) return true;
    // Over the soft drop threshold. If the client is hammering well past it,
    // close the socket; otherwise just drop this frame.
    if (win.count > MAX_MSGS_PER_WINDOW * RATE_CLOSE_FACTOR) {
      console.warn(`[RoomDO] rate-limit close for ${playerId}: ${win.count} msgs in window`);
      try { ws.close(1008, 'rate limit'); } catch {}
      if (this.sessions.get(playerId) === ws) this.sessions.delete(playerId);
    }
    return false;
  }

  private bindSocket(playerId: string, ws: WebSocket): void {
    // Close any prior connection for this player (reconnect).
    const prior = this.sessions.get(playerId);
    if (prior && prior !== ws) {
      try { prior.close(1000, 'replaced'); } catch {}
    }
    this.sessions.set(playerId, ws);
    // P-SEC-4 (e): a real socket has now connected — the idle-room cleanup alarm
    // becomes a no-op (it only tears down create-and-abandon rooms). We leave the
    // pending alarm to fire harmlessly rather than racing a deleteAlarm.
    this.socketEverBound = true;
    // P-SEC-4 (c): fresh rate-limit window for this connection.
    this.rateWindows.set(ws, { windowStart: Date.now(), count: 0 });
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
      this.cleanupTimeout = null;
    }

    // Cycle 24 Phase 3: cancel any pending reconnect-grace timeout. Player
    // came back within the grace window — sheepdog stayed in-world the
    // whole time, just stops being orphaned now.
    const grace = this.graceTimeouts.get(playerId);
    if (grace) {
      clearTimeout(grace.handle);
      this.graceTimeouts.delete(playerId);
      const elapsed = Date.now() - grace.startedAt;
      console.log(`[RoomDO ${this.meta?.roomCode}] reconnect within grace (${elapsed}ms) for ${playerId}`);
    }

    ws.addEventListener('message', async (evt) => {
      try {
        // P-SEC-4 (c): inbound rate limit — checked BEFORE any decode work so a
        // flood is rejected at the cheapest possible point. Returns false to drop
        // this frame; it closes the socket itself past the sustained-abuse
        // threshold, so we just bail here.
        if (!this.checkRateLimit(ws, playerId)) return;

        const raw = evt.data;
        let bytes: Uint8Array | null = null;
        if (raw instanceof ArrayBuffer) bytes = new Uint8Array(raw);
        else if (raw instanceof Uint8Array) bytes = raw;
        else if (typeof raw === 'string') {
          console.warn(`[RoomDO] received text frame from ${playerId}, ignoring`);
          return;
        } else if (raw && typeof (raw as any).arrayBuffer === 'function') {
          // Blob / Blob-like — convert.
          const ab = await (raw as Blob).arrayBuffer();
          bytes = new Uint8Array(ab);
        } else if (raw && typeof (raw as any).byteLength === 'number') {
          bytes = new Uint8Array(raw as any);
        }
        if (!bytes) {
          console.warn(`[RoomDO] unknown frame type:`, typeof raw, (raw as any)?.constructor?.name);
          return;
        }
        // P-SEC-4 (a): pre-decode byte-length cap. Reject an oversized frame
        // before spending any decode CPU/memory on it.
        if (bytes.byteLength > MAX_INBOUND_BYTES) {
          console.warn(`[RoomDO] oversized frame from ${playerId}: ${bytes.byteLength}B > ${MAX_INBOUND_BYTES}B, dropping`);
          return;
        }
        // P-SEC-4 (a): decode through the bounded Decoder (maxStr/maxArray/
        // maxMap/maxBin/maxExt). A hostile length prefix throws here and is
        // caught below — it never allocates the claimed structure.
        const msg = inboundDecoder.decode(bytes) as any;
        if (!msg || typeof msg.t !== 'string') return;
        // P-SEC-4 (a): explicit depth bound. The decoder caps per-level breadth
        // but not total nesting; reject anything nested past MAX_DECODE_DEPTH.
        if (exceedsMaxDepth(msg, MAX_DECODE_DEPTH)) {
          console.warn(`[RoomDO] over-deep frame from ${playerId}, dropping`);
          return;
        }
        this.handleClientMessage(playerId, msg);
      } catch (e: any) {
        console.error(`[RoomDO] ws message error from ${playerId}:`, e?.stack || e);
      }
    });

    ws.addEventListener('close', () => {
      if (this.sessions.get(playerId) === ws) {
        this.sessions.delete(playerId);
      }
      this.handlePlayerDisconnect(playerId);
    });

    ws.addEventListener('error', () => {
      if (this.sessions.get(playerId) === ws) {
        this.sessions.delete(playerId);
      }
    });

    // Send current room state so the client can sync any mutations that
    // happened between the REST join response and the WS binding.
    const room = this.getSerializableState();
    this.send(ws, 'roomUpdated', { room });
  }

  // P-SEC-2: a session is the host iff its persistent identity is the pinned
  // host identity. Falls back to the sessionId==hostId comparison only when the
  // room/player carries no persistentId (legacy or solo dev rooms), so the
  // host-only gates degrade safely instead of locking everyone out. A guest
  // holding a different identity can never satisfy this, which is the point.
  private isHostSession(playerId: string): boolean {
    const meta = this.meta;
    if (!meta) return false;
    const player = this.players.get(playerId);
    if (!player) return false;
    if (meta.hostPersistentId && player.persistentId) {
      return player.persistentId === meta.hostPersistentId;
    }
    // No persistent identity to compare — fall back to the session id.
    return playerId === meta.hostId;
  }

  private handleClientMessage(playerId: string, msg: any): void {
    const t = msg.t as string;
    const meta = this.meta!;
    const player = this.players.get(playerId);
    if (!player) return;

    switch (t) {
      case 'ready':
        // Acknowledged; nothing to do (players start ready=true).
        break;
      case 'playerInput':
        if (this.simulation && meta.state === 'in-game') {
          // P-SEC-3: server input trust boundary. Drop the input at ingress if
          // `direction` is not an object of two finite numbers — a NaN/Infinity
          // direction poisons sheepdog.position and desyncs every client. We
          // also coerce the sequence to a finite integer here so Infinity (which
          // the old `?? 0` chain let through) can't latch sheepdog.inputSequence
          // and freeze the dog. applyPlayerInput re-checks both as defence in
          // depth; this drop just avoids queueing a known-bad input at all.
          if (!isValidInputDirection(msg.direction)) {
            break;
          }
          const seq = coerceInputSequence(msg.sequence ?? msg.inputSequence ?? 0);
          if (seq === null) {
            break;
          }
          this.simulation.handlePlayerInput(playerId, {
            direction: msg.direction,
            sprint: !!msg.sprint,
            inputSequence: seq,
            timestamp: msg.timestamp ?? Date.now(),
            clientPosition: msg.clientPosition ?? null,
          });
        }
        break;
      case 'startGame':
        if (!this.isHostSession(playerId)) break;
        this.startGame();
        break;
      case 'setDogType': {
        const dogType = msg.dogType as string;
        if (!DOG_TYPES.has(dogType)) break;
        player.dogType = dogType;
        if (this.simulation && this.simulation.sheepdogs && this.simulation.sheepdogs.has(playerId)) {
          this.simulation.sheepdogs.get(playerId).dogType = dogType;
        }
        meta.lastActivity = Date.now();
        this.broadcast('roomUpdated', { room: this.getSerializableState() });
        break;
      }
      case 'setModeLock': {
        if (!this.isHostSession(playerId)) break;
        meta.modeLocked = !!msg.locked;
        meta.lastActivity = Date.now();
        this.broadcast('modeLockChanged', { modeLocked: meta.modeLocked, gameMode: meta.gameMode });
        break;
      }
      case 'leaveRoom':
        this.handlePlayerLeave(playerId);
        try { this.sessions.get(playerId)?.close(1000, 'leave'); } catch {}
        break;
      case 'ping':
        this.send(this.sessions.get(playerId)!, 'pong', { id: msg.id, timestamp: Date.now() });
        break;
      default:
        // Unknown type; ignore per v2 spec (no default:break bug).
        break;
    }
  }

  private startGame(): void {
    if (!this.meta || this.meta.state !== 'waiting') return;
    console.log(`[RoomDO ${this.meta.roomCode}] startGame with ${this.players.size} player(s)`);
    // P-SEC-4 (d): minimum-connected-players gate for the heavy sheep counts.
    // The flocking neighbour scan is O(n^2)-ish, so a 3,000/5,000-sheep room is
    // a real per-tick CPU load on the DO. A solo (or under-filled) room at those
    // counts is a cheap way to pin a DO, so we transparently cap the count down
    // to HIGH_SHEEP_COUNT_CAP unless at least MIN_PLAYERS_FOR_HIGH_SHEEP players
    // are *connected* (sessions, not just lobby-joined) at start. We count
    // connected sockets so an abandoned room with phantom lobby members can't
    // satisfy the gate. Common-case rooms (<= 1,000 sheep) are never touched.
    // We mutate meta.sheepCount so the adapter, snapshot, and any downstream
    // consumer all see the effective count consistently.
    const connectedPlayers = this.sessions.size;
    if (
      this.meta.sheepCount >= HIGH_SHEEP_COUNT_THRESHOLD &&
      connectedPlayers < MIN_PLAYERS_FOR_HIGH_SHEEP
    ) {
      console.log(
        `[RoomDO ${this.meta.roomCode}] high sheep count ${this.meta.sheepCount} with only ` +
        `${connectedPlayers} connected player(s) — capping to ${HIGH_SHEEP_COUNT_CAP}`,
      );
      this.meta.sheepCount = HIGH_SHEEP_COUNT_CAP;
    }
    this.meta.state = 'in-game';
    this.meta.lastActivity = Date.now();
    this.persist();

    // Build the room adapter the sim consumes.
    const self = this;
    const adapter: any = {
      roomCode: this.meta.roomCode,
      isPublic: this.meta.isPublic,
      modeLocked: this.meta.modeLocked,
      gameMode: this.meta.gameMode,
      sceneId: this.meta.sceneId,
      // Cycle 8 Phase 5: pass room-level sheepCount through to GameSim.
      sheepCount: this.meta.sheepCount,
      // P-DET-1: pass the persisted per-game seed so GameSim seeds its
      // mulberry32 deterministically. NOT added to getSerializableState() —
      // it stays server-side and never reaches the wire.
      seed: this.meta.seed,
      state: this.meta.state,
      lastActivity: this.meta.lastActivity,
      simulation: null,
      players: new Map(this.players),
      getPlayer: (id: string) => this.players.get(id) ?? null,
      broadcastToRoom: (event: string, data: any) => self.broadcast(event, data),
      finishGame: () => {
        if (self.meta) {
          self.meta.state = 'finished';
          self.meta.lastActivity = Date.now();
        }
      },
      getSerializableState: () => self.getSerializableState(),
      resolvePlayerName: (id: string) => {
        const p = self.players.get(id);
        if (!p) return null;
        return p.displayName || p.name || null;
      },
      onSubmitScores: async (playerScores: Record<string, number>, completionData: any) => {
        try {
          const gameMode = completionData?.isTimedMode ? 'timed' : 'competitive';
          // Cycle 8 Phase 3+5: include sceneId + sheepCount in audit trail
          // so leaderboards can partition by them. Phase 5 will let hosts
          // pick a non-200 sheepCount; until then the meta default is 200.
          const sceneId = self.meta!.sceneId || 'field';
          const sheepCount = (self.meta as any).sheepCount || 200;
          for (const [sessionId, score] of Object.entries(playerScores)) {
            const p = self.players.get(sessionId);
            if (!p?.persistentId) continue;
            let value: number;
            if (gameMode === 'timed') value = score as number;
            else value = completionData?.competitive?.winner === sessionId ? 1 : 0;
            try {
              await d1SubmitScore(self.env.DB, p.persistentId, gameMode as any, value, {
                roomCode: self.meta!.roomCode,
                sceneId,
                sheepCount,
                totalSheep: sheepCount,
                playerCount: Object.keys(playerScores).length,
              });
            } catch (err) {
              console.error(`score submit failed for ${p.persistentId}:`, err);
            }
          }
        } catch (e) {
          console.error('onSubmitScores error:', e);
        }
      },
    };

    try {
      this.simulation = new GameSimulation(adapter);
      this.simulation.start();
    } catch (e: any) {
      console.error(`[RoomDO ${this.meta!.roomCode}] sim init failed:`, e?.stack || e);
      this.meta!.state = 'waiting';
      this.broadcast('roomError', { message: 'Failed to start game: ' + (e?.message || 'unknown') });
      return;
    }

    // Broadcast initial state
    this.broadcast('gameStarted', {
      room: this.getSerializableState(),
      gameState: this.simulation.createGameStateSnapshot(),
    });

    // Start broadcast loop at ~60Hz to match client expectations.
    this.startBroadcastLoop();
  }

  private startBroadcastLoop(): void {
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    this.broadcastInterval = setInterval(() => {
      if (!this.simulation) return;
      const state = this.simulation.getLatestGameState();
      if (state) this.broadcast('gameStateUpdate', state);
    }, 16);
  }

  private stopBroadcastLoop(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  private handlePlayerDisconnect(playerId: string): void {
    if (!this.meta) return;
    // Cycle 24 Phase 3: grace window applies only to in-game disconnects.
    // Lobby-state disconnects evict immediately (pre-game disconnect =
    // explicit leave, no point sitting on a phantom sheepdog).
    if (this.meta.state !== 'in-game') {
      this.handlePlayerLeave(playerId);
      return;
    }
    // Already grace-pending? Nothing to do — the previous timeout is still
    // counting down. (Can happen if a player toggles connectivity rapidly.)
    if (this.graceTimeouts.has(playerId)) return;
    // Schedule the eviction. If the player rebinds before the timeout
    // fires, bindSocket cancels it.
    const handle = setTimeout(() => {
      this.graceTimeouts.delete(playerId);
      // Re-check state — room may have been torn down or the player may
      // have already left explicitly while we were waiting.
      if (!this.meta || !this.players.has(playerId)) return;
      console.log(`[RoomDO ${this.meta.roomCode}] grace timeout fired for ${playerId} — evicting`);
      this.handlePlayerLeave(playerId);
    }, RoomDO.RECONNECT_GRACE_MS);
    this.graceTimeouts.set(playerId, { handle, startedAt: Date.now() });
    console.log(`[RoomDO ${this.meta.roomCode}] in-game disconnect — ${RoomDO.RECONNECT_GRACE_MS}ms grace for ${playerId}`);
  }

  private handlePlayerLeave(playerId: string): void {
    if (!this.meta) return;
    const player = this.players.get(playerId);
    if (!player) return;

    // P-SEC-2: decide host-departure by identity, captured before the delete.
    // The leaver was the host if it held the pinned host identity (or, for a
    // room with no persistent identity, the host sessionId).
    const leaverWasHost = this.isHostSession(playerId);

    this.players.delete(playerId);
    this.meta.lastActivity = Date.now();

    if (this.simulation && this.simulation.sheepdogs) {
      this.simulation.sheepdogs.delete(playerId);
      if (this.simulation.dogConfigs) this.simulation.dogConfigs.delete(playerId);
    }

    if (this.players.size === 0) {
      // Room is empty — stop sim, mark for cleanup.
      if (this.simulation) {
        this.simulation.cleanup?.();
        this.simulation = null;
      }
      this.stopBroadcastLoop();
      const emptiedRoomCode = this.meta.roomCode;
      this.meta = null;
      this.persist();
      // P-SEC-4 (e): release the lobby entry + the host's per-pid concurrent-room
      // slot now that the room is gone. Best-effort; a failure here only means a
      // slot lingers until the lobby's stale sweep reclaims it.
      this.releaseLobbyRoom(emptiedRoomCode).catch((e) =>
        console.warn(`[RoomDO ${emptiedRoomCode}] lobby release on teardown failed:`, e),
      );
      return;
    }

    if (leaverWasHost) {
      // P-SEC-2: host migration is identity-first.
      //   1. If a session sharing the *pinned* host identity is still connected
      //      (a reconnecting original host that rebound under a new sessionId),
      //      it reclaims — hostPersistentId is unchanged, we just re-point
      //      hostId at that session.
      //   2. Otherwise the oldest remaining player (by joinedAt) becomes host,
      //      and hostPersistentId is re-pinned to their identity so subsequent
      //      gates + migrations track the new host.
      const remaining = Array.from(this.players.entries());
      let newHostId: string | undefined;
      if (this.meta.hostPersistentId) {
        const reclaimer = remaining.find(([, p]) => p.persistentId === this.meta!.hostPersistentId);
        if (reclaimer) newHostId = reclaimer[0];
      }
      if (!newHostId) {
        // Oldest by join time; falls back to Map order if joinedAt is absent.
        let oldest = remaining[0];
        for (const entry of remaining) {
          if ((entry[1].joinedAt ?? 0) < (oldest[1].joinedAt ?? 0)) oldest = entry;
        }
        newHostId = oldest[0];
      }
      const newHost = this.players.get(newHostId)!;
      // Clear the stale isHost flag on whoever previously held it, then set it
      // on the new host so getSerializableState() reports a single host.
      for (const p of this.players.values()) p.isHost = false;
      this.meta.hostId = newHostId;
      this.meta.hostPersistentId = newHost.persistentId ?? this.meta.hostPersistentId;
      newHost.isHost = true;
      const newHostName = newHost.displayName || newHost.name || 'Player';
      this.broadcast('hostChanged', {
        newHostId,
        newHostName,
        isHost: false, // recipients interpret via their own id
        room: this.getSerializableState(),
      });
    }

    this.broadcast('playerLeft', {
      playerId,
      playerName: player.displayName || player.name,
      room: this.getSerializableState(),
    });
    this.persist();
  }

  private send(ws: WebSocket, t: string, data: Record<string, unknown> = {}): void {
    try {
      ws.send(encodeMsg(t, data));
    } catch (e) {
      console.error(`send ${t} failed:`, e);
    }
  }

  private broadcast(t: string, data: Record<string, unknown> = {}): void {
    const buf = encodeMsg(t, data);
    for (const [pid, ws] of this.sessions) {
      try {
        // Per-recipient `isHost` flag where relevant.
        if (t === 'hostChanged' && this.meta) {
          const payload = encodeMsg(t, { ...data, isHost: this.meta.hostId === pid });
          ws.send(payload);
        } else {
          ws.send(buf);
        }
      } catch (e) {
        console.error(`broadcast ${t} to ${pid} failed:`, e);
      }
    }
  }

  public getSerializableState(): any {
    if (!this.meta) return null;
    return {
      roomCode: this.meta.roomCode,
      code: this.meta.roomCode, // legacy alias
      name: this.meta.name,
      hostId: this.meta.hostId,
      maxPlayers: this.meta.maxPlayers,
      isPublic: this.meta.isPublic,
      gameMode: this.meta.gameMode,
      sceneId: this.meta.sceneId,
      sheepCount: this.meta.sheepCount,
      modeLocked: this.meta.modeLocked,
      state: this.meta.state,
      playerCount: this.players.size,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        dogType: p.dogType,
        isHost: p.isHost,
        isReady: p.isReady,
      })),
      createdAt: this.meta.createdAt,
      lastActivity: this.meta.lastActivity,
    };
  }
}
