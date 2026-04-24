# C-retry pre-flight checklist

Run this before starting any C-retry track session. Any "no" answer is a hard stop - do not begin implementation work until the gap is closed.

## 1. Why this exists

Cycle 1 shipped a non-functional Cloudflare cutover in part because the agent executed tracks C1-C4 without any browser-automation MCP active and never noticed it was flying blind (see POSTMORTEM.md section 5.9). This checklist forces tool inventory up front so the same failure cannot recur.

## 2. Required tools - verify each with the given command

| Requirement | Verify with | Pass condition |
|-------------|-------------|----------------|
| Node >=22 | `node --version` | Prints `v22.x.x` or higher |
| npm >=10 | `npm --version` | Prints `10.x.x` or higher |
| wrangler (latest) | `npx wrangler --version` | Prints a version, no install error |
| `@msgpack/msgpack` (inside `worker/`) | `cd worker && node -e "require('@msgpack/msgpack')"` | Exits 0 with no output |
| Playwright CLI | `npx playwright --version` | Prints `Version X.Y.Z` |
| `gh` CLI authed | `gh auth status` | Shows "Logged in to github.com" |
| Cloudflare API token in env | `grep CLOUDFLARE_API_TOKEN ~/.config/mk-agent/env` | Returns a non-empty value |
| MCP browser tool available in session | Look for `claude-in-chrome`, `Claude_Preview`, or `playwright-mcp` in the tool list | At least one is present |

Note: if the worktree has not yet initialized `worker/`, skip the `@msgpack/msgpack` check until after Track C1 scaffolds the directory. Re-run it before any Track C2+ session.

## 3. What to do if a check fails

- Node too old: install Node 22 LTS via nvm (`nvm install 22 && nvm use 22`).
- npm too old: `npm install -g npm@latest`.
- wrangler missing: no install needed - `npx wrangler` fetches on demand. If it fails, `npm install -g wrangler` as fallback.
- `@msgpack/msgpack` missing: `cd worker && npm install @msgpack/msgpack`.
- Playwright missing: `npm install -g playwright && npx playwright install chromium`.
- `gh` not authed: `gh auth login` (interactive) and retry.
- Cloudflare token missing: ask the user to populate `~/.config/mk-agent/env` with `CLOUDFLARE_API_TOKEN=...`. Do not proceed without it.
- No MCP browser tool: stop and ask the user to enable one of `claude-in-chrome`, `Claude_Preview`, or `playwright-mcp` in this session. Do not start the track. This is the POSTMORTEM 5.9 failure mode - it is non-negotiable.

## 4. Context reads required

Before writing any code, confirm each of these has been read in full this session. The checklist is a memory aid - there is no enforcement, just honesty.

- [ ] `AGENT_PLAN.md` Sections 0 through 6
- [ ] `POSTMORTEM.md` (all of it, not just the track-relevant sections)
- [ ] `docs/cycle-1-audit.md`
- [ ] `docs/c-retry/contract.md` (expected after Unit 1 merges)
- [ ] `docs/c-retry/protocol-v2.md` (expected after Unit 2 merges)
- [ ] `docs/c-retry/verification-protocol.md` (expected after Unit 6 merges)

If a file under `docs/c-retry/` does not yet exist because its producing unit has not merged, note that explicitly in the session-start output. Do not proceed on a track that depends on a missing artifact.

## 5. Session-start output template

Post this block at the top of the session transcript, filled in. Replace bracketed placeholders with actual results.

```markdown
## C-retry pre-flight

- Node: [v22.x.x]
- npm: [10.x.x]
- wrangler: [x.y.z]
- `@msgpack/msgpack` in worker/: [ok | n/a - worker not yet scaffolded]
- Playwright: [x.y.z]
- gh auth: [ok - <user>]
- CF token: [present | MISSING - STOP]
- MCP browser tool: [claude-in-chrome | Claude_Preview | playwright-mcp | NONE - STOP]

Reads confirmed:
- AGENT_PLAN.md sections 0-6: [yes]
- POSTMORTEM.md: [yes]
- docs/cycle-1-audit.md: [yes]
- docs/c-retry/contract.md: [yes | expected-after-Unit-1]
- docs/c-retry/protocol-v2.md: [yes | expected-after-Unit-2]
- docs/c-retry/verification-protocol.md: [yes | expected-after-Unit-6]

Playtest plan: I will verify this track end-to-end by [one sentence describing the concrete browser session you will run, e.g. "opening two `Claude_Preview` contexts against `wrangler dev`, creating a room in A, joining from B, starting a game, and reading the leaderboard back" - per POSTMORTEM section 7 last sentence].
```

If any line reads `STOP`, abort and return control to the user.
