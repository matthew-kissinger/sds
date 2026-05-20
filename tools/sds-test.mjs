import { WebSocket } from 'ws';
import { encode, decode } from '@msgpack/msgpack';

const BASE = 'https://sds-worker.matt-m-kissinger.workers.dev';

(async () => {
  const reg = await fetch(`${BASE}/api/register`, {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({persistent_id: 'tail-test-' + Date.now(), display_name: 'TailHost', name_type: 'custom'})
  }).then(r=>r.json());
  const token = reg.token;
  const create = await fetch(`${BASE}/api/rooms`, {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({token, playerName:'TailHost', dogType:'jep', roomSettings:{maxPlayers:2, isPublic:false, gameMode:'cooperative'}})
  }).then(r=>r.json());
  console.log('[test] ROOM:', create.roomCode, 'PLAYERID:', create.playerId);

  const ws = new WebSocket(`wss://sds-worker.matt-m-kissinger.workers.dev/r/${create.roomCode}/ws?playerId=${create.playerId}`);
  ws.binaryType = 'arraybuffer';
  let stateFrames = 0;
  let firstState = null;
  ws.on('open', () => {
    console.log('[test] WS OPEN');
    setTimeout(() => { console.log('[test] SENDING startGame'); ws.send(encode({t:'startGame'})); }, 800);
  });
  ws.on('message', (buf) => {
    const msg = decode(new Uint8Array(buf));
    if (msg.t === 'gameStateUpdate') {
      stateFrames++;
      if (!firstState) { firstState = msg; console.log('[test] FIRST STATE sheep=' + (msg.sheep?.length || 0) + ' dogs=' + (msg.sheepdogs?.length || 0)); }
      if (stateFrames % 60 === 0) console.log('[test] STATE FRAME #' + stateFrames);
    } else {
      console.log('[test] RECV t=' + msg.t);
      if (msg.t === 'gameStarted') console.log('  snapshot sheep=' + (msg.gameState?.sheep?.length || 0));
      if (msg.t === 'roomError' || msg.t === 'error') console.log('  msg=' + msg.message);
    }
  });
  ws.on('close', (c, r) => console.log('[test] WS CLOSE', c, String(r)));
  ws.on('error', (e) => console.log('[test] WS ERR', e.message));
  setTimeout(() => { console.log(`[test] END: totalStateFrames=${stateFrames}`); ws.close(); process.exit(0); }, 6000);
})().catch(e => { console.error('[test] fatal', e); process.exit(1); });
