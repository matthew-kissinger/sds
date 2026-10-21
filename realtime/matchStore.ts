// SPDX-License-Identifier: AGPL-3.0-or-later
import type { HistoryMatch, PlayerHistory, PlayerStats, ActivityGroup, OwnerStats } from '../net/stats';
export interface MatchRecord extends HistoryMatch { revision: number; identities: string[] }
export function publicMatch(record: MatchRecord): HistoryMatch {
  return { id:record.id,region:record.region,mode:record.mode,flockSize:record.flockSize,
    visibility:record.visibility,rules:record.rules,partySize:record.partySize,createdAt:record.createdAt,
    startedAt:record.startedAt,endedAt:record.endedAt,status:record.status,reason:record.reason,
    ticks:record.ticks,count:record.count,unclaimed:record.unclaimed,waitMs:record.waitMs,players:record.players };
}
/** Revision guards cover retries and a late start write arriving after completion. */
export async function saveMatch(db: D1Database, record: MatchRecord) {
  const statements = [db.prepare(`INSERT INTO matches
    (id,revision,created_at,started_at,ended_at,region,mode,flock_size,party_size,status,reason,wait_ms,record)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,
    started_at=excluded.started_at,ended_at=excluded.ended_at,status=excluded.status,
    reason=excluded.reason,wait_ms=excluded.wait_ms,record=excluded.record
    WHERE excluded.revision > matches.revision`).bind(record.id,record.revision,record.createdAt,
      record.startedAt,record.endedAt,record.region,record.mode,record.flockSize,record.partySize,
      record.status,record.reason,record.waitMs,JSON.stringify(publicMatch(record)))];
  for (const [i, p] of record.players.entries()) statements.push(db.prepare(`INSERT INTO participants
    SELECT ?,?,?,?,?,?,?,? WHERE (SELECT revision FROM matches WHERE id=?)=?
    ON CONFLICT(match_id,player_id) DO UPDATE SET outcome=excluded.outcome,forfeited=excluded.forfeited,
    sheep=excluded.sheep,disconnects=excluded.disconnects,reconnects=excluded.reconnects`)
    .bind(record.id,record.identities[i],p.slot,p.outcome,Number(p.forfeited),p.count,p.disconnects,p.reconnects,
      record.id,record.revision));
  await db.batch(statements);
}

export async function playerHistory(db: D1Database, id: string, before: string | null): Promise<PlayerHistory> {
  const cursor = before?.split(':');
  const at = cursor ? Number(cursor[0]) : Number.MAX_SAFE_INTEGER;
  const key = cursor?.[1] ?? 'z';
  const history = await db.prepare(`SELECT m.record,p.slot FROM matches m JOIN participants p ON p.match_id=m.id
    WHERE p.player_id=? AND (m.created_at < ? OR (m.created_at=? AND m.id<?))
    ORDER BY m.created_at DESC,m.id DESC LIMIT 21`).bind(id,at,at,key).all<{ record: string; slot: number }>();
  const stats = await db.prepare(`SELECT m.mode, COUNT(CASE WHEN m.started_at IS NOT NULL THEN 1 END) matches,
    SUM(p.outcome='coop_complete') completed, SUM(p.outcome='win') wins, SUM(p.outcome='shared') sharedWins,
    SUM(p.outcome='forfeit_win') forfeitWins, SUM(p.forfeited) forfeits, COALESCE(SUM(p.sheep),0) sheep,
    SUM(m.status='interrupted') interruptions FROM participants p JOIN matches m ON m.id=p.match_id
    WHERE p.player_id=? GROUP BY m.mode`).bind(id).all<PlayerStats>();
  const matches = history.results.slice(0,20).map(row => ({ ...JSON.parse(row.record) as HistoryMatch, yourSlot: row.slot }));
  const last = matches.at(-1);
  return { stats: stats.results, matches, next: history.results.length > 20 && last ? `${last.createdAt}:${last.id}` : null };
}

export async function ownerStats(db: D1Database, days: number): Promise<OwnerStats> {
  const generatedAt = Date.now(), since = generatedAt - days * 86_400_000;
  const groups = await db.prepare(`SELECT m.region,m.mode,COUNT(*) attempts,
    SUM(m.started_at IS NOT NULL) started,SUM(m.status='finished') finished,
    SUM(m.status='interrupted') interrupted,SUM(m.status='abandoned') abandoned,
    SUM(m.status IN ('starting','playing')) active,AVG(m.wait_ms) averageWaitMs,
    (SELECT COUNT(DISTINCT p.player_id) FROM participants p JOIN matches n ON n.id=p.match_id
      WHERE n.created_at>=? AND n.region=m.region AND n.mode=m.mode) players,
    COALESCE(SUM((SELECT SUM(p.disconnects) FROM participants p WHERE p.match_id=m.id)),0) disconnects,
    COALESCE(SUM((SELECT SUM(p.reconnects) FROM participants p WHERE p.match_id=m.id)),0) reconnects
    FROM matches m WHERE m.created_at>=? GROUP BY m.region,m.mode ORDER BY m.region,m.mode`)
    .bind(since,since).all<ActivityGroup>();
  const capacity = await db.prepare('SELECT region,SUM(rejected) rejected FROM capacity_days WHERE day>=? GROUP BY region')
    .bind(Math.floor(since/86_400_000)).all<{ region: string; rejected: number }>();
  const recent = await db.prepare('SELECT record FROM matches WHERE created_at>=? ORDER BY created_at DESC,id DESC LIMIT 30')
    .bind(since).all<{ record: string }>();
  return { since,generatedAt,groups:groups.results,capacity:capacity.results,recent:recent.results.map(r=>JSON.parse(r.record) as HistoryMatch) };
}
