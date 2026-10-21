// SPDX-License-Identifier: AGPL-3.0-or-later
import { decode, encode } from '@msgpack/msgpack';
import { requireThat, RoomError } from './http';
import { settings, type Settings } from './roomState';
import { PROTOCOL } from '../net/messages';
export type Command = { seq: number } & (
  { type: 'ready'; value: boolean } | { type: 'settings'; value: Settings } |
  { type: 'start' | 'leave' | 'ping' | 'again' } | { type: 'loaded'; round: string } |
  { type: 'remove'; slot: number } | { type: 'ack'; revision: number } | { type: 'seen'; round: string; tick: number } |
  { type: 'input'; round: string; x: number; z: number; sprint: boolean; bark: number }
);
export function packet(value: unknown): ArrayBuffer {
  return Uint8Array.from(encode(value)).buffer;
}
export function command(message: string | ArrayBuffer): Command {
  requireThat(message instanceof ArrayBuffer && message.byteLength <= 1024, 'binary_frame_required', 400);
  let value: unknown;
  try { value = decode(new Uint8Array(message), { maxStrLength: 128, maxBinLength: 0, maxArrayLength: 8, maxMapLength: 0, maxExtLength: 0 }); }
  catch { throw new RoomError('invalid_frame', 400); }
  requireThat(Array.isArray(value) && value[0] === PROTOCOL, 'protocol_mismatch', 400);
  const [, type, seq, arg, count, visibility] = value;
  requireThat(Number.isSafeInteger(seq) && seq >= 0, 'invalid_sequence', 400);
  if (['start', 'leave', 'ping', 'again'].includes(type) && value.length === 3) return { type, seq } as Command;
  if (type === 'ready' && value.length === 4 && typeof arg === 'boolean') return { type, seq, value: arg };
  if (type === 'loaded' && value.length === 4 && typeof arg === 'string' && /^[a-f0-9]{32}$/.test(arg)) return { type, seq, round: arg };
  if (type === 'remove' && value.length === 4 && Number.isInteger(arg) && arg >= 0 && arg < 4) return { type, seq, slot: arg };
  if (type === 'ack' && value.length === 4 && Number.isSafeInteger(arg) && arg >= 0) return { type, seq, revision: arg };
  if (type === 'settings' && value.length === 6) return { type, seq, value: settings({ mode: arg, flockSize: count, visibility }) };
  if (type === 'seen' && value.length === 5 && typeof arg === 'string' && /^[a-f0-9]{32}$/.test(arg) && Number.isSafeInteger(count) && count >= 0) return { type, seq, round: arg, tick: count };
  if (type === 'input' && value.length === 8 && typeof arg === 'string' && /^[a-f0-9]{32}$/.test(arg)
    && Number.isFinite(count) && Number.isFinite(visibility) && count * count + visibility * visibility <= 1.0001
    && typeof value[6] === 'boolean' && Number.isSafeInteger(value[7]) && value[7] >= 0)
    return { type, seq, round: arg, x: count, z: visibility, sprint: value[6], bark: value[7] };
  throw new RoomError('invalid_command', 400);
}
