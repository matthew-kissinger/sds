// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// REST + WS handshake helpers shared by the live-worker integration specs
// (coop-survival.spec.ts, mixed-cohort.spec.ts). Extracted from
// coop-survival.spec.ts during upkeep A2 so both specs drive the identical
// register -> create/join -> ticketed WS upgrade path.
//
// Requires a local worker: see each spec's header for the verified recipe
// (npm run dev:setup, then wrangler dev with INTEGRATION_TEST:1).

import { PROTOCOL_VERSION } from "../../../shared/protocol.js";
import { TestClient } from "./wsClient";

export const HTTP_BASE = process.env.INTEGRATION_WORKER_URL ?? "http://localhost:8787";
export const WS_BASE = process.env.INTEGRATION_WORKER_WS ?? HTTP_BASE.replace(/^http/, "ws");

export interface RegisterResult { token: string; persistentId: string; }
export interface RoomResult { roomCode: string; playerId: string; wsTicket: string; }

export async function register(displayName: string): Promise<RegisterResult> {
  // Omit persistent_id so the worker mints a fresh server-side identity (P-SEC-1).
  const res = await fetch(`${HTTP_BASE}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: displayName, name_type: "custom" }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as any;
  const persistentId = data.playerProfile?.persistentId ?? data.playerProfile?.persistent_id;
  if (!data.token) throw new Error("register returned no token");
  return { token: data.token, persistentId };
}

export async function createSurvivalRoom(
  token: string,
  playerName: string,
  dogType: string,
  protocolVersion: number = PROTOCOL_VERSION,
): Promise<RoomResult> {
  const res = await fetch(`${HTTP_BASE}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      playerName,
      dogType,
      protocolVersion,
      roomSettings: {
        maxPlayers: 4,
        isPublic: true,
        name: `${playerName}'s survival`,
        gameMode: "survival",
        sceneId: "newsheepdogland",
      },
    }),
  });
  if (!res.ok) throw new Error(`createRoom failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as any;
  return { roomCode: data.roomCode, playerId: data.playerId, wsTicket: data.wsTicket };
}

export async function joinRoom(
  token: string,
  roomCode: string,
  playerName: string,
  dogType: string,
  protocolVersion: number = PROTOCOL_VERSION,
): Promise<RoomResult> {
  const res = await fetch(`${HTTP_BASE}/api/rooms/${roomCode}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, playerName, dogType, protocolVersion }),
  });
  if (!res.ok) throw new Error(`joinRoom failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as any;
  return { roomCode: data.roomCode, playerId: data.playerId, wsTicket: data.wsTicket };
}

export function wsClient(roomCode: string, r: RoomResult, name: string, dogType: string): TestClient {
  // The WS upgrade authenticates on playerId + ticket only (P-SEC-2); identity
  // was stored by the REST join, so don't let TestClient append name/dogType.
  const url = `${WS_BASE}/r/${roomCode}/ws?playerId=${encodeURIComponent(r.playerId)}&ticket=${encodeURIComponent(r.wsTicket)}`;
  return new TestClient(url, { playerId: r.playerId, playerName: name, dogType }, { appendIdentityQuery: false });
}
