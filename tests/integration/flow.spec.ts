// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Two-client end-to-end flow per POSTMORTEM 5.3. Every test here is
// `test.skip` on the current codebase because the worker endpoint does not
// yet exist. The C-retry agent should unskip these one at a time as the
// corresponding server behavior is implemented.
//
// Unskip marker: // C-retry: unskip when worker endpoint exists
//
// Workflow for the retry:
//   1. Start the worker locally (e.g. `wrangler dev --port 8787`).
//   2. Set INTEGRATION_WORKER_URL=http://localhost:8787 in the env.
//   3. Change `test.skip` to `test` for the step you are verifying.
//   4. Run `npm run test:integration` and debug until green.
//
// All seven steps use the same two fixtures (PLAYER_A, PLAYER_B) and the
// same TestClient helper - the harness is constant; only the server side
// is being validated.

import { describe, expect, test } from "vitest";

import {
  PLAYER_A,
  PLAYER_B,
  RegisterResponse,
  RoomCreateResponse,
  roomCreateBody,
  roomJoinBody,
} from "./helpers/fixtures";
import { TestClient } from "./helpers/wsClient";

const HTTP_BASE = process.env.INTEGRATION_WORKER_URL ?? "http://localhost:8787";
const WS_BASE =
  process.env.INTEGRATION_WORKER_WS ??
  HTTP_BASE.replace(/^http/, "ws");

async function registerPlayer(fixture: typeof PLAYER_A): Promise<RegisterResponse> {
  const res = await fetch(`${HTTP_BASE}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      persistentId: fixture.persistentId,
      displayName: fixture.playerName,
      nameType: fixture.nameType,
    }),
  });
  if (!res.ok) throw new Error(`register ${fixture.persistentId} failed: ${res.status}`);
  return (await res.json()) as RegisterResponse;
}

describe("Two-client end-to-end flow (POSTMORTEM 5.3)", () => {
  // C-retry: unskip when worker endpoint exists
  test.skip("[C-retry] 1. Two clients register via POST /api/register and receive tokens", async () => {
    const a = await registerPlayer(PLAYER_A);
    const b = await registerPlayer(PLAYER_B);
    expect(typeof a.token).toBe("string");
    expect(a.token.length).toBeGreaterThan(10);
    expect(typeof b.token).toBe("string");
    expect(b.token.length).toBeGreaterThan(10);
    expect(a.playerId).not.toBe(b.playerId);
  });

  // C-retry: unskip when worker endpoint exists
  test.skip("[C-retry] 2. Client A creates a room via POST /api/rooms and receives {roomCode, playerId}", async () => {
    const a = await registerPlayer(PLAYER_A);
    const res = await fetch(`${HTTP_BASE}/api/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${a.token}`,
      },
      body: JSON.stringify(roomCreateBody(PLAYER_A, a.playerId)),
    });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as RoomCreateResponse;
    expect(body.roomCode).toMatch(/^[A-Z0-9]{4,8}$/);
    expect(body.playerId).toBe(a.playerId);
  });

  // C-retry: unskip when worker endpoint exists
  test.skip("[C-retry] 3. Client B joins via POST /api/rooms/:code/join", async () => {
    const a = await registerPlayer(PLAYER_A);
    const b = await registerPlayer(PLAYER_B);
    const create = await fetch(`${HTTP_BASE}/api/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${a.token}`,
      },
      body: JSON.stringify(roomCreateBody(PLAYER_A, a.playerId)),
    });
    const { roomCode } = (await create.json()) as RoomCreateResponse;

    const join = await fetch(`${HTTP_BASE}/api/rooms/${roomCode}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${b.token}`,
      },
      body: JSON.stringify(roomJoinBody(PLAYER_B, b.playerId)),
    });
    expect(join.ok).toBe(true);
    const body = (await join.json()) as RoomCreateResponse;
    expect(body.roomCode).toBe(roomCode);
    expect(body.playerId).toBe(b.playerId);
  });

  // C-retry: unskip when worker endpoint exists
  test.skip("[C-retry] 4. Both clients open WSS to /r/:code/ws and receive a lobby snapshot with both players", async () => {
    const a = await registerPlayer(PLAYER_A);
    const b = await registerPlayer(PLAYER_B);
    const create = await fetch(`${HTTP_BASE}/api/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${a.token}`,
      },
      body: JSON.stringify(roomCreateBody(PLAYER_A, a.playerId)),
    });
    const { roomCode } = (await create.json()) as RoomCreateResponse;
    await fetch(`${HTTP_BASE}/api/rooms/${roomCode}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${b.token}`,
      },
      body: JSON.stringify(roomJoinBody(PLAYER_B, b.playerId)),
    });

    const clientA = new TestClient(`${WS_BASE}/r/${roomCode}/ws`, {
      playerId: a.playerId,
      playerName: PLAYER_A.playerName,
      dogType: PLAYER_A.dogType,
      isPublic: true,
    });
    const clientB = new TestClient(`${WS_BASE}/r/${roomCode}/ws`, {
      playerId: b.playerId,
      playerName: PLAYER_B.playerName,
      dogType: PLAYER_B.dogType,
    });

    await Promise.all([clientA.connect(), clientB.connect()]);
    try {
      const [lobbyA, lobbyB] = await Promise.all([
        clientA.waitFor("lobby"),
        clientB.waitFor("lobby"),
      ]);
      const playersA = (lobbyA as unknown as { players: Array<{ id: string }> }).players;
      const playersB = (lobbyB as unknown as { players: Array<{ id: string }> }).players;
      expect(playersA.map((p) => p.id).sort()).toEqual(
        [a.playerId, b.playerId].sort(),
      );
      expect(playersB.map((p) => p.id).sort()).toEqual(
        [a.playerId, b.playerId].sort(),
      );
    } finally {
      await Promise.all([clientA.close(), clientB.close()]);
    }
  });

  // C-retry: unskip when worker endpoint exists
  //
  // Expected contract (copy into the body when unskipping - depends on
  // steps 1-4 already passing):
  //   clientA.send({ t: "start" });
  //   const [startA, startB] = await Promise.all([
  //     clientA.waitFor("gameStart"),
  //     clientB.waitFor("gameStart"),
  //   ]);
  //   expect(startA.mode).toBe("cooperative");
  //   expect(startB.mode).toBe("cooperative");
  test.skip("[C-retry] 5. Host sends {t:'start'}; both clients receive {t:'gameStart'}", async () => {
    expect(true).toBe(true);
  });

  // C-retry: unskip when worker endpoint exists
  //
  // Expected contract (copy into the body when unskipping):
  //   clientA.send({ t: "input", seq: 1, dir: { x: 1, z: 0 }, sprint: false });
  //   const [stateA, stateB] = await Promise.all([
  //     clientA.waitFor("state"),
  //     clientB.waitFor("state"),
  //   ]);
  //   expect(stateA.tick).toBeGreaterThan(0);
  //   expect(stateA.dogs).toBeDefined();
  //   expect(stateA.sheep).toBeDefined();
  //   expect(stateB.tick).toBeGreaterThanOrEqual(stateA.tick);
  test.skip("[C-retry] 6. Client A sends {t:'input', seq, dir, sprint}; both clients receive a matching {t:'state'}", async () => {
    expect(true).toBe(true);
  });

  // C-retry: unskip when worker endpoint exists
  //
  // Open question: whether the worker exposes a test-only
  // `{t:'forceComplete'}` message. If not, this test must drive completion
  // by playing out the win condition via scripted inputs - slow and
  // fragile in CI. The retry agent should decide: either add a test-only
  // forceComplete compile-gated out of production, or accept a longer
  // completion test with deterministic seed + scripted inputs.
  //
  // Expected contract (copy into the body when unskipping):
  //   clientA.send({ t: "forceComplete" }); // or play out the win condition
  //   const [doneA, doneB] = await Promise.all([
  //     clientA.waitFor("complete", 10000),
  //     clientB.waitFor("complete", 10000),
  //   ]);
  //   expect(doneA.scores).toBeDefined();
  //   expect(doneB.scores).toBeDefined();
  //   const lb = await fetch(`${HTTP_BASE}/api/leaderboard?mode=cooperative&limit=50`);
  //   expect(lb.ok).toBe(true);
  //   const rows = (await lb.json()) as Array<{ persistent_id: string }>;
  //   const ids = rows.map((r) => r.persistent_id);
  //   expect(ids).toContain(PLAYER_A.persistentId);
  //   expect(ids).toContain(PLAYER_B.persistentId);
  test.skip("[C-retry] 7. Game completes; both clients receive {t:'complete', scores}; leaderboard returns both players", async () => {
    expect(true).toBe(true);
  });
});
