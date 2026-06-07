// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 68 P3: two-client LIVE co-op survival integration proof.
//
// This is the run Cycle 67 deferred ("a full 2-client co-op run is impractical
// to automate"). It exercises the real wire path end-to-end against a live local
// worker: REST register (mint) -> create a survival room -> join -> two WS
// upgrades with admission tickets -> host startGame -> both clients receive the
// DO-authoritative `gameStateUpdate` snapshots carrying the survival block, and
// (via the env-gated __testAdvanceSurvival seam) both see the wolves the DO
// spawns at nightfall. The DO is authoritative; clients render from the snapshot.
//
// Gated OFF by default so `npm test` stays green with no worker running. To run
// (verified recipe, Cycle 68 P3):
//   1. npm run dev:setup            # migrate a fresh local D1
//   2. cd worker && npx wrangler dev --port 8787 --ip 127.0.0.1 --var INTEGRATION_TEST:1
//      (JWT_SECRET comes from worker/.dev.vars; INTEGRATION_TEST enables the seam)
//   3. COOP_SURVIVAL_LIVE=1 INTEGRATION_WORKER_URL=http://127.0.0.1:8787 \
//      npx vitest run tests/integration/coop-survival.spec.ts
// The test writes cycle68-validation/coop/two-client-proof.json (gitignored).

import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { TestClient } from "./helpers/wsClient";
import { PROTOCOL_VERSION } from "../../shared/protocol.js";

const RUN_LIVE = process.env.COOP_SURVIVAL_LIVE === "1";
const HTTP_BASE = process.env.INTEGRATION_WORKER_URL ?? "http://localhost:8787";
const WS_BASE = process.env.INTEGRATION_WORKER_WS ?? HTTP_BASE.replace(/^http/, "ws");
const ARTIFACT_DIR = "cycle68-validation/coop";

interface RegisterResult { token: string; persistentId: string; }
interface RoomResult { roomCode: string; playerId: string; wsTicket: string; }

async function register(displayName: string): Promise<RegisterResult> {
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

async function createSurvivalRoom(token: string, playerName: string, dogType: string): Promise<RoomResult> {
  const res = await fetch(`${HTTP_BASE}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      playerName,
      dogType,
      protocolVersion: PROTOCOL_VERSION,
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

async function joinRoom(token: string, roomCode: string, playerName: string, dogType: string): Promise<RoomResult> {
  const res = await fetch(`${HTTP_BASE}/api/rooms/${roomCode}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, playerName, dogType, protocolVersion: PROTOCOL_VERSION }),
  });
  if (!res.ok) throw new Error(`joinRoom failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as any;
  return { roomCode: data.roomCode, playerId: data.playerId, wsTicket: data.wsTicket };
}

function wsClient(roomCode: string, r: RoomResult, name: string, dogType: string): TestClient {
  // The WS upgrade authenticates on playerId + ticket only (P-SEC-2); identity
  // was stored by the REST join, so don't let TestClient append name/dogType.
  const url = `${WS_BASE}/r/${roomCode}/ws?playerId=${encodeURIComponent(r.playerId)}&ticket=${encodeURIComponent(r.wsTicket)}`;
  return new TestClient(url, { playerId: r.playerId, playerName: name, dogType }, { appendIdentityQuery: false });
}

/** Wait for a gameStateUpdate snapshot whose `predicate` holds, polling frames. */
async function waitForState(client: TestClient, predicate: (s: any) => boolean, budgetMs = 8000): Promise<any> {
  const deadline = Date.now() + budgetMs;
  // Scan frames already buffered first, then await new ones.
  for (const m of client.allOfType("gameStateUpdate")) {
    if (predicate(m)) return m;
  }
  while (Date.now() < deadline) {
    const msg = await client.waitFor("gameStateUpdate", Math.max(250, deadline - Date.now()));
    if (predicate(msg)) return msg;
  }
  throw new Error("waitForState: predicate never satisfied within budget");
}

describe.skipIf(!RUN_LIVE)("Cycle 68 P3: two-client live co-op survival", () => {
  test("two clients share the DO-authoritative survival run + wolves over the wire", async () => {
    const a = await register("CoopHostA");
    const b = await register("CoopGuestB");
    expect(a.token).toBeTruthy();
    expect(b.token).toBeTruthy();

    const roomA = await createSurvivalRoom(a.token, "CoopHostA", "jep");
    expect(roomA.roomCode).toMatch(/^[A-Z0-9]{4,8}$/);
    const roomB = await joinRoom(b.token, roomA.roomCode, "CoopGuestB", "pip");
    expect(roomB.roomCode).toBe(roomA.roomCode);
    expect(roomB.playerId).not.toBe(roomA.playerId);

    const clientA = wsClient(roomA.roomCode, roomA, "CoopHostA", "jep");
    const clientB = wsClient(roomA.roomCode, roomB, "CoopGuestB", "pip");
    await Promise.all([clientA.connect(), clientB.connect()]);

    const artifact: any = {
      ok: false,
      roomCode: roomA.roomCode,
      protocolVersion: PROTOCOL_VERSION,
      players: [roomA.playerId, roomB.playerId],
    };

    try {
      // Host starts the run; both clients see it begin.
      clientA.send({ t: "startGame" });
      await Promise.all([clientA.waitFor("gameStarted", 8000), clientB.waitFor("gameStarted", 8000)]);

      // Both receive the authoritative survival snapshot block (day/phase/flock).
      const dayA = await waitForState(clientA, (s) => s.survival && typeof s.survival.day === "number");
      const dayB = await waitForState(clientB, (s) => s.survival && typeof s.survival.day === "number");
      expect(dayA.survival.day).toBeGreaterThanOrEqual(1);
      expect(dayB.survival.day).toBeGreaterThanOrEqual(1);
      // The protocol version tag rides every frame.
      expect(dayA.v).toBe(PROTOCOL_VERSION);
      artifact.survivalBlockA = dayA.survival;
      artifact.survivalBlockB = dayB.survival;

      // Force the day clock to nightfall via the env-gated test seam; the DO
      // spawns the wolf pack and broadcasts it to BOTH clients.
      clientA.send({ t: "__testAdvanceSurvival", seconds: 420 });
      const wolvesA = await waitForState(clientA, (s) => Array.isArray(s.wolves) && s.wolves.length >= 1, 10000);
      const wolvesB = await waitForState(clientB, (s) => Array.isArray(s.wolves) && s.wolves.length >= 1, 10000);
      expect(wolvesA.wolves.length).toBeGreaterThanOrEqual(1);
      expect(wolvesB.wolves.length).toBeGreaterThanOrEqual(1);
      // Same authoritative pack size on both clients (render-from-snapshot).
      expect(wolvesA.survival.phase).toBe("night");
      artifact.wolfCountA = wolvesA.wolves.length;
      artifact.wolfCountB = wolvesB.wolves.length;
      artifact.nightPhase = wolvesA.survival.phase;
      artifact.ok = true;
    } finally {
      await Promise.all([clientA.close(), clientB.close()]);
      try {
        mkdirSync(ARTIFACT_DIR, { recursive: true });
        writeFileSync(`${ARTIFACT_DIR}/two-client-proof.json`, JSON.stringify(artifact, null, 2));
      } catch { /* artifact best-effort */ }
    }

    expect(artifact.ok).toBe(true);
  }, 40000);
});
