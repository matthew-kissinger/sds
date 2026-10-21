// SPDX-License-Identifier: AGPL-3.0-or-later
// Normal protocol clients herd via inputs. No server state mutation or teleport.
import WebSocket from 'ws';
import { encode, decode } from '@msgpack/msgpack';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const compiled = await build({ stdin: { contents: `export { createHerdingDriver } from './tests/helpers/herding-driver';
  export { createSimState } from './sim/state'; export { HOME_FIELD } from './sim/field';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'node' });
const { createHerdingDriver, createSimState, HOME_FIELD } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const origin = 'http://localhost:5198';
async function post(path, body, token, key) {
  const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin,
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path.split('/').at(-1)}: ${response.status} ${await response.text()}`);
  return response.json();
}
const sockets = []; let timer; let progress;
async function connect(a) {
  const socket = new WebSocket(`${origin.replace('http', 'ws')}/r/${a.handle}/ws?ticket=${a.ticket}&v=3`, { origin });
  const client = { socket, room: null, snapshot: null, seq: 0, errors: [], send(type, ...args) {
    if (socket.readyState === WebSocket.OPEN) socket.send(encode([3, type, this.seq++, ...args]));
  } };
  sockets.push(client);
  socket.on('message', bytes => {
    const frame = decode(bytes);
    if (frame.type === 'room') { client.room = frame; client.send('ack', frame.revision); if (frame.phase === 'starting') client.send('loaded', frame.round); }
    if (frame.type === 'snapshot') { client.snapshot = frame; client.send('seen', frame.round, frame.tick); }
    if (frame.type === 'error' && frame.code !== 'stale_round') client.errors.push(frame.code);
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); }); return client;
}
async function until(predicate, timeout = 10000) {
  const end = Date.now() + timeout;
  while (!predicate()) { if (Date.now() >= end) throw new Error('Protocol condition timed out'); await new Promise(r => setTimeout(r, 25)); }
}
try {
  const identity = await post('/api/register', {}), guest = await post('/api/register', {});
  const a = await post('/r/rooms', { region: 'na', settings: { mode: 'coop', flockSize: 25, visibility: 'private' } }, identity.token, crypto.randomUUID().replaceAll('-', ''));
  const host = await connect(a), peer = await connect(await post(`/r/${a.handle}/join`, {}, guest.token));
  await until(() => host.room?.members.length === 2);
  host.send('ready', true); peer.send('ready', true); await until(() => host.room.members.every(m => m.ready)); host.send('start');
  await until(() => host.snapshot?.tick >= 1);
  const round = host.room.round, state = createSimState(HOME_FIELD, 25, 0, [0, 1]), drive = createHerdingDriver();
  timer = setInterval(() => {
    const frame = host.snapshot; if (host.room.phase !== 'playing') return;
    state.tick = frame.tick;
    frame.dogs.forEach((d, i) => { state.dogs[i].position.set(d.x, d.z); state.dogs[i].velocity.set(d.vx, d.vz); state.dogs[i].stamina = d.stamina; });
    state.sheep.forEach((s, i) => { s.position.set(frame.sheep[i * 4], frame.sheep[i * 4 + 1]); s.state = frame.sheep[i * 4 + 3] === 0 ? 'active' : 'penned'; });
    const input = drive(state); host.send('input', round, input.direction.x, input.direction.z, input.sprint, 0);
  }, 1000 / 30);
  console.log('Herding through the live local protocol, bounded to 300 seconds.');
  progress = setInterval(() => console.log(JSON.stringify({ tick: host.snapshot?.tick, penned: host.snapshot?.count, dogs: host.snapshot?.dogs.map(d => ({slot:d.slot,x:d.x,z:d.z,ack:d.ack})), errors: host.errors })), 10000);
  await until(() => host.room.phase === 'finished' || host.room.interruption, 300000);
  clearInterval(timer);
  assert.equal(host.room.phase, 'finished', host.room.interruption);
  await until(() => peer.room.phase === 'finished');
  assert.equal(host.room.result.count, 25); assert.deepEqual(peer.room.result, host.room.result);
  const result = host.room.result;
  host.send('again'); await until(() => host.room.phase === 'waiting' && peer.room.phase === 'waiting');
  assert(host.room.members.every(m => !m.ready)); assert.equal(host.room.result, null);
  host.send('ready', true); peer.send('ready', true); await until(() => host.room.members.every(m => m.ready)); host.send('start');
  await until(() => host.room.phase === 'playing' && host.room.round !== round);
  assert.equal(host.errors.length + peer.errors.length, 0);
  await mkdir('captures/multiplayer/local-coop', { recursive: true });
  await writeFile('captures/multiplayer/local-coop/round.json', JSON.stringify({ functionalOnly: true, result, sameResult: true, rematch: true, normalProtocolOnly: true }, null, 2));
  console.log(`PASS: ${result.count} sheep, ${result.tick} ticks; agreed result and fresh rematch.`);
} finally { clearInterval(timer); clearInterval(progress); for (const c of sockets) { c.send('leave'); c.socket.close(); } }
