// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, it } from 'vitest';
import { decode } from '@msgpack/msgpack';
import { reset, runInDurableObject, evictDurableObject } from 'cloudflare:test';
import { bindings, clients, connect, create, DEFAULT, join, register, request, roomStub } from './helpers';
import { saveMatch, type MatchRecord } from '../matchStore';
import type { RoomState } from '../roomState';
import type { RoomHistory } from '../RoomHistory';
import type { PlayerHistory, OwnerStats } from '../../net/stats';

afterEach(async () => { for (const c of clients.splice(0)) c.socket.close(1000,'done'); await reset(); });
const db = () => bindings.MATCH_DB!;
const owner = () => request('/r/stats/owner','local-owner-key-for-tests-only-00000000');
async function flush(handle: string) {
  await runInDurableObject(roomStub(handle), instance => (instance as unknown as { history: RoomHistory }).history.flush());
}
async function start(mode: 'coop' | 'competitive' = 'competitive') {
  const hostToken = await register('host'), guestToken = await register('guest');
  const admission = await create(hostToken,'na',{ ...DEFAULT,mode });
  const host = await connect(admission), guest = await connect(await join(admission.handle,guestToken));
  host.send('ready',true); guest.send('ready',true);
  await host.until(r=>r.members.length===2 && r.members.every(m=>m.ready));
  host.send('start'); const room = await host.until(r=>r.phase==='starting');
  host.send('loaded',room.round); guest.send('loaded',room.round);
  await host.until(r=>r.phase==='playing');
  return { admission,host,guest,hostToken,guestToken };
}
it('exports departed players, preserves forfeit wins across rematch/eviction and deduplicates retries', async () => {
  const { admission,host,guest,hostToken,guestToken } = await start();
  guest.send('leave'); const finished = await host.until(r=>r.phase==='finished');
  await flush(admission.handle); await flush(admission.handle);
  let value = await (await request('/r/stats/me',guestToken)).json<PlayerHistory>();
  expect(value.matches).toHaveLength(1); expect(value.stats[0]).toMatchObject({ matches:1,forfeits:1,forfeitWins:0 });
  expect(value.matches[0]!.players).toHaveLength(2);
  expect(JSON.stringify(value)).not.toContain('player_id'); expect(JSON.stringify(value)).not.toContain('identities');
  host.send('again'); await host.until(r=>r.phase==='waiting' && r.result===null);
  await evictDurableObject(roomStub(admission.handle));
  value = await (await request('/r/stats/me',hostToken)).json<PlayerHistory>();
  expect(value.stats[0]).toMatchObject({ matches:1,wins:0,sharedWins:0,forfeitWins:1 });
  expect(value.matches[0]!.id).toBe(finished.round);
  expect((await db().prepare('SELECT COUNT(*) n FROM matches').first<{n:number}>())!.n).toBe(1);
});
it('retains an outbox through database failure and actual eviction, then exports an interruption', async () => {
  const { admission,hostToken } = await start('coop');
  await db().exec('DROP TABLE participants');
  await flush(admission.handle); // Failed batch rolls back the match too.
  expect((await db().prepare('SELECT COUNT(*) n FROM matches').first<{n:number}>())!.n).toBe(0);
  await runInDurableObject(roomStub(admission.handle), instance => clearInterval((instance as unknown as {timer:ReturnType<typeof setInterval>}).timer));
  await evictDurableObject(roomStub(admission.handle));
  await roomStub(admission.handle).inspect();
  const env = bindings as unknown as { MATCH_SCHEMA: string };
  await db().exec(env.MATCH_SCHEMA.replace(/^\s*--.*$/gm,'').replace(/\r?\n/g,' '));
  await runInDurableObject(roomStub(admission.handle), instance => { (instance as unknown as {history:{retryAt:number}}).history.retryAt=0; });
  await flush(admission.handle);
  const value = await (await request('/r/stats/me',hostToken)).json<PlayerHistory>();
  expect(value.matches[0]).toMatchObject({ status:'interrupted',reason:'server_restart',ticks:null,count:null });
  expect(value.stats[0]).toMatchObject({ matches:1,completed:0,interruptions:1 });
});
it('counts a transport loss and rejoin once without changing the round roster', async () => {
  const { admission,host,guest,guestToken } = await start();
  guest.socket.close(1000,'network'); await host.until(r=>r.members.some(m=>!m.connected));
  const peer = await connect(await join(admission.handle,guestToken));
  await host.until(r=>r.members.every(m=>m.connected)); peer.send('leave');
  await host.until(r=>r.phase==='finished'); await flush(admission.handle);
  const value = await (await request('/r/stats/me',guestToken)).json<PlayerHistory>();
  expect(value.matches[0]!.players.find(p=>p.slot===1)).toMatchObject({ disconnects:1,reconnects:1,forfeited:true });
});
it.each(['coop','competitive'] as const)('retains %s history through expiry and cleanup without false player forfeits',async mode=>{
  const {admission,hostToken}=await start(mode);
  await runInDurableObject(roomStub(admission.handle),async instance=>{
    const live=instance as unknown as {room:RoomState;timer:ReturnType<typeof setInterval>;change:(fn:(r:RoomState)=>void)=>Promise<void>};
    clearInterval(live.timer);live.room.expiresAt=Date.now()-1;await live.change(()=>{});
  });
  await runInDurableObject(roomStub(admission.handle),async (_instance,state)=>{
    expect(await state.storage.get('room')).toBeDefined(); // Pending export prevents cleanup.
  });
  await flush(admission.handle);
  await runInDurableObject(roomStub(admission.handle),instance=>instance.alarm());
  await runInDurableObject(roomStub(admission.handle),async (_instance,state)=>expect(await state.storage.get('room')).toBeUndefined());
  const value=await (await request('/r/stats/me',hostToken)).json<PlayerHistory>();
  expect(value.matches[0]).toMatchObject({status:'interrupted',reason:'room_expired'});
  expect(value.stats[0]).toMatchObject({matches:1,interruptions:1,forfeits:0,wins:0,forfeitWins:0,completed:0});
});
it('preserves co-op team results without crediting a departed player with completion or individual sheep', async () => {
  const { admission,hostToken,guestToken } = await start('coop');
  await runInDurableObject(roomStub(admission.handle), async instance => {
    const live = instance as unknown as { room: RoomState; timer: ReturnType<typeof setInterval>; change: (fn:(r:RoomState)=>void)=>Promise<void> };
    clearInterval(live.timer);
    await live.change(r=>{r.members=r.members.slice(0,1);});
    await live.change(r=>{r.phase='finished';r.result={mode:'coop',reason:'flock',tick:600,count:25,started:2,remaining:1,standings:[],unclaimed:0,winners:[]};});
  });
  await flush(admission.handle);
  const host = await (await request('/r/stats/me',hostToken)).json<PlayerHistory>();
  const guest = await (await request('/r/stats/me',guestToken)).json<PlayerHistory>();
  expect(host.stats[0]).toMatchObject({ completed:1,sheep:0 });
  expect(guest.stats[0]).toMatchObject({ completed:0,forfeits:1 });
  expect(host.matches[0]).toMatchObject({ count:25,ticks:600,partySize:2 });
});
function record(id: string, at=Date.now()): MatchRecord {
  return { id,revision:2,region:'na',mode:'competitive',flockSize:25,visibility:'private',rules:'competitive-1',partySize:2,
    createdAt:at,startedAt:at,endedAt:at+1000,status:'finished',reason:'flock',ticks:60,count:25,unclaimed:1,waitMs:3000,
    identities:['host','guest'],players:[0,1].map(slot=>({slot,name:`Player ${slot}`,count:12,forfeited:false,outcome:'shared',disconnects:0,reconnects:0})) };
}
it('refuses another start at the bounded export backlog without destroying the waiting party',async()=>{
  const admission=await create(await register('host'));
  const host=await connect(admission),guest=await connect(await join(admission.handle,await register('guest')));
  host.send('ready',true);guest.send('ready',true);await host.until(r=>r.members.length===2&&r.members.every(m=>m.ready));
  await runInDurableObject(roomStub(admission.handle),instance=>{
    const pending=(instance as unknown as {history:{pending:Map<string,MatchRecord>}}).history.pending;
    for(let i=0;i<64;i++){const id=i.toString(16).padStart(32,'0');pending.set('match-outbox:'+id,record(id));}
  });
  const error=new Promise<string>(resolve=>host.socket.addEventListener('message',event=>{
    const frame=decode(new Uint8Array(event.data as ArrayBuffer)) as {type:string;code:string};
    if(frame.type==='error')resolve(frame.code);
  }));
  host.send('start');expect(await error).toBe('history_backlog');
  const response=await request(`/r/${admission.handle}/status`);
  expect(await response.json()).toMatchObject({phase:'waiting',occupancy:2});
});
it('rejects stale result writes, separates shared wins, paginates equal timestamps and hides other histories', async () => {
  const token = await register('host'), at=Date.now();
  for(let i=0;i<22;i++) await saveMatch(db(),record(i.toString(16).padStart(32,'0'),at));
  const stale = record('0'.repeat(32),at);stale.revision=1;stale.status='playing';stale.players[0]!.outcome='none';
  await saveMatch(db(),stale);
  const first = await (await request('/r/stats/me',token)).json<PlayerHistory>();
  const second = await (await request(`/r/stats/me?before=${first.next}`,token)).json<PlayerHistory>();
  expect(first.matches).toHaveLength(20);expect(second.matches).toHaveLength(2);
  expect(new Set([...first.matches,...second.matches].map(m=>m.id)).size).toBe(22);
  expect(first.stats[0]).toMatchObject({ matches:22,sharedWins:22,wins:0,sheep:264 });
  const dashboard=await (await owner()).json<OwnerStats>();
  expect(dashboard.groups).toEqual([{region:'na',mode:'competitive',attempts:22,started:22,finished:22,
    interrupted:0,abandoned:0,active:0,averageWaitMs:3000,players:2,disconnects:0,reconnects:0}]);
  expect(dashboard.recent).toHaveLength(22);expect(JSON.stringify(dashboard)).not.toContain('identities');
  const stranger = await (await request('/r/stats/me',await register('stranger'))).json<PlayerHistory>();
  expect(stranger.matches).toHaveLength(0);
  expect((await request('/r/stats/me?player=host',token)).status).toBe(400);
});
it('protects owner data independently of player auth, bounds queries, and exports capacity counts', async () => {
  const token = await register('host');
  expect((await request('/r/stats/owner',token)).status).toBe(401);
  expect((await request('/r/stats/me')).status).toBe(401);
  expect((await request('/r/stats/owner?days=999','local-owner-key-for-tests-only-00000000')).status).toBe(400);
  const old=bindings.ROOM_CAPS;
  try { bindings.ROOM_CAPS={na:0,eu:0,apac:0};await expect(create(token)).rejects.toThrow('region_capacity'); }
  finally { bindings.ROOM_CAPS=old; }
  await runInDurableObject(bindings.LOBBIES.get(bindings.LOBBIES.idFromName('na')), instance=>instance.alarm());
  await runInDurableObject(bindings.LOBBIES.get(bindings.LOBBIES.idFromName('na')), instance=>instance.alarm());
  const response=await owner();expect(response.headers.get('Cache-Control')).toBe('no-store');
  const value=await response.json<OwnerStats>();expect(value.capacity).toEqual([{region:'na',rejected:1}]);
  const oldKey=bindings.OWNER_STATS_TOKEN;try {bindings.OWNER_STATS_TOKEN='';expect((await owner()).status).toBe(503);} finally {bindings.OWNER_STATS_TOKEN=oldKey;}
});
