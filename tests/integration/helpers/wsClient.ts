// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Test-only WebSocket client for the two-client integration harness.
//
// Wraps the node `ws` library and speaks MessagePack so tests can exercise
// the worker exactly like a real browser would. Not used in production.
//
// Usage:
//   const client = new TestClient("ws://localhost:8787/r/ABC123/ws", {
//     playerId: "p1",
//     playerName: "Alice",
//     dogType: "jep",
//   });
//   await client.connect();
//   client.send({ t: "ready" });
//   const lobby = await client.waitFor("lobby");
//   await client.close();

import { decode, encode } from "@msgpack/msgpack";
import WebSocket from "ws";

// ---------------------------------------------------------------------------
// P2-DELTA mirror (upkeep A1, dossier F5). The wire protocol v3 sends the
// delta-capable cohort a keyframe (full `gameStateUpdate`, tick-stamped)
// every KEYFRAME_INTERVAL_TICKS and a changed-sheep `gameStateDelta`
// otherwise. The constants and apply semantics below mirror
// js/NetworkManager.js exactly so live integration specs observe state at
// the broadcast cadence instead of the ~1Hz keyframe cadence.
// ---------------------------------------------------------------------------

// Conditional blocks that ride every gameStateDelta with snapshot-identical
// semantics - copied onto the reconstructed snapshot only when present on
// the frame. Mirrors NetworkManager's DELTA_CONDITIONAL_BLOCKS.
const DELTA_CONDITIONAL_BLOCKS = [
  "competitive",
  "timedMode",
  "objective",
  "survival",
  "wolves",
] as const;

// Cooldown between requestKeyframe sends after a baseTick gap, mirroring
// NetworkManager's KEYFRAME_REQUEST_COOLDOWN_MS (the DO additionally caps
// unicast keyframes at 2/s per client).
const KEYFRAME_REQUEST_COOLDOWN_MS = 500;

/** A reconstructed full game snapshot (keyframe or applied delta), `t` stripped. */
export type GameSnapshot = { [k: string]: unknown };

export interface Identity {
  playerId: string;
  playerName: string;
  dogType: string;
  // Optional: mark a room public on first WS upgrade per protocol-v2.
  isPublic?: boolean;
}

export interface AnyMessage {
  t: string;
  [k: string]: unknown;
}

export interface TestClientOptions {
  /** Per-message decode timeout. Defaults to 5000ms. */
  defaultTimeoutMs?: number;
  /**
   * If true, append identity fields as query string params on connect.
   * Set to false when the caller has already baked them into `url`.
   * Defaults to true.
   */
  appendIdentityQuery?: boolean;
  /**
   * Override WebSocket constructor for tests. Defaults to node `ws`.
   * Must match the `ws` module surface (constructor + .on + .send + .close).
   */
  WebSocketCtor?: typeof WebSocket;
}

interface PendingWaiter {
  type: string;
  resolve: (msg: AnyMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface SnapshotWaiter {
  predicate: (s: GameSnapshot) => boolean;
  resolve: (s: GameSnapshot) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class TestClient {
  public readonly url: string;
  public readonly identity: Identity;
  public readonly received: AnyMessage[] = [];

  /**
   * P2-DELTA mirror: reconstructed full snapshots in arrival order - one per
   * keyframe (`gameStateUpdate`) and one per APPLIED `gameStateDelta`. Raw
   * frames stay untouched in `received`, so cadence assertions on the wire
   * stream (`allOfType("gameStateDelta")`) still see exactly what arrived.
   */
  public readonly snapshots: GameSnapshot[] = [];

  /** Tick of the last applied game frame; null until a tick-stamped keyframe arrives. */
  public lastAppliedTick: number | null = null;

  private socket: WebSocket | null = null;
  private readonly defaultTimeoutMs: number;
  private readonly appendIdentityQuery: boolean;
  private readonly WebSocketCtor: typeof WebSocket;
  private readonly waiters: PendingWaiter[] = [];
  private readonly snapshotWaiters: SnapshotWaiter[] = [];
  private closedByUs = false;

  // P2-DELTA mirror of NetworkManager's reconstruction state.
  private deltaBase: GameSnapshot | null = null;
  private awaitingKeyframe = false;
  private lastKeyframeRequestAt = -Infinity;

  constructor(url: string, identity: Identity, opts: TestClientOptions = {}) {
    this.url = url;
    this.identity = identity;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 5000;
    this.appendIdentityQuery = opts.appendIdentityQuery ?? true;
    this.WebSocketCtor = opts.WebSocketCtor ?? WebSocket;
  }

  /** Build the final connection URL with identity query params. */
  public resolvedUrl(): string {
    if (!this.appendIdentityQuery) return this.url;
    const u = new URL(this.url);
    u.searchParams.set("playerId", this.identity.playerId);
    u.searchParams.set("playerName", this.identity.playerName);
    u.searchParams.set("dogType", this.identity.dogType);
    if (this.identity.isPublic) u.searchParams.set("public", "1");
    return u.toString();
  }

  /** Open the socket. Resolves on `open`, rejects on `error` before open. */
  public connect(): Promise<void> {
    if (this.socket) {
      return Promise.reject(new Error("TestClient already connected"));
    }
    const finalUrl = this.resolvedUrl();
    const ws = new this.WebSocketCtor(finalUrl);
    this.socket = ws;

    return new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        ws.removeListener("error", onError);
        resolve();
      };
      const onError = (err: Error) => {
        ws.removeListener("open", onOpen);
        reject(err);
      };
      ws.once("open", onOpen);
      ws.once("error", onError);

      ws.on("message", (data: WebSocket.RawData) => {
        this.handleIncoming(data);
      });
      ws.on("close", () => {
        this.drainWaiters(
          new Error(
            this.closedByUs
              ? "TestClient closed before message arrived"
              : "TestClient socket closed unexpectedly",
          ),
        );
      });
      ws.on("error", (err: Error) => {
        // Post-open errors should reject any pending waiters so tests fail
        // fast rather than hanging on a socket that is no longer delivering.
        this.drainWaiters(err);
      });
    });
  }

  /** MessagePack-encode and send a message. */
  public send(msg: AnyMessage): void {
    if (!this.socket) throw new Error("TestClient: not connected");
    if (this.socket.readyState !== this.WebSocketCtor.OPEN) {
      throw new Error(
        `TestClient: socket not open (readyState=${this.socket.readyState})`,
      );
    }
    const encoded = encode(msg);
    // `ws` accepts Buffer directly; wrap to ArrayBuffer-shape for clarity.
    const buf = Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    this.socket.send(buf, { binary: true });
  }

  /**
   * Wait for the next message with a matching `t`. Messages received before
   * this call are NOT consulted - call `.findInLog(t)` for that. The waiter
   * rejects if the timeout elapses.
   */
  public waitFor(t: string, timeoutMs?: number): Promise<AnyMessage> {
    const budget = timeoutMs ?? this.defaultTimeoutMs;
    return new Promise<AnyMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w === waiter);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(
          new Error(
            `TestClient.waitFor("${t}") timed out after ${budget}ms. ` +
              `Received so far: [${this.received.map((m) => m.t).join(", ")}]`,
          ),
        );
      }, budget);
      const waiter: PendingWaiter = { type: t, resolve, reject, timer };
      this.waiters.push(waiter);
    });
  }

  /** Synchronous scan of the event log for a given type. */
  public findInLog(t: string): AnyMessage | undefined {
    return this.received.find((m) => m.t === t);
  }

  /** All messages of a given type seen so far. */
  public allOfType(t: string): AnyMessage[] {
    return this.received.filter((m) => m.t === t);
  }

  /**
   * Wait for the NEXT reconstructed snapshot (keyframe or applied delta)
   * matching `predicate`. Snapshots ingested before this call are NOT
   * consulted - scan `.snapshots` for that. Rejects on timeout.
   */
  public waitForSnapshot(
    predicate: (s: GameSnapshot) => boolean = () => true,
    timeoutMs?: number,
  ): Promise<GameSnapshot> {
    const budget = timeoutMs ?? this.defaultTimeoutMs;
    return new Promise<GameSnapshot>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.snapshotWaiters.findIndex((w) => w === waiter);
        if (idx !== -1) this.snapshotWaiters.splice(idx, 1);
        reject(
          new Error(
            `TestClient.waitForSnapshot() timed out after ${budget}ms. ` +
              `Snapshots ingested so far: ${this.snapshots.length}`,
          ),
        );
      }, budget);
      const waiter: SnapshotWaiter = { predicate, resolve, reject, timer };
      this.snapshotWaiters.push(waiter);
    });
  }

  /** Close the socket cleanly. Safe to call more than once. */
  public async close(code = 1000, reason = "test-complete"): Promise<void> {
    if (!this.socket) return;
    this.closedByUs = true;
    const ws = this.socket;
    if (
      ws.readyState === this.WebSocketCtor.CLOSED ||
      ws.readyState === this.WebSocketCtor.CLOSING
    ) {
      return;
    }
    await new Promise<void>((resolve) => {
      ws.once("close", () => resolve());
      try {
        ws.close(code, reason);
      } catch {
        resolve();
      }
    });
  }

  // ---- internals ---------------------------------------------------------

  private handleIncoming(data: WebSocket.RawData): void {
    let buf: Uint8Array;
    if (Array.isArray(data)) {
      buf = Buffer.concat(data.map((b) => Buffer.from(b)));
    } else if (data instanceof ArrayBuffer) {
      buf = new Uint8Array(data);
    } else {
      buf = data as Buffer;
    }
    let decoded: unknown;
    try {
      decoded = decode(buf);
    } catch (err) {
      // Surface decode errors via waiter rejections; don't throw from the
      // socket listener or we'll kill the process.
      this.drainWaiters(
        new Error(
          `TestClient: MessagePack decode failed: ${(err as Error).message}`,
        ),
      );
      return;
    }
    if (!decoded || typeof decoded !== "object" || !("t" in (decoded as object))) {
      this.drainWaiters(
        new Error(
          `TestClient: received message without 't' field: ${JSON.stringify(decoded)}`,
        ),
      );
      return;
    }
    const msg = decoded as AnyMessage;
    this.received.push(msg);

    // Fulfill the first waiter that matches this type.
    const idx = this.waiters.findIndex((w) => w.type === msg.t);
    if (idx !== -1) {
      const waiter = this.waiters.splice(idx, 1)[0];
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
    }

    // P2-DELTA mirror: feed the snapshot reconstruction (upkeep A1 / F5).
    if (msg.t === "gameStateUpdate") this.applyKeyframe(msg);
    else if (msg.t === "gameStateDelta") this.applyDelta(msg);
  }

  /**
   * Mirror of NetworkManager._handleGameStateUpdate: any full
   * gameStateUpdate is a keyframe - replace the reconstructed snapshot
   * wholesale. A pre-delta (v2 cohort) stream sends no deltas, so on it the
   * snapshot log is simply one snapshot per full frame.
   */
  private applyKeyframe(msg: AnyMessage): void {
    const { t: _t, ...state } = msg;
    this.deltaBase = state;
    this.lastAppliedTick = (state.tick as number | undefined) ?? null;
    this.awaitingKeyframe = false;
    this.ingestSnapshot(state);
  }

  /**
   * Mirror of NetworkManager._handleGameStateDelta: a delta applies only
   * when its baseTick matches the tick of the last applied frame; on any gap
   * it is discarded, a keyframe is requested (cooldown-limited), and further
   * deltas are dropped until a full gameStateUpdate arrives.
   */
  private applyDelta(msg: AnyMessage): void {
    if (
      this.awaitingKeyframe ||
      !this.deltaBase ||
      this.lastAppliedTick === null ||
      msg.baseTick !== this.lastAppliedTick
    ) {
      this.requestKeyframe();
      return;
    }

    // Fresh sheep array per apply: unchanged entries share the previous
    // record references; a changed entry REPLACES the record wholesale at
    // index `i` - key presence included (a key absent on the new record is
    // gone), mirroring the server's per-key record compare.
    const sheep = (this.deltaBase.sheep as GameSnapshot[]).slice();
    const changed = Array.isArray(msg.changed)
      ? (msg.changed as Array<GameSnapshot & { i: number }>)
      : [];
    for (const c of changed) {
      const { i, ...rec } = c;
      sheep[i] = rec;
    }

    const state: GameSnapshot = {
      v: msg.v,
      tick: msg.tick,
      timestamp: msg.timestamp,
      sheepRetired: msg.sheepRetired,
      totalSheep: msg.totalSheep,
      gameCompleted: msg.gameCompleted,
      isCompetitive: msg.isCompetitive,
      isTimedMode: msg.isTimedMode,
      sheep,
      sheepdogs: msg.sheepdogs,
    };
    // Conditional blocks ride every delta with snapshot-identical semantics:
    // present on the reconstruction iff present on the frame.
    for (const k of DELTA_CONDITIONAL_BLOCKS) {
      if (k in msg) state[k] = msg[k];
    }

    this.deltaBase = state;
    this.lastAppliedTick = msg.tick as number;
    this.ingestSnapshot(state);
  }

  /** Shared tail of the keyframe and delta paths: log + fulfill snapshot waiters. */
  private ingestSnapshot(state: GameSnapshot): void {
    this.snapshots.push(state);
    const idx = this.snapshotWaiters.findIndex((w) => w.predicate(state));
    if (idx !== -1) {
      const waiter = this.snapshotWaiters.splice(idx, 1)[0];
      clearTimeout(waiter.timer);
      waiter.resolve(state);
    }
  }

  /**
   * Mirror of NetworkManager._requestKeyframe: ask the DO for an on-demand
   * keyframe after a baseTick gap, at most one send per cooldown window.
   */
  private requestKeyframe(): void {
    this.awaitingKeyframe = true;
    const now = Date.now();
    if (now - this.lastKeyframeRequestAt < KEYFRAME_REQUEST_COOLDOWN_MS) return;
    this.lastKeyframeRequestAt = now;
    try {
      this.send({ t: "requestKeyframe" });
    } catch {
      // Socket not open: the next cadence keyframe resynchronizes anyway.
    }
  }

  private drainWaiters(err: Error): void {
    while (this.waiters.length) {
      const w = this.waiters.shift()!;
      clearTimeout(w.timer);
      w.reject(err);
    }
    while (this.snapshotWaiters.length) {
      const w = this.snapshotWaiters.shift()!;
      clearTimeout(w.timer);
      w.reject(err);
    }
  }
}
