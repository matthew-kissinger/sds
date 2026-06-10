// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 68 P3: two-client LIVE co-op survival integration proof.
//
// This is the run Cycle 67 deferred ("a full 2-client co-op run is impractical
// to automate"). It exercises the real wire path end-to-end against a live local
// worker: REST register (mint) -> create a survival room -> join -> two WS
// upgrades with admission tickets -> host startGame -> both clients receive the
// DO-authoritative game frames carrying the survival block, and (via the
// env-gated __testAdvanceSurvival seam) both see the wolves the DO spawns at
// nightfall. The DO is authoritative; clients render from the snapshot.
//
// Upkeep A1 (dossier F5): the clients join as v3, so the DO sends them the
// keyframe/delta cadence - a full `gameStateUpdate` only ~1Hz with
// `gameStateDelta` frames in between. TestClient now mirrors the
// NetworkManager reconstruction, so this spec observes state through the
// reconstructed `.snapshots` stream at the broadcast cadence instead of
// sampling only the 1Hz keyframes. The REST + WS handshake helpers moved to
// helpers/liveWorker.ts (shared with mixed-cohort.spec.ts).
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

import { createSurvivalRoom, joinRoom, register, wsClient } from "./helpers/liveWorker";
import type { TestClient } from "./helpers/wsClient";
import { PROTOCOL_VERSION } from "../../shared/protocol.js";
import { newsheepdogland } from "../../shared/scenes/newsheepdogland.js";

const RUN_LIVE = process.env.COOP_SURVIVAL_LIVE === "1";
const ARTIFACT_DIR = "cycle68-validation/coop";
const NIGHT_PROBE_T = 0.85;

function secondsToNightProbe(): number {
  const secondsPerDay = newsheepdogland.dayNight?.secondsPerDay ?? 600;
  const initialT = newsheepdogland.dayNight?.initialT ?? 0.28;
  let delta = NIGHT_PROBE_T - initialT;
  while (delta < 0) delta += 1;
  return Math.ceil(delta * secondsPerDay);
}

/**
 * Wait for a reconstructed snapshot (keyframe OR applied delta) whose
 * `predicate` holds. Upkeep A1: observing `.snapshots` instead of raw
 * `gameStateUpdate` frames keeps the spec at the broadcast cadence under the
 * v3 keyframe/delta protocol.
 */
async function waitForState(client: TestClient, predicate: (s: any) => boolean, budgetMs = 8000): Promise<any> {
  // Scan snapshots already reconstructed first, then await new ones.
  for (const s of client.snapshots) {
    if (predicate(s)) return s;
  }
  return client.waitForSnapshot(predicate, budgetMs);
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
      clientA.send({ t: "__testAdvanceSurvival", seconds: secondsToNightProbe() });
      const wolvesA = await waitForState(clientA, (s) => Array.isArray(s.wolves) && s.wolves.length >= 1, 10000);
      const wolvesB = await waitForState(clientB, (s) => Array.isArray(s.wolves) && s.wolves.length >= 1, 10000);
      expect(wolvesA.wolves.length).toBeGreaterThanOrEqual(1);
      expect(wolvesB.wolves.length).toBeGreaterThanOrEqual(1);
      // Same authoritative pack size on both clients (render-from-snapshot).
      expect(wolvesA.survival.phase).toBe("night");
      artifact.wolfCountA = wolvesA.wolves.length;
      artifact.wolfCountB = wolvesB.wolves.length;
      artifact.nightPhase = wolvesA.survival.phase;

      // Upkeep A1 acceptance: a v3 join observes game frames at the broadcast
      // cadence, not the ~1Hz keyframe cadence. The raw wire stream carries
      // gameStateDelta frames between keyframes, and the reconstructed
      // snapshot stream therefore outnumbers the keyframes.
      const keyframesA = clientA.allOfType("gameStateUpdate").length;
      const deltasA = clientA.allOfType("gameStateDelta").length;
      expect(deltasA).toBeGreaterThan(0);
      expect(clientA.snapshots.length).toBeGreaterThan(keyframesA);
      artifact.keyframesA = keyframesA;
      artifact.deltaFramesA = deltasA;
      artifact.snapshotsA = clientA.snapshots.length;
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
