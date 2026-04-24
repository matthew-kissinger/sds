// RoomDO: one Durable Object per active game room.
// Owns the sim, the WS connections, and the broadcast loop.

// @ts-ignore - JS module with no types
import { GameSimulation } from './GameSim.js';
import { encode, decode } from '@msgpack/msgpack';
import { submitScore as d1SubmitScore } from './d1.js';
import { listScenes, DEFAULT_SCENE_ID } from '../../shared/scenes/index.js';

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
  name: string;
  maxPlayers: number;
  isPublic: boolean;
  gameMode: string;
  sceneId: string;
  modeLocked: boolean;
  state: 'waiting' | 'in-game' | 'finished';
  createdAt: number;
  lastActivity: number;
}

interface Env {
  ROOM_DO: DurableObjectNamespace;
  LOBBY_DO: DurableObjectNamespace;
  DB: D1Database;
  JWT_SECRET: string;
}

const DOG_TYPES = new Set(['jep', 'pip', 'sally', 'shiloh', 'george_washington']);

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
        this.players = new Map(stored.players);
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
    const validSceneIds = listScenes().map((sc: any) => sc.id);
    const sceneId = s.sceneId && validSceneIds.includes(s.sceneId) ? s.sceneId : DEFAULT_SCENE_ID;
    const maxPlayers = Math.min(4, Math.max(2, s.maxPlayers || 4));

    this.meta = {
      roomCode: body.roomCode,
      hostId: body.hostId,
      name: s.name || 'Sheepdog Game',
      maxPlayers,
      isPublic: !!s.isPublic,
      gameMode,
      sceneId,
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

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    server.accept();
    this.bindSocket(playerId, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private bindSocket(playerId: string, ws: WebSocket): void {
    // Close any prior connection for this player (reconnect).
    const prior = this.sessions.get(playerId);
    if (prior && prior !== ws) {
      try { prior.close(1000, 'replaced'); } catch {}
    }
    this.sessions.set(playerId, ws);
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
      this.cleanupTimeout = null;
    }

    ws.addEventListener('message', async (evt) => {
      try {
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
        const msg = decode(bytes) as any;
        if (!msg || typeof msg.t !== 'string') return;
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
          this.simulation.handlePlayerInput(playerId, {
            direction: msg.direction,
            sprint: !!msg.sprint,
            inputSequence: msg.sequence ?? msg.inputSequence ?? 0,
            timestamp: msg.timestamp ?? Date.now(),
            clientPosition: msg.clientPosition ?? null,
          });
        }
        break;
      case 'startGame':
        if (playerId !== meta.hostId) break;
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
        if (playerId !== meta.hostId) break;
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
    // No minimum-player gate. Solo starts are useful for dev validation and
    // for players who just want to herd sheep in a private room alone.
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
          for (const [sessionId, score] of Object.entries(playerScores)) {
            const p = self.players.get(sessionId);
            if (!p?.persistentId) continue;
            let value: number;
            if (gameMode === 'timed') value = score as number;
            else value = completionData?.competitive?.winner === sessionId ? 1 : 0;
            try {
              await d1SubmitScore(self.env.DB, p.persistentId, gameMode as any, value, {
                roomCode: self.meta!.roomCode,
                totalSheep: 200,
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
    // Simple strategy: treat WS close as leave. No grace window for now (keep it simple,
    // matches droplet behavior).
    this.handlePlayerLeave(playerId);
  }

  private handlePlayerLeave(playerId: string): void {
    if (!this.meta) return;
    const player = this.players.get(playerId);
    if (!player) return;

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
      this.meta = null;
      this.persist();
      return;
    }

    if (this.meta.hostId === playerId) {
      const newHostId = Array.from(this.players.keys())[0];
      const newHost = this.players.get(newHostId)!;
      this.meta.hostId = newHostId;
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
