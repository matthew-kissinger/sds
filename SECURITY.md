# Security

## Scope

Sheep Dog Simulator is a browser game with a Cloudflare Workers backend for multiplayer rooms and leaderboards. Reports welcome for:

- Server-side vulnerabilities in `worker/src/` (auth bypass, injection, race conditions, DO state corruption).
- Client-side vulnerabilities that affect other users (stored XSS via share URLs / player names, CSRF against the API).
- Leaderboard manipulation that isn't already gated by the score-bounds check.

Out of scope:

- Self-inflicted XSS that only affects the reporter's own browser.
- Volumetric DoS against the public Worker (Cloudflare already rate-limits).
- Best-practice nits (missing headers, absent SPF/DMARC on the domain — send these as a regular issue).

## Reporting

Use the private contact route listed on [Matthew Kissinger's GitHub profile](https://github.com/matthew-kissinger) with a write-up, a PoC if you have one, and the worker version (`sds-worker` current version is visible in `wrangler deployments list`). Please don't open a public issue for anything that could put other players at risk.

I aim to acknowledge within a few days. The project is a side project and I can't guarantee an SLA, but I will credit reporters in the release notes (or on request, keep the disclosure private).

## Response pattern

- Triage: reproduce, scope impact, decide severity.
- Fix on a private branch; deploy worker / Pages.
- Public commit + advisory once the fix is live.
- Credit reporter unless they request anonymity.
