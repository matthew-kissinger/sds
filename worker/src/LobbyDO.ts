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

export class LobbyDO {
  private state: DurableObjectState;
  private env: Env;
  private rooms = new Map<string, LobbyEntry>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
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
    return new Response('not found', { status: 404 });
  }

  private register(entry: LobbyEntry): void {
    if (!entry.isPublic || entry.state === 'finished') {
      this.rooms.delete(entry.roomCode);
      return;
    }
    this.rooms.set(entry.roomCode, { ...entry, updatedAt: Date.now() });
  }

  private listLobbies(): LobbyEntry[] {
    const now = Date.now();
    const list: LobbyEntry[] = [];
    for (const [code, entry] of this.rooms) {
      if (now - entry.updatedAt > STALE_MS) {
        this.rooms.delete(code);
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
