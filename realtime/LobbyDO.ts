// SPDX-License-Identifier: AGPL-3.0-or-later
import { LobbyMetrics } from './LobbyMetrics';
import { DurableObject } from 'cloudflare:workers';
import type { RealtimeEnv } from './bindings';
import { requireThat, rpc } from './http';
import { randomKey, type Region } from './regions';
import { deploymentDeadline } from './deadline';
import { ROOM_LIFETIME_MS, type Settings, type publicRoom } from './roomState';
type Summary = ReturnType<typeof publicRoom>;
interface Lease {
  handle: string; owner: string; key: string; config: string; expiresAt: number;
  revision: number; summary: Summary | null; listedUntil: number;
}
export class LobbyDO extends DurableObject<RealtimeEnv> {
  private metrics: LobbyMetrics;
  private leases: Lease[] = [];
  constructor(ctx: DurableObjectState, env: RealtimeEnv) {
    super(ctx, env);
    this.metrics = new LobbyMetrics(ctx,env);
    ctx.blockConcurrencyWhile(async () => { this.leases = await ctx.storage.get<Lease[]>('leases') ?? []; await this.metrics.load(); });
  }
  private prune(now: number) { this.leases = this.leases.filter(l => l.expiresAt > now); }
  private async persist() {
    if (!this.leases.length) { await this.ctx.storage.delete('leases'); await this.metrics.schedule(); return; }
    await this.ctx.storage.put('leases', this.leases);
    await this.ctx.storage.setAlarm(Math.min(...this.leases.map(l => l.expiresAt)));
    await this.metrics.schedule();
  }
  async allocate(region: Region, owner: string, key: string, config: Settings) {
    // Expected admission failures must be caught inside the input gate:
    // rejecting blockConcurrencyWhile resets the object in workerd.
    return this.ctx.blockConcurrencyWhile(() => rpc(async () => {
      const now = Date.now(); this.prune(now);
      const end = deploymentDeadline(this.env);
      requireThat(now < end, 'pilot_closed', 410);
      const old = this.leases.find(l => l.owner === owner && l.key === key);
      if (old) { requireThat(old.config === JSON.stringify(config), 'idempotency_conflict'); return old.handle; }
      requireThat(this.leases.filter(l => l.owner === owner).length < 2, 'creation_limit', 429);
      const cap = this.env.ROOM_CAPS?.[region];
      requireThat(Number.isInteger(cap) && cap >= 0 && cap <= 50, 'capacity_unconfigured', 503);
      if (this.leases.length >= cap) await this.metrics.reject(region);
      requireThat(this.leases.length < cap, 'region_capacity', 429);
      const handle = `${region}_${randomKey()}`;
      this.leases.push({ handle, owner, key, config: JSON.stringify(config), expiresAt: Math.min(now + ROOM_LIFETIME_MS, end),
        revision: -1, summary: null, listedUntil: 0 });
      await this.persist(); return handle;
    }));
  }
  async publish(handle: string, revision: number, summary: Summary | null, closed: boolean): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now(); this.prune(now);
      const lease = this.leases.find(l => l.handle === handle);
      if (!lease || revision < lease.revision) return;
      if (closed) this.leases = this.leases.filter(l => l !== lease);
      else {
        requireThat(!summary || (summary.handle === handle && summary.settings.visibility === 'public'
          && summary.phase === 'waiting'), 'invalid_summary', 400);
        lease.revision = revision; lease.summary = summary; lease.listedUntil = now + 60_000;
      }
      await this.persist();
    });
  }
  async list(after: string | null): Promise<{ rooms: Summary[]; next: string | null }> {
    const now = Date.now();
    const active = this.leases.filter(l => l.expiresAt > now && l.listedUntil > now && l.summary
      && (!after || l.handle > after)).sort((a, b) => a.handle.localeCompare(b.handle));
    const page = active.slice(0, 25);
    return { rooms: page.map(l => l.summary!), next: active.length > 25 ? page.at(-1)!.handle : null };
  }
  async alarm() { this.prune(Date.now()); await this.persist(); await this.metrics.flush(); }
}
