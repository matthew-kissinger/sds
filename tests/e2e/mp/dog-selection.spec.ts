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
 * Cycle 24 Phase 4 — MP dog-selection wiring.
 *
 * Ensures each player sees the correct dogType for every other player,
 * end-to-end through the path documented in
 * [`docs/multiplayer-dog-selection.md`](../../../docs/multiplayer-dog-selection.md).
 *
 * Verify-only path. No refactor unless a real wiring bug surfaces.
 */

test.describe('Cycle 24 Phase 4 — MP dog selection', () => {
  test.setTimeout(360_000);

  test('host=pip + guest=sally → each side sees the other dogType correctly', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    await seedIdentity(hostContext, makeIdentity('host'));
    await seedIdentity(guestContext, makeIdentity('guest'));
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      await bootApp(hostPage);
      await navigateToMultiplayer(hostPage, { pickDog: 'pip' });
      const roomCode = await createRoomAsHost(hostPage, { sheepCount: 200 });

      await bootApp(guestPage);
      await navigateToMultiplayer(guestPage, { pickDog: 'sally' });
      await joinRoomByCode(guestPage, roomCode);

      await waitForRoomState(hostPage, { minPlayers: 2, timeoutMs: 30_000 });

      // Each side's probe should report the other peer with the picked
      // dogType. Self also reports the picked dogType.
      const hostProbe = await getMpProbe(hostPage);
      const guestProbe = await getMpProbe(guestPage);

      const hostMe = hostProbe.peers.find((p) => p.isMine);
      const hostOther = hostProbe.peers.find((p) => !p.isMine);
      const guestMe = guestProbe.peers.find((p) => p.isMine);
      const guestOther = guestProbe.peers.find((p) => !p.isMine);

      expect(hostMe?.dogType).toBe('pip');
      expect(hostOther?.dogType).toBe('sally');
      expect(guestMe?.dogType).toBe('sally');
      expect(guestOther?.dogType).toBe('pip');
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('default selection — no explicit pickDog → both sides see jep', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    await seedIdentity(hostContext, makeIdentity('host'));
    await seedIdentity(guestContext, makeIdentity('guest'));
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      await bootApp(hostPage);
      await navigateToMultiplayer(hostPage); // no pickDog
      const roomCode = await createRoomAsHost(hostPage, { sheepCount: 200 });

      await bootApp(guestPage);
      await navigateToMultiplayer(guestPage); // no pickDog
      await joinRoomByCode(guestPage, roomCode);

      await waitForRoomState(hostPage, { minPlayers: 2, timeoutMs: 30_000 });

      const hostProbe = await getMpProbe(hostPage);
      const guestProbe = await getMpProbe(guestPage);
      // Default in MenuController is 'jep'; loadDogSelection only swaps
      // it if localStorage.selectedDog is one of the five canonical ids.
      // Test contexts don't seed localStorage, so default applies.
      for (const peer of [...hostProbe.peers, ...guestProbe.peers]) {
        expect(peer.dogType).toBe('jep');
      }
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('three-player permutation: host=jep, g1=pip, g2=shiloh — all peers see all dogTypes', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const g1Context = await browser.newContext();
    const g2Context = await browser.newContext();
    await seedIdentity(hostContext, makeIdentity('host'));
    await seedIdentity(g1Context, makeIdentity('g1'));
    await seedIdentity(g2Context, makeIdentity('g2'));
    const hostPage = await hostContext.newPage();
    const g1Page = await g1Context.newPage();
    const g2Page = await g2Context.newPage();

    try {
      await bootApp(hostPage);
      await navigateToMultiplayer(hostPage, { pickDog: 'jep' });
      const roomCode = await createRoomAsHost(hostPage, { sheepCount: 200, maxPlayers: 4 });

      await bootApp(g1Page);
      await navigateToMultiplayer(g1Page, { pickDog: 'pip' });
      await joinRoomByCode(g1Page, roomCode);

      await bootApp(g2Page);
      await navigateToMultiplayer(g2Page, { pickDog: 'shiloh' });
      await joinRoomByCode(g2Page, roomCode);

      await waitForRoomState(hostPage, { minPlayers: 3, timeoutMs: 45_000 });

      // Each page should see itself + the two others with correct dogTypes.
      const expectedDogTypes = new Set(['jep', 'pip', 'shiloh']);
      for (const page of [hostPage, g1Page, g2Page]) {
        const probe = await getMpProbe(page);
        expect(probe.peers).toHaveLength(3);
        const seen = new Set(probe.peers.map((p) => p.dogType));
        expect(seen).toEqual(expectedDogTypes);
      }
    } finally {
      await hostContext.close();
      await g1Context.close();
      await g2Context.close();
    }
  });
});
