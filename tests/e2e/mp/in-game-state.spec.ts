import { test, expect } from '@playwright/test';
import {
  bootApp,
  createRoomAsHost,
  getMpProbe,
  joinRoomByCode,
  navigateToMultiplayer,
  seedIdentity,
  makeIdentity,
  waitForRoomState,
} from './_helpers';

/**
 * Cycle 24 Phase 2 — in-game state propagation.
 *
 * Once host clicks Start Game (UI gates on >=2 players), the worker flips
 * meta.state to 'in-game'. Both clients should observe the transition + see
 * matching sheepCount, gameMode, sceneId.
 *
 * Out of scope: actual sheep retirement (requires canvas + input sim);
 * mid-game scene-swap (not a worker-supported flow — sceneId is fixed at
 * room creation per worker/src/RoomDO.ts:188).
 */

test.describe('Cycle 24 Phase 2 — in-game state', () => {
  test.setTimeout(360_000);

  test('host start-game transitions both clients to in-game with matching state', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    await seedIdentity(hostContext, makeIdentity('host'));
    await seedIdentity(guestContext, makeIdentity('guest'));
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      await bootApp(hostPage);
      await navigateToMultiplayer(hostPage);
      const roomCode = await createRoomAsHost(hostPage, {
        gameMode: 'cooperative',
        sheepCount: 200,
        maxPlayers: 4,
      });

      await bootApp(guestPage);
      await navigateToMultiplayer(guestPage);
      await joinRoomByCode(guestPage, roomCode);

      await waitForRoomState(hostPage, { minPlayers: 2, timeoutMs: 30_000 });

      // Host clicks Start Game (only enabled with >=2 players per Lobby.js:292).
      const startBtn = hostPage.getByRole('button', { name: /^Start Game$/i });
      await expect(startBtn).toBeVisible({ timeout: 15_000 });
      await expect(startBtn).toBeEnabled({ timeout: 15_000 });
      await startBtn.dispatchEvent('click');

      // Both clients should see state flip to 'in-game' via roomUpdated.
      await waitForRoomState(hostPage, { roomState: 'in-game', timeoutMs: 30_000 });
      await waitForRoomState(guestPage, { roomState: 'in-game', timeoutMs: 30_000 });

      const hostProbe = await getMpProbe(hostPage);
      const guestProbe = await getMpProbe(guestPage);
      expect(hostProbe.sheepCount).toBe(200);
      expect(guestProbe.sheepCount).toBe(200);
      expect(hostProbe.gameMode).toBe('cooperative');
      expect(guestProbe.gameMode).toBe('cooperative');
      expect(hostProbe.sceneId).toBe(guestProbe.sceneId);
      expect(hostProbe.roomCode).toBe(guestProbe.roomCode);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('Insane (3000) room starts in-game with sheepCount=3000 on both clients', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    await seedIdentity(hostContext, makeIdentity('host'));
    await seedIdentity(guestContext, makeIdentity('guest'));
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      await bootApp(hostPage);
      await navigateToMultiplayer(hostPage);
      const roomCode = await createRoomAsHost(hostPage, {
        gameMode: 'cooperative',
        sheepCount: 3000,
        maxPlayers: 4,
      });

      await bootApp(guestPage);
      await navigateToMultiplayer(guestPage);
      await joinRoomByCode(guestPage, roomCode);

      await waitForRoomState(hostPage, { minPlayers: 2, timeoutMs: 30_000 });

      const startBtn = hostPage.getByRole('button', { name: /^Start Game$/i });
      await expect(startBtn).toBeEnabled({ timeout: 15_000 });
      await startBtn.dispatchEvent('click');

      await waitForRoomState(hostPage, { roomState: 'in-game', timeoutMs: 30_000 });
      await waitForRoomState(guestPage, { roomState: 'in-game', timeoutMs: 30_000 });

      const hostProbe = await getMpProbe(hostPage);
      const guestProbe = await getMpProbe(guestPage);
      expect(hostProbe.sheepCount).toBe(3000);
      expect(guestProbe.sheepCount).toBe(3000);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('competitive mode propagates to guest', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    await seedIdentity(hostContext, makeIdentity('host'));
    await seedIdentity(guestContext, makeIdentity('guest'));
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      await bootApp(hostPage);
      await navigateToMultiplayer(hostPage);
      const roomCode = await createRoomAsHost(hostPage, {
        gameMode: 'competitive',
        sheepCount: 200,
      });

      await bootApp(guestPage);
      await navigateToMultiplayer(guestPage);
      await joinRoomByCode(guestPage, roomCode);

      await waitForRoomState(guestPage, { minPlayers: 2, timeoutMs: 30_000 });
      const guestProbe = await getMpProbe(guestPage);
      expect(guestProbe.gameMode).toBe('competitive');
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
