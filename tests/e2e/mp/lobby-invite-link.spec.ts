import { test, expect } from '@playwright/test';
import {
  bootApp,
  bootViaInvite,
  createRoomAsHost,
  getMpProbe,
  navigateToMultiplayer,
  seedIdentity,
  makeIdentity,
  waitForRoomState,
} from './_helpers';

/**
 * Cycle 24 Phase 1 — invite-hash join flow.
 *
 * Asserts the App.js useEffect that consumes `#/r/CODE`, strips the hash,
 * and routes to the joinRoom screen with the code pre-filled.
 */
test.describe('Cycle 24 Phase 1 — invite link', () => {
  test.setTimeout(360_000);

  test('guest opens #/r/CODE → routed to join screen → joins room', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    await seedIdentity(hostContext, makeIdentity('host'));
    await seedIdentity(guestContext, makeIdentity('guestInvite'));

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      // Host opens a room; invite code = host's room code.
      await bootApp(hostPage);
      await navigateToMultiplayer(hostPage);
      const roomCode = await createRoomAsHost(hostPage);

      // Guest boots via #/r/CODE — the App.js effect strips the hash and
      // routes to joinRoom; bootViaInvite then clicks Join.
      await bootViaInvite(guestPage, roomCode);

      const guestProbe = await getMpProbe(guestPage);
      expect(guestProbe.roomCode).toBe(roomCode);
      expect(guestProbe.isHost).toBe(false);

      // Hash + search should have been stripped on consume — App.js calls
      // history.replaceState(null, '', location.pathname).
      const url = await guestPage.evaluate(() => ({ search: location.search, hash: location.hash }));
      // Search may carry the ?mpProbe=1 param (preserved through stripCinematicOnInvite),
      // but the hash must be empty after the App.js effect consumed the invite.
      // (Actually the App.js effect does `history.replaceState(null, '', location.pathname)`
      // which also strips the search. Confirm both.)
      expect(url.hash).toBe('');

      // Host should see the new player.
      await waitForRoomState(hostPage, { minPlayers: 2, timeoutMs: 15_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
