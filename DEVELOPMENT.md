# Development Guide

## Prerequisites

- Node.js 22+ (check with `node --version`)
- npm 10+
- A Cloudflare account (free plan is fine) if you want to run the multiplayer worker locally against real D1
- A modern browser: Chrome 80+, Firefox 75+, Safari 13+, Edge 80+

## Installation

```bash
# Client deps
npm install

# Worker deps
cd worker && npm install && cd ..
```

---

## Running locally

### Single-player only

No worker needed.

```bash
npm run dev                 # Vite on :3000
```

The client auto-detects `localhost` and skips any multiplayer network calls unless you open the multiplayer UI.

### Full stack (multiplayer-capable)

Two terminals:

```bash
# Terminal 1 — client
npm run dev                 # Vite on :3000

# Terminal 2 — worker (Cloudflare Workers local runtime via wrangler)
cd worker
npx wrangler dev            # Worker on :8787, talks to remote D1 in preview mode
```

The client detects `localhost` in `js/NetworkManager.js` and points at:
- `http://localhost:8787` (HTTP API)
- `ws://localhost:8787`   (WebSocket)

So the two dev servers wire up automatically.

### LAN testing (mobile on same WiFi)

```bash
npm run dev:lan             # Vite bound to 0.0.0.0
```

Vite prints the LAN URL (e.g. `http://192.168.1.100:3000/`). The worker's `wrangler dev` also listens on `0.0.0.0`, so a phone on the same network can hit both. If the client is on LAN but the worker is on `localhost` only, update the `NetworkManager` constructor's URL detection or run `wrangler dev --ip 0.0.0.0`.

---

## Common tasks

### Build for production

```bash
npm run build               # client → dist/
cd worker && npx wrangler deploy
npx wrangler pages deploy dist --project-name=sds-frontend --branch=main
```

### Run the test suites

```bash
npm test                    # all vitest suites
npm run test:integration    # WebSocket two-client harness
npm run test:e2e            # Playwright browser smoke (requires `npx playwright install chromium` once)
```

### Inspect worker behavior

```bash
cd worker
npx wrangler tail           # live logs from the deployed worker
npx wrangler tail --format=json > /tmp/w.log   # for grepping structured fields
```

The synthetic end-to-end client at `sds-test.mjs` (repo root) exercises register → create-room → WS upgrade → startGame → state-frame count against the live worker:

```bash
node sds-test.mjs
```

### Inspect D1

```bash
cd worker
npx wrangler d1 execute sds-db --command "SELECT COUNT(*) FROM players" --remote
npx wrangler d1 execute sds-db --file migrations/0001_init.sql --local   # wipe+reapply schema locally
```

### Apply schema changes

1. Add a new migration file: `worker/migrations/0002_<change>.sql` (use `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` patterns).
2. Apply locally: `npx wrangler d1 execute sds-db --file migrations/0002_<change>.sql --local`
3. When ready: `npx wrangler d1 execute sds-db --file migrations/0002_<change>.sql --remote`

---

## Port reference

| Service | Port | Env var |
|---------|------|---------|
| Vite (client) | 3000 | — |
| Wrangler dev (worker) | 8787 | — |
| Legacy Geckos server | 9208 | `PORT` |

The Geckos server (`server/`) is no longer in the critical path — `sheepdogsim.com` serves from Cloudflare Pages and the multiplayer API lives on a Cloudflare Worker. The directory is kept on disk as a short-term rollback archive until the DigitalOcean droplet is destroyed (~1 week post-cutover). See [docs/cycle-2-todo.md](docs/cycle-2-todo.md).

---

## Troubleshooting

### Port already in use

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS / Linux
lsof -i :3000
kill -9 <PID>
```

### Vite cache is stale

```bash
npm run clean
```

### Worker can't reach D1

`npx wrangler whoami` should show the same account the D1 database lives in. If `npx wrangler d1 list` doesn't show `sds-db`, reauthenticate with `npx wrangler login` or set `CLOUDFLARE_API_TOKEN` in the environment.

### Mobile can't connect on LAN

1. Allow Node through the firewall (Windows Security → Allow an app through firewall).
2. Both devices must be on the same WiFi network (not guest SSID).
3. Disable VPN if active.
4. Run `ipconfig` / `ifconfig` to verify your IP matches what Vite printed.

### `npm run build` fails on `shared/BoundaryCollision.js`

The file uses `let position` (not `const`) in `applyHardBoundaryConstraintsWithMultipleGates` because that function reassigns it when sheep pass through competitive gates. If you see `Cannot assign to "position" because it is a constant`, you have an old checkout; `git pull`.

---

## Environment variables

Client (optional, create `.env.local`):

```env
# Override the worker URL (defaults: localhost:8787 for dev, workers.dev for prod)
# Not currently wired — NetworkManager detects localhost vs hostname directly.
```

Worker secrets (set via `npx wrangler secret put <NAME>`):

- `JWT_SECRET` — 32-byte hex string. Used to sign short-lived session tokens. Generate with `openssl rand -hex 32`.

Repo secrets (GitHub Actions, when CI is wired up):

- `CF_API_TOKEN` — Cloudflare API token with Workers Edit + Pages Edit + D1 Edit
- `CF_ACCOUNT_ID` — `56adffd40534f7fe110fc661a40bbf53` (not secret, shown here for convenience)

---

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full module map. Short version:

```
js/               client (Three.js + React + NetworkManager)
worker/           Cloudflare Worker (RoomDO + LobbyDO + D1)
shared/           deterministic sim (imported by both)
server/           legacy Geckos server (being retired)
tests/            vitest + Playwright
docs/             design + cycle reports
```
