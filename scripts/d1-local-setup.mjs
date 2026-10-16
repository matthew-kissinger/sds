// Apply every worker/migrations/*.sql to the LOCAL D1, in sequence order, in
// the state directory `vite dev` and `vite preview` read (.wrangler/state; see
// persistState in vite.config.ts).
//
// Intended for a fresh local D1: `wrangler d1 execute` has no IF-NOT-EXISTS
// guard for CREATE TABLE / ADD COLUMN, so re-running against an already-populated
// local DB will error. Delete .wrangler/state/v3/d1 to reset, then re-run.
//
// Remote migrations are NOT applied here: scripts/d1-migrate-remote.mjs applies
// them deliberately, and the preview workflow applies them to the preview D1.
// The migration list lives in exactly one place, the migrations directory.

import { readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(repoRoot, 'worker', 'migrations');

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort(); // lexicographic == sequence order (0001_, 0002_, ...)

if (files.length === 0) {
  console.error('No migration files found in worker/migrations.');
  process.exit(1);
}

console.log(`Applying ${files.length} migration(s) to LOCAL sds-db...`);
for (const file of files) {
  console.log(`>> ${file}`);
  execSync(`npx wrangler d1 execute sds-db --local --config wrangler.toml --persist-to .wrangler/state --file=worker/migrations/${file}`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}
console.log('Local D1 migrations applied.');
