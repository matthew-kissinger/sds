import { DurableObject } from 'cloudflare:workers';

interface PlayerInfo {
  id: string;
  name: string;
  dogType: string;
}

interface RoomState {
  roomCode: string;
  mode: string;
  state: 'waiting' | 'in-game' | 'finished';
  hostId: string | null;
  players: Map<string, PlayerInfo>;
  modeLocked: boolean;
}

export class RoomDO extends DurableObject {
  private room: RoomState = {
    roomCode: '',
    mode: 'cooperative',
    state: 'waiting',
    hostId: null,
    players: new Map(),
    modeLocked: false,
  };

  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      // Store player info from query params
      const playerId = url.searchParams.get('playerId') || crypto.randomUUID();
      const playerName = url.searchParams.get('name') || 'Player';
      const dogType = url.searchParams.get('dogType') || 'jep';
      server.serializeAttachment({ playerId, playerName, dogType });
      this.onPlayerJoin(server, { id: playerId, name: playerName, dogType });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/') {
      return Response.json(this.getSerializableState());
    }
    return new Response('Not found', { status: 404 });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const attachment = ws.deserializeAttachment() as { playerId: string };
    try {
      const msg = typeof message === 'string' ? JSON.parse(message) : JSON.parse(new TextDecoder().decode(message as ArrayBuffer));
      this.handleMessage(ws, attachment.playerId, msg);
    } catch (e) {
      console.error('RoomDO: failed to parse message', e);
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    const attachment = ws.deserializeAttachment() as { playerId: string };
    this.onPlayerLeave(ws, attachment.playerId);
  }

  private onPlayerJoin(ws: WebSocket, player: PlayerInfo): void {
    if (!this.room.hostId) {
      this.room.hostId = player.id;
    }
    this.room.players.set(player.id, player);
    this.broadcast({ t: 'lobby', ...this.getSerializableState() });
  }

  private onPlayerLeave(ws: WebSocket, playerId: string): void {
    this.room.players.delete(playerId);
    if (this.room.hostId === playerId) {
      const next = this.room.players.keys().next().value;
      this.room.hostId = next ?? null;
      if (next) this.broadcast({ t: 'hostChanged', newHost: next });
    }
    if (this.room.players.size === 0) {
      this.room.state = 'finished';
    }
    this.broadcast({ t: 'lobby', ...this.getSerializableState() });
  }

  private handleMessage(ws: WebSocket, playerId: string, msg: Record<string, unknown>): void {
    switch (msg.t) {
      case 'start':
        if (playerId === this.room.hostId && this.room.state === 'waiting') {
          this.room.state = 'in-game';
          this.broadcast({ t: 'start' });
        }
        break;
      case 'leave':
        this.onPlayerLeave(ws, playerId);
        break;
      case 'modeLock':
        if (playerId === this.room.hostId) {
          this.room.modeLocked = !!msg.locked;
          this.broadcast({ t: 'lobby', ...this.getSerializableState() });
        }
        break;
      case 'setDog': {
        const player = this.room.players.get(playerId);
        if (player && typeof msg.dogType === 'string') {
          player.dogType = msg.dogType;
          this.broadcast({ t: 'lobby', ...this.getSerializableState() });
        }
        break;
      }
      default:
        // Echo unhandled messages back for now (C2 replaces with real sim)
        ws.send(JSON.stringify({ t: 'echo', original: msg }));
    }
  }

  private broadcast(msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch {}
    }
  }

  private getSerializableState() {
    return {
      roomCode: this.room.roomCode,
      mode: this.room.mode,
      state: this.room.state,
      hostId: this.room.hostId,
      players: Array.from(this.room.players.values()),
      modeLocked: this.room.modeLocked,
    };
  }
}
