// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import type { OwnerStats } from '../../../net/stats';
import { dashboard } from './historyApi';
import { HistoryStyles, MatchList, modeName } from './HistoryView';
export default function OwnerDashboard() {
  const [key,setKey]=useState(''), [days,setDays]=useState(7), [data,setData]=useState<OwnerStats|null>(null);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  const load=async()=>{
    request.current?.abort();const abort=new AbortController();request.current=abort;setBusy(true);setMessage('');
    try {const value=await dashboard(key,days,abort.signal);if(!abort.signal.aborted)setData(value);}
    catch(e){if(!abort.signal.aborted){setData(null);setMessage(e instanceof Error ? e.message : 'Dashboard unavailable.');}}
    finally {if(!abort.signal.aborted)setBusy(false);}
  };
  return <main className="owner-stats"><HistoryStyles /><div>
    <a href="/">Back to Sheepdog Sim</a><h1>Multiplayer activity</h1><p>Owner view · co-op and competitive</p>
    <form onSubmit={e=>{e.preventDefault();void load();}}>
      {!data ? <label>Owner key<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} required /></label> : null}
      <div className="history-actions"><label>Period <select value={days} onChange={e=>setDays(Number(e.target.value))} disabled={busy}><option value={1}>Last day</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select></label>
        <button disabled={busy||!key}>{busy ? 'Loading' : data ? 'Refresh dashboard' : 'Open dashboard'}</button>
        {data ? <button type="button" onClick={()=>{request.current?.abort();setKey('');setData(null);setBusy(false);}}>Lock dashboard</button> : null}</div>
    </form>
    {message ? <p role="status">{message}</p> : null}
    {!data ? <p>The key stays in this tab’s memory and is cleared on reload.</p> : <>
      <p>Updated {new Date(data.generatedAt).toLocaleString()}. Round activity since {new Date(data.since).toLocaleString()}.
        Counts update after lifecycle events are saved; this is not a live connection monitor.</p>
      <div className="owner-groups">{data.groups.map(g=><section className="owner-group" key={`${g.region}-${g.mode}`}><h3>{g.region.toUpperCase()} · {modeName(g.mode)}</h3>
        <p>{g.players} distinct player identities · {g.started} rounds started</p>
        <p>{g.finished} finished · {g.interrupted} interrupted · {g.abandoned} abandoned</p>
        <p>{g.started ? `${Math.round(g.finished/g.started*100)}% completion` : 'No completed starts'} · {g.active} pending or in progress</p>
        <p>{g.disconnects} disconnects · {g.reconnects} reconnects</p>
        <p>{g.averageWaitMs===null ? 'No waiting-time sample' : `${(g.averageWaitMs/1000).toFixed(0)} seconds average lobby wait`}</p>
      </section>)}</div>
      {!data.groups.length ? <p>No recorded round activity in this period.</p> : null}
      <h2>Capacity rejections</h2><p>Daily totals for days overlapping the selected period. Retried attempts count separately.</p>
      <ul>{['na','eu','apac'].map(region=><li key={region}>{region.toUpperCase()}: {data.capacity.find(c=>c.region===region)?.rejected ?? 0}</li>)}</ul>
      <h2>Recent rounds</h2><MatchList matches={data.recent} />
    </>}
  </div></main>;
}
