// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Upkeep A2 (review-dossier coverage gap 2): mixed-cohort LIVE integration
// proof for the protocol v3 per-client soft-degrade split. One client joins
// with protocolVersion 3 (the default) and one with protocolVersion 2 in the
// SAME live room. After the host starts the game we observe both wire streams
// for a fixed window and assert:
//   1. the v3 stream is keyframe/delta cadence (gameStateDelta frames between
//      periodic full gameStateUpdate keyframes);
//   2. the v2 stream is full gameStateUpdate frames every broadcast interval
//      and carries ZERO gameStateDelta frames;
//   3. cross-cohort state equality: at shared ticks the v3 client's
//      RECONSTRUCTED snapshot deep-equals the v2 client's full frame on the
//      sheep array, the sheepdogs array, and the top-level scalars.
//
// The room is a survival room (helpers/liveWorker.ts) deliberately: the
// survival sheep pool is mostly dormant, so the changed-sheep fraction stays
// far below the 85% degenerate-frame rule and real deltas flow from tick 1
// (docs/hardening/delta-protocol-design.md, Deviations item 2).
//
// Gated OFF by default so `npm test` stays green with no worker running. To
// run (same recipe as coop-survival.spec.ts):
//   1. npm run dev:setup            # migrate a fresh local D1
//   2. cd worker && npx wrangler dev --port 8787 --ip 127.0.0.1 --var INTEGRATION_TEST:1
//      (JWT_SECRET comes from worker/.dev.vars)
//   3. MIXED_COHORT_LIVE=1 INTEGRATION_WORKER_URL=http://127.0.0.1:8787 \
//      npx vitest run tests/integration/mixed-cohort.spec.ts

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createSurvivalRoom, joinRoom, register, wsClient } from "./helpers/liveWorker";
import type { AnyMessage, TestClient } from "./helpers/wsClient";
import { KEYFRAME_INTERVAL_TICKS, PROTOCOL_VERSION } from "../../shared/protocol.js";

const RUN_LIVE = process.env.MIXED_COHORT_LIVE === "1";

// Observation window after gameStarted. The DO broadcasts every 16ms and
// keyframes the v3 cohort every KEYFRAME_INTERVAL_TICKS (60) ticks, so 3s
// spans ~180 broadcast intervals and at least 2 periodic keyframes.
const OBSERVE_MS = 3000;

// Top-level scalars that ride every frame on both cohorts (delta frames carry
// them too, so the reconstruction preserves them per-frame).
const FRAME_SCALARS = [
  "v",
  "tick",
  "timestamp",
  "sheepRetired",
  "totalSheep",
  "gameCompleted",
  "isCompetitive",
  "isTimedMode",
] as const;

describe.skipIf(!RUN_LIVE)("Upkeep A2: mixed v3 + v2 cohort in one live room", () => {
  let v3: TestClient | null = null;
  let v2: TestClient | null = null;

  beforeAll(async () => {
    const a = await register("MixedHostV3");
    const b = await register("MixedGuestV2");

    // Host creates as v3 (helper default); guest joins EXPLICITLY as v2 so
    // the DO stores it in the legacy full-frame cohort.
    const roomA = await createSurvivalRoom(a.token, "MixedHostV3", "jep");
    const roomB = await joinRoom(b.token, roomA.roomCode, "MixedGuestV2", "pip", 2);
    expect(roomB.roomCode).toBe(roomA.roomCode);

    v3 = wsClient(roomA.roomCode, roomA, "MixedHostV3", "jep");
    v2 = wsClient(roomA.roomCode, roomB, "MixedGuestV2", "pip");
    await Promise.all([v3.connect(), v2.connect()]);

    v3.send({ t: "startGame" });
    await Promise.all([v3.waitFor("gameStarted", 8000), v2.waitFor("gameStarted", 8000)]);

    // Record both streams for the window, then close so each test below
    // asserts over the same frozen logs.
    await new Promise((resolve) => setTimeout(resolve, OBSERVE_MS));
    await Promise.all([v3.close(), v2.close()]);
  }, 40_000);

  afterAll(async () => {
    // Safety net if beforeAll threw mid-handshake; close() is idempotent.
    await Promise.all([v3?.close(), v2?.close()]);
  });

  test("v3 stream is keyframe/delta cadence (deltas between periodic keyframes)", () => {
    const keyframes = v3!.allOfType("gameStateUpdate");
    const deltas = v3!.allOfType("gameStateDelta");

    // At least the start-of-game keyframe plus one periodic keyframe, and
    // far more deltas than keyframes (~1Hz keyframes vs ~60Hz broadcast).
    expect(keyframes.length).toBeGreaterThanOrEqual(2);
    expect(deltas.length).toBeGreaterThanOrEqual(30);
    expect(deltas.length).toBeGreaterThan(keyframes.length);

    // Every frame is tick-stamped, deltas carry their basis tick, and the
    // periodic keyframes land on the KEYFRAME_INTERVAL_TICKS cadence.
    for (const k of keyframes) expect(typeof k.tick).toBe("number");
    for (const d of deltas) {
      expect(typeof d.tick).toBe("number");
      expect(typeof d.baseTick).toBe("number");
      expect(d.v).toBe(PROTOCOL_VERSION);
    }
    const periodic = keyframes.filter((k) => (k.tick as number) % KEYFRAME_INTERVAL_TICKS === 0);
    expect(periodic.length).toBeGreaterThanOrEqual(1);

    // Deltas sit strictly BETWEEN keyframes, not just trailing them.
    const kTicks = keyframes.map((k) => k.tick as number).sort((x, y) => x - y);
    const between = deltas.filter(
      (d) => (d.tick as number) > kTicks[0] && (d.tick as number) < kTicks[kTicks.length - 1],
    );
    expect(between.length).toBeGreaterThan(0);

    // The mirror kept pace: reconstructed snapshots outnumber raw keyframes.
    expect(v3!.snapshots.length).toBeGreaterThan(keyframes.length);
    expect(typeof v3!.lastAppliedTick).toBe("number");
  });

  test("v2 stream is full frames every broadcast interval with zero deltas", () => {
    expect(v2!.allOfType("gameStateDelta").length).toBe(0);

    const fulls = v2!.allOfType("gameStateUpdate");
    // ~180 expected over 3s at the 16ms interval; 60 is a conservative floor
    // that still proves per-interval cadence rather than 1Hz keyframes.
    expect(fulls.length).toBeGreaterThanOrEqual(60);
    // And the legacy cohort sees MANY more full frames than the v3 cohort's
    // keyframe count over the same window.
    expect(fulls.length).toBeGreaterThan(v3!.allOfType("gameStateUpdate").length * 4);

    // Shape: every legacy frame is a complete snapshot (sheep array present,
    // additive tick field stamped).
    for (const f of fulls) {
      expect(Array.isArray(f.sheep)).toBe(true);
      expect(typeof f.tick).toBe("number");
    }
  });

  test("cross-cohort state equality: v3 reconstruction deep-equals v2 full frame at shared ticks", () => {
    // Index the v2 full frames by tick. Duplicate ticks (16ms broadcast loop
    // firing between sim ticks) re-send the same snapshot, so last-write-wins
    // is safe.
    const v2ByTick = new Map<number, AnyMessage>();
    for (const f of v2!.allOfType("gameStateUpdate")) {
      if (typeof f.tick === "number") v2ByTick.set(f.tick, f);
    }

    let compared = 0;
    for (const snap of v3!.snapshots) {
      const tick = snap.tick as number;
      const peer = v2ByTick.get(tick);
      if (!peer) continue;
      compared += 1;
      // The delta path reconstructs the SAME quantized snapshot the legacy
      // path serializes whole: sheep array, sheepdogs array, and the
      // every-frame scalars must deep-equal at the shared tick.
      expect(snap.sheep).toEqual(peer.sheep);
      expect(snap.sheepdogs).toEqual(peer.sheepdogs);
      for (const key of FRAME_SCALARS) {
        expect(snap[key]).toEqual(peer[key]);
      }
    }
    expect(compared).toBeGreaterThanOrEqual(3);
  });
});
