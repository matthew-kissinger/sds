# sds-worker

Cloudflare Workers backend for Sheep Dog Simulator. Replaces the DigitalOcean droplet + Geckos.io stack with Workers + Durable Objects + D1.

## Prerequisites

Set credentials in `~/.config/mk-agent/env` (already there if you ran Track C1):

```
CLOUDFLARE_API_TOKEN=<your token>
CLOUDFLARE_ACCOUNT_ID=<your account id>
```

Source before running wrangler:

```bash
source ~/.config/mk-agent/env
```

## Local development

```bash
cd worker
npm install
wrangler dev
```

Worker runs at `http://localhost:8787` by default.

## Running tests

```bash
cd worker
npm test
```

Tests use Vitest with node environment. Shared primitive ports are covered in `src/__tests__/shared.test.ts`.

## Deploying

Do not deploy until Track C4. When ready:

```bash
cd worker
wrangler deploy
```

## D1 database setup

Create the database (one-time):

```bash
wrangler d1 create sds-db
```

Copy the returned `database_id` into `wrangler.toml`, replacing the placeholder value.

Run the initial migration:

```bash
# Local (for wrangler dev)
wrangler d1 execute sds-db --file migrations/0001_init.sql

# Remote (production)
wrangler d1 execute sds-db --file migrations/0001_init.sql --remote
```

## JWT secret

Generate a secure 64-character hex string and set it as a Worker secret:

```bash
wrangler secret put JWT_SECRET
```

When prompted, paste your secret. This is used to sign and verify player auth tokens issued by `POST /api/register`.

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/lobbies` | List open public rooms |
| GET | `/api/leaderboard?mode=X&limit=N` | Fetch leaderboard for a mode |
| POST | `/api/register` | Issue a signed JWT for a player |
| POST | `/api/score` | Submit a score (requires Bearer token) |
| GET (WS) | `/r/:code/ws` | WebSocket upgrade to a room |

## Durable Objects

- `RoomDO` - one instance per room code. Manages players, lobby state, and (in Track C2) the authoritative simulation.
- `LobbyDO` - singleton keyed `"global"`. Registry of open public rooms for the lobby list.

## Directory structure

```
worker/
  src/
    index.ts           - Worker router, CORS, auth helpers
    RoomDO.ts          - Room Durable Object stub
    LobbyDO.ts         - Lobby registry Durable Object
    shared/
      Vector2D.ts      - 2D vector math (XZ plane)
      FlockingAlgorithms.ts
      MovementPhysics.ts
      BoundaryCollision.ts
      GameStateValidation.ts
      index.ts         - barrel export
    __tests__/
      shared.test.ts   - Vitest tests for shared primitives
  migrations/
    0001_init.sql      - D1 schema
  wrangler.toml
  package.json
  tsconfig.json
  vitest.config.ts
```
