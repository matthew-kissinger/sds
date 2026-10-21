// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
beforeEach(async () => {
  const { MATCH_DB, MATCH_SCHEMA } = env as unknown as { MATCH_DB: D1Database; MATCH_SCHEMA: string };
  await MATCH_DB.exec(MATCH_SCHEMA.replace(/^\s*--.*$/gm,'').replace(/\r?\n/g,' '));
});
