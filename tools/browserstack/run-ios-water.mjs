import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

function loadDotEnvLocal() {
    if (!existsSync('.env.local')) return;
    const text = readFileSync('.env.local', 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
        if (!match) continue;
        const [, key, rawValue] = match;
        if (process.env[key]) continue;
        process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
}

loadDotEnvLocal();

const missing = ['BROWSERSTACK_USERNAME', 'BROWSERSTACK_ACCESS_KEY']
    .filter((key) => !process.env[key]);
if (missing.length > 0) {
    console.error(`Missing required BrowserStack env vars: ${missing.join(', ')}`);
    process.exit(1);
}

const baseUrl = process.env.IOS_WATER_BASE_URL || 'http://localhost:3000';
const usesLocalBaseUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseUrl);
if (!process.env.BROWSERSTACK_LOCAL && !usesLocalBaseUrl) {
    process.env.BROWSERSTACK_LOCAL = 'false';
}

const command = process.execPath;
const args = [
    'node_modules/browserstack-node-sdk/src/bin/runner.js',
    'playwright',
    'test',
    '--config=playwright.browserstack.config.ts',
    ...process.argv.slice(2),
];

const child = spawn(command, args, {
    stdio: 'inherit',
    env: {
        ...process.env,
        BROWSERSTACK_PROJECT_NAME: process.env.BROWSERSTACK_PROJECT_NAME || 'Sheep Dog Simulator',
        BROWSERSTACK_BUILD_NAME: process.env.BROWSERSTACK_BUILD_NAME || 'cycle-32-ios-water',
    },
});

child.on('exit', (code, signal) => {
    if (signal) {
        console.error(`BrowserStack iOS water canary terminated by ${signal}`);
        process.exit(1);
    }
    process.exit(code ?? 1);
});
