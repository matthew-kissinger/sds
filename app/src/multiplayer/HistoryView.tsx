// SPDX-License-Identifier: AGPL-3.0-or-later
import type { HistoryMatch, PlayerStats } from '../../../net/stats';
import { activeLocale, formatSeconds, translate, translatePlural, useT } from '@app/i18n/store';
import { reasonText } from './notices';
export const modeName = (mode: string) => translate(mode==='coop' ? 'mp.mode.coop' : 'mp.mode.competitive');
// Saved matches outlive this list, so a region it no longer has shows as it was saved.
export const regionName = (region: string) => region==='na' || region==='eu' || region==='apac' ? translate(`mp.region.${region}`) : region.toUpperCase();
export function PlayerSummary({ stats }: { stats: PlayerStats[] }) {
  const t = useT();
  return <div className="history-summary">{['coop','competitive'].map(mode=>{
    const s=stats.find(s=>s.mode===mode);
    return <section key={mode}><h3>{modeName(mode)}</h3><dl>
      <div><dt>{t('stats.matchesStarted')}</dt><dd>{s?.matches ?? 0}</dd></div>
      {mode==='coop' ? <div><dt>{t('stats.completedTogether')}</dt><dd>{s?.completed ?? 0}</dd></div> : <>
        <div><dt>{t('stats.wins')}</dt><dd>{s?.wins ?? 0}</dd></div>
        <div><dt>{t('stats.sharedWins')}</dt><dd>{s?.sharedWins ?? 0}</dd></div>
        <div><dt>{t('stats.forfeitWins')}</dt><dd>{s?.forfeitWins ?? 0}</dd></div>
        <div><dt>{t('stats.sheepInPen')}</dt><dd>{s?.sheep ?? 0}</dd></div></>}
      <div><dt>{t(mode==='coop' ? 'stats.earlyDepartures' : 'stats.forfeits')}</dt><dd>{s?.forfeits ?? 0}</dd></div>
      <div><dt>{t('stats.interrupted')}</dt><dd>{s?.interruptions ?? 0}</dd></div>
    </dl></section>;
  })}</div>;
}
export function MatchList({ matches }: { matches: (HistoryMatch & { yourSlot?: number })[] }) {
  const t = useT();
  if (!matches.length) return <p>{t('stats.none')}</p>;
  return <ol className="history-matches">{matches.map(m=><li key={m.id}>
    <div className="history-match-heading"><strong>{modeName(m.mode)} · {t('common.sheepCount.other', { count: m.flockSize })}</strong>
      <time dateTime={new Date(m.createdAt).toISOString()}>{new Date(m.createdAt).toLocaleString(activeLocale()==='en' ? undefined : activeLocale(),{dateStyle:'medium',timeStyle:'short'})}</time></div>
    <p>{t('stats.startingPlayers', { count: m.partySize })} · {regionName(m.region)} · {t(m.visibility==='private' ? 'mp.inviteOnly' : 'mp.public')}</p>
    <p>{m.status==='finished' ? t(m.reason==='forfeit' ? 'stats.finishedForfeit' : 'stats.flockFinished')
      : m.status==='interrupted' ? t('stats.interruptedReason', { reason: reasonText(m.reason ?? '') })
      : t(m.status==='abandoned' ? 'stats.abandoned' : m.status==='starting' ? 'stats.waitingStart' : 'stats.inProgress')}
      {m.ticks!==null ? ` · ${t('stats.secondsPlay', { seconds: formatSeconds(m.ticks/60) })}` : ''}</p>
    <ul>{m.players.map(p=><li key={p.slot}><strong>{p.name}{p.slot===m.yourSlot ? ` ${t('stats.you')}` : ''}</strong>
      {p.count!==null ? ` · ${translatePlural('common.sheepCount', p.count)}` : ''}{p.forfeited ? ` · ${t(m.mode==='coop' ? 'stats.leftEarly' : 'stats.forfeited')}` : ''}
      {p.outcome==='none' ? '' : ` · ${t(`stats.outcome.${p.outcome}`)}`}</li>)}</ul>
    {m.count!==null ? <p>{t('stats.sheepHome', { count: m.count, total: m.flockSize })}{m.unclaimed ? ` · ${t('stats.unclaimed', { count: m.unclaimed })}` : ''}</p> : null}
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
