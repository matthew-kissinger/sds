// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RealtimeEnv } from './bindings';
import type { Region } from './regions';
interface Day { day: number; region: Region; count: number; saved: number }
/** Daily counters, not a log of IP addresses or rejected identities. */
export class LobbyMetrics {
  private days: Day[] = [];
  constructor(private ctx: DurableObjectState, private env: RealtimeEnv) {}
  async load() { this.days = await this.ctx.storage.get<Day[]>('capacity') ?? []; }
  get pending() { return this.days.some(d => d.count > d.saved); }
  async reject(region: Region) {
    if (!this.env.MATCH_DB) return;
    const day = Math.floor(Date.now()/86_400_000);
    this.days = this.days.filter(d => d.day >= day-31 || d.count > d.saved).slice(-63);
    let row = this.days.find(d => d.day === day);
    if (!row) { row = { day,region,count:0,saved:0 }; this.days.push(row); }
    row.count++; await this.ctx.storage.put('capacity',this.days); await this.schedule();
  }
  async schedule() {
    if (this.pending) await this.ctx.storage.setAlarm(Math.min(await this.ctx.storage.getAlarm() ?? Infinity,Date.now()+30_000));
  }
  async flush() {
    if (!this.env.MATCH_DB) return;
    try {
      for (const row of this.days.filter(d=>d.count>d.saved)) {
        const count = row.count;
        await this.env.MATCH_DB.prepare(`INSERT INTO capacity_days VALUES (?,?,?)
          ON CONFLICT(day,region) DO UPDATE SET rejected=MAX(rejected,excluded.rejected)`)
          .bind(row.day,row.region,count).run();
        await this.ctx.blockConcurrencyWhile(async () => { row.saved=count; await this.ctx.storage.put('capacity',this.days); });
      }
    } catch { /* Daily operational counters retry; never block room admission. */ }
    await this.schedule();
  }
}
