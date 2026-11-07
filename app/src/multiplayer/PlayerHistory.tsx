// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import type { PlayerHistory as History } from '../../../net/stats';
import { myHistory } from './historyApi';
import { HistoryStyles, MatchList, PlayerSummary } from './HistoryView';
import { translate, useT } from '@app/i18n/store';
export function PlayerHistory({ close }: { close: () => void }) {
  const t = useT();
  const [data,setData]=useState<History|null>(null), [message,setMessage]=useState(()=>translate('stats.loading'));
  const [busy,setBusy]=useState(false), [cursor,setCursor]=useState<string|null>(null), [refresh,setRefresh]=useState(0);
  const back=useRef<HTMLButtonElement>(null);
  useEffect(()=>{back.current?.focus();},[]);
  useEffect(()=>{
    const abort=new AbortController();setBusy(true);setMessage(translate('stats.loading'));
    void myHistory(cursor,abort.signal).then(value=>{if(!abort.signal.aborted){setData(value);setMessage('');}})
      .catch(e=>{if(!abort.signal.aborted)setMessage(e instanceof Error ? e.message : translate('stats.unavailable'));})
      .finally(()=>{if(!abort.signal.aborted)setBusy(false);});
    return ()=>abort.abort();
  },[cursor,refresh]);
  return <section className="mp-section" aria-label={t('stats.aria')}><HistoryStyles />
    <div className="mp-row"><button className="mp-btn mp-btn--small" ref={back} onClick={close}>{t('stats.back')}</button>
      <button className="mp-btn mp-btn--small mp-btn--quiet" disabled={busy} onClick={()=>{setCursor(null);setRefresh(n=>n+1);}}>{t('stats.refresh')}</button></div>
    <h3>{t('mp.stats')}</h3>
    <p className="mp-copy">{t('stats.note')}</p>
    {message ? <p className="mp-note" role="status">{message}</p> : null}
    {data ? <><PlayerSummary stats={data.stats} /><h3>{t('stats.recent')}</h3><MatchList matches={data.matches} /></> : null}
    {data?.next ? <button className="mp-btn mp-btn--small" disabled={busy} onClick={()=>setCursor(data.next)}>{t('stats.older')}</button> : null}
  </section>;
}
