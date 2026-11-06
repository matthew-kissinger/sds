// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import { PlayerHistory } from './PlayerHistory';
import { MultiplayerStyles } from './MultiplayerStyles';
import { Boot } from '@app/ui/Boot';
import { useGameStore } from '@app/state/store';
import { formatSeconds, translatePlural, useT, type Translate } from '@app/i18n/store';
import { noticeText } from './notices';
import { MultiplayerClient, INITIAL } from './MultiplayerClient';
import type { Region, RoomView, Standing } from '../../../net/messages';
const REGIONS: readonly Region[] = ['na', 'eu', 'apac'];
const invite = () => location.pathname.match(/^\/r\/((?:na|eu|apac)_[a-f0-9]{32})$/)?.[1] ?? '';
export default function MultiplayerRoot() {
  const t = useT();
  const modeLabel = (mode: 'coop' | 'competitive') => t(`mp.mode.${mode}`);
  const regionName = (key: Region) => t(`mp.region.${key}`);
  const sheep = (count: number) => translatePlural('common.sheepCount', count);
  const [status, setStatus] = useState(INITIAL);
  const [client] = useState(() => new MultiplayerClient(setStatus));
  const [open, setOpen] = useState(location.pathname.startsWith('/r/'));
  const [handle, setHandle] = useState(invite);
  const [region, setRegion] = useState<Region>(() => {
    try { const r = localStorage.getItem('coop-region'); return r === 'eu' || r === 'apac' ? r : 'na'; } catch { return 'na'; }
  });
  const [mode, setMode] = useState<'coop' | 'competitive'>('coop');
  const [count, setCount] = useState<25 | 75 | 200>(25);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [rooms, setRooms] = useState<RoomView[]>([]);
  const [boardMessage, setBoardMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyOpen,setHistoryOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [invited] = useState(() => invite() !== '');
  const phase = useGameStore(s => s.gamePhase);
  const panel = useGameStore(s => s.uiPanel);
  const ready = useGameStore(s => s.sceneReady);
  const dialog = useRef<HTMLDialogElement>(null);
  const room = status.room;
  const modal = open && (!room || room.phase !== 'playing' || phase === 'paused');
  useEffect(() => () => client.dispose(), [client]);
  useEffect(() => { client.assetsReady(); }, [client, ready]);
  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    if (!modal) dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (!open || room) return;
    const abort = new AbortController(); let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/r/lobbies/${region}`, { signal: abort.signal });
        if (!response.ok) throw new Error('Board unavailable');
        const board = await response.json() as { rooms: RoomView[] };
        if (active) { setRooms(board.rooms); setBoardMessage(''); }
      } catch { if (active) setBoardMessage(t('mp.boardUnavailable')); }
    };
    void poll(); const timer = setInterval(() => void poll(), 5000);
    return () => { active = false; abort.abort(); clearInterval(timer); };
  }, [open, room, region, t]);
  const enter = async (target?: string) => {
    setBusy(true); await client.enter(target, region, count, visibility, mode); setBusy(false);
  };
  const leave = () => { client.leave(); setOpen(false); setHandle(''); };
  const host = room?.hostSlot === status.slot;
  const me = room?.members.find(m => m.slot === status.slot);
  const everyoneReady = !!room && room.members.length >= 2 && room.members.every(m => m.connected && m.ready);
  const shareLink = room ? `${location.origin}/r/${room.handle}` : '';
  const createSection = <section className="mp-section" aria-label={t('mp.createAria')}>
    <h3>{t('mp.createTitle')}</h3>
    <div className="mp-fields">
      <label className="mp-field"><span>{t('mp.regionLabel')}</span><select className="mp-select" value={region} onChange={e => {
        const value = e.target.value as Region; setRegion(value); try { localStorage.setItem('coop-region', value); } catch { /* optional preference */ }
      }}>{REGIONS.map(key => <option key={key} value={key}>{regionName(key)}</option>)}</select></label>
      <label className="mp-field"><span>{t('mp.modeLabel')}</span><select className="mp-select" value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="coop">{modeLabel('coop')}</option><option value="competitive">{modeLabel('competitive')}</option></select></label>
      <label className="mp-field"><span>{t('mp.sheepLabel')}</span><select className="mp-select" value={count} onChange={e => setCount(Number(e.target.value) as 25 | 75 | 200)}>{[25, 75, 200].map(n => <option key={n}>{n}</option>)}</select></label>
      <label className="mp-field"><span>{t('mp.visibilityLabel')}</span><select className="mp-select" value={visibility} onChange={e => setVisibility(e.target.value as 'private' | 'public')}><option value="private">{t('mp.inviteOnly')}</option><option value="public">{t('mp.public')}</option></select></label>
    </div>
    <p className="mp-copy">{t(mode === 'coop' ? 'mp.coopCopy' : 'mp.compCopy')}</p>
  </section>;
  const joinSection = <section className="mp-section" aria-label={t('mp.joinAria')}>
    <h3>{t('mp.joinTitle')}</h3>
    <div className="mp-row">
      <label className="mp-field"><span>{t('mp.inviteField')}</span><input className="mp-input" value={handle} placeholder={t('mp.invitePlaceholder')} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={e => setHandle(e.target.value)} /></label>
      <button className={`mp-btn${invited ? ' mp-btn--primary' : ''}`} disabled={busy || !ready || !handle} onClick={() => {
        const parsed = handle.match(/(?:na|eu|apac)_[a-f0-9]{32}/)?.[0];
        if (parsed) void enter(parsed); else setBoardMessage(t('mp.invalidLink'));
      }}>{t('mp.joinButton')}</button>
    </div>
  </section>;
  const boardSection = <section className="mp-section" aria-label={t('mp.boardAria')}>
    <h3>{t('mp.boardTitle', { region: regionName(region) })}</h3>
    {boardMessage ? <p className="mp-note" role="status">{boardMessage}</p> : rooms.length === 0 ? <p className="mp-empty">{t('mp.boardEmpty')}</p> : <ul className="mp-rooms">{rooms.map(r => {
      const label = `${r.members[0]?.name ?? t('mp.roomFallback')} · ${modeLabel(r.settings.mode)} · ${r.members.length}/4 · ${sheep(r.settings.flockSize)}`;
      return <li key={r.handle}><button className="mp-room" aria-label={label} disabled={busy || !ready || r.members.length >= 4} onClick={() => void enter(r.handle)}>
        <span className="mp-room__main"><span className="mp-room__name">{r.members[0]?.name ?? t('mp.roomFallback')}</span><span className="mp-room__meta">{modeLabel(r.settings.mode)} · {sheep(r.settings.flockSize)}</span></span>
        <span className="mp-room__count">{r.members.length}/4</span>
      </button></li>;
    })}</ul>}
  </section>;
  const title = t(room?.phase === 'finished' ? 'mp.titleFinished' : room?.phase === 'playing' ? 'mp.titlePlaying' : 'mp.title');
  const sub = historyOpen ? null : !room ? t('mp.subtitle') : null;
  return <>
    <MultiplayerStyles />
    {!open && panel === 'none' ? <Boot
      onMultiplayer={() => setOpen(true)}
      multiplayerLabel={import.meta.env.MODE === 'coop' ? 'Play multiplayer locally' : undefined}
    /> : null}
    {room?.phase === 'playing' ? <aside className="mp-hud" data-connected={status.connected} aria-live="polite">
      <div className="mp-hud__bar"><span className="mp-hud__dot" aria-hidden="true" /><span className="mp-hud__label">{room.settings.mode === 'competitive' ? modeLabel('competitive') : `${modeLabel('coop')} · ${t('player.label', { number: status.slot + 1 })}`}</span><span className="mp-hud__ping">{status.connected ? `${status.rtt ?? '…'} ms` : t('mp.reconnecting')}</span></div>
      {room.settings.mode === 'competitive' ? <Scoreboard standings={status.standings} unclaimed={status.unclaimed} you={status.slot} /> : null}
      {status.message ? <p>{noticeText(status.message)}</p> : null}
    </aside> : null}
    <dialog ref={dialog} className="mp-dialog" aria-labelledby="coop-title" onCancel={event => event.preventDefault()} onKeyDown={event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      if (historyOpen) { setHistoryOpen(false); return; }
      if (room?.phase === 'playing') useGameStore.getState().resume(); else if (!room) setOpen(false);
    }}>
      <header className="mp-head">
        <h2 className="mp-title" id="coop-title">{title}</h2>
        {sub ? <p className="mp-sub">{sub}</p> : null}
      </header>
      {historyOpen ? <div className="mp-body"><PlayerHistory close={() => setHistoryOpen(false)} /></div> : !room ? <>
        <div className="mp-body">
          {status.message ? <p className="mp-note" role="status">{noticeText(status.message)}</p> : null}
          {invited ? <>{joinSection}{createSection}</> : <>{createSection}{joinSection}</>}
          {boardSection}
          {!ready ? <p className="mp-note">{t('mp.fieldLoading')}</p> : null}
          <button className="mp-btn mp-btn--quiet" onClick={() => setHistoryOpen(true)}>{t('mp.stats')}</button>
        </div>
        <footer className="mp-foot">
          <button className="mp-btn mp-btn--quiet" disabled={busy} onClick={() => setOpen(false)}>{t('mp.backToSolo')}</button>
          <button className="mp-btn mp-btn--primary" disabled={busy || !ready} onClick={() => void enter()}>{t('mp.createRoom')}</button>
        </footer>
      </> : <>
        <div className="mp-body">
          {status.message ? <p className="mp-note" role="status">{noticeText(status.message)}</p> : null}
          <ul className="mp-chips" aria-label={t('mp.settingsAria')}>
            <li className="mp-chip">{modeLabel(room.settings.mode)}</li><li className="mp-chip">{regionName(room.region)}</li>
            <li className="mp-chip">{sheep(room.settings.flockSize)}</li><li className="mp-chip">{t(room.settings.visibility === 'public' ? 'mp.public' : 'mp.inviteOnly')}</li>
          </ul>
          <ol className="mp-players" aria-label={t('mp.playersAria')}>{[0, 1, 2, 3].map(slot => {
            const m = room.members.find(x => x.slot === slot);
            if (!m) return room.phase === 'waiting' ? <li key={slot} className="mp-player" data-empty="true"><span className="mp-player__slot" aria-hidden="true">{slot + 1}</span><span className="mp-player__who">{t('mp.openSeat')}</span></li> : null;
            return <li key={slot} className="mp-player">
              <span className="mp-player__slot" aria-hidden="true">{slot + 1}</span>
              <span className="mp-player__who"><span className="mp-player__name">{m.name}</span><span className="mp-player__role">{t('player.label', { number: slot + 1 })}{slot === room.hostSlot ? ` · ${t('mp.host')}` : ''}{m.slot === status.slot ? ` · ${t('mp.you')}` : ''}</span></span>
              <span className="mp-pill" data-tone={!m.connected ? 'warn' : m.ready ? 'ready' : undefined}>{t(m.connected ? m.ready ? 'mp.pillReady' : 'mp.pillWaiting' : 'mp.pillReconnecting')}</span>
              {host && room.phase === 'waiting' && m.slot !== status.slot ? <button className="mp-btn mp-btn--small mp-btn--quiet" aria-label={t('mp.removePlayer', { number: m.slot + 1 })} onClick={() => client.send('remove', m.slot)}>{t('mp.remove')}</button> : null}
            </li>;
          })}</ol>
          {room.phase === 'waiting' ? <>
            {host ? <label className="mp-field"><span>{t('mp.modeLabel')}</span><select className="mp-select" value={room.settings.mode} disabled={!status.connected} onChange={e => client.send('settings', e.target.value, room.settings.flockSize, room.settings.visibility)}><option value="coop">{modeLabel('coop')}</option><option value="competitive">{modeLabel('competitive')}</option></select></label> : null}
            {room.settings.mode === 'competitive' ? <p className="mp-copy">{t('mp.compRules')}</p> : null}
            <div className="mp-row">
              <label className="mp-field"><span>{t('mp.inviteLink')}</span><input className="mp-input" readOnly value={shareLink} onFocus={e => e.target.select()} /></label>
              <button className="mp-btn" onClick={() => { void navigator.clipboard.writeText(shareLink).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{t(copied ? 'share.copied' : 'mp.copyLink')}</button>
            </div>
            {!host ? <p className="mp-copy">{t('mp.hostStarts')}</p> : null}
          </> : null}
          {room.phase === 'starting' ? <p className="mp-copy">{t('mp.starting')}</p> : null}
          {room.phase === 'playing' ? <p className="mp-copy">{t('mp.menuOpen')}</p> : null}
          {room.result ? <section className="mp-result" aria-label={t('mp.resultAria')}>
            {room.result.mode === 'competitive' ? <><strong>{winnerLine(room.result, t)}</strong><Scoreboard standings={room.result.standings} unclaimed={room.result.unclaimed} /></> : null}
            <p>{translatePlural('mp.result', room.result.count, { seconds: formatSeconds(room.result.tick / 60), remaining: room.result.remaining, started: room.result.started })}</p>
            {host ? null : <p>{t('mp.waitHost')}</p>}
          </section> : null}
          {room.result ? <button className="mp-btn mp-btn--quiet" onClick={() => setHistoryOpen(true)}>{t('mp.stats')}</button> : null}
        </div>
        <footer className="mp-foot">
          {room.phase === 'waiting' ? <button className={`mp-btn${host ? '' : ' mp-btn--primary'}`} disabled={!status.connected} onClick={() => client.send('ready', !me?.ready)}>{t(me?.ready ? 'mp.notReady' : 'mp.ready')}</button> : null}
          {room.phase === 'waiting' && host ? <button className="mp-btn mp-btn--primary" disabled={!status.connected || !everyoneReady} onClick={() => client.send('start')}>{t(room.settings.mode === 'coop' ? 'mp.startCoop' : 'mp.startCompetitive')}</button> : null}
          {room.phase === 'playing' ? <button className="mp-btn mp-btn--primary" onClick={() => useGameStore.getState().resume()}>{t('common.resume')}</button> : null}
          {room.result && host ? <button className="mp-btn mp-btn--primary" onClick={() => client.send('again')}>{t('mp.returnLobby')}</button> : null}
          <button className="mp-btn mp-btn--danger" onClick={leave}>{t(room.settings.mode === 'competitive' && room.phase === 'playing' ? 'mp.forfeitLeave' : 'mp.leaveRoom')}</button>
        </footer>
      </>}
    </dialog>
  </>;
}

function winnerLine(result: { readonly reason: string; readonly winners: readonly number[] }, t: Translate) {
  if (result.reason === 'no_winner') return t('mp.noWinner');
  const players = result.winners.map(slot => t('player.label', { number: slot + 1 })).join(t('mp.listJoin'));
  const forfeit = result.reason === 'forfeit';
  if (result.winners.length > 1) return t(forfeit ? 'mp.winnersSharedForfeit' : 'mp.winnersShared', { players });
  return t(forfeit ? 'mp.winnerForfeit' : 'mp.winner', { players });
}

function Scoreboard({ standings, unclaimed, you }: { standings: Standing[]; unclaimed: number; you?: number }) {
  const t = useT();
  const compact = you !== undefined;
  return <ul className="mp-scores" aria-label={t('mp.scoresAria')}>{standings.map(s => <li key={s.slot} data-you={s.slot === you}>
    <span>{compact ? s.slot + 1 : t('player.label', { number: s.slot + 1 })} · {s.name}{s.forfeited ? ` · ${t('mp.forfeited')}` : ''}</span><span>{s.count}</span>
  </li>)}{unclaimed > 0 ? <li data-muted="true"><span>{t('mp.unclaimed')}</span><span>{unclaimed}</span></li> : null}</ul>;
}
