// P2-MIGRATE-STATE: state-tracked D1 migration runner for the deploy pipeline.
//
// Replaces the deploy.yml migrate job's `git diff --diff-filter=A` bash block.
// Migration state lives in the sds_migration_state table (created/seeded by
// worker/migrations/0010_migration_state.sql), which the deploy controls. The
// built-in d1_migrations table is out of sync from early manual applies of
// 0007-0009, so `wrangler d1 migrations apply` is still deliberately avoided.
//
// Flow per run:
//   1. If sds_migration_state does not exist yet (bootstrap), fall back to the
//      legacy behavior for exactly this run:
//        - BOOTSTRAP_MODE=diff (default, production): apply only files newly
//          ADDED in the BEFORE..AFTER push range. The deploy that ships 0010
//          applies it through this path, which creates + seeds the table.
//        - BOOTSTRAP_MODE=full (preview): apply the FULL migration set in
//          sequence order (a fresh preview D1 has no schema at all).
//      After the bootstrap applies, any file applied in this run is recorded
//      as 'applied' (INSERT OR IGNORE; the 0010 seeds already cover history).
//   2. Otherwise read the state table:
//        - Any row with status='failed' aborts the run. A failed row means a
//          previous apply crashed mid-file; the operator must resolve manually
//          (inspect the remote schema, finish or roll back the partial DDL,
//          then UPDATE the row to 'applied' or DELETE it).
//        - pending = migration files not recorded as applied, in sequence
//          (lexicographic) order.
//        - For each pending file: INSERT its id with status='failed' BEFORE
//          applying, apply the file, then UPDATE to 'applied'. A crash between
//          insert and update leaves the 'failed' marker for step 2 above.
//
// Environment:
//   D1_TARGET        'production' (default) or 'preview'. Preview targets the
//                    sds-db-preview binding via `--env preview` and hard-asserts
//                    it can never touch the production database id.
//   BOOTSTRAP_MODE   'diff' (default) or 'full'. See bootstrap flow above.
//   BEFORE / AFTER   commit range for diff bootstrap (deploy.yml passes
//                    github.event.before / github.sha).
//   D1_LOCAL=1       run against the local D1 (--local) instead of --remote.
//                    For testing this script; skips remote-only id assertions
//                    that depend on a provisioned preview database.
//
// Exit codes: 0 = up to date or applied cleanly; 1 = failure (including a
// detected 'failed' row, which is a refusal, not a skip).

import { readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = join(repoRoot, 'worker');
const migrationsDir = join(workerDir, 'migrations');

const STATE_TABLE = 'sds_migration_state';
const PROD_DB_NAME = 'sds-db';
const PROD_DB_ID = '513aa937-e60a-4fb6-b499-9f3814149e88';
const PREVIEW_DB_NAME = 'sds-db-preview';
const PREVIEW_PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000';

const target = process.env.D1_TARGET || 'production';
const bootstrapMode = process.env.BOOTSTRAP_MODE || (target === 'preview' ? 'full' : 'diff');
const isLocal = process.env.D1_LOCAL === '1';
const locationFlag = isLocal ? '--local' : '--remote';

if (target !== 'production' && target !== 'preview') {
  fail(`Unknown D1_TARGET '${target}' (expected 'production' or 'preview').`);
}
if (bootstrapMode !== 'diff' && bootstrapMode !== 'full') {
  fail(`Unknown BOOTSTRAP_MODE '${bootstrapMode}' (expected 'diff' or 'full').`);
}

const dbName = target === 'preview' ? PREVIEW_DB_NAME : PROD_DB_NAME;
const envArgs = target === 'preview' ? ' --env preview' : '';

function fail(msg) {
  console.error(`d1-migrate-remote: ${msg}`);
  process.exit(1);
}

// Guard rail: a preview run must be provably pointed away from production.
function assertPreviewSafety() {
  if (dbName === PROD_DB_NAME) {
    fail('Preview target resolved to the production database name. Refusing.');
  }
  const toml = readFileSync(join(workerDir, 'wrangler.toml'), 'utf8');
  const previewSection = toml.split(/\[env\.preview\]/)[1];
  if (!previewSection) {
    fail('wrangler.toml has no [env.preview] section. Refusing preview migration.');
  }
  const idMatch = previewSection.match(/database_id\s*=\s*"([^"]+)"/);
  const previewId = idMatch && idMatch[1];
  if (!previewId) {
    fail('No database_id found under [env.preview] in wrangler.toml. Refusing.');
  }
  if (previewId === PROD_DB_ID) {
    fail('The [env.preview] database_id equals the PRODUCTION database id. Refusing.');
  }
  if (!isLocal && previewId === PREVIEW_PLACEHOLDER_ID) {
    fail(
      'The [env.preview] database_id is still the placeholder. The workflow must ' +
      'substitute the real preview id (repo variable CF_PREVIEW_D1_ID) before this runs.'
    );
  }
}

function wrangler(args) {
  return execSync(`npx wrangler ${args}`, {
    cwd: workerDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

// Execute a SQL command and return the parsed `results` array.
function sql(command) {
  if (command.includes('"')) fail(`SQL command may not contain double quotes: ${command}`);
  const out = wrangler(`d1 execute ${dbName}${envArgs} ${locationFlag} --json --yes --command "${command}"`);
  const start = out.indexOf('[');
  if (start === -1) fail(`Unparseable wrangler --json output:\n${out}`);
  const parsed = JSON.parse(out.slice(start));
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!first || first.success === false) fail(`SQL command failed: ${command}`);
  return first.results || [];
}

function applyFile(file) {
  console.log(`>> Applying ${file} to ${isLocal ? 'LOCAL' : 'remote'} ${dbName}`);
  wrangler(`d1 execute ${dbName}${envArgs} ${locationFlag} --file=migrations/${file} --yes`);
}

function assertSafeId(id) {
  if (!/^[\w.-]+$/.test(id)) fail(`Unsafe migration id '${id}'.`);
}

function stateTableExists() {
  const rows = sql(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${STATE_TABLE}'`
  );
  return rows.length > 0;
}

function recordApplied(id) {
  assertSafeId(id);
  const now = new Date().toISOString();
  sql(
    `INSERT OR IGNORE INTO ${STATE_TABLE} (id, applied_at, status) VALUES ('${id}', '${now}', 'applied')`
  );
}

function listMigrationFiles() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexicographic == sequence order (0001_, 0002_, ...)
  if (files.length === 0) fail('No migration files found in worker/migrations.');
  for (const f of files) assertSafeId(f);
  return files;
}

function diffAddedFiles() {
  const ZERO = '0000000000000000000000000000000000000000';
  const before = process.env.BEFORE || '';
  const after = process.env.AFTER || 'HEAD';
  const base = !before || before === ZERO ? `${after}~1` : before;
  console.log(`Bootstrap (diff): scanning ${base}..${after} for newly added worker/migrations/*.sql`);
  const out = execSync(
    `git diff --name-only --diff-filter=A ${base} ${after} -- "worker/migrations/*.sql"`,
    { cwd: repoRoot, encoding: 'utf8' }
  );
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((p) => p.replace(/^worker\/migrations\//, ''))
    .sort();
}

function main() {
  if (target === 'preview') assertPreviewSafety();

  const files = listMigrationFiles();
  let diffAdded = null;
  if (target === 'production' && bootstrapMode === 'diff') {
    diffAdded = diffAddedFiles().filter((f) => files.includes(f));
    if (diffAdded.length === 0) {
      console.log('Production diff mode: no newly added migrations in this push. Skipping remote D1 check.');
      return;
    }
  }

  if (!stateTableExists()) {
    // Bootstrap: the deploy that ships the state-table migration itself, or a
    // fresh preview database. Fall back to the legacy behavior for this run.
    const toApply =
      bootstrapMode === 'full' ? files : diffAdded;
    if (toApply.length === 0) {
      console.log('Bootstrap: state table absent and no new migrations in this push. Nothing to do.');
      return;
    }
    console.log(`Bootstrap (${bootstrapMode}): applying ${toApply.length} migration(s) without state tracking.`);
    for (const f of toApply) applyFile(f);
    if (stateTableExists()) {
      // 0010's seeds cover history; record anything applied in this run that
      // postdates the seed list (e.g. a 0011 shipped in the same push as 0010).
      for (const f of toApply) recordApplied(f);
      console.log('Bootstrap complete: state table now live; this run recorded.');
    } else {
      console.log(
        'Bootstrap applied, but the state table still does not exist (the state-table ' +
        'migration has not shipped yet). Next run falls back to diff mode again.'
      );
    }
    return;
  }

  const rows = sql(`SELECT id, status FROM ${STATE_TABLE}`);
  const failed = rows.filter((r) => r.status === 'failed');
  if (failed.length > 0) {
    fail(
      `Found ${failed.length} migration(s) marked 'failed' from a previous half-completed apply: ` +
      failed.map((r) => r.id).join(', ') + '. Refusing to continue. ' +
      'Resolve manually: inspect the remote schema, finish or roll back the partial change, ' +
      `then UPDATE ${STATE_TABLE} SET status='applied' WHERE id='<id>' (or DELETE the row to re-apply).`
    );
  }

  const applied = new Set(rows.map((r) => r.id));
  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log(`All ${files.length} migration(s) already applied to ${dbName}. Nothing to do.`);
    return;
  }

  console.log(`Pending migration(s) for ${dbName}: ${pending.join(', ')}`);
  for (const f of pending) {
    const now = new Date().toISOString();
    // Mark 'failed' BEFORE applying: a crash mid-apply leaves this row, and the
    // next run detects it and refuses to skip.
    sql(
      `INSERT INTO ${STATE_TABLE} (id, applied_at, status) VALUES ('${f}', '${now}', 'failed')`
    );
    applyFile(f);
    sql(
      `UPDATE ${STATE_TABLE} SET status='applied', applied_at='${new Date().toISOString()}' WHERE id='${f}'`
    );
    console.log(`>> ${f} applied and recorded.`);
  }
  console.log(`Applied ${pending.length} migration(s) to ${dbName}.`);
}

main();
