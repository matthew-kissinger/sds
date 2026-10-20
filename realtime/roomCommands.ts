// SPDX-License-Identifier: AGPL-3.0-or-later
import { requireThat } from './http';
import type { Command } from './protocol';
import { clearReady, hostHandoff, interrupt, START_MS, type RoomState } from './roomState';
export function applyCommand(room: RoomState, id: string, session: string, cmd: Command, now: number, round: string): void {
  const actor = room.members.find(m => m.id === id && m.session === session && m.connected);
  requireThat(actor && room.phase !== 'closed', 'session_replaced', 401);
  if (cmd.type === 'ping' || cmd.type === 'ack') return;
  if (cmd.type === 'leave') {
    room.members = room.members.filter(m => m !== actor);
    if (room.phase === 'starting') interrupt(room, 'player_departed');
    room.idleExpires = now + 120_000; hostHandoff(room); return;
  }
  if (cmd.type === 'loaded') {
    requireThat(room.phase === 'starting' && room.round === cmd.round, 'stale_round');
    actor.loaded = true;
    if (room.members.every(m => m.loaded)) { room.phase = 'playing'; room.startDeadline = null; }
    return;
  }
  if (cmd.type === 'again') {
    requireThat(room.phase === 'finished' && room.host === id, 'not_finished');
    room.phase = 'waiting'; room.result = null; clearReady(room); return;
  }
  requireThat(room.phase === 'waiting', 'not_waiting');
  if (cmd.type === 'ready') { actor.ready = cmd.value; return; }
  requireThat(room.host === id, 'host_only', 403);
  if (cmd.type === 'settings') { room.settings = cmd.value; clearReady(room); return; }
  if (cmd.type === 'remove') {
    const target = room.members.find(m => m.slot === cmd.slot);
    requireThat(target && target !== actor, 'invalid_target', 400);
    requireThat(room.removed.length < 64, 'removal_limit');
    room.removed.push(target.id); room.members = room.members.filter(m => m !== target); return;
  }
  requireThat(room.settings.mode === 'coop', 'mode_unavailable');
  requireThat(room.members.length >= 2 && room.members.every(m => m.connected && m.ready), 'not_ready');
  room.phase = 'starting'; room.round = round; room.startDeadline = now + START_MS;
  room.interruption = null;
  for (const member of room.members) member.loaded = false;
}
