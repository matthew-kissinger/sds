// SPDX-License-Identifier: AGPL-3.0-or-later
// Use the working saved OAuth login without changing workstation environment.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const env = { ...process.env }; delete env.CLOUDFLARE_API_TOKEN;
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)), ...process.argv.slice(2)],
  { env, stdio: 'inherit', windowsHide: true });
child.on('exit', code => { process.exitCode = code ?? 1; });
