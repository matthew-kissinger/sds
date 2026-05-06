import { test, expect } from '@playwright/test';
import {
  bootApp,
  createRoomAsHost,
  getMpProbe,
  joinRoomByCode,
  leaveLobby,
  navigateToMultiplayer,
  seedIdentity,
  makeIdentity,
  waitForRoomState,
} from './_helpers';

/**
 * Cycle 24 Phase 1 — lobby lifecycle.
 *
 * Drives host + guest through real menu flows and asserts that the worker's
 * authoritative room state stays in sync with both clients (read via
 * window.__sdsMpProbe).
 *
 * Out of scope here: in-game state, scene swap mid-game, sim-baseline
 * cross-check, reconnect grace. Those land in Phase 2/3.
 *
 * Note: there's no "kick" feature in current UI (Lobby.js exposes only
 * Leave Room + Start Game). The Cycle 24 plan's kick spec was aspirational
 * — skipped here, documented as a future gap.
 */

test.describe('Cycle 24 Phase 1 — lobby lifecycle', () => {
  // Two-tab tests on swiftshader CI take 90-180s per phase due to parallel
  // scene init on the same emulated GPU. 360s ceiling is the same shape as
  // scene-swap-stability.spec.ts.
  test.setTimeout(360_000);

  test('host creates room, guest joins by code, both see each other', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const hostId = makeIdentity('host');
    const guestId = makeIdentity('guest');
    await seedIdentity(hostContext, hostId);
    await seedIdentity(guestContext, guestId);

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      // Host creates the room.
      await bootApp(hostPage);
      await navigateToMultiplayer(hostPage);
      const roomCode = await createRoomAsHost(hostPage, { gameMode: 'cooperative', sheepCount: 200 });
      expect(roomCode).toMatch(/^[A-Z0-9]{4,8}$/);

      const hostProbe = await getMpProbe(hostPage);
      expect(hostProbe.isHost).toBe(true);
      expect(hostProbe.roomState).toBe('waiting');
      expect(hostProbe.playerCount).toBe(1);

      // Guest joins via code.
      await bootApp(guestPage);
      await navigateToMultiplayer(guestPage);
      await joinRoomByCode(guestPage, roomCode);

      const guestProbe = await getMpProbe(guestPage);
      expect(guestProbe.isHost).toBe(false);
      expect(guestProbe.roomCode).toBe(roomCode);
      expect(guestProbe.roomState).toBe('waiting');

      // Host should see 2 players post-join (broadcast playerJoined).
      await waitForRoomState(hostPage, { minPlayers: 2, timeoutMs: 15_000 });
      const hostAfterJoin = await getMpProbe(hostPage);
      expect(hostAfterJoin.playerCount).toBe(2);
      expect(hostAfterJoin.peers.find((p) => p.isMine)?.isHost).toBe(true);
      expect(hostAfterJoin.peers.find((p) => !p.isMine)?.isHost).toBe(false);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('guest leaving drops player count on host side', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    await seedIdentity(hostContext, makeIdentity('host'));
    await seedIdentity(guestContext, makeIdentity('guest'));

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      await bootApp(hostPage);
      await navigateToMultiplayer(hostPage);
      const roomCode = await createRoomAsHost(hostPage);

      await bootApp(guestPage);
      await navigateToMultiplayer(guestPage);
      await joinRoomByCode(guestPage, roomCode);

      await waitForRoomState(hostPage, { minPlayers: 2 });

      // Guest leaves via lobby UI.
      await leaveLobby(guestPage);

      // Host should observe playerCount drop back to 1 within ~5s
      // (RoomDO.handlePlayerLeave broadcasts 'playerLeft').
      await expect(async () => {
        const probe = await getMpProbe(hostPage);
        expect(probe.playerCount).toBe(1);
      }).toPass({ timeout: 10_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('host leaves with guest present → guest becomes new host (migration)', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    await seedIdentity(hostContext, makeIdentity('host'));
    await seedIdentity(guestContext, makeIdentity('guest'));

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      await bootApp(hostPage);
      await navigateToMultiplayer(hostPage);
      const roomCode = await createRoomAsHost(hostPage);

      await bootApp(guestPage);
      await navigateToMultiplayer(guestPage);
      await joinRoomByCode(guestPage, roomCode);

      await waitForRoomState(hostPage, { minPlayers: 2 });

      // Original host leaves. Guest should be promoted.
      await leaveLobby(hostPage);

      await expect(async () => {
        const guestProbe = await getMpProbe(guestPage);
        expect(guestProbe.isHost).toBe(true);
        expect(guestProbe.playerCount).toBe(1);
        expect(guestProbe.roomCode).toBe(roomCode);
      }).toPass({ timeout: 15_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('solo host leaves → room is torn down', async ({ browser }) => {
    const hostContext = await browser.newContext();
    await seedIdentity(hostContext, makeIdentity('lonelyHost'));
    const hostPage = await hostContext.newPage();

    try {
      await bootApp(hostPage);
      await navigateToMultiplayer(hostPage);
      await createRoomAsHost(hostPage);
      await leaveLobby(hostPage);

      // After leave, the React menu navigates back to dogSelection. The
      // probe should reflect a disconnected/empty state — no roomCode.
      await expect(async () => {
        const probe = await getMpProbe(hostPage);
        expect(probe.roomCode).toBeNull();
      }).toPass({ timeout: 10_000 });
    } finally {
      await hostContext.close();
    }
  });
});
