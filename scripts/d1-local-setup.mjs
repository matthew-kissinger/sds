// Apply every worker/migrations/*.sql to the LOCAL D1, in sequence order.
//
// Intended for a fresh local D1: `wrangler d1 execute` has no IF-NOT-EXISTS
// guard for CREATE TABLE / ADD COLUMN, so re-running against an already-populated
// local DB will error. Delete worker/.wrangler/state/v3/d1 to reset, then re-run.
//
// Remote migrations are NOT applied here. They are applied automatically on
// deploy by the `migrate` job in .github/workflows/deploy.yml (which runs
// `wrangler d1 execute --remote` for each migration file newly added in a push).
//
// Used by `npm run dev:setup` and by the CI perf jobs so the local-migration
// list lives in exactly one place (the migrations dir itself), not a hand-kept
// chain that drifts every time a migration is added.

import { readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const workerDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'worker');
const migrationsDir = join(workerDir, 'migrations');

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
  execSync(`npx wrangler d1 execute sds-db --local --file=migrations/${file}`, {
    cwd: workerDir,
    stdio: 'inherit',
  });
}
console.log('Local D1 migrations applied.');
