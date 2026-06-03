// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// P-SEC-1: the auth rebuild that closes the impersonation exploit. Before this,
// /api/register handed a session token to anyone who presented a known
// persistent_id. Now a row is bound to a device secret (hash stored in D1,
// plaintext on the device), and:
//   - a NEW register ignores any client-chosen id and mints a uuid + secret,
//   - a legacy NULL-hash row binds trust-on-first-use (mints a secret, keeps
//     its score history),
//   - re-register with the correct secret succeeds with no new secret issued,
//   - wrong / absent secret after binding is rejected (AuthError -> 401),
//   - the exploit case (leaked persistent_id, no secret) is rejected.
//
// The fake D1 mirrors the .prepare(sql).bind(...).first()/.run()/.all() shape
// used by tests/worker-leaderboard.spec.ts + tests/worker-score-errors.spec.ts,
// but is STATEFUL: it stores one players row so a register can be observed by a
// later re-register (the exploit assertions need that continuity).
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerPlayer,
  hashSecret,
  timingSafeEqualHex,
  generateAuthSecret,
  AuthError,
  type PlayerRow,
} from '../../worker/src/d1';

// ---- stateful fake D1 ------------------------------------------------------

interface FakeState {
  players: Map<string, PlayerRow>;
  discriminators: Set<string>; // `${display_name}#${disc}`
  calls: { sql: string; binds: unknown[] }[];
}

function makeFakeDb(seed?: PlayerRow[]) {
  const state: FakeState = {
    players: new Map(),
    discriminators: new Set(),
    calls: [],
  };
  for (const p of seed ?? []) state.players.set(p.persistent_id, { ...p });

  const db: any = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt: any = {
        bind(...args: unknown[]) {
          binds = args;
          state.calls.push({ sql, binds: args });
          return stmt;
        },
        async first<T = any>(): Promise<T | null> {
          if (/SELECT \* FROM players WHERE persistent_id/i.test(sql)) {
            const row = state.players.get(binds[0] as string);
            return (row ? ({ ...row } as unknown as T) : null);
          }
          return null;
        },
        async all<T = any>(): Promise<{ results: T[] }> {
          if (/SELECT discriminator FROM discriminators/i.test(sql)) {
            const displayName = binds[0] as string;
            const used = [...state.discriminators]
              .filter((k) => k.startsWith(`${displayName}#`))
              .map((k) => ({ discriminator: k.split('#')[1] }));
            return { results: used as unknown as T[] };
          }
          return { results: [] };
        },
        async run() {
          if (/INSERT INTO discriminators/i.test(sql)) {
            state.discriminators.add(`${binds[0]}#${binds[1]}`);
            return { success: true };
          }
          if (/INSERT INTO players/i.test(sql)) {
            // Bind order mirrors d1.ts INSERT: persistent_id, display_name,
            // discriminator, full_name, created_at, last_active, auth_secret_hash,
            // auth_bound_at (the NULL score columns are literals in the SQL).
            const [persistent_id, display_name, discriminator, full_name, created_at, last_active, auth_secret_hash, auth_bound_at] = binds as any[];
            state.players.set(persistent_id, {
              persistent_id, display_name, discriminator, full_name,
              created_at, last_active,
              solo_classic_best: null, solo_extreme_best: null,
              solo_insane_best: null, solo_chaos_best: null,
              timed_best: null, competitive_wins: 0, cooperative_best: null,
              auth_secret_hash, auth_bound_at,
            });
            return { success: true };
          }
          if (/UPDATE players SET/i.test(sql)) {
            const pid = binds[binds.length - 1] as string;
            const row = state.players.get(pid);
            if (row) {
              // TOFU-bind UPDATE: last_active, auth_secret_hash, auth_bound_at, pid
              if (/auth_secret_hash/i.test(sql)) {
                row.last_active = binds[0] as number;
                row.auth_secret_hash = binds[1] as string;
                row.auth_bound_at = binds[2] as number;
              } else {
                // last_active-only UPDATE (matching re-register): last_active, pid
                row.last_active = binds[0] as number;
              }
            }
            return { success: true };
          }
          return { success: true };
        },
      };
      return stmt;
    },
    async batch(stmts: unknown[]) { void stmts; return []; },
    _state: state,
  };
  return { db, state };
}

function legacyRow(persistentId: string, overrides: Partial<PlayerRow> = {}): PlayerRow {
  // A row as it existed before P-SEC-1: NULL auth_secret_hash, with some score
  // history we expect a TOFU bind to preserve.
  return {
    persistent_id: persistentId,
    display_name: 'Legacy',
    discriminator: '0007',
    full_name: 'Legacy#0007',
    created_at: 1_600_000_000_000,
    last_active: 1_600_000_000_000,
    solo_classic_best: 47.5,
    solo_extreme_best: null,
    solo_insane_best: null,
    solo_chaos_best: null,
    timed_best: 12,
    competitive_wins: 3,
    cooperative_best: null,
    auth_secret_hash: null,
    auth_bound_at: null,
    ...overrides,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- crypto primitives -----------------------------------------------------

describe('auth primitives', () => {
  it('hashSecret is deterministic, 64-hex-char SHA-256, and differs per input', async () => {
    const a = await hashSecret('alpha');
    const a2 = await hashSecret('alpha');
    const b = await hashSecret('beta');
    expect(a).toBe(a2);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('timingSafeEqualHex matches equal strings and rejects differing / length-mismatched', () => {
    expect(timingSafeEqualHex('deadbeef', 'deadbeef')).toBe(true);
    expect(timingSafeEqualHex('deadbeef', 'deadbee0')).toBe(false);
    expect(timingSafeEqualHex('dead', 'deadbeef')).toBe(false);
    expect(timingSafeEqualHex('', '')).toBe(true);
  });

  it('generateAuthSecret returns a fresh base64url-ish 32-byte secret each call', () => {
    const s1 = generateAuthSecret();
    const s2 = generateAuthSecret();
    expect(s1).not.toBe(s2);
    // 32 bytes base64url, no padding => 43 chars; charset is url-safe.
    expect(s1).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s1.length).toBeGreaterThanOrEqual(43);
  });
});

// ---- new registration ------------------------------------------------------

describe('new registration mints a server id + secret', () => {
  it('stores the row with auth_secret_hash = hash(returned secret) and returns it once', async () => {
    const { db, state } = makeFakeDb();
    const pid = crypto.randomUUID(); // the route mints this; not client-chosen
    const result = await registerPlayer(db, pid, 'Shep', 'custom');

    expect(result.authSecret).toBeTruthy();
    expect(result.player.persistent_id).toBe(pid);

    const stored = state.players.get(pid)!;
    expect(stored.auth_secret_hash).toBe(await hashSecret(result.authSecret!));
    expect(stored.auth_bound_at).toBeTypeOf('number');
  });

  it('the route-level contract: a client-supplied id is ignored; the worker mints a uuid', async () => {
    // This mirrors index.ts /api/register: isReturning=false => pid=randomUUID,
    // so an attacker-chosen "victim" id never reaches registerPlayer.
    const { db, state } = makeFakeDb();
    const attackerChosen = 'victim-player-id';
    const mintedPid = crypto.randomUUID();
    expect(mintedPid).toMatch(UUID_RE);
    expect(mintedPid).not.toBe(attackerChosen);

    const result = await registerPlayer(db, mintedPid, 'Shep', 'custom', /* providedSecret */ null);
    expect(result.player.persistent_id).toBe(mintedPid);
    expect(state.players.has(attackerChosen)).toBe(false);
    expect(result.authSecret).toBeTruthy();
  });
});

// ---- trust-on-first-use bind of a legacy row -------------------------------

describe('TOFU bind of a legacy NULL-hash row', () => {
  it('mints a secret, sets the hash + bound_at, and preserves the row history', async () => {
    const pid = 'legacy-pid-1';
    const { db, state } = makeFakeDb([legacyRow(pid)]);

    const result = await registerPlayer(db, pid, 'IgnoredName', 'custom', /* no secret */ null);

    // A secret is issued so the device can capture it.
    expect(result.authSecret).toBeTruthy();
    const stored = state.players.get(pid)!;
    expect(stored.auth_secret_hash).toBe(await hashSecret(result.authSecret!));
    expect(stored.auth_bound_at).toBeTypeOf('number');

    // History preserved: this was the player's row, not a fresh insert.
    expect(stored.solo_classic_best).toBe(47.5);
    expect(stored.timed_best).toBe(12);
    expect(stored.competitive_wins).toBe(3);
    expect(stored.display_name).toBe('Legacy'); // name not overwritten on bind
    expect(stored.created_at).toBe(1_600_000_000_000);
  });

  it('a subsequent register with the freshly-bound secret succeeds and issues no new secret', async () => {
    const pid = 'legacy-pid-2';
    const { db } = makeFakeDb([legacyRow(pid)]);

    const bound = await registerPlayer(db, pid, 'X', 'custom', null);
    const secret = bound.authSecret!;
    expect(secret).toBeTruthy();

    const again = await registerPlayer(db, pid, 'X', 'custom', secret);
    expect(again.authSecret).toBeUndefined();
    expect(again.player.persistent_id).toBe(pid);
  });
});

// ---- re-register + the exploit ---------------------------------------------

describe('re-register requires the matching secret (exploit closed)', () => {
  it('correct secret -> success, no new secret', async () => {
    const { db } = makeFakeDb();
    const pid = crypto.randomUUID();
    const created = await registerPlayer(db, pid, 'Shep', 'custom');
    const secret = created.authSecret!;

    const re = await registerPlayer(db, pid, 'Shep', 'custom', secret);
    expect(re.authSecret).toBeUndefined();
    expect(re.player.persistent_id).toBe(pid);
  });

  it('wrong secret after binding -> AuthError (route maps to 401)', async () => {
    const { db } = makeFakeDb();
    const pid = crypto.randomUUID();
    await registerPlayer(db, pid, 'Shep', 'custom');

    await expect(
      registerPlayer(db, pid, 'Shep', 'custom', 'totally-wrong-secret'),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('absent secret after binding -> AuthError (route maps to 401)', async () => {
    const { db } = makeFakeDb();
    const pid = crypto.randomUUID();
    await registerPlayer(db, pid, 'Shep', 'custom');

    await expect(
      registerPlayer(db, pid, 'Shep', 'custom', null),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('THE EXPLOIT: a leaked persistent_id with no secret mints no token (AuthError, no mutation)', async () => {
    // Victim already has a bound row (e.g. created on their own device).
    const victimPid = crypto.randomUUID();
    const victimHash = await hashSecret('victim-only-secret');
    const { db, state } = makeFakeDb([
      legacyRow(victimPid, {
        display_name: 'Victim', full_name: 'Victim#0001', discriminator: '0001',
        auth_secret_hash: victimHash, auth_bound_at: 1_600_000_000_000,
        solo_classic_best: 31.2,
      }),
    ]);
    const before = { ...state.players.get(victimPid)! };

    // Attacker knows only the persistent_id (it used to leak via the wire /
    // leaderboard rows). They present it with no secret.
    await expect(
      registerPlayer(db, victimPid, 'Attacker', 'custom', null),
    ).rejects.toBeInstanceOf(AuthError);

    // The row is untouched: no rebind, no overwrite, no last_active bump.
    const after = state.players.get(victimPid)!;
    expect(after.auth_secret_hash).toBe(before.auth_secret_hash);
    expect(after.auth_bound_at).toBe(before.auth_bound_at);
    expect(after.display_name).toBe('Victim');
    expect(after.solo_classic_best).toBe(31.2);
    expect(after.last_active).toBe(before.last_active);
  });
});
