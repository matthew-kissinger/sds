// LobbyDO: singleton. Tracks public rooms for /api/lobbies and quick-match.
// Rooms push metadata updates here via register/update/remove.

interface LobbyEntry {
  roomCode: string;
  hostName: string;
  gameMode: string;
  // Cycle 8 Phase 5: surface scene + sheep count to lobby browsers so
  // players can pick rooms by what they want to play, not just the mode.
  sceneId?: string;
  sheepCount?: number;
  playerCount: number;
  maxPlayers: number;
  state: 'waiting' | 'in-game' | 'finished';
  isPublic: boolean;
  updatedAt: number;
}

interface Env {
  ROOM_DO: DurableObjectNamespace;
}

const STALE_MS = 2 * 60 * 1000;

// P-SEC-4 (f): hard ceiling on the public-room Map. Without a bound, a flood of
// room-create calls (each one registers a public entry here) grows this map
// without limit — a memory-exhaustion lever on the singleton lobby DO. The cap
// is generous: a real public lobby never approaches 2,000 concurrent open rooms
// at the current player base. Once full, the oldest-by-updatedAt entry is
// evicted to make room (it is the most-stale and closest to the STALE_MS sweep
// anyway), so a legitimate fresh room always lands.
const MAX_PUBLIC_ROOMS = 2000;

// P-SEC-4 (f): proactive prune cadence. listLobbies/findQuickMatch already evict
// stale entries lazily-on-read, but a lobby nobody reads (e.g. all clients gone)
// keeps stale entries resident forever. A periodic alarm sweeps them so the map
// can't accumulate dead rooms between reads. Set generously above STALE_MS so
// the alarm is cheap; the lazy sweep still catches anything in between.
const PRUNE_INTERVAL_MS = 60 * 1000;

// P-SEC-4 (e): per-persistent_id concurrent-room cap. A single identity opening
// unbounded rooms is both a spam vector (public lobby pollution) and a
// resource-exhaustion lever (each room is a live DO). We track open-room
// ownership here on the singleton lobby so the cap is global, not per-DO.
// Generous: a legitimate host runs one room, occasionally two while migrating.
const MAX_ROOMS_PER_PID = 5;

export class LobbyDO {
  private state: DurableObjectState;
  private env: Env;
  private rooms = new Map<string, LobbyEntry>();
  // P-SEC-4 (e): roomCode -> owning persistent_id, and the reverse count per
  // pid. Populated on claim-room (called by the create paths in index.ts) and
  // released on release-room / room teardown. In-memory on the singleton; an
  // eventual DO restart resets it, which fails open (no false lockout) — the
  // cap is spam/DoS mitigation, not a correctness invariant.
  private roomOwner = new Map<string, string>();
  private pidRoomCount = new Map<string, number>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    // P-SEC-4 (f): ensure a prune alarm is scheduled so stale entries are swept
    // even when no client reads the lobby. setAlarm is idempotent-ish (it just
    // overwrites the single pending alarm); scheduling on construct means a
    // freshly-woken DO re-arms its own sweep.
    this.schedulePrune();
  }

  // P-SEC-4 (f): arm the next prune if one isn't already pending. Guarded so we
  // don't thrash setAlarm on every request. Wrapped in try/catch + a typeof
  // guard so the node test runtime (where storage.getAlarm/setAlarm may be
  // absent) doesn't throw out of the constructor.
  private schedulePrune(): void {
    try {
      const storage: any = this.state.storage;
      if (typeof storage?.setAlarm !== 'function') return;
      // Fire-and-forget; getAlarm may be async. If an alarm is already set we
      // leave it; otherwise schedule one PRUNE_INTERVAL_MS out.
      Promise.resolve(typeof storage.getAlarm === 'function' ? storage.getAlarm() : null)
        .then((existing: number | null) => {
          if (existing == null) storage.setAlarm(Date.now() + PRUNE_INTERVAL_MS);
        })
        .catch(() => {});
    } catch {
      /* no alarm support in this runtime */
    }
  }

  // P-SEC-4 (f): the alarm handler. Sweeps stale entries and re-arms itself so
  // the lobby keeps pruning as long as it holds any rooms. Stops re-arming once
  // empty so an idle lobby DO doesn't keep an alarm alive forever.
  async alarm(): Promise<void> {
    this.pruneStale();
    if (this.rooms.size > 0) {
      try {
        const storage: any = this.state.storage;
        if (typeof storage?.setAlarm === 'function') {
          storage.setAlarm(Date.now() + PRUNE_INTERVAL_MS);
        }
      } catch {
        /* ignore */
      }
    }
  }

  // P-SEC-4 (f): remove every entry older than STALE_MS. Shared by the alarm and
  // available for direct test. Also releases the concurrent-room ownership for
  // any swept room so a host whose room aged out isn't charged for it forever.
  pruneStale(): number {
    const now = Date.now();
    let removed = 0;
    for (const [code, entry] of this.rooms) {
      if (now - entry.updatedAt > STALE_MS) {
        this.rooms.delete(code);
        this.releaseRoom(code);
        removed++;
      }
    }
    return removed;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/register' && request.method === 'POST') {
      const body = await request.json<LobbyEntry>();
      this.register(body);
      return new Response('ok');
    }
    if (path === '/update' && request.method === 'POST') {
      const body = await request.json<LobbyEntry>();
      this.register(body);
      return new Response('ok');
    }
    if (path === '/remove' && request.method === 'POST') {
      const body = await request.json<{ roomCode: string }>();
      this.rooms.delete(body.roomCode);
      this.releaseRoom(body.roomCode);
      return new Response('ok');
    }
    if (path === '/list' && request.method === 'GET') {
      return new Response(JSON.stringify({ lobbies: this.listLobbies() }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (path === '/quick-match' && request.method === 'POST') {
      const body = await request.json<{ gameMode: string }>();
      const match = this.findQuickMatch(body.gameMode || 'cooperative');
      return new Response(JSON.stringify({ match }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (path === '/allocate-code' && request.method === 'POST') {
      const code = this.allocateRoomCode();
      return new Response(JSON.stringify({ roomCode: code }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    // P-SEC-4 (e): claim a room for a persistent_id, enforcing the per-pid
    // concurrent-room cap. Called by the create paths in index.ts BEFORE the
    // room is initialized. Returns 429 when the caller already owns
    // MAX_ROOMS_PER_PID rooms so the create is refused before a DO is spun up.
    if (path === '/claim-room' && request.method === 'POST') {
      const body = await request.json<{ persistentId: string; roomCode: string }>();
      const ok = this.claimRoom(body.persistentId, body.roomCode);
      if (!ok) {
        return new Response(
          JSON.stringify({ error: 'room_limit', limit: MAX_ROOMS_PER_PID }),
          { status: 429, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (path === '/release-room' && request.method === 'POST') {
      const body = await request.json<{ roomCode: string }>();
      this.releaseRoom(body.roomCode);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }

  // P-SEC-4 (e): record ownership of roomCode by persistentId. Returns false
  // (no-op) when the pid is already at the cap. Idempotent: re-claiming a room
  // the pid already owns succeeds without double-counting.
  private claimRoom(persistentId: string, roomCode: string): boolean {
    if (!persistentId || !roomCode) return true; // no identity to charge — fail open
    if (this.roomOwner.get(roomCode) === persistentId) return true; // already owned
    const current = this.pidRoomCount.get(persistentId) ?? 0;
    if (current >= MAX_ROOMS_PER_PID) return false;
    this.roomOwner.set(roomCode, persistentId);
    this.pidRoomCount.set(persistentId, current + 1);
    return true;
  }

  // P-SEC-4 (e): release a room's ownership (on teardown / stale sweep).
  private releaseRoom(roomCode: string): void {
    const owner = this.roomOwner.get(roomCode);
    if (!owner) return;
    this.roomOwner.delete(roomCode);
    const current = this.pidRoomCount.get(owner) ?? 0;
    if (current <= 1) this.pidRoomCount.delete(owner);
    else this.pidRoomCount.set(owner, current - 1);
  }

  private register(entry: LobbyEntry): void {
    if (!entry.isPublic || entry.state === 'finished') {
      this.rooms.delete(entry.roomCode);
      return;
    }
    // P-SEC-4 (f): enforce the map ceiling. Updating an existing entry never
    // grows the map, so only guard on inserts. When full, evict the single
    // most-stale entry (lowest updatedAt) to admit the new room. This keeps the
    // map bounded under a create-flood without starving fresh legitimate rooms.
    if (!this.rooms.has(entry.roomCode) && this.rooms.size >= MAX_PUBLIC_ROOMS) {
      // First try a stale sweep (cheap, usually clears space).
      if (this.pruneStale() === 0) {
        let oldestCode: string | null = null;
        let oldestAt = Infinity;
        for (const [code, e] of this.rooms) {
          if (e.updatedAt < oldestAt) { oldestAt = e.updatedAt; oldestCode = code; }
        }
        if (oldestCode) { this.rooms.delete(oldestCode); this.releaseRoom(oldestCode); }
      }
    }
    this.rooms.set(entry.roomCode, { ...entry, updatedAt: Date.now() });
    // A registration may be the first room this DO holds since waking — make
    // sure the prune alarm is armed.
    this.schedulePrune();
  }

  private listLobbies(): LobbyEntry[] {
    const now = Date.now();
    const list: LobbyEntry[] = [];
    for (const [code, entry] of this.rooms) {
      if (now - entry.updatedAt > STALE_MS) {
        this.rooms.delete(code);
        this.releaseRoom(code);
        continue;
      }
      if (entry.state === 'finished' || !entry.isPublic) continue;
      list.push(entry);
    }
    return list;
  }

  private findQuickMatch(gameMode: string): LobbyEntry | null {
    const now = Date.now();
    for (const [code, entry] of this.rooms) {
      if (now - entry.updatedAt > STALE_MS) {
        this.rooms.delete(code);
        this.releaseRoom(code);
        continue;
      }
      if (!entry.isPublic) continue;
      if (entry.state !== 'waiting') continue;
      if (entry.playerCount >= entry.maxPlayers) continue;
      if (entry.gameMode !== gameMode) continue;
      return entry;
    }
    return null;
  }

  private allocateRoomCode(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < 3; i++) code += letters[Math.floor(Math.random() * letters.length)];
      for (let i = 0; i < 3; i++) code += digits[Math.floor(Math.random() * digits.length)];
      if (!this.rooms.has(code)) return code;
    }
    // Fallback: timestamp-based (won't collide in practice)
    return 'R' + Date.now().toString(36).slice(-5).toUpperCase();
  }
}
