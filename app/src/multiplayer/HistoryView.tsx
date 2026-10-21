// SPDX-License-Identifier: AGPL-3.0-or-later
import type { HistoryMatch, PlayerStats } from '../../../net/stats';
export const modeName = (mode: string) => mode==='coop' ? 'Co-op' : 'Competitive';
const outcome = { none:'',win:'Win',shared:'Shared win',forfeit_win:'Win by forfeit',coop_complete:'Completed together' };
export function PlayerSummary({ stats }: { stats: PlayerStats[] }) {
  return <div className="history-summary">{['coop','competitive'].map(mode=>{
    const s=stats.find(s=>s.mode===mode);
    return <section key={mode}><h3>{modeName(mode)}</h3><dl>
      <div><dt>Matches started</dt><dd>{s?.matches ?? 0}</dd></div>
      {mode==='coop' ? <div><dt>Completed together</dt><dd>{s?.completed ?? 0}</dd></div> : <>
        <div><dt>Wins</dt><dd>{s?.wins ?? 0}</dd></div>
        <div><dt>Shared wins</dt><dd>{s?.sharedWins ?? 0}</dd></div>
        <div><dt>Wins by forfeit</dt><dd>{s?.forfeitWins ?? 0}</dd></div>
        <div><dt>Sheep in your pen</dt><dd>{s?.sheep ?? 0}</dd></div></>}
      <div><dt>{mode==='coop' ? 'Early departures' : 'Forfeits'}</dt><dd>{s?.forfeits ?? 0}</dd></div>
      <div><dt>Interrupted rounds</dt><dd>{s?.interruptions ?? 0}</dd></div>
    </dl></section>;
  })}</div>;
}
export function MatchList({ matches }: { matches: (HistoryMatch & { yourSlot?: number })[] }) {
  if (!matches.length) return <p>No recorded matches yet. History begins when this feature is enabled.</p>;
  return <ol className="history-matches">{matches.map(m=><li key={m.id}>
    <div className="history-match-heading"><strong>{modeName(m.mode)} · {m.flockSize} sheep</strong>
      <time dateTime={new Date(m.createdAt).toISOString()}>{new Date(m.createdAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}</time></div>
    <p>{m.partySize} starting players · {m.region.toUpperCase()} · {m.visibility==='private' ? 'Invite only' : 'Public'}</p>
    <p>{m.status==='finished' ? m.reason==='forfeit' ? 'Finished by forfeit' : 'Flock finished'
      : m.status==='interrupted' ? `Interrupted: ${m.reason?.replaceAll('_',' ')}`
      : m.status==='abandoned' ? 'Ended without a winner' : m.status==='starting' ? 'Waiting to start' : 'In progress'}
      {m.ticks!==null ? ` · ${(m.ticks/60).toFixed(1)} seconds of play` : ''}</p>
    <ul>{m.players.map(p=><li key={p.slot}><strong>{p.name}{p.slot===m.yourSlot ? ' (you)' : ''}</strong>
      {p.count!==null ? ` · ${p.count} sheep` : ''}{p.forfeited ? m.mode==='coop' ? ' · left early' : ' · forfeited' : ''}
      {outcome[p.outcome] ? ` · ${outcome[p.outcome]}` : ''}</li>)}</ul>
    {m.count!==null ? <p>{m.count} of {m.flockSize} sheep home{m.unclaimed ? ` · ${m.unclaimed} unclaimed` : ''}</p> : null}
  </li>)}</ol>;
}
export function HistoryStyles() {
  return <style>{`
    .history-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:var(--herd-s4)}
    .history-summary section,.history-matches>li,.owner-group{background:var(--herd-paper);border:1px solid var(--herd-line);border-radius:12px;padding:var(--herd-s4)}
    .history-summary h3,.owner-group h3{margin-top:0}.history-summary dl{margin:0}
    .history-summary dl>div{display:flex;justify-content:space-between;gap:var(--herd-s3);margin:8px 0}
    .history-summary dd{margin:0;font-variant-numeric:tabular-nums lining-nums}
    .history-matches{list-style:none;padding:0;display:grid;gap:var(--herd-s3)}
    .history-match-heading{display:flex;justify-content:space-between;gap:var(--herd-s2);flex-wrap:wrap}
    .history-matches p{margin:8px 0}.history-matches ul{padding-left:20px;overflow-wrap:anywhere}
    .history-matches time{font-size:var(--herd-small);color:var(--herd-ink-soft)}
    .history-actions{display:flex;gap:var(--herd-s2);flex-wrap:wrap;margin:var(--herd-s4) 0}
    .owner-stats{height:100dvh;overflow:auto;padding:var(--herd-s6);background:var(--herd-paper-solid)}
    .owner-stats>div{max-width:1000px;margin:auto}.owner-stats input,.owner-stats select,.owner-stats button{font:inherit;min-height:44px;padding:8px 12px;border:1px solid var(--herd-line-strong);border-radius:6px;background:var(--herd-paper);max-width:100%;box-sizing:border-box}
    .owner-stats input{display:block;width:min(100%,420px);margin:12px 0}.owner-stats a{color:inherit}
    .owner-stats :focus-visible{outline:2px solid var(--herd-ink);outline-offset:3px}
    .owner-stats button:disabled{opacity:.5}.owner-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:var(--herd-s3)}
    @media(max-width:600px){.owner-stats{padding:var(--herd-s4)}}
  `}</style>;
}
