// SPDX-License-Identifier: AGPL-3.0-or-later
import { requireThat } from './http';
import type { Region } from './regions';

export const GRACE_MS = 15_000;
export const RESERVATION_MS = 10_000;
export const START_MS = 10_000;
export const ROOM_LIFETIME_MS = 6 * 60 * 60 * 1000;
export type Settings = { mode: 'coop' | 'competitive'; flockSize: 25 | 75 | 200; visibility: 'public' | 'private' };
export type Identity = { id: string; name: string };
export interface Member extends Identity {
  slot: number; order: number; session: string; connected: boolean; ready: boolean;
  deadline: number | null; ticket: string | null; ticketExpires: number; loaded: boolean;
}
export interface RoomState {
  schema: 1; handle: string; region: Region; settings: Settings; revision: number;
  phase: 'waiting' | 'starting' | 'closed'; host: string | null; members: Member[];
  removed: string[]; nextOrder: number; expiresAt: number; idleExpires: number;
  round: string | null; startDeadline: number | null;
  interruption: 'server_restart' | 'start_timeout' | 'player_departed' | 'simulation_unavailable' | null;
}
export function settings(value: Record<string, unknown>): Settings {
  requireThat(Object.keys(value).every(k => ['mode', 'flockSize', 'visibility'].includes(k)), 'invalid_settings', 400);
  requireThat(value.mode === 'coop' || value.mode === 'competitive', 'invalid_mode', 400);
  requireThat(value.flockSize === 25 || value.flockSize === 75 || value.flockSize === 200, 'invalid_flock_size', 400);
  requireThat(value.visibility === 'public' || value.visibility === 'private', 'invalid_visibility', 400);
  return { mode: value.mode, flockSize: value.flockSize, visibility: value.visibility };
}
export function newRoom(handle: string, region: Region, config: Settings, now: number): RoomState {
  return { schema: 1, handle, region, settings: config, revision: 0, phase: 'waiting',
    host: null, members: [], removed: [], nextOrder: 0, expiresAt: now + ROOM_LIFETIME_MS,
    idleExpires: now + 120_000, round: null, startDeadline: null, interruption: null };
}
export function clearReady(room: RoomState): void {
  for (const member of room.members) { member.ready = false; member.loaded = false; }
}
export function interrupt(room: RoomState, reason: RoomState['interruption']): void {
  room.phase = 'waiting'; room.startDeadline = null; room.interruption = reason;
  clearReady(room);
}
export function hostHandoff(room: RoomState): void {
  if (!room.members.some(m => m.id === room.host && m.connected)) {
    room.host = [...room.members].filter(m => m.connected).sort((a, b) => a.order - b.order)[0]?.id ?? null;
  }
}
export function expire(room: RoomState, now: number): void {
  const before = room.members.length;
  room.members = room.members.filter(m => m.deadline === null || now < m.deadline);
  if (before !== room.members.length && room.phase === 'starting') interrupt(room, 'player_departed');
  if (room.startDeadline !== null && now >= room.startDeadline) interrupt(room, 'start_timeout');
  if (now >= room.expiresAt || (!room.members.length && now >= room.idleExpires)) {
    room.phase = 'closed'; room.members = []; room.host = null; room.removed = []; room.startDeadline = null;
  }
  hostHandoff(room);
}
export function reserve(room: RoomState, who: Identity, session: string, ticket: string, now: number): Member {
  requireThat(room.phase !== 'closed', 'room_expired', 410);
  requireThat(!room.removed.includes(who.id), 'removed_from_room', 403);
  let member = room.members.find(m => m.id === who.id);
  if (!member) {
    requireThat(room.phase === 'waiting', 'round_in_progress');
    requireThat(room.members.length < 4, 'room_full');
    const slot = [0, 1, 2, 3].find(s => !room.members.some(m => m.slot === s))!;
    member = { ...who, slot, order: room.nextOrder++, session, connected: false, ready: false,
      deadline: now + RESERVATION_MS, ticket, ticketExpires: now + RESERVATION_MS, loaded: false };
    room.members.push(member);
  } else {
    // Issuing a replacement ticket does not revoke a still-live session or
    // extend the disconnected seat's original grace deadline.
    member.name = who.name; member.ticket = ticket; member.ticketExpires = now + RESERVATION_MS;
  }
  return member;
}
export function bind(room: RoomState, ticket: string, session: string, now: number): Member {
  const member = room.members.find(m => m.ticket === ticket);
  requireThat(room.phase !== 'closed' && member && now < member.ticketExpires, 'invalid_ticket', 401);
  member.ticket = null; member.session = session; member.connected = true; member.deadline = null;
  member.ready = false; member.loaded = false;
  hostHandoff(room); room.idleExpires = now + 120_000;
  return member;
}
export function disconnect(room: RoomState, id: string, session: string, now: number): void {
  const member = room.members.find(m => m.id === id && m.session === session);
  if (!member || !member.connected) return;
  member.connected = false; member.ready = false; member.deadline = now + GRACE_MS;
  if (room.phase === 'starting') interrupt(room, 'player_departed');
  room.idleExpires = now + 120_000; hostHandoff(room);
}
export function publicRoom(room: RoomState) {
  return { protocol: 1, handle: room.handle, region: room.region, settings: room.settings,
    revision: room.revision, phase: room.phase, round: room.round, interruption: room.interruption,
    hostSlot: room.members.find(m => m.id === room.host)?.slot ?? null,
    members: room.members.map(m => ({ slot: m.slot, name: m.name, connected: m.connected, ready: m.ready })) };
}
