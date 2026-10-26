// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import { PlayerHistory } from './PlayerHistory';
import { MultiplayerStyles } from './MultiplayerStyles';
import { Boot } from '@app/ui/Boot';
import { useGameStore } from '@app/state/store';
import { MultiplayerClient, INITIAL } from './MultiplayerClient';
import type { Region, RoomView, Standing } from '../../../net/messages';
const regions: Record<Region, string> = { na: 'North America', eu: 'Europe', apac: 'Asia-Pacific' };
const modeLabel = (mode: 'coop' | 'competitive') => mode === 'coop' ? 'Co-op' : 'Competitive';
const notices: Record<string, string> = {
  region_capacity: 'This region is full right now. Try another region or wait a moment.',
  room_full: 'That room is full.', room_not_found: 'Room not found. Check the link.',
  room_expired: 'That room has expired.', round_in_progress: 'That round has already started.',
  host_only: 'Only the host can do that.', session_replaced: 'This seat is open in another tab.',
  identity_required: 'Could not confirm your player identity. Reload and try again.',
  identity_expired: 'Could not confirm your player identity. Reload and try again.',
  identity_unavailable: 'Player identity is unavailable. Try again shortly.',
};
const notice = (message: string) => notices[message] ?? (message.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()));
const invite = () => location.pathname.match(/^\/r\/((?:na|eu|apac)_[a-f0-9]{32})$/)?.[1] ?? '';
export default function MultiplayerRoot() {
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
      } catch { if (active) setBoardMessage('Public board unavailable. Invite links may still work.'); }
    };
    void poll(); const timer = setInterval(() => void poll(), 5000);
    return () => { active = false; abort.abort(); clearInterval(timer); };
  }, [open, room, region]);
  const enter = async (target?: string) => {
    setBusy(true); await client.enter(target, region, count, visibility, mode); setBusy(false);
  };
  const leave = () => { client.leave(); setOpen(false); setHandle(''); };
  const host = room?.hostSlot === status.slot;
  const me = room?.members.find(m => m.slot === status.slot);
  const everyoneReady = !!room && room.members.length >= 2 && room.members.every(m => m.connected && m.ready);
  const shareLink = room ? `${location.origin}/r/${room.handle}` : '';
  const createSection = <section className="mp-section" aria-label="Create a room">
    <h3>Create a room</h3>
    <div className="mp-fields">
      <label className="mp-field"><span>Region</span><select className="mp-select" value={region} onChange={e => {
        const value = e.target.value as Region; setRegion(value); try { localStorage.setItem('coop-region', value); } catch { /* optional preference */ }
      }}>{Object.entries(regions).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label className="mp-field"><span>Mode</span><select className="mp-select" value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="coop">Co-op</option><option value="competitive">Competitive</option></select></label>
      <label className="mp-field"><span>Sheep</span><select className="mp-select" value={count} onChange={e => setCount(Number(e.target.value) as 25 | 75 | 200)}>{[25, 75, 200].map(n => <option key={n}>{n}</option>)}</select></label>
      <label className="mp-field"><span>Visibility</span><select className="mp-select" value={visibility} onChange={e => setVisibility(e.target.value as 'private' | 'public')}><option value="private">Invite only</option><option value="public">Public</option></select></label>
    </div>
    <p className="mp-copy">{mode === 'coop' ? 'Everyone herds the same flock into one pen.' : 'One shared flock, one pen each. The highest count wins.'}</p>
  </section>;
  const joinSection = <section className="mp-section" aria-label="Join a room">
    <h3>Join with a link</h3>
    <div className="mp-row">
      <label className="mp-field"><span>Invite link or room</span><input className="mp-input" value={handle} placeholder="Paste a room link" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={e => setHandle(e.target.value)} /></label>
      <button className={`mp-btn${invited ? ' mp-btn--primary' : ''}`} disabled={busy || !ready || !handle} onClick={() => {
        const parsed = handle.match(/(?:na|eu|apac)_[a-f0-9]{32}/)?.[0];
        if (parsed) void enter(parsed); else setBoardMessage('Enter a valid room link.');
      }}>Join room</button>
    </div>
  </section>;
  const boardSection = <section className="mp-section" aria-label="Public rooms">
    <h3>Public rooms · {regions[region]}</h3>
    {boardMessage ? <p className="mp-note" role="status">{boardMessage}</p> : rooms.length === 0 ? <p className="mp-empty">No waiting rooms.</p> : <ul className="mp-rooms">{rooms.map(r => {
      const label = `${r.members[0]?.name ?? 'Room'} · ${modeLabel(r.settings.mode)} · ${r.members.length}/4 · ${r.settings.flockSize} sheep`;
      return <li key={r.handle}><button className="mp-room" aria-label={label} disabled={busy || !ready || r.members.length >= 4} onClick={() => void enter(r.handle)}>
        <span className="mp-room__main"><span className="mp-room__name">{r.members[0]?.name ?? 'Room'}</span><span className="mp-room__meta">{modeLabel(r.settings.mode)} · {r.settings.flockSize} sheep</span></span>
        <span className="mp-room__count">{r.members.length}/4</span>
      </button></li>;
    })}</ul>}
  </section>;
  const title = room?.phase === 'finished' ? 'Round finished' : room?.phase === 'playing' ? 'Multiplayer menu' : 'Multiplayer';
  const sub = historyOpen ? null : !room ? 'Herd together or compete with up to four players.' : null;
  return <>
    <MultiplayerStyles />
    {!open && panel === 'none' ? <Boot /> : null}
    {!open && phase === 'title' ? <button className="herd-button mp-entry" onClick={() => setOpen(true)}>{import.meta.env.MODE === 'coop' ? 'Play multiplayer locally' : 'Play multiplayer'}</button> : null}
    {room?.phase === 'playing' ? <aside className="mp-hud" data-connected={status.connected} aria-live="polite">
      <div className="mp-hud__bar"><span className="mp-hud__dot" aria-hidden="true" /><span className="mp-hud__label">{room.settings.mode === 'competitive' ? 'Competitive' : `Co-op · Player ${status.slot + 1}`}</span><span className="mp-hud__ping">{status.connected ? `${status.rtt ?? '…'} ms` : 'Reconnecting'}</span></div>
      {room.settings.mode === 'competitive' ? <Scoreboard standings={status.standings} unclaimed={status.unclaimed} you={status.slot} /> : null}
      {status.message ? <p>{status.message}</p> : null}
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
          {status.message ? <p className="mp-note" role="status">{notice(status.message)}</p> : null}
          {invited ? <>{joinSection}{createSection}</> : <>{createSection}{joinSection}</>}
          {boardSection}
          {!ready ? <p className="mp-note">The field is loading.</p> : null}
          <button className="mp-btn mp-btn--quiet" onClick={() => setHistoryOpen(true)}>Your multiplayer stats</button>
        </div>
        <footer className="mp-foot">
          <button className="mp-btn mp-btn--quiet" disabled={busy} onClick={() => setOpen(false)}>Back to solo</button>
          <button className="mp-btn mp-btn--primary" disabled={busy || !ready} onClick={() => void enter()}>Create room</button>
        </footer>
      </> : <>
        <div className="mp-body">
          {status.message ? <p className="mp-note" role="status">{notice(status.message)}</p> : null}
          <ul className="mp-chips" aria-label="Room settings">
            <li className="mp-chip">{modeLabel(room.settings.mode)}</li><li className="mp-chip">{regions[room.region]}</li>
            <li className="mp-chip">{room.settings.flockSize} sheep</li><li className="mp-chip">{room.settings.visibility === 'public' ? 'Public' : 'Invite only'}</li>
          </ul>
          <ol className="mp-players" aria-label="Players">{[0, 1, 2, 3].map(slot => {
            const m = room.members.find(x => x.slot === slot);
            if (!m) return room.phase === 'waiting' ? <li key={slot} className="mp-player" data-empty="true"><span className="mp-player__slot" aria-hidden="true">{slot + 1}</span><span className="mp-player__who">Open seat</span></li> : null;
            return <li key={slot} className="mp-player">
              <span className="mp-player__slot" aria-hidden="true">{slot + 1}</span>
              <span className="mp-player__who"><span className="mp-player__name">{m.name}</span><span className="mp-player__role">Player {slot + 1}{slot === room.hostSlot ? ' · host' : ''}{m.slot === status.slot ? ' · you' : ''}</span></span>
              <span className="mp-pill" data-tone={!m.connected ? 'warn' : m.ready ? 'ready' : undefined}>{m.connected ? m.ready ? 'ready' : 'waiting' : 'reconnecting'}</span>
              {host && room.phase === 'waiting' && m.slot !== status.slot ? <button className="mp-btn mp-btn--small mp-btn--quiet" aria-label={`Remove player ${m.slot + 1}`} onClick={() => client.send('remove', m.slot)}>Remove</button> : null}
            </li>;
          })}</ol>
          {room.phase === 'waiting' ? <>
            {host ? <label className="mp-field"><span>Mode</span><select className="mp-select" value={room.settings.mode} disabled={!status.connected} onChange={e => client.send('settings', e.target.value, room.settings.flockSize, room.settings.visibility)}><option value="coop">Co-op</option><option value="competitive">Competitive</option></select></label> : null}
            {room.settings.mode === 'competitive' ? <p className="mp-copy">One shared flock, one pen each. Finish the flock; the highest eligible count wins. Ties share the win. Leaving forfeits your place.</p> : null}
            <div className="mp-row">
              <label className="mp-field"><span>Invite link</span><input className="mp-input" readOnly value={shareLink} onFocus={e => e.target.select()} /></label>
              <button className="mp-btn" onClick={() => { void navigator.clipboard.writeText(shareLink).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? 'Link copied' : 'Copy invite link'}</button>
            </div>
            {!host ? <p className="mp-copy">The host starts when everyone is ready.</p> : null}
          </> : null}
          {room.phase === 'starting' ? <p className="mp-copy">Waiting for everyone’s field to load.</p> : null}
          {room.phase === 'playing' ? <p className="mp-copy">The shared game continues while this menu is open.</p> : null}
          {room.result ? <section className="mp-result" aria-label="Result">
            {room.result.mode === 'competitive' ? <><strong>{room.result.reason === 'no_winner' ? 'No winner' : `${room.result.winners.map(s => `Player ${s + 1}`).join(' and ')} ${room.result.winners.length > 1 ? 'share the win' : 'wins'}${room.result.reason === 'forfeit' ? ' by forfeit' : ''}`}</strong><Scoreboard standings={room.result.standings} unclaimed={room.result.unclaimed} /></> : null}
            <p>{room.result.count} sheep home in {(room.result.tick / 60).toFixed(1)} seconds. {room.result.remaining} of {room.result.started} players finished.</p>
            {host ? null : <p>Waiting for the host to return the party to the lobby.</p>}
          </section> : null}
          {room.result ? <button className="mp-btn mp-btn--quiet" onClick={() => setHistoryOpen(true)}>Your multiplayer stats</button> : null}
        </div>
        <footer className="mp-foot">
          {room.phase === 'waiting' ? <button className={`mp-btn${host ? '' : ' mp-btn--primary'}`} disabled={!status.connected} onClick={() => client.send('ready', !me?.ready)}>{me?.ready ? 'Not ready' : 'Ready'}</button> : null}
          {room.phase === 'waiting' && host ? <button className="mp-btn mp-btn--primary" disabled={!status.connected || !everyoneReady} onClick={() => client.send('start')}>Start {room.settings.mode === 'coop' ? 'co-op' : 'competitive'}</button> : null}
          {room.phase === 'playing' ? <button className="mp-btn mp-btn--primary" onClick={() => useGameStore.getState().resume()}>Resume</button> : null}
          {room.result && host ? <button className="mp-btn mp-btn--primary" onClick={() => client.send('again')}>Return party to lobby</button> : null}
          <button className="mp-btn mp-btn--danger" onClick={leave}>{room.settings.mode === 'competitive' && room.phase === 'playing' ? 'Forfeit and leave' : 'Leave room'}</button>
        </footer>
      </>}
    </dialog>
  </>;
}

function Scoreboard({ standings, unclaimed, you }: { standings: Standing[]; unclaimed: number; you?: number }) {
  const compact = you !== undefined;
  return <ul className="mp-scores" aria-label="Pen scores">{standings.map(s => <li key={s.slot} data-you={s.slot === you}>
    <span>{compact ? s.slot + 1 : `Player ${s.slot + 1}`} · {s.name}{s.forfeited ? ' · forfeited' : ''}</span><span>{s.count}</span>
  </li>)}{unclaimed > 0 ? <li data-muted="true"><span>Unclaimed</span><span>{unclaimed}</span></li> : null}</ul>;
}
