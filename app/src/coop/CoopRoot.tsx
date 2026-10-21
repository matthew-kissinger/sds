// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import { Boot } from '@app/ui/Boot';
import { useGameStore } from '@app/state/store';
import { CoopClient, INITIAL } from './CoopClient';
import type { Region, RoomView } from '../../../net/messages';
const regions: Record<Region, string> = { na: 'North America', eu: 'Europe', apac: 'Asia-Pacific' };
const invite = () => location.pathname.match(/^\/r\/((?:na|eu|apac)_[a-f0-9]{32})$/)?.[1] ?? '';
export default function CoopRoot() {
  const [status, setStatus] = useState(INITIAL);
  const [client] = useState(() => new CoopClient(setStatus));
  const [open, setOpen] = useState(location.pathname.startsWith('/r/'));
  const [handle, setHandle] = useState(invite);
  const [region, setRegion] = useState<Region>(() => {
    try { const r = localStorage.getItem('coop-region'); return r === 'eu' || r === 'apac' ? r : 'na'; } catch { return 'na'; }
  });
  const [count, setCount] = useState<25 | 75 | 200>(25);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [rooms, setRooms] = useState<RoomView[]>([]);
  const [boardMessage, setBoardMessage] = useState('');
  const [busy, setBusy] = useState(false);
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
        if (active) { setRooms(board.rooms.filter(r => r.settings.mode === 'coop')); setBoardMessage(''); }
      } catch { if (active) setBoardMessage('Public board unavailable. Invite links may still work.'); }
    };
    void poll(); const timer = setInterval(() => void poll(), 5000);
    return () => { active = false; abort.abort(); clearInterval(timer); };
  }, [open, room, region]);
  const enter = async (target?: string) => {
    setBusy(true); await client.enter(target, region, count, visibility); setBusy(false);
  };
  const leave = () => { client.leave(); setOpen(false); setHandle(''); };
  const host = room?.hostSlot === status.slot;
  const me = room?.members.find(m => m.slot === status.slot);
  return <>
    {!open && panel === 'none' ? <Boot /> : null}
    {!open && phase === 'title' ? <button className="herd-button coop-entry" onClick={() => setOpen(true)}>{import.meta.env.MODE === 'coop' ? 'Play co-op locally' : 'Play co-op'}</button> : null}
    {room?.phase === 'playing' ? <aside className="coop-connection" aria-live="polite">
      <span>Co-op · Player {status.slot + 1} · {status.connected ? `${status.rtt ?? '…'} ms` : 'Reconnecting'}</span>
      {status.message ? <p>{status.message}</p> : null}
    </aside> : null}
    <dialog ref={dialog} className="coop-dialog" aria-labelledby="coop-title" onCancel={event => event.preventDefault()} onKeyDown={event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      if (room?.phase === 'playing') useGameStore.getState().resume(); else if (!room) setOpen(false);
    }}>
      <h2 id="coop-title">{room?.phase === 'finished' ? 'Flock home' : room?.phase === 'playing' ? 'Co-op menu' : 'Co-op'}</h2>
      {status.message ? <p role="status">{status.message.replaceAll('_', ' ')}</p> : null}
      {!room ? <>
        <p>Herd together with up to four players. Send an invite link or join a public room.</p>
        <label>Region <select value={region} onChange={e => {
          const value = e.target.value as Region; setRegion(value); try { localStorage.setItem('coop-region', value); } catch { /* optional preference */ }
        }}>{Object.entries(regions).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label>Sheep <select value={count} onChange={e => setCount(Number(e.target.value) as 25 | 75 | 200)}>{[25, 75, 200].map(n => <option key={n}>{n}</option>)}</select></label>
        <label>Visibility <select value={visibility} onChange={e => setVisibility(e.target.value as 'private' | 'public')}><option value="private">Invite only</option><option value="public">Public</option></select></label>
        <button disabled={busy || !ready} onClick={() => void enter()}>Create co-op room</button>
        <label>Invite link or room <input value={handle} onChange={e => setHandle(e.target.value)} /></label>
        <button disabled={busy || !ready || !handle} onClick={() => {
          const parsed = handle.match(/(?:na|eu|apac)_[a-f0-9]{32}/)?.[0];
          if (parsed) void enter(parsed); else setBoardMessage('Enter a valid room link.');
        }}>Join room</button>
        <h3>Public rooms · {regions[region]}</h3>
        {boardMessage ? <p role="status">{boardMessage}</p> : rooms.length === 0 ? <p>No waiting co-op rooms.</p> : rooms.map(r => <button key={r.handle} disabled={busy || !ready || r.members.length >= 4} onClick={() => void enter(r.handle)}>
          {r.members[0]?.name ?? 'Co-op'} · {r.members.length}/4 · {r.settings.flockSize} sheep
        </button>)}
        {!ready ? <p>The field is loading.</p> : null}
        <button disabled={busy} onClick={() => setOpen(false)}>Back to solo</button>
      </> : <>
        <p>{regions[room.region]} · {room.settings.flockSize} sheep · {room.settings.visibility === 'public' ? 'Public' : 'Invite only'}</p>
        <ol>{room.members.map(m => <li key={m.slot}>
          Player {m.slot + 1}: {m.name}{m.slot === room.hostSlot ? ' · host' : ''} · {m.connected ? m.ready ? 'ready' : 'waiting' : 'reconnecting'}
          {host && room.phase === 'waiting' && m.slot !== status.slot ? <button onClick={() => client.send('remove', m.slot)}>Remove player {m.slot + 1}</button> : null}
        </li>)}</ol>
        {room.phase === 'waiting' ? <>
          <label>Invite link <input readOnly value={`${location.origin}/r/${room.handle}`} onFocus={e => e.target.select()} /></label>
          <button onClick={() => { void navigator.clipboard.writeText(`${location.origin}/r/${room.handle}`).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? 'Link copied' : 'Copy invite link'}</button>
          <button disabled={!status.connected} onClick={() => client.send('ready', !me?.ready)}>{me?.ready ? 'Not ready' : 'Ready'}</button>
          {host ? <button disabled={!status.connected || room.members.length < 2 || !room.members.every(m => m.connected && m.ready)} onClick={() => client.send('start')}>Start co-op</button> : <p>The host starts when everyone is ready.</p>}
        </> : null}
        {room.phase === 'starting' ? <p>Waiting for everyone’s field to load.</p> : null}
        {room.phase === 'playing' ? <><p>The shared game continues while this menu is open.</p><button onClick={() => useGameStore.getState().resume()}>Resume</button></> : null}
        {room.result ? <><p>{room.result.count} sheep home in {(room.result.tick / 60).toFixed(1)} seconds. {room.result.remaining} of {room.result.started} players finished.</p>
          {host ? <button onClick={() => client.send('again')}>Return party to lobby</button> : <p>Waiting for the host to return the party to the lobby.</p>}</> : null}
        <button onClick={leave}>Leave room</button>
      </>}
    </dialog>
    <style>{`.coop-entry{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:30}.coop-dialog{color:#273321;background:#f4eddc;border:1px solid #68765c;border-radius:16px;width:min(500px,calc(100vw - 32px));max-height:85dvh;padding:24px;box-sizing:border-box;font:inherit}.coop-dialog::backdrop{background:#12201999}.coop-dialog label{display:block;margin:12px 0}.coop-dialog input{max-width:100%;box-sizing:border-box;width:100%}.coop-dialog button,.coop-dialog select,.coop-dialog input{font:inherit;min-height:44px;padding:8px;margin:4px;border:1px solid #68765c;border-radius:6px}.coop-dialog button{background:#e6e2c8;color:inherit}.coop-dialog button:disabled{opacity:.5}.coop-connection{position:fixed;bottom:90px;left:16px;max-width:calc(100vw - 32px);background:#f4eddcee;padding:8px 12px;border-radius:8px;pointer-events:none;font-size:13px;z-index:12}.coop-connection p{margin:4px 0}`}</style>
  </>;
}
