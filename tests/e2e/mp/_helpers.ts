import { expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Cycle 24 Phase 1 — multiplayer e2e helpers.
 *
 * Each helper opens a fresh browser context (per scene-swap-stability.spec.ts
 * lessons) so host + guest don't share localStorage / token state inside the
 * same Chromium tab tree.
 *
 * Specs read room state via window.__sdsMpProbe() (installed by main.js when
 * the page is opened with ?mpProbe=1). Avoids decoding msgpack frames in
 * tests, which would couple specs to wire format.
 */

export type MpProbe = {
  playerId: string | null;
  peers: Array<{ id: string; name: string; dogType: string; isHost: boolean; isMine: boolean }>;
  playerCount: number;
  roomCode: string | null;
  roomState: 'waiting' | 'in-game' | 'finished' | null;
  sheepCount: number | null;
  gameMode: 'cooperative' | 'competitive' | 'timed' | null;
  sceneId: string | null;
  isHost: boolean;
  connected: boolean;
  connecting: boolean;
};

// Cycle 24 Phase 1: every helper boot uses both flags together.
// - mpProbe=1 — install __sdsMpProbe global (gates main.js install)
// - testNoCanvas=1 — skip heavy 3D init + animate loop. React UI + the
//   NetworkManager still mount; the tests only need MP flow + lobby UI.
//   Two-tab tests on swiftshader were timing out because parallel scene
//   inits saturate the JS thread and React renders stall behind rAF.
const PROBE_QUERY = 'mpProbe=1&testNoCanvas=1';

export type Identity = {
  persistentId: string;
  displayName: string;
};

export function makeIdentity(label: string): Identity {
  // Stable-ish but unique-per-run id so the worker doesn't merge sessions.
  const rand = Math.random().toString(36).slice(2, 8);
  return {
    persistentId: `player_${label}_${Date.now()}_${rand}`,
    displayName: `${label}-${rand}`,
  };
}

export async function seedIdentity(context: BrowserContext, identity: Identity): Promise<void> {
  await context.addInitScript((id) => {
    const stored = {
      persistentId: id.persistentId,
      displayName: id.displayName,
      fullName: `${id.displayName}#0001`,
      discriminator: '0001',
      nameType: 'custom',
      createdAt: Date.now(),
      isRegistered: false,
    };
    localStorage.setItem('playerIdentity', JSON.stringify(stored));
  }, identity);
}

/** Boot to the React main menu with the MP probe installed. */
export async function bootApp(page: Page, opts: { extraQuery?: string; hash?: string } = {}): Promise<void> {
  const search = opts.extraQuery ? `?${PROBE_QUERY}&${opts.extraQuery}` : `?${PROBE_QUERY}`;
  const hash = opts.hash ? `#${opts.hash}` : '';
  await page.goto(`/${search}${hash}`, { waitUntil: 'domcontentloaded' });
  // Wait for any main-menu signal (or the join-room screen if seeded via hash).
  // 90s timeout because two-tab MP tests run scene init on both pages
  // simultaneously, and chromium-on-swiftshader stalls the JS thread under
  // GPU contention. Single-tab smoke specs run in ~10s; this bound is the
  // p99 ceiling we've seen with two parallel scene inits.
  await expect(async () => {
    const visible = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button')).map((b) => b.textContent || '');
      return buttons.some((t) => /Multiplayer|Solo Play|Join Room|Welcome to Sheep Dog/i.test(t));
    });
    expect(visible).toBe(true);
  }).toPass({ timeout: 90_000 });
}

// Dog name → en locale label used in DogSelection card <h3>. Matches the
// translation in js/locales/en/index.js. The DogSelection card button has
// no aria-label, so tests find it by the visible <h3> name.
const DOG_DISPLAY_NAMES: Record<string, RegExp> = {
  jep: /^Jep\b/,
  pip: /^Pip\b/,
  sally: /^Sally\b/,
  shiloh: /^Shiloh\b/,
  george_washington: /^George Washington\b/,
};

/**
 * Navigate main menu → Multiplayer mode → optionally pick a specific dog
 * → confirm → MP options screen.
 *
 * Cycle 24 Phase 4: optional `pickDog` arg drives the dog-selection step
 * so two-tab specs can assert each player's dogType propagates correctly.
 */
export async function navigateToMultiplayer(
  page: Page,
  opts: { pickDog?: 'jep' | 'pip' | 'sally' | 'shiloh' | 'george_washington' } = {},
): Promise<void> {
  // Main menu has the "Multiplayer" mode button. MenuOption renders the
  // button with label + description as concatenated text content, so the
  // accessible name is "Multiplayer Compete or cooperate online" (label +
  // description). Match on the prefix "Multiplayer ".
  const mpButton = page.getByRole('button', { name: /^Multiplayer\b/i });
  await expect(mpButton).toBeVisible({ timeout: 60_000 });
  await mpButton.dispatchEvent('click');

  // Dog selection screen.
  const confirm = page.getByRole('button', { name: /Confirm Selection/i });
  await expect(confirm).toBeVisible({ timeout: 30_000 });

  if (opts.pickDog) {
    const namePattern = DOG_DISPLAY_NAMES[opts.pickDog];
    if (!namePattern) throw new Error(`navigateToMultiplayer: unknown dog ${opts.pickDog}`);
    // The DogSelection card button has the dog name in an inner <h3>. The
    // accessible name of the parent <button> picks that up. Stat labels
    // (Speed/Stamina/Control) are inside StatBar, also inside the button,
    // so the accessible name is e.g. "Pip Australian Shepherd Speed Stamina
    // Control ...". Anchor on the dog name at the start of the name to
    // avoid matching another card's description.
    const card = page.getByRole('button', { name: namePattern });
    await expect(card.first()).toBeVisible({ timeout: 15_000 });
    await card.first().dispatchEvent('click');
  }

  await confirm.dispatchEvent('click');

  // MultiplayerOptions screen has the Create Room / Join Room / Quick Match
  // panel. Wait for "Create Room" to appear.
  const createRoom = page.getByRole('button', { name: /Create Room/i }).first();
  await expect(createRoom).toBeVisible({ timeout: 60_000 });
}

export type CreateRoomOpts = {
  /** Sheep count value to pick from dropdown (200, 250, 500, 1000, 3000, 5000). Default 200. */
  sheepCount?: number;
  /** Game mode value (cooperative | competitive | timed). Default cooperative. */
  gameMode?: 'cooperative' | 'competitive' | 'timed';
  /** maxPlayers value (2, 3, 4). Default 4. */
  maxPlayers?: number;
};

/**
 * Drive RoomCreation form. Assumes navigateToMultiplayer() already landed on
 * the Multiplayer options screen. Returns the room code once the lobby
 * screen renders.
 */
export async function createRoomAsHost(page: Page, opts: CreateRoomOpts = {}): Promise<string> {
  const createMenuItem = page.getByRole('button', { name: /Create Room/i }).first();
  await createMenuItem.dispatchEvent('click');

  // RoomCreation form selects.
  if (opts.maxPlayers != null) {
    const select = page.locator('select').nth(0);
    await select.selectOption(String(opts.maxPlayers));
  }
  if (opts.gameMode) {
    const select = page.locator('select').nth(1);
    await select.selectOption(opts.gameMode);
  }
  if (opts.sheepCount != null) {
    const select = page.locator('select').nth(2);
    await select.selectOption(String(opts.sheepCount));
  }

  // Submit "Create Room →".
  const submit = page.getByRole('button', { name: /Create Room\s*→/i });
  await expect(submit).toBeVisible({ timeout: 5_000 });
  await submit.dispatchEvent('click');

  // Lobby renders once the WS handshake is up. Wait for the probe to expose
  // a roomCode + state==='waiting'.
  await waitForRoomState(page, { roomState: 'waiting', timeoutMs: 60_000 });
  const probe = await getMpProbe(page);
  if (!probe.roomCode) throw new Error('createRoomAsHost: no roomCode after lobby render');
  return probe.roomCode;
}

/**
 * Drive RoomJoining form (manual code entry). Assumes the page is on the
 * Multiplayer options screen.
 */
export async function joinRoomByCode(page: Page, code: string): Promise<void> {
  // MenuOption button "Join Room Enter a room code" — anchor on the start
  // of the label only.
  const joinMenuItem = page.getByRole('button', { name: /^Join Room\b/i }).first();
  await joinMenuItem.dispatchEvent('click');

  // RoomJoining input + Join button. The input has a `transition: all 0.3s`
  // CSS rule that makes Playwright's fill() actionability check unstable
  // (each focus retriggers the transition). Use `force: true` to bypass
  // the actionability wait — semantically the field IS interactive, the
  // animation is just visual.
  const input = page.locator('input[type="text"]').first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(code.toUpperCase(), { force: true });

  const join = page.getByRole('button', { name: /Join Room\s*→/i });
  await join.dispatchEvent('click');

  await waitForRoomState(page, { roomState: 'waiting', timeoutMs: 60_000, expectedCode: code.toUpperCase() });
}

/**
 * Boot directly via invite-hash URL. App.js useEffect parses #/r/CODE,
 * stripts the hash, and routes to the joinRoom screen with the code
 * pre-filled. The user still has to click Join.
 */
export async function bootViaInvite(page: Page, code: string, opts: { extraQuery?: string } = {}): Promise<void> {
  await bootApp(page, { ...opts, hash: `/r/${code.toUpperCase()}` });

  // The join-room screen renders with the code pre-filled. Click Join.
  const join = page.getByRole('button', { name: /Join Room\s*→/i });
  await expect(join).toBeVisible({ timeout: 15_000 });
  await join.dispatchEvent('click');

  await waitForRoomState(page, { roomState: 'waiting', timeoutMs: 60_000, expectedCode: code.toUpperCase() });
}

export async function leaveLobby(page: Page): Promise<void> {
  const leave = page.getByRole('button', { name: /Leave Room/i });
  await expect(leave).toBeVisible({ timeout: 5_000 });
  await leave.dispatchEvent('click');
}

export async function getMpProbe(page: Page): Promise<MpProbe> {
  const probe = await page.evaluate(() => {
    const fn = (window as any).__sdsMpProbe;
    return typeof fn === 'function' ? fn() : null;
  });
  if (!probe) throw new Error('window.__sdsMpProbe not installed (forgot ?mpProbe=1?)');
  return probe as MpProbe;
}

export type WaitForOpts = {
  roomState?: MpProbe['roomState'];
  expectedCode?: string;
  minPlayers?: number;
  timeoutMs?: number;
};

export async function waitForRoomState(page: Page, opts: WaitForOpts = {}): Promise<MpProbe> {
  const timeout = opts.timeoutMs ?? 15_000;
  let last: MpProbe | null = null;
  await expect(async () => {
    last = await getMpProbe(page);
    if (opts.roomState !== undefined) expect(last.roomState).toBe(opts.roomState);
    if (opts.expectedCode) expect(last.roomCode).toBe(opts.expectedCode.toUpperCase());
    if (opts.minPlayers != null) expect(last.playerCount).toBeGreaterThanOrEqual(opts.minPlayers);
  }).toPass({ timeout });
  return last!;
}

/**
 * Open a fresh browser context, seed a unique identity, install the probe,
 * and run a callback against the new page. Auto-closes the context after.
 */
export async function withMpContext<T>(
  browser: import('@playwright/test').Browser,
  label: string,
  body: (ctx: BrowserContext, page: Page, identity: Identity) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext();
  const identity = makeIdentity(label);
  await seedIdentity(context, identity);
  const page = await context.newPage();
  try {
    return await body(context, page, identity);
  } finally {
    await context.close();
  }
}
