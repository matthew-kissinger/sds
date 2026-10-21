// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RoomState } from './roomState';
import type { RealtimeEnv } from './bindings';
import { requireThat } from './http';
import { saveMatch, type MatchRecord } from './matchStore';

const PREFIX = 'match-outbox:';
const MAX_PENDING = 64;
/** Lifecycle records only. Persist together with room state, export from alarms. */
export class RoomHistory {
  private record: MatchRecord | null = null;
  private waitingSince = Date.now();
  private failures = 0;
  private retryAt = 0;
  private pending = new Map<string, MatchRecord>();
  constructor(private ctx: DurableObjectState, private env: RealtimeEnv) {}
  async load() {
    const state = await this.ctx.storage.get<{ record: MatchRecord | null; waitingSince: number; failures?: number; retryAt?: number }>('history');
    if (state) { this.record = state.record; this.waitingSince = state.waitingSince; this.failures = state.failures ?? 0; this.retryAt = state.retryAt ?? 0; }
    this.pending = await this.ctx.storage.list<MatchRecord>({ prefix: PREFIX });
  }
  get hasPending() { return this.pending.size > 0; }
  canStart() { requireThat(this.pending.size < MAX_PENDING, 'history_backlog', 409); }
  observe(before: RoomState, room: RoomState, now: number) {
    if (!this.env.MATCH_DB) return;
    if (room.phase === 'starting' && room.round !== this.record?.id) {
      this.canStart();
      this.record = { id: room.round!, revision: 0, region: room.region, ...room.settings,
        rules: `${room.settings.mode}-1`, partySize: room.members.length, createdAt: now,
        startedAt: null, endedAt: null, status: 'starting', reason: null,
        ticks: null, count: null, unclaimed: null, waitMs: null,
        identities: room.members.map(m => m.id),
        players: room.members.map(m => ({ slot: m.slot, name: m.name, count: null,
          forfeited: false, outcome: 'none', disconnects: 0, reconnects: 0 })) };
    }
    const r = this.record;
    if (!r || r.endedAt !== null) {
      if (before.phase !== 'waiting' && room.phase === 'waiting') this.waitingSince = now;
      return;
    }
    const old = JSON.stringify(r);
    if (room.phase === 'playing' && r.startedAt === null) {
      r.status = 'playing'; r.startedAt = now; r.waitMs = Math.max(0, now - this.waitingSince);
    }
    r.players.forEach((p,i) => {
      const prior = before.members.find(m => m.id === r.identities[i]);
      const next = room.members.find(m => m.id === r.identities[i]);
      if (prior?.connected && next && !next.connected) p.disconnects++;
      if (prior && !prior.connected && next?.connected) p.reconnects++;
      if (r.startedAt !== null && !next && now < room.expiresAt) p.forfeited = true;
    });
    if (!['starting','playing'].includes(room.phase)) {
      r.endedAt = now;
      const expired = now >= room.expiresAt;
      const result = !expired ? room.result : null;
      r.status = room.phase === 'finished' ? 'finished' : room.phase === 'closed' && !expired ? 'abandoned' : 'interrupted';
      r.reason = expired ? 'room_expired' : room.interruption ?? result?.reason ?? 'all_left';
      if (result) {
        r.ticks = result.tick; r.count = result.count; r.unclaimed = result.unclaimed;
        r.players.forEach(p => {
          const standing = result.standings.find(s => s.slot === p.slot);
          if (standing) { p.count = standing.count; p.forfeited = standing.forfeited; }
          if (r.status !== 'finished') return;
          if (r.mode === 'coop' && !p.forfeited) p.outcome = 'coop_complete';
          else if (result.winners.includes(p.slot)) p.outcome = result.reason === 'forfeit'
            ? 'forfeit_win' : result.winners.length > 1 ? 'shared' : 'win';
        });
      }
      if (room.phase === 'waiting') this.waitingSince = now;
    }
    const key = PREFIX + r.id;
    if (old !== JSON.stringify(r) || !this.pending.has(key) && r.revision === 0) {
      r.revision++; this.pending.set(key, structuredClone(r));
    }
  }
  private metadata() { return { record: this.record, waitingSince: this.waitingSince, failures: this.failures, retryAt: this.retryAt }; }
  values(room: RoomState): Record<string, unknown> {
    return { room, history: this.metadata(), ...Object.fromEntries(this.pending) };
  }
  async schedule() {
    if (!this.hasPending) return;
    const current = await this.ctx.storage.getAlarm();
    await this.ctx.storage.setAlarm(Math.min(current ?? Infinity, Math.max(Date.now() + 5000, this.retryAt)));
  }
  async flush() {
    if (!this.hasPending) return;
    if (Date.now() < this.retryAt) { await this.schedule(); return; }
    try {
      if (!this.env.MATCH_DB) throw new Error('history_unconfigured');
      for (const [key, value] of [...this.pending].slice(0,8)) {
        await saveMatch(this.env.MATCH_DB, value);
        await this.ctx.blockConcurrencyWhile(async () => {
          if (this.pending.get(key)?.revision !== value.revision) return;
          await this.ctx.storage.delete(key); this.pending.delete(key);
        });
      }
      this.failures = 0; this.retryAt = 0;
    } catch {
      this.failures++; this.retryAt = Date.now() + Math.min(300_000, 5000 * 2 ** Math.min(this.failures,6));
    }
    await this.ctx.blockConcurrencyWhile(() => this.ctx.storage.put('history',this.metadata()));
    await this.schedule();
  }
}
