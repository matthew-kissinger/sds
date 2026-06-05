// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Real-SQLite D1 test harness (Cycle 57 P8).
//
// The leaderboard worker was historically tested with canned-row mocks:
// `prepare(sql).bind(...).all()` returned a fixed array regardless of the SQL.
// That can verify a function's JS branches, but it CANNOT catch the bug class
// that hid a real 12-minute run from the board — because the load-bearing
// logic lives in the SQL itself (`WHERE s.score_anomalies IS NULL`, the
// `GROUP BY` aggregation, the MIN/MAX direction). A mock that ignores the SQL
// is blind to exactly the thing that broke.
//
// This harness wraps Node's built-in `node:sqlite` (DatabaseSync, ships in
// Node >= 22.5) in a D1Database-shaped adapter and applies the REAL committed
// migrations. The same `registerPlayer` / `submitScore` / `getLeaderboard` /
// `renamePlayer` functions the production Worker runs execute against a real
// SQLite engine, so the store→read loop is exercised for real and stays
// deterministic (in-memory, fixed inputs, no network).
//
// Scope: the schema migrations only. Data-backfill migrations
// (0002_backfill_droplet, 0005_score_submissions_backfill) and the unrelated
// 0004_events table are intentionally skipped so a fresh test DB starts empty —
// a backfilled legacy row would pollute leaderboard assertions. If a future
// migration changes players / score_submissions / discriminators / score_errors,
// add it to MIGRATIONS below.

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);

// Guard the import so a CI runner on an older Node degrades to a skipped suite
// (see describe.skipIf in the spec) instead of a hard red.
let DatabaseSync: any = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  /* node:sqlite unavailable (Node < 22.5) — sqliteAvailable stays false */
}

export const sqliteAvailable = typeof DatabaseSync === 'function';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../../../worker/migrations');

// Ordered, schema-only. The two backfills and 0004_events are deliberately
// excluded (see file header).
const MIGRATIONS = [
  '0001_init.sql',
  '0002_mode_matrix.sql',
  '0003_score_anomalies.sql',
  '0006_score_errors.sql',
  '0007_player_auth_secret.sql',
];

/** A bound statement: the SQL plus the positional params from `.bind(...)`. */
interface Bound {
  sql: string;
  params: unknown[];
}

/**
 * Build a D1Database-shaped facade over a node:sqlite DatabaseSync instance.
 * Implements exactly the surface worker/src/d1.ts touches:
 *   db.prepare(sql).bind(...args).first<T>() | .all<T>() | .run()
 *   db.batch(stmts)
 * Each `.first/.all/.run` re-prepares against the live engine, so the real
 * SQL (filters, GROUP BY, aggregates) runs — nothing is pattern-matched.
 */
function makeD1(sqlite: any) {
  function execute(b: Bound, kind: 'run' | 'all' | 'first') {
    const stmt = sqlite.prepare(b.sql);
    if (kind === 'all') return { results: stmt.all(...b.params) };
    if (kind === 'first') {
      const row = stmt.get(...b.params);
      return row ?? null;
    }
    const info = stmt.run(...b.params);
    return {
      success: true,
      meta: {
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
      },
    };
  }

  const db: any = {
    prepare(sql: string) {
      const bound: Bound = { sql, params: [] };
      const stmt: any = {
        bind(...args: unknown[]) {
          bound.params = args;
          return stmt;
        },
        async first<T = any>(): Promise<T | null> {
          return execute(bound, 'first') as T | null;
        },
        async all<T = any>(): Promise<{ results: T[] }> {
          return execute(bound, 'all') as { results: T[] };
        },
        async run() {
          return execute(bound, 'run');
        },
        // Used by batch(): execute this already-bound statement.
        __exec: () => execute(bound, 'run'),
      };
      return stmt;
    },
    // D1 batch is atomic; mirror that with a transaction so a mid-batch failure
    // rolls back the audit-row + materialized-best pair together.
    async batch(stmts: any[]) {
      sqlite.exec('BEGIN');
      try {
        const out = stmts.map((s) => s.__exec());
        sqlite.exec('COMMIT');
        return out;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
    // Test-only escape hatch for direct assertions on stored rows.
    __raw: sqlite,
  };
  return db;
}

export interface TestD1 {
  /** D1Database-shaped facade passed to worker/src/d1.ts functions. */
  db: any;
  /** Read raw rows for assertions the public API does not expose. */
  query<T = any>(sql: string, ...params: unknown[]): T[];
  /** Release the in-memory engine. */
  close(): void;
}

/**
 * Create a fresh in-memory D1 with the real schema applied. Throws if
 * node:sqlite is unavailable — gate call sites with `sqliteAvailable`.
 */
export function createTestD1(): TestD1 {
  if (!sqliteAvailable) {
    throw new Error('node:sqlite unavailable (requires Node >= 22.5)');
  }
  const sqlite = new DatabaseSync(':memory:');
  for (const file of MIGRATIONS) {
    sqlite.exec(readFileSync(resolve(migrationsDir, file), 'utf8'));
  }
  return {
    db: makeD1(sqlite),
    query<T = any>(sql: string, ...params: unknown[]): T[] {
      return sqlite.prepare(sql).all(...params) as T[];
    },
    close() {
      sqlite.close();
    },
  };
}
