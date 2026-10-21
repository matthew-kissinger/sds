// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import type { PlayerHistory as History } from '../../../net/stats';
import { myHistory } from './historyApi';
import { HistoryStyles, MatchList, PlayerSummary } from './HistoryView';
export function PlayerHistory({ close }: { close: () => void }) {
  const [data,setData]=useState<History|null>(null), [message,setMessage]=useState('Loading your history.');
  const [busy,setBusy]=useState(false), [cursor,setCursor]=useState<string|null>(null), [refresh,setRefresh]=useState(0);
  const back=useRef<HTMLButtonElement>(null);
  useEffect(()=>{back.current?.focus();},[]);
  useEffect(()=>{
    const abort=new AbortController();setBusy(true);setMessage('Loading your history.');
    void myHistory(cursor,abort.signal).then(value=>{if(!abort.signal.aborted){setData(value);setMessage('');}})
      .catch(e=>{if(!abort.signal.aborted)setMessage(e instanceof Error ? e.message : 'History unavailable.');})
      .finally(()=>{if(!abort.signal.aborted)setBusy(false);});
    return ()=>abort.abort();
  },[cursor,refresh]);
  return <section aria-label="Your multiplayer history"><HistoryStyles />
    <button ref={back} onClick={close}>Back to multiplayer</button><h3>Your multiplayer stats</h3>
    <p>Co-op and competitive only. Results may take a few seconds to appear.</p>
    {message ? <p role="status">{message}</p> : null}
    {data ? <><PlayerSummary stats={data.stats} /><h3>Recent matches</h3><MatchList matches={data.matches} /></> : null}
    <div className="history-actions"><button disabled={busy} onClick={()=>{setCursor(null);setRefresh(n=>n+1);}}>Refresh latest</button>
      {data?.next ? <button disabled={busy} onClick={()=>setCursor(data.next)}>Older matches</button> : null}</div>
  </section>;
}
