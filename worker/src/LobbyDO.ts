import { DurableObject } from 'cloudflare:workers';

interface LobbyEntry {
  roomCode: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  gameMode: string;
  state: string;
}

export class LobbyDO extends DurableObject {
  private lobbies: Map<string, LobbyEntry> = new Map();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/list') {
      return Response.json(Array.from(this.lobbies.values()).filter(l => l.state === 'waiting'));
    }
    if (url.pathname === '/upsert' && request.method === 'POST') {
      const entry = await request.json() as LobbyEntry;
      this.lobbies.set(entry.roomCode, entry);
      return Response.json({ ok: true });
    }
    if (url.pathname === '/remove' && request.method === 'POST') {
      const { roomCode } = await request.json() as { roomCode: string };
      this.lobbies.delete(roomCode);
      return Response.json({ ok: true });
    }
    return new Response('Not found', { status: 404 });
  }
}
