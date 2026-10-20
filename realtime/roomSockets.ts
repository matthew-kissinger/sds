// SPDX-License-Identifier: AGPL-3.0-or-later
import { packet } from './protocol';
import { publicRoom, type RoomState } from './roomState';
export interface Attachment {
  id: string; session: string; seq: number; ack: number; sent: number;
  tokens: number; at: number;
  traffic: number; trafficAt: number; matchAck: number; matchSent: number;
}
export function attached(ws: WebSocket): Attachment { return ws.deserializeAttachment() as Attachment; }
export function budget(a: Attachment, now: number, transport = false): boolean {
  if (transport) {
    a.traffic = Math.min(100, a.traffic + Math.max(0, now - a.trafficAt) * 0.08); a.trafficAt = now;
    if (a.traffic < 1) return false;
    a.traffic--; return true;
  }
  a.tokens = Math.min(20, a.tokens + Math.max(0, now - a.at) * 0.01); a.at = now;
  if (a.tokens < 1) return false;
  a.tokens--; return true;
}
export function broadcast(ctx: DurableObjectState, room: RoomState): void {
  const data = packet({ type: 'room', ...publicRoom(room) });
  for (const ws of ctx.getWebSockets()) {
    const a = attached(ws);
    if (!room.members.some(m => m.id === a.id && m.session === a.session && m.connected)) {
      ws.close(1000, 'session_ended'); continue;
    }
    // An explicit acknowledgement window works on workerd, which does not
    // promise the browser's bufferedAmount property. No unbounded send queue.
    if (room.revision - a.ack > 8) { ws.close(1013, 'slow_consumer'); continue; }
    try { ws.send(data); a.sent = room.revision; ws.serializeAttachment(a); }
    catch { ws.close(1011, 'send_failed'); }
  }
}
