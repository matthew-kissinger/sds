// SPDX-License-Identifier: AGPL-3.0-or-later
import { DurableObject } from 'cloudflare:workers';
import type { RealtimeEnv } from './bindings';
import { failure, requireThat, RoomError, rpc } from './http';
import { command, packet } from './protocol';
import { REGIONS, randomKey, type Region } from './regions';
import { applyCommand } from './roomCommands';
import { CoopMatch } from './CoopMatch';
import { PROTOCOL } from '../net/messages';
import { attached, broadcast, budget, type Attachment } from './roomSockets';
import { bind, disconnect, expire, interrupt, newRoom, publicRoom, reserve,
  type Identity, type RoomState, type Settings } from './roomState';

export class RoomDO extends DurableObject<RealtimeEnv> {
  private room: RoomState | null = null;
  private match: CoopMatch | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private advancing = false;
  private lastSnapshot = -1;
  constructor(ctx: DurableObjectState, env: RealtimeEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get<RoomState>('room') ?? null;
      if (!this.room) return;
      requireThat(this.room.schema === 2, 'storage_version', 503);
      if (this.room.phase === 'starting' || this.room.phase === 'playing') interrupt(this.room, 'server_restart');
      for (const member of this.room.members) {
        const live = ctx.getWebSockets().some(ws => {
          const a = attached(ws); return a.id === member.id && a.session === member.session;
        });
        if (member.connected && !live) disconnect(this.room, member.id, member.session, Date.now());
      }
      expire(this.room, Date.now()); this.room.revision++;
      await this.persist();
      broadcast(this.ctx, this.room);
    });
  }
  private current(): RoomState { requireThat(this.room, 'room_not_found', 404); return this.room; }
  private async persist() {
    const room = this.current();
    await this.ctx.storage.put('room', room);
    if (room.phase === 'closed') {
      // Keep a tombstone until the allocation lease expires. A retried create
      // must never resurrect an old invite if directory withdrawal failed.
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 5_000, room.expiresAt));
      return;
    }
    const deadlines = [room.expiresAt, ...room.members.flatMap(m => m.deadline === null ? [] : [m.deadline])];
    if (!room.members.length) deadlines.push(room.idleExpires);
    if (room.startDeadline) deadlines.push(room.startDeadline);
    // Public leases heal missed directory updates; private rooms can sleep.
    if (room.settings.visibility === 'public') deadlines.push(Date.now() + 30_000);
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...deadlines)));
  }
  private async publish() {
    const room = this.current();
    const lobby = this.env.LOBBIES.get(this.env.LOBBIES.idFromName(room.region), { locationHint: REGIONS[room.region] });
    const summary = room.phase === 'waiting' && room.settings.visibility === 'public' ? publicRoom(room) : null;
    try {
      await lobby.publish(room.handle, room.revision, summary, room.phase === 'closed');
    } catch {
      // Directory failure never rolls back an already committed seat. Retry
      // through an alarm, and let the previous public lease expire meanwhile.
      const alarm = await this.ctx.storage.getAlarm();
      await this.ctx.storage.setAlarm(Math.min(alarm ?? Infinity, Date.now() + 5_000));
    }
    // At this point the directory's allocation lease has expired too, even
    // when it is unavailable. No expired idempotency key can recreate us.
    if (room.phase === 'closed' && Date.now() >= room.expiresAt) {
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
    }
  }
  private async change<T>(fn: (room: RoomState, now: number) => T, refresh = false): Promise<T> {
    const result = await this.ctx.blockConcurrencyWhile(async () => {
      const room = this.current(); const before = JSON.stringify(room); expire(room, Date.now());
      // Invalid commands must not partly change settings or consume a seat.
      const draft = structuredClone(room);
      let result: T | undefined; let error: unknown;
      try { result = fn(draft, Date.now()); this.room = draft; } catch (e) { error = e; }
      const changed = before !== JSON.stringify(this.current());
      if (changed) this.current().revision++;
      if (changed || refresh) await this.persist();
      if (changed) broadcast(this.ctx, this.current());
      this.syncMatch();
      return { result, error, changed };
    });
    if (result.changed || refresh) await this.publish();
    if (result.error) throw result.error;
    return result.result as T;
  }
  async admit(who: Identity, init: { handle: string; region: Region; settings: Settings } | null) {
    return rpc(async () => {
    if (init) await this.ctx.blockConcurrencyWhile(async () => {
      if (!this.room) {
        this.room = newRoom(init.handle, init.region, init.settings, Date.now());
        await this.persist();
      }
    });
    return this.change((room, now) => {
      const ticket = randomKey();
      const member = reserve(room, who, randomKey(), ticket, now);
      return { handle: room.handle, slot: member.slot, ticket, expiresAt: member.ticketExpires, protocol: PROTOCOL };
    });
    });
  }
  async inspect() {
    return rpc(() => this.change(room => ({ handle: room.handle, region: room.region,
      phase: room.phase, occupancy: room.members.length, settings: room.settings, protocol: PROTOCOL })));
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      requireThat(request.headers.get('Upgrade')?.toLowerCase() === 'websocket', 'upgrade_required', 426);
      requireThat(request.headers.get('Origin') === this.env.ALLOWED_ORIGIN, 'origin_denied', 403);
      requireThat(url.searchParams.get('v') === String(PROTOCOL), 'protocol_mismatch', 400);
      const ticket = url.searchParams.get('ticket');
      requireThat(ticket && /^[a-f0-9]{32}$/.test(ticket), 'invalid_ticket', 401);
      return await this.change((room, now) => {
        const member = bind(room, ticket, randomKey(), now);
        this.match?.reset(member.slot);
        for (const old of this.ctx.getWebSockets()) if (attached(old).id === member.id) old.close(1000, 'session_replaced');
        const pair = new WebSocketPair(); const [client, server] = [pair[0], pair[1]];
        server.binaryType = 'arraybuffer';
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({ id: member.id, session: member.session, seq: -1,
          ack: room.revision, sent: room.revision, tokens: 20, at: now,
          traffic: 100, trafficAt: now, matchAck: this.match?.sim.tick ?? 0, matchSent: this.match?.sim.tick ?? 0 } satisfies Attachment);
        if (this.match) server.send(packet(this.match.snapshot()));
        return new Response(null, { status: 101, webSocket: client });
      });
    } catch (error) { return failure(error); }
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const a = attached(ws); const now = Date.now();
      requireThat(budget(a, now, true), 'message_rate', 429);
      const cmd = command(message);
      if (cmd.type !== 'input' && cmd.type !== 'seen') requireThat(budget(a, now), 'control_rate', 429);
      if (cmd.seq <= a.seq) { ws.serializeAttachment(a); return; }
      a.seq = cmd.seq;
      if (cmd.type === 'input' || cmd.type === 'seen') {
        const room = this.current(); const member = room.members.find(m => m.id === a.id && m.session === a.session && m.connected);
        if (member && room.phase === 'finished' && cmd.round === room.round) { ws.serializeAttachment(a); return; }
        requireThat(member && room.phase === 'playing' && this.match && cmd.round === room.round, 'stale_round');
        if (cmd.type === 'seen') {
          requireThat(cmd.tick <= a.matchSent, 'invalid_ack', 400);
          a.matchAck = Math.max(a.matchAck, cmd.tick);
        } else this.match.input(member.slot, cmd.seq, cmd.x, cmd.z, cmd.sprint, cmd.bark, now);
        ws.serializeAttachment(a); return;
      }
      if (cmd.type === 'ack') {
        requireThat(cmd.revision <= a.sent, 'invalid_ack', 400);
        a.ack = Math.max(a.ack, cmd.revision); ws.serializeAttachment(a); return;
      }
      ws.serializeAttachment(a);
      if (cmd.type === 'ping') { ws.send(packet({ protocol: PROTOCOL, type: 'pong', seq: cmd.seq })); return; }
      await this.change((room, time) => applyCommand(room, a.id, a.session, cmd, time, randomKey()));
    } catch (error) {
      const code = error instanceof RoomError ? error.code : 'service_unavailable';
      if (error instanceof RoomError && error.status === 409) ws.send(packet({ protocol: PROTOCOL, type: 'error', code }));
      else ws.close(1008, code);
    }
  }
  async webSocketClose(ws: WebSocket) {
    if (!this.room) { ws.close(1000, 'closed'); return; }
    const a = attached(ws);
    await this.change((room, now) => disconnect(room, a.id, a.session, now));
    ws.close(1000, 'closed');
  }
  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws); }
  async alarm() { await this.change(() => {}, true); }
  private syncMatch() {
    const room = this.current();
    if (room.phase !== 'playing') {
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null; this.match = null; return;
    }
    if (!this.match) {
      this.match = new CoopMatch(room.round!, room.settings.flockSize, room.members.map(m => m.slot),
        crypto.getRandomValues(new Uint32Array(1))[0], Date.now());
      this.lastSnapshot = -1;
      for (const ws of this.ctx.getWebSockets()) {
        const a = attached(ws); a.matchAck = a.matchSent = 0; ws.serializeAttachment(a);
      }
      this.sendSnapshot();
      this.timer = setInterval(() => { void this.advanceMatch(); }, 16);
    }
  }
  private sendSnapshot() {
    if (!this.match) return;
    const tick = this.match.sim.tick; const bytes = packet(this.match.snapshot());
    this.lastSnapshot = tick;
    for (const ws of this.ctx.getWebSockets()) {
      const a = attached(ws);
      if (!this.current().members.some(m => m.id === a.id && m.session === a.session && m.connected)) continue;
      if (tick - a.matchAck > 120) { ws.close(1013, 'slow_consumer'); continue; }
      try { ws.send(bytes); a.matchSent = tick; ws.serializeAttachment(a); }
      catch { ws.close(1011, 'send_failed'); }
    }
  }
  private async advanceMatch() {
    if (this.advancing || !this.match || this.current().phase !== 'playing') return;
    this.advancing = true;
    try {
      const outcome = this.match.advance(Date.now(), this.current());
      if (this.match.sim.tick - this.lastSnapshot >= 3 || outcome === 'finished') this.sendSnapshot();
      if (outcome !== 'playing') {
        const result = { tick: this.match.sim.tick, count: this.match.sim.pennedCount,
          started: this.match.started, remaining: this.match.sim.state.dogs.length };
        await this.change(room => {
          if (outcome === 'finished') { room.phase = 'finished'; room.result = result; }
          else if (outcome === 'empty') { room.phase = 'closed'; room.members = []; room.result = null; }
          else interrupt(room, 'overload');
        });
      }
    } catch {
      await this.change(room => interrupt(room, 'overload')).catch(() => {});
    } finally { this.advancing = false; }
  }
}
