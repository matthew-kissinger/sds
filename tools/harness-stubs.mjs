// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Network stubs for the browser probes, so a receipt measures the game alone.
//
// Every probe opens the built client from a loopback origin that has no Worker
// behind it. Two requests then fail for reasons that have nothing to do with
// the game: the Cloudflare Web Analytics beacon in every HTML page cannot
// report from that origin (cloudflareinsights.com refuses it), and `/api/*`
// is a 404 or the single-page HTML from the static probe server
// (startPreviewServer in tools/probe-lib.mjs), never the Worker's JSON.
// Both used to land in receipts as failed requests and console errors, and
// several probes still stubbed the version 2 `/api/lobbies` route that the
// version 3 client never calls.
//
// This module deliberately imports nothing, so the hub probe, which loads
// Playwright from a path on the measurement machine, can use it as well.
// It takes a Playwright BrowserContext or Page; both expose `route`.

const PLAYER = { persistentId: 'harness-player', displayName: 'Player' };

/** The analytics beacon script and its report endpoint, any subdomain. */
const ANALYTICS = /^https:\/\/([a-z0-9-]+\.)*cloudflareinsights\.com\//;

/**
 * Answer the analytics beacon with an empty script and the score API with the
 * Worker's own response shapes (worker/src/index.ts) for a player who has no
 * times. `displayName` and `persistentId` let a probe pick the name its
 * screenshots show.
 */
export async function stubHarnessNetwork(target, { displayName = PLAYER.displayName, persistentId = PLAYER.persistentId } = {}) {
  await target.route(ANALYTICS, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));

  const profile = { persistent_id: persistentId, persistentId, displayName, fullName: displayName };
  await target.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    switch (path) {
      case '/api/healthz': return json({ ok: true, worker: 'harness-stub' });
      case '/api/register': return json({ token: 'harness-token', authSecret: 'harness-secret', playerProfile: profile });
      case '/api/rename': return json({ success: true, playerProfile: profile });
      case '/api/score': return json({ success: true, updated: false, isNewRecord: false, playerProfile: profile });
      case '/api/leaderboard':
      case '/api/my-scores': return json({ entries: [] });
      case '/api/leaderboards': return json({ leaderboards: [] });
      default: return json({ error: 'not found' }, 404);
    }
  });
}
