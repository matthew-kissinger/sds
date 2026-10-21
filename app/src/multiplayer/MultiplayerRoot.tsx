// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import { PlayerHistory } from './PlayerHistory';
import { Boot } from '@app/ui/Boot';
import { useGameStore } from '@app/state/store';
import { MultiplayerClient, INITIAL } from './MultiplayerClient';
import type { Region, RoomView, Standing } from '../../../net/messages';
const regions: Record<Region, string> = { na: 'North America', eu: 'Europe', apac: 'Asia-Pacific' };
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
  return <>
    {!open && panel === 'none' ? <Boot /> : null}
    {!open && phase === 'title' ? <button className="herd-button coop-entry" onClick={() => setOpen(true)}>{import.meta.env.MODE === 'coop' ? 'Play multiplayer locally' : 'Play multiplayer'}</button> : null}
    {room?.phase === 'playing' ? <aside className="coop-connection" aria-live="polite">
      <span>{room.settings.mode === 'competitive' ? 'Competitive' : 'Co-op'} · Player {status.slot + 1} · {status.connected ? `${status.rtt ?? '…'} ms` : 'Reconnecting'}</span>
      {room.settings.mode === 'competitive' ? <Scoreboard standings={status.standings} unclaimed={status.unclaimed} /> : null}
      {status.message ? <p>{status.message}</p> : null}
    </aside> : null}
    <dialog ref={dialog} className="coop-dialog" aria-labelledby="coop-title" onCancel={event => event.preventDefault()} onKeyDown={event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      if (historyOpen) { setHistoryOpen(false); return; }
      if (room?.phase === 'playing') useGameStore.getState().resume(); else if (!room) setOpen(false);
    }}>
      <h2 id="coop-title">{room?.phase === 'finished' ? 'Round finished' : room?.phase === 'playing' ? 'Multiplayer menu' : 'Multiplayer'}</h2>
      {status.message ? <p role="status">{status.message.replaceAll('_', ' ')}</p> : null}
      {historyOpen ? <PlayerHistory close={() => setHistoryOpen(false)} /> : !room ? <>
        <button onClick={() => setHistoryOpen(true)}>Your multiplayer stats</button>
        <p>Herd together or compete for the same flock with up to four players. Send an invite link or join a public room.</p>
        <label>Region <select value={region} onChange={e => {
          const value = e.target.value as Region; setRegion(value); try { localStorage.setItem('coop-region', value); } catch { /* optional preference */ }
        }}>{Object.entries(regions).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label>Mode <select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="coop">Co-op</option><option value="competitive">Competitive</option></select></label>
        <label>Sheep <select value={count} onChange={e => setCount(Number(e.target.value) as 25 | 75 | 200)}>{[25, 75, 200].map(n => <option key={n}>{n}</option>)}</select></label>
        <label>Visibility <select value={visibility} onChange={e => setVisibility(e.target.value as 'private' | 'public')}><option value="private">Invite only</option><option value="public">Public</option></select></label>
        <button disabled={busy || !ready} onClick={() => void enter()}>Create room</button>
        <label>Invite link or room <input value={handle} onChange={e => setHandle(e.target.value)} /></label>
        <button disabled={busy || !ready || !handle} onClick={() => {
          const parsed = handle.match(/(?:na|eu|apac)_[a-f0-9]{32}/)?.[0];
          if (parsed) void enter(parsed); else setBoardMessage('Enter a valid room link.');
        }}>Join room</button>
        <h3>Public rooms · {regions[region]}</h3>
        {boardMessage ? <p role="status">{boardMessage}</p> : rooms.length === 0 ? <p>No waiting rooms.</p> : rooms.map(r => <button key={r.handle} disabled={busy || !ready || r.members.length >= 4} onClick={() => void enter(r.handle)}>
          {r.members[0]?.name ?? 'Room'} · {r.settings.mode === 'coop' ? 'Co-op' : 'Competitive'} · {r.members.length}/4 · {r.settings.flockSize} sheep
        </button>)}
        {!ready ? <p>The field is loading.</p> : null}
        <button disabled={busy} onClick={() => setOpen(false)}>Back to solo</button>
      </> : <>
        <p>{room.settings.mode === 'coop' ? 'Co-op' : 'Competitive'} · {regions[room.region]} · {room.settings.flockSize} sheep · {room.settings.visibility === 'public' ? 'Public' : 'Invite only'}</p>
        <ol>{room.members.map(m => <li key={m.slot}>
          Player {m.slot + 1}: {m.name}{m.slot === room.hostSlot ? ' · host' : ''} · {m.connected ? m.ready ? 'ready' : 'waiting' : 'reconnecting'}
          {host && room.phase === 'waiting' && m.slot !== status.slot ? <button onClick={() => client.send('remove', m.slot)}>Remove player {m.slot + 1}</button> : null}
        </li>)}</ol>
        {room.phase === 'waiting' ? <>
          {host ? <label>Mode <select value={room.settings.mode} disabled={!status.connected} onChange={e => client.send('settings', e.target.value, room.settings.flockSize, room.settings.visibility)}><option value="coop">Co-op</option><option value="competitive">Competitive</option></select></label> : null}
          {room.settings.mode === 'competitive' ? <p>One shared flock, one pen each. Finish the flock; the highest eligible count wins. Ties share the win. Leaving forfeits your place.</p> : null}
          <label>Invite link <input readOnly value={`${location.origin}/r/${room.handle}`} onFocus={e => e.target.select()} /></label>
          <button onClick={() => { void navigator.clipboard.writeText(`${location.origin}/r/${room.handle}`).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? 'Link copied' : 'Copy invite link'}</button>
          <button disabled={!status.connected} onClick={() => client.send('ready', !me?.ready)}>{me?.ready ? 'Not ready' : 'Ready'}</button>
          {host ? <button disabled={!status.connected || room.members.length < 2 || !room.members.every(m => m.connected && m.ready)} onClick={() => client.send('start')}>Start {room.settings.mode === 'coop' ? 'co-op' : 'competitive'}</button> : <p>The host starts when everyone is ready.</p>}
        </> : null}
        {room.phase === 'starting' ? <p>Waiting for everyone’s field to load.</p> : null}
        {room.phase === 'playing' ? <><p>The shared game continues while this menu is open.</p><button onClick={() => useGameStore.getState().resume()}>Resume</button></> : null}
        {room.result ? <><button onClick={() => setHistoryOpen(true)}>Your multiplayer stats</button>{room.result.mode === 'competitive' ? <><p>{room.result.reason === 'no_winner' ? 'No winner' : `${room.result.winners.map(s => `Player ${s + 1}`).join(' and ')} ${room.result.winners.length > 1 ? 'share the win' : 'wins'}${room.result.reason === 'forfeit' ? ' by forfeit' : ''}`}</p><Scoreboard standings={room.result.standings} unclaimed={room.result.unclaimed} /></> : null}<p>{room.result.count} sheep home in {(room.result.tick / 60).toFixed(1)} seconds. {room.result.remaining} of {room.result.started} players finished.</p>
          {host ? <button onClick={() => client.send('again')}>Return party to lobby</button> : <p>Waiting for the host to return the party to the lobby.</p>}</> : null}
        <button onClick={leave}>{room.settings.mode === 'competitive' && room.phase === 'playing' ? 'Forfeit and leave' : 'Leave room'}</button>
      </>}
    </dialog>
    <style>{`.coop-entry{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:30}.coop-dialog{color:#273321;background:#f4eddc;border:1px solid #68765c;border-radius:16px;width:min(500px,calc(100vw - 32px));max-height:85dvh;padding:24px;box-sizing:border-box;font:inherit}.coop-dialog::backdrop{background:#12201999}.coop-dialog label{display:block;margin:12px 0}.coop-dialog input{max-width:100%;box-sizing:border-box;width:100%}.coop-dialog button,.coop-dialog select,.coop-dialog input{font:inherit;min-height:44px;padding:8px;margin:4px;border:1px solid #68765c;border-radius:6px}.coop-dialog button{background:#e6e2c8;color:inherit}.coop-dialog button:disabled{opacity:.5}.coop-connection{position:fixed;bottom:90px;left:16px;max-width:calc(100vw - 32px);background:#f4eddcee;padding:8px 12px;border-radius:8px;pointer-events:none;font-size:13px;z-index:12}.coop-connection p{margin:4px 0}@media(max-width:600px){.coop-connection{top:110px;bottom:auto;left:12px;font-size:12px;max-width:calc(50vw - 60px);padding:6px;overflow-wrap:anywhere}}.competitive-scores{list-style:none;padding:0;margin:6px 0;font-variant-numeric:tabular-nums}`}</style>
  </>;
}

function Scoreboard({ standings, unclaimed }: { standings: Standing[]; unclaimed: number }) {
  return <ul className="competitive-scores" aria-label="Pen scores">{standings.map(s => <li key={s.slot}>
    Player {s.slot + 1} · {s.name}: {s.count}{s.forfeited ? ' · forfeited' : ''}
  </li>)}{unclaimed > 0 ? <li>Unclaimed: {unclaimed}</li> : null}</ul>;
}
