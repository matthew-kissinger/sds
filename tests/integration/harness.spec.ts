// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Harness self-tests. These validate the integration scaffolding itself
// (MessagePack round-trip, waitFor semantics, fixture shape) without talking
// to a real worker. They MUST pass on the current codebase.

import { decode, encode } from "@msgpack/msgpack";
import { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import {
  isValidPlayerFixture,
  PLAYERS,
  PLAYER_A,
  PLAYER_B,
  roomCreateBody,
  roomJoinBody,
} from "./helpers/fixtures";
import { TestClient } from "./helpers/wsClient";

// ---------------------------------------------------------------------------
// encodeDecode: MessagePack round-trip for each expected message type
// ---------------------------------------------------------------------------

describe("encodeDecode: MessagePack round-trip", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["client input", { t: "input", seq: 42, dir: { x: 1, z: 0 }, sprint: false }],
    ["client ready", { t: "ready" }],
    ["client start", { t: "start" }],
    ["client leave", { t: "leave" }],
    ["client setDog", { t: "setDog", dogType: "rex" }],
    ["client modeLock", { t: "modeLock", locked: true }],
    [
      "server lobby",
      {
        t: "lobby",
        roomCode: "ABC123",
        hostId: "p1",
        players: [
          { id: "p1", name: "Alice", dogType: "jep", ready: true },
          { id: "p2", name: "Bob", dogType: "rex", ready: true },
        ],
        mode: "cooperative",
        modeLocked: false,
        state: "waiting",
      },
    ],
    [
      "server state",
      {
        t: "state",
        tick: 128,
        dogs: {
          p1: { x: 1.5, z: 2.25, rot: 0.0, vx: 0, vz: 0 },
          p2: { x: -3.0, z: 4.5, rot: 1.57, vx: 0.1, vz: 0 },
        },
        sheep: [
          { id: 0, x: 10.0, z: 10.0, state: 0 },
          { id: 1, x: 11.5, z: 9.5, state: 1 },
        ],
        scores: { p1: 0, p2: 0 },
      },
    ],
    [
      "server gameStart",
      {
        t: "gameStart",
        mode: "cooperative",
        seed: 123456,
        sheepCount: 200,
        fieldBounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
      },
    ],
    [
      "server complete",
      {
        t: "complete",
        scores: { p1: 12, p2: 8 },
        winner: "p1",
        sheepRetired: 20,
      },
    ],
    ["server error", { t: "error", msg: "bad input" }],
    [
      "server hostChanged",
      { t: "hostChanged", newHostId: "p2", newHostName: "Bob" },
    ],
  ];

  for (const [name, msg] of cases) {
    test(`round-trips ${name}`, () => {
      const encoded = encode(msg);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.byteLength).toBeGreaterThan(0);
      const decoded = decode(encoded);
      expect(decoded).toEqual(msg);
    });
  }

  test("preserves nested numeric precision to 32-bit float granularity", () => {
    const msg = { t: "state", x: 1.5 };
    const decoded = decode(encode(msg)) as { t: string; x: number };
    expect(decoded.x).toBeCloseTo(1.5, 5);
  });

  test("rejects decoding of non-msgpack bytes", () => {
    const garbage = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    expect(() => decode(garbage)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// waitFor: helper semantics against a local mock WS server
// ---------------------------------------------------------------------------

describe("waitFor: message-by-type resolution", () => {
  let wss: WebSocketServer;
  let port: number;
  const connectedServerSockets: WebSocket[] = [];
  const openedClients: TestClient[] = [];

  beforeAll(async () => {
    wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
    port = (wss.address() as AddressInfo).port;
    wss.on("connection", (socket) => {
      connectedServerSockets.push(socket);
    });
  });

  afterAll(async () => {
    for (const s of connectedServerSockets) {
      try {
        s.terminate();
      } catch {
        /* ignore */
      }
    }
    await new Promise<void>((resolve, reject) =>
      wss.close((err) => (err ? reject(err) : resolve())),
    );
  });

  afterEach(async () => {
    while (openedClients.length) {
      const c = openedClients.pop()!;
      await c.close().catch(() => undefined);
    }
    while (connectedServerSockets.length) {
      const s = connectedServerSockets.pop()!;
      try {
        s.terminate();
      } catch {
        /* ignore */
      }
    }
  });

  function newClient(): TestClient {
    const c = new TestClient(
      `ws://127.0.0.1:${port}/r/TEST00/ws`,
      {
        playerId: "p-test",
        playerName: "TestPlayer",
        dogType: "jep",
      },
      { defaultTimeoutMs: 1000 },
    );
    openedClients.push(c);
    return c;
  }

  function sendFromServer(socket: WebSocket, msg: object): void {
    const buf = encode(msg);
    socket.send(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), {
      binary: true,
    });
  }

  test("resolves with the first matching message", async () => {
    const client = newClient();
    await client.connect();
    const serverSocket = connectedServerSockets[connectedServerSockets.length - 1];

    const pending = client.waitFor("lobby");
    sendFromServer(serverSocket, { t: "ignoreMe", v: 1 });
    sendFromServer(serverSocket, { t: "lobby", roomCode: "ABC123" });

    const msg = await pending;
    expect(msg.t).toBe("lobby");
    expect(msg.roomCode).toBe("ABC123");
  });

  test("records every received message in order on `.received`", async () => {
    const client = newClient();
    await client.connect();
    const serverSocket = connectedServerSockets[connectedServerSockets.length - 1];

    sendFromServer(serverSocket, { t: "a", i: 0 });
    sendFromServer(serverSocket, { t: "b", i: 1 });
    sendFromServer(serverSocket, { t: "c", i: 2 });

    // Wait for the last one so we know all three arrived.
    await client.waitFor("c");
    expect(client.received.map((m) => m.t)).toEqual(["a", "b", "c"]);
    expect(client.allOfType("a").length).toBe(1);
    expect(client.findInLog("b")).toMatchObject({ t: "b", i: 1 });
    expect(client.findInLog("zz")).toBeUndefined();
  });

  test("rejects with a descriptive timeout when no message arrives", async () => {
    const client = newClient();
    await client.connect();

    await expect(client.waitFor("neverComes", 150)).rejects.toThrow(
      /waitFor\("neverComes"\) timed out/,
    );
  });

  test("timeout message lists the types that did arrive", async () => {
    const client = newClient();
    await client.connect();
    const serverSocket = connectedServerSockets[connectedServerSockets.length - 1];

    sendFromServer(serverSocket, { t: "hello" });
    sendFromServer(serverSocket, { t: "world" });

    await expect(client.waitFor("unseen", 200)).rejects.toThrow(
      /Received so far: \[hello, world\]/,
    );
  });

  test("send() encodes with MessagePack and the server decodes it back", async () => {
    const client = newClient();
    await client.connect();
    const serverSocket = connectedServerSockets[connectedServerSockets.length - 1];

    const serverGot = new Promise<unknown>((resolve) => {
      serverSocket.once("message", (data) => {
        const buf = Array.isArray(data)
          ? Buffer.concat(data.map((b) => Buffer.from(b)))
          : (data as Buffer);
        resolve(decode(buf));
      });
    });

    client.send({ t: "input", seq: 7, dir: { x: 1, z: 0 }, sprint: true });
    const decoded = await serverGot;
    expect(decoded).toEqual({
      t: "input",
      seq: 7,
      dir: { x: 1, z: 0 },
      sprint: true,
    });
  });

  test("close() rejects any outstanding waiters", async () => {
    const client = newClient();
    await client.connect();

    const pending = client.waitFor("nope", 2000);
    await client.close();
    await expect(pending).rejects.toThrow(/closed/);
  });

  test("connect() rejects cleanly on bad URL", async () => {
    const bad = new TestClient(
      "ws://127.0.0.1:1/r/BAD/ws",
      { playerId: "x", playerName: "x", dogType: "jep" },
      { defaultTimeoutMs: 500 },
    );
    await expect(bad.connect()).rejects.toBeDefined();
  });

  test("resolvedUrl appends identity query params", () => {
    const c = new TestClient(
      "ws://127.0.0.1:9999/r/AAA000/ws",
      {
        playerId: "p-xyz",
        playerName: "Name With Space",
        dogType: "scout",
        isPublic: true,
      },
    );
    const resolved = new URL(c.resolvedUrl());
    expect(resolved.searchParams.get("playerId")).toBe("p-xyz");
    expect(resolved.searchParams.get("playerName")).toBe("Name With Space");
    expect(resolved.searchParams.get("dogType")).toBe("scout");
    expect(resolved.searchParams.get("public")).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// fixtures: valid shapes
// ---------------------------------------------------------------------------

describe("fixtures", () => {
  test("exports two distinct player fixtures with valid shapes", () => {
    expect(PLAYERS.length).toBe(2);
    expect(PLAYER_A.persistentId).not.toBe(PLAYER_B.persistentId);
    expect(PLAYER_A.playerName).not.toBe(PLAYER_B.playerName);
    for (const p of PLAYERS) {
      expect(isValidPlayerFixture(p)).toBe(true);
    }
  });

  test("roomCreateBody returns a valid create payload", () => {
    const body = roomCreateBody(PLAYER_A, "alice-id");
    expect(body).toMatchObject({
      playerId: "alice-id",
      playerName: PLAYER_A.playerName,
      dogType: PLAYER_A.dogType,
      mode: "cooperative",
      isPublic: true,
    });
  });

  test("roomJoinBody returns a valid join payload", () => {
    const body = roomJoinBody(PLAYER_B, "bob-id");
    expect(body).toEqual({
      playerId: "bob-id",
      playerName: PLAYER_B.playerName,
      dogType: PLAYER_B.dogType,
    });
  });

  test("isValidPlayerFixture rejects malformed inputs", () => {
    expect(isValidPlayerFixture(null)).toBe(false);
    expect(isValidPlayerFixture({})).toBe(false);
    expect(isValidPlayerFixture({ persistentId: "x" })).toBe(false);
    expect(
      isValidPlayerFixture({
        persistentId: "x",
        playerName: "x",
        dogType: "x",
        nameType: "bogus",
      }),
    ).toBe(false);
  });
});
