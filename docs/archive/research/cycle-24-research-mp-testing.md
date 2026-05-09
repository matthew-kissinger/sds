# Cycle 24 — MP testing research (2026-05-05)

> Background research for Cycle 24 Path A. Drafted before phase planning. Sources at the end.

## TL;DR

- **Stack target:** local Playwright with two `browser.newContext()` per test (host + N guests). Forget Browserbase for MP CI.
- **Backend:** keep the current `npm run dev` (Vite + `wrangler dev`) as the test harness. Wrangler v3+ uses Miniflare under the hood with full DO + WS support — same code path as production.
- **Reconnect grace:** **15 seconds** for the in-game state, 0 seconds in the lobby (current behavior is fine for `state === 'waiting'`). Reasoning below.
- **Suite shape:** 4 phases over the cycle, ordered cheapest-signal-first (lobby → in-game → reconnect → adversarial).

## 1. Cleanest two-tab pattern for our stack

Two contexts, not two pages. Two `page`s in the same context share storage, cookies, and BroadcastChannel — guests would see the host's `playerIdentity` localStorage and the test would silently break. `newContext()` per role gives clean isolation, identical to two separate browsers.

Sketch (~10 lines, drop into a helper):

```ts
// tests/e2e/mp/helpers.ts
import { test as base, type BrowserContext, type Page } from '@playwright/test';

export async function spawnPeer(browser: any, name: string): Promise<Page> {
  const ctx: BrowserContext = await browser.newContext();
  await ctx.addInitScript((n: string) => {
    localStorage.setItem('playerIdentity', JSON.stringify({
      persistentId: `p_${n}_${Date.now()}`, displayName: n,
      fullName: `${n}#0001`, discriminator: '0001', nameType: 'custom',
      createdAt: Date.now(), isRegistered: false,
    }));
  }, name);
  return ctx.newPage();
}

// In a spec:
const host = await spawnPeer(browser, 'Host');
const guest = await spawnPeer(browser, 'Guest');
await host.goto('/'); /* create room flow, capture #ABCD code */
await guest.goto(`/?room=ABCD`); /* join flow */
// Assert WS exchange via the existing __sdsSwapProbe-style harness rather
// than page.on('websocket') — msgpack frames are binary and decoding them
// in the test is more brittle than exposing window.__sdsMpProbe() with
// players, connectionState, lastEvent.
```

Why a probe over `page.on('websocket')`: our wire is msgpack (`@msgpack/msgpack`), so `framereceived` events arrive as base64-ish binary payloads. Decoding them in-test re-implements `RoomDO.encodeMsg` and breaks every time we add a field. The Cycle 18 `__sdsSwapProbe` pattern already proved that exposing a typed JS observer on `window` is faster to write and more readable than wire-level assertions. Add a `window.__sdsMpProbe()` returning `{ playerId, isHost, players, state, lastEvent, connectionState, ping }`.

For events the test really needs to observe at wire level (e.g., a regression test that a malformed frame gets ignored), `page.on('websocket', ws => ws.on('framereceived', ...))` is fine — but reach for it the second time, not the first.

## 2. Browserbase vs local Playwright

**Local wins.** ROI math:

- Browserbase Developer ($20/mo) caps at 25 concurrent browsers and is **Chromium + Firefox only — no WebKit**. Our existing `playwright.config.ts` already runs all three engines locally; moving MP tests to Browserbase regresses cross-engine coverage on the most network-sensitive code we have.
- Browserbase shines for *fleet* concurrency (1000s of agents) or for IP/geo testing. Neither applies — we're testing a host + 1–3 guests on one box.
- Our DO is `wrangler dev` (Miniflare) on localhost. Routing that traffic through Browserbase means tunneling localhost → cloud or deploying ephemeral previews per PR. Both add ~30–60s per test run for no gain.
- GH Actions Linux runners already run our 3-engine matrix in headless mode. Adding 1 worker dedicated to a `mp` project (separate from the existing chromium/firefox/webkit projects) is one config block.

Use Browserbase only if/when we need: (a) real Safari on iOS (Browserbase doesn't help there either — that's BrowserStack/Sauce), or (b) a load test with 50+ concurrent guests (different cycle).

## 3. Phase suggestions for Cycle 24 MP test cycle

**Phase 1 — lobby lifecycle (cheapest signal). ~3hr.**
Tests: host creates a room → guest joins via code → `/meta` returns 2 players → host clicks Start → both pages reach `state === 'in-game'` → host clicks Leave → `playerLeft` arrives at guest → host migration fires → empty-room cleanup deletes DO storage. Acceptance: all 6 transitions assertable via `__sdsMpProbe`. No game-canvas waits — keep this phase fast.

**Phase 2 — in-game multiplayer + scene-swap. ~4hr.**
Tests: 2-player Classic on Field; verify both clients see the same `gameStateUpdate` sheep count within 1 frame; one player's `playerInput` moves their dog on the *other* page. Mode-locked + scene-swap regression (RoomDO restart still recreates flock at new scene's spawn under MP). Acceptance: sheep delta < 5 between host/guest probes; cross-page input-to-render p95 < 200ms over LAN.

**Phase 3 — reconnect + grace window. ~4hr.**
Requires implementing the grace window first (see §4) — then test it. Tests: drop a guest's WS via `context.setOffline(true)`, assert host probe shows guest in `disconnected` state but still in `players[]`; bring back online within grace, assert reconnect succeeds and replays state; let it expire, assert `playerLeft` fires. Acceptance: 3 timing variants (under, at, over grace) all pass deterministically with `--repeat-each=5`.

**Phase 4 — adversarial / Cycle 23 regression gates. ~3hr.**
Mobile-guest gate: spoof iPhone UA, attempt join on a 5000-sheep room, expect 403. Cinematic-flag URL strip: invite link with `?cinematic=1` strips on join. Cap allow-list: hosts can't init a 9999-sheep room. Acceptance: each Cycle 23 Phase E commit gets an explicit failing-without-the-fix test.

Order matters: Phase 1 catches the most regressions per minute, Phase 4 protects shipped cheap wins from rot. Phase 3 is last because it requires new server code, not just tests.

## 4. Reconnect grace recommendation

**15 seconds, in-game only.** Reasoning:

- Today `RoomDO.handlePlayerDisconnect` calls `handlePlayerLeave` immediately. Mobile clients backgrounding for an elevator, a tunnel, or an app-switch (3–10s typical) get evicted mid-game and lose their score. The Cycle 23 mobile-guest extension makes this worse.
- Survey of public defaults: Colyseus has no default — devs typically pick **10–20s** in `allowReconnection()`. Nakama uses **5s** ConnectTimeout but no grace concept. AAA games use **3–5 minutes** but that's reconnect-to-match-after-relaunch, a different pattern (and they restart the engine to do it). Fortnite Ballistic ranked is 3 min. Roblox/Roact internal multiplayer: 30s.
- 15s is the sweet spot: covers 95% of mobile background events and brief WiFi handoffs, short enough that surviving players don't notice a "ghost" sheepdog, well under the 60Hz broadcast loop's CPU cost amortization. The lobby case (`state === 'waiting'`) should stay at 0s — joining the lobby is cheap and people should be able to walk away cleanly.
- Implementation: in `handlePlayerDisconnect`, if `meta.state === 'in-game'`, schedule a 15s timeout that calls `handlePlayerLeave`. On reconnect (existing `bindSocket` path that closes the prior socket), clear the timeout. The sim adapter's `sheepdogs.delete` call already lives behind `handlePlayerLeave`, so a reconnecting player keeps their dog. **One net change: don't delete the sheepdog inside the grace window.** This is also the cheapest test target for Phase 3.

## 5. "You should test this too" risks we'd miss

- **Host-migration race.** Two guests in a room; host closes tab; both guests' code path runs `Array.from(this.players.keys())[0]` for new host. If WS close events arrive in different orders across the two guest sockets, both sides could briefly disagree on who's host. Test with deterministic close ordering (`host.close()` then assert both peers report `newHostId === <first-guest-id>` within 500ms).
- **`/meta` GET race vs WS bind.** REST `/join` returns before the WS `bindSocket` fires — there's a window where `players[]` includes the joiner but no WS exists. A test that immediately broadcasts after join can flake. Add an explicit `connectionState === 'connected'` wait helper.
- **MessagePack frame type coercion.** RoomDO accepts `ArrayBuffer | Uint8Array | Blob`. CI's headless Chromium sends one type, headed Firefox sends another. Worth a regression test that all three paths in `bindSocket`'s message handler decode identically (smallest msg + largest gameStateUpdate at 5000 sheep).
- **DO hibernation.** Cycle 23 didn't migrate to the WebSocket Hibernation API. If we ever do, all current sessions go through `webSocketMessage()` instead of `addEventListener` and the test harness must keep up. Document as future-cycle, not Cycle 24.
- **Two hosts joining the same room code.** `initRoom` returns 409 if `meta` exists, but a race between two `/init` POSTs to the router (LobbyDO) hasn't been e2e-tested. Worth one test.
- **Ping pong drift.** Client `MultiplayerState.updatePing` keeps a 10-sample rolling history; the server replies in `handleClientMessage` `case 'ping'`. Test that ping floor stays under 50ms on localhost (regression catch for accidental synchronous awaits in the broadcast loop).

## Sources

- [Playwright multi-context usage](https://dev.to/raghwendrasonu/using-multiple-browser-contexts-in-playwright-with-real-life-examples--3mga) — `browser.newContext()` per user, isolation rationale
- [Playwright WebSocket API](https://playwright.dev/docs/api/class-websocket) + [framereceived event](https://runebook.dev/en/docs/playwright/api/class-websocket/web-socket-event-frame-received)
- [Wrangler/Miniflare DO + WS local dev](https://developers.cloudflare.com/workers/development-testing/) — Wrangler v3+ uses Miniflare for local DO + WS parity with prod
- [Cloudflare Playwright fork (Browser Rendering)](https://github.com/cloudflare/playwright) — relevant if we ever move to remote browser
- [Browserbase pricing & concurrency](https://www.browserbase.com/pricing) — 25 concurrent on Developer, 100 on Startup; Chromium + Firefox, no WebKit confirmed
- [Colyseus 0.17 reconnect docs](https://0-15-x.docs.colyseus.io/server/room/) — 10–20s typical `allowReconnection` values
- [Heroic Labs (Nakama) shutdown grace](https://forum.heroiclabs.com/t/about-the-shutdown-grace/570) — 5s default ConnectTimeout
- [Fortnite Ballistic reconnect grace](https://www.epicgames.com/help/en-US/c-Category_Fortnite/c-Fortnite_PlayerBehavior/are-penalties-applied-for-fortnite-ballistic-in-a-ranked-match-a000093065) — 3min for ranked penalty (different pattern, included for context)
- [Cloudflare DO WS hibernation](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/) — future-cycle migration target
