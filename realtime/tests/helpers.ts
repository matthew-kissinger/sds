// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from 'cloudflare:workers';
import type { MatchFrame } from '../../net/messages';
import { decode } from '@msgpack/msgpack';
import { signJwt } from '../../worker/src/jwt';
import worker from '../index';
import type { RealtimeEnv } from '../bindings';
import { packet } from '../protocol';
import { randomKey } from '../regions';
import type { publicRoom, Settings } from '../roomState';
export const bindings = env as unknown as RealtimeEnv & { IDENTITY_DB: D1Database };
export const ORIGIN = 'http://localhost:5199';
export const SECRET = 'local-test-secret-not-a-production-credential';
export const DEFAULT: Settings = { mode: 'coop', flockSize: 25, visibility: 'public' };
export type Admission = { handle: string; ticket: string; slot: number; expiresAt: number };
export type View = ReturnType<typeof publicRoom> & { type: 'room' };
export async function register(id: string) {
  await bindings.IDENTITY_DB.exec('CREATE TABLE IF NOT EXISTS players (persistent_id TEXT PRIMARY KEY, display_name TEXT NOT NULL)');
  await bindings.IDENTITY_DB.prepare('INSERT OR IGNORE INTO players VALUES (?, ?)').bind(id, `Dog ${id}`).run();
  return signJwt({ persistent_id: id }, SECRET);
}
export async function request(path: string, token?: string, body?: unknown, extra: Record<string, string> = {}) {
  return worker.fetch(new Request(`http://localhost:5199${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: ORIGIN, 'CF-Connecting-IP': randomKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), bindings);
}
export async function create(token: string, region = 'na', config = DEFAULT, key = randomKey()): Promise<Admission> {
  const response = await request('/r/rooms', token, { region, settings: config }, { 'Idempotency-Key': key });
  if (response.status !== 201) throw new Error(`create ${response.status}: ${await response.text()}`);
  return response.json();
}
export async function join(handle: string, token: string): Promise<Admission> {
  const response = await request(`/r/${handle}/join`, token, {});
  if (!response.ok) throw new Error(`join ${response.status}: ${await response.text()}`);
  return response.json();
}
export const clients: Client[] = [];
export class Client {
  seq = 0;
  frames: View[] = [];
  snapshots: MatchFrame[] = [];
  private wake: (() => void) | null = null;
  constructor(public socket: WebSocket, autoAck: boolean) {
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('message', event => {
      const frame = decode(new Uint8Array(event.data as ArrayBuffer)) as View | MatchFrame;
      if (frame.type === 'snapshot') {
        this.snapshots.push(frame);
        if (autoAck) this.send('seen', frame.round, frame.tick);
        this.wake?.();
      }
      if (frame.type === 'room') {
        this.frames.push(frame);
        if (autoAck) this.send('ack', frame.revision);
        this.wake?.();
      }
    });
    socket.accept(); clients.push(this);
  }
  send(type: string, ...args: unknown[]) { if (this.socket.readyState !== WebSocket.OPEN) return; this.socket.send(packet([3, type, this.seq++, ...args])); }
  async snapshotUntil(predicate: (frame: MatchFrame) => boolean): Promise<MatchFrame> {
    const end = Date.now() + 4000;
    for (;;) {
      const found = this.snapshots.find(predicate); if (found) return found;
      if (Date.now() >= end) throw new Error('Snapshot timeout');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  async until(predicate: (view: View) => boolean): Promise<View> {
    const end = Date.now() + 3000;
    for (;;) {
      const found = [...this.frames].reverse().find(predicate); if (found) return found;
      if (Date.now() >= end) throw new Error(`Frame timeout: ${JSON.stringify(this.frames.at(-1))}`);
      await new Promise<void>(resolve => { const t = setTimeout(resolve, 20); this.wake = () => { clearTimeout(t); resolve(); }; });
    }
  }
}
export async function connect(admission: Admission, autoAck = true): Promise<Client> {
  const response = await request(`/r/${admission.handle}/ws?ticket=${admission.ticket}&v=3`, undefined, undefined, { Upgrade: 'websocket' });
  if (!response.webSocket) throw new Error(`upgrade ${response.status}: ${await response.text()}`);
  return new Client(response.webSocket, autoAck);
}
export function roomStub(handle: string) { return bindings.ROOMS.get(bindings.ROOMS.idFromName(handle)); }
