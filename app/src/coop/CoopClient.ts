// SPDX-License-Identifier: AGPL-3.0-or-later
import { decode, encode } from '@msgpack/msgpack';
import { useGameStore } from '@app/state/store';
import { scoresController } from '@app/scores/controller';
import { PROTOCOL, type MatchFrame, type Region, type RoomView } from '../../../net/messages';
import { RemoteView } from './RemoteView';

export interface CoopStatus { room: RoomView | null; slot: number; message: string; connected: boolean; rtt: number | null }
export const INITIAL: CoopStatus = { room: null, slot: -1, message: '', connected: false, rtt: null };
type Admission = { handle: string; slot: number; ticket: string };
/** Component-owned connection. Credentials stay in the identity controller. */
export class CoopClient {
  status: CoopStatus = INITIAL;
  private socket: WebSocket | null = null;
  private view: RemoteView | null = null;
  private seq = 0;
  private generation = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private pingAt = 0;
  private lastMessage = 0;
  private pending: MatchFrame | null = null;
  private loaded = '';
  private handle = '';
  private reconnectUntil = 0;
  private createKey = '';
  constructor(private update: (status: CoopStatus) => void) {}
  private patch(patch: Partial<CoopStatus>) { this.status = { ...this.status, ...patch }; this.update(this.status); }
  private async admit(path: string, body: unknown, key?: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await scoresController.roomToken(attempt === 1);
      if (!token) throw new Error('Identity unavailable. Try again.');
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`, ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) });
      const value = await response.json();
      if (response.status === 401 && value.error === 'identity_expired' && attempt === 0) continue;
      if (!response.ok) throw new Error(value.error ?? 'Service unavailable');
      return value as Admission;
    }
    throw new Error('Identity unavailable');
  }
  async enter(handle?: string, region: Region = 'na', count = 25, visibility = 'private') {
    const generation = ++this.generation;
    this.patch({ message: 'Connecting…' });
    try {
      if (!this.createKey) this.createKey = crypto.randomUUID().replaceAll('-', '');
      const admission = await this.admit(handle ? `/r/${handle}/join` : '/r/rooms',
        handle ? {} : { region, settings: { mode: 'coop', flockSize: count, visibility } }, handle ? undefined : this.createKey);
      if (generation !== this.generation) return;
      this.createKey = ''; this.handle = admission.handle;
      history.replaceState(null, '', `/r/${admission.handle}${location.search}`);
      this.connect(admission, generation);
    } catch (error) { if (generation === this.generation) this.patch({ message: String(error instanceof Error ? error.message : error) }); }
  }
  private connect(admission: Admission, generation: number) {
    this.seq = 0; this.loaded = ''; this.pending = null;
    this.patch({ slot: admission.slot });
    const url = new URL(`/r/${admission.handle}/ws`, location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', admission.ticket); url.searchParams.set('v', String(PROTOCOL));
    const socket = new WebSocket(url); this.socket = socket; socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      if (generation !== this.generation) { socket.close(); return; }
      this.lastMessage = performance.now(); this.patch({ connected: true, message: '' });
      this.heartbeat = setInterval(() => {
        if (performance.now() - this.lastMessage > 5000) { socket.close(4000, 'connection_stale'); return; }
        this.pingAt = performance.now(); this.send('ping'); this.assetsReady();
      }, 1000);
    };
    socket.onmessage = event => {
      if (generation !== this.generation || this.socket !== socket) return;
      try {
        if (!(event.data instanceof ArrayBuffer) || event.data.byteLength > 64 * 1024) throw new Error('Invalid server frame');
        const frame = decode(new Uint8Array(event.data), { maxArrayLength: 1000, maxMapLength: 32,
          maxStrLength: 256, maxBinLength: 0, maxExtLength: 0 }) as RoomView | MatchFrame | { type: 'pong' | 'error'; protocol: number; code?: string };
        if (frame.protocol !== PROTOCOL) throw new Error('Protocol mismatch');
        this.lastMessage = performance.now();
        if (frame.type === 'room') {
          this.send('ack', frame.revision);
          if (this.status.room?.handle === frame.handle && frame.revision < this.status.room.revision) return;
          if (!frame.members.some(m => m.slot === this.status.slot) || frame.phase === 'closed') {
            this.leave('You have left this room.'); return;
          }
          this.patch({ room: frame, message: frame.interruption ? `Match interrupted: ${frame.interruption.replaceAll('_', ' ')}` : '' });
          if (frame.phase === 'waiting') {
            this.loaded = ''; this.view = null; this.pending = null;
            if (!useGameStore.getState().sim.authoritative) useGameStore.getState().reset();
          }
          this.assetsReady();
          if (this.pending && frame.phase === 'playing') this.snapshot(this.pending);
          if (frame.phase === 'finished' && frame.result) {
            if (this.view) this.view.enabled = false;
            if (this.view) useGameStore.setState({ gamePhase: 'complete', uiPanel: 'none', completionTick: frame.result.tick,
              completionTimeMs: frame.result.tick * 1000 / 60, pennedCount: frame.result.count });
          }
        } else if (frame.type === 'snapshot') this.snapshot(frame);
        else if (frame.type === 'pong') this.patch({ rtt: Math.round(performance.now() - this.pingAt) });
        else this.patch({ message: frame.code?.replaceAll('_', ' ') ?? 'Request unavailable' });
      } catch { this.leave('Incompatible server data. Reload the local client before joining again.'); }
    };
    socket.onclose = event => {
      if (generation !== this.generation || this.socket !== socket) return;
      if (this.heartbeat) clearInterval(this.heartbeat); this.heartbeat = null;
      this.socket = null; if (this.view) this.view.enabled = false;
      this.patch({ connected: false, message: 'Reconnecting… Your seat is reserved for 15 seconds.' });
      if (event.reason === 'session_ended') { this.leave('Your seat is no longer available.'); return; }
      if (event.reason === 'session_replaced') { this.leave('This identity joined in another tab. Use a separate browser profile for another player.'); return; }
      this.reconnectUntil = Date.now() + 15_000;
      this.reconnect(generation);
    };
  }
  private reconnect(generation: number) {
    this.retry = setTimeout(() => {
      void this.admit(`/r/${this.handle}/join`, {}).then(admission => {
        if (generation !== this.generation) return;
        this.view = null; this.connect(admission, generation);
      }).catch(error => {
        if (generation !== this.generation) return;
        if (Date.now() < this.reconnectUntil) this.reconnect(generation);
        else this.leave(`Could not reconnect: ${error instanceof Error ? error.message : 'seat expired'}`);
      });
    }, 750);
  }
  assetsReady() {
    const room = this.status.room;
    if (room?.phase === 'starting' && room.round && room.round !== this.loaded && useGameStore.getState().sceneReady && this.status.connected) {
      this.loaded = room.round; this.send('loaded', room.round);
    }
  }
  private snapshot(frame: MatchFrame) {
    const room = this.status.room;
    if (!room || room.phase !== 'playing') { this.pending = frame; return; }
    this.pending = null;
    if (frame.round !== room.round || frame.rules !== 'coop-1' || frame.basis !== null
      || frame.sheep.length !== room.settings.flockSize * 4 || frame.dogs.length < 1 || frame.dogs.length > 4
      || !frame.dogs.some(d => d.slot === this.status.slot) || frame.sheep.some(n => !Number.isFinite(n))) throw new Error('Invalid snapshot');
    this.send('seen', frame.round, frame.tick);
    const roster = frame.dogs.map(d => d.slot).sort().join();
    if (!this.view || this.view.state.dogs.map(d => d.id).sort().join() !== roster) {
      this.view = new RemoteView(frame, this.status.slot, (input, bark) => this.send('input', frame.round,
        input.direction.x, input.direction.z, input.sprint, bark), b => useGameStore.getState().barkAccepted(b), this.view?.barkId ?? 0);
      const menu = !useGameStore.getState().sim.authoritative && useGameStore.getState().gamePhase === 'paused';
      useGameStore.setState({ sim: this.view, flockSize: room.settings.flockSize, gamePhase: menu ? 'paused' : 'playing', uiPanel: menu ? 'pause' : 'none',
        pennedCount: frame.count, acceptedBark: null, completionTick: 0, completionTimeMs: 0 });
    } else this.view.receive(frame);
    useGameStore.getState().sheepPenned(frame.count);
  }
  send(type: string, ...args: unknown[]): number {
    if (this.socket?.readyState !== WebSocket.OPEN) return -1;
    if (this.socket.bufferedAmount > 16_384) { this.socket.close(4000, 'send_queue'); return -1; }
    const seq = this.seq++; this.socket.send(encode([PROTOCOL, type, seq, ...args])); return seq;
  }
  leave(message = '') {
    this.send('leave'); this.dispose(); this.handle = ''; history.replaceState(null, '', '/');
    useGameStore.getState().reset(); this.status = { ...INITIAL, message }; this.update(this.status);
  }
  dispose() {
    this.generation++;
    if (this.retry) clearTimeout(this.retry); if (this.heartbeat) clearInterval(this.heartbeat);
    this.retry = this.heartbeat = null;
    if (this.view) this.view.enabled = false;
    this.socket?.close(1000, 'client_closed'); this.socket = null;
  }
}
