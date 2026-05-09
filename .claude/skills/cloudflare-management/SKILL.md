---
description: Audit + adjust Cloudflare zone settings for sheepdogsim.com (or any zone with the same Pages-fronted shape) — Crawler Hints, Speed optimizations, Bot/AI controls, sitemap submission, SSL/TLS posture. Drives the dashboard via Claude in Chrome MCP, or the API via the token in ~/.config/mk-agent/env. Use when the user asks "anything to do in Cloudflare" or after major content changes that benefit from cache/crawler signals.
---

# cloudflare-management

Manage Cloudflare for the sheepdogsim.com zone (zone id `08f6aca2579390fc14be2cfa39bd99ce`, account id `56adffd40534f7fe110fc661a40bbf53`). The zone fronts a Cloudflare Pages site (`sds-frontend`) plus a Worker (`sds-worker`) with Durable Objects + D1.

## When to invoke

- User asks "anything to check in Cloudflare?", "audit the CF settings", "are we missing anything in CF?"
- After a major content shipment that benefits from a fresh crawl (Crawler Hints will auto-IndexNow on content changes once enabled).
- After a new Search Console issue surfaces that points at a CF-side cause (cache, MIME, redirect, header).
- When the user reports a deploy issue that might be CF Bot Fight Mode false-positives, AI Labyrinth poisoning, or Always Online serving stale content.

## How to access

**Two paths, prefer the dashboard for first-time audits, prefer the API for repeated/scriptable changes:**

### Path A: Dashboard via Claude in Chrome MCP (visual audit, settings toggles)

1. **Check browser connection** with `list_connected_browsers`. If empty, ask the user to install + connect the Claude in Chrome extension. Don't fall through to computer-use (Chrome is granted at "read" tier — clicks are blocked).
2. Navigate to `https://dash.cloudflare.com/`. If the user is signed into Google in this Chrome, Cloudflare's Google SSO will auto-resume; you'll land on the account home (`/<account_id>/home/overview`).
3. Watch for the **viewport-scale gotcha** — Chrome reports a 1920×855 viewport but screenshots arrive at 1568×744. Click coordinates are screenshot-based. Multiply DOM coords by `1568/1920 = 0.8167` to get screen coords. Reliable pattern:
   ```javascript
   // via mcp__Claude_in_Chrome__javascript_tool
   const r = element.getBoundingClientRect();
   const scale = 1568/1920;
   ({ screenX: Math.round((r.x+r.width/2)*scale), screenY: Math.round((r.y+r.height/2)*scale) })
   ```
4. Toggle inputs are usually `<input type="checkbox">` hidden behind a styled wrapper. Click the screen-space wrapper position, not the DOM-reported input position (the input may be visually offset from its hit area).
5. Submenus expand by clicking the parent label (e.g. "AI Crawl Control", "Speed", "SSL/TLS"). Wait for the submenu to render before navigating into it.

### Path B: API via the token in `~/.config/mk-agent/env` (read-only, scriptable)

```bash
source ~/.config/mk-agent/env
ZONE=08f6aca2579390fc14be2cfa39bd99ce

# Verify token + scope
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/user/tokens/verify"

# Zone lookup
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=sheepdogsim.com"
```

The current token's scope is **limited** — the verify endpoint returns null and zone-settings reads return 9109 "Unauthorized to access requested resource". Useful for Pages + Workers + R2 + D1 + a few other things, **not** for zone-level toggles. For toggle work, use Path A.

If the user wants API-only future workflows, ask them to mint a new token with `Zone:Settings:Edit` + `Zone:Cache Purge:Edit` scopes.

## Audit checklist (run top to bottom)

### 1. Caching → Configuration (`/<account>/sheepdogsim.com/caching/configuration`)

| Setting | Recommended | Rationale |
|---|---|---|
| **Crawler Hints (Beta)** | **ON** | Auto-pings IndexNow whenever content changes. Free. Headers gives Bing/Yandex/Naver crawl-time discovery without manual sitemap submission. |
| **Always Online™** | **ON** | Wayback Machine fallback when origin is down. Free. Largely irrelevant for a CF Pages site (Pages has its own redundancy) but harmless. |
| Caching Level | **Standard** (default) | Keep. |
| Browser Cache TTL | **4 hours** (default) | Keep. Pages overrides per-route via `_headers`. |
| CSAM Scanning Tool | OFF (default) | N/A. |
| Development Mode | OFF | Only enable temporarily during a debug session; auto-disables in 3h. |
| Enable Query String Sort | OFF (default) | Doesn't apply to our SPA + static pages pattern. |

### 2. Speed → Settings → Protocol Optimization

| Setting | Recommended | Rationale |
|---|---|---|
| HTTP/2 | **ON** (locked default) | Keep. |
| HTTP/2 to Origin | **ON** | Keep. |
| HTTP/3 (with QUIC) | **ON** | Keep. Faster connection setup over UDP. |
| Enhanced HTTP/2 Prioritization | Pro-only | Skip; we're on Free. |
| **0-RTT Connection Resumption** | **ON** | Lower TLS handshake for returning visitors. Replay-attack risk is irrelevant for a public game site. |

### 3. Speed → Settings → Content Optimization

| Setting | Recommended | Rationale |
|---|---|---|
| **Speed Brain (Beta)** | **ON** | Predictive prefetch via Speculation Rules API. Free, no downside for a site with internal navigation. |
| **Cloudflare Fonts (Beta)** | **ON** | Proxies Google Fonts through CF. Privacy + ~one fewer DNS hop. |
| **Early Hints** | **ON** | HTTP 103 hints for browser preconnect/preload. Core Web Vitals improvement. |
| Smart Hints | "Sign up" only (closed beta) | Skip until generally available. |
| **Rocket Loader™** | **OFF** (NEVER enable) | Defers all JS loading via a bootstrap script; **breaks Three.js + React mount** on this project. The current `setTimeout(0)` defer in `js/components/index.js` is the working pattern; Rocket Loader fights it. |
| Automatic Platform Optimization for WordPress | N/A | We're not WordPress. |
| Prefetch URLs | APO-only | N/A. |
| Shared Dictionary Compression (Beta) | OFF for now | Experimental; revisit when out of beta. |

### 4. Speed → Image Optimization

All Pro-only (Polish, Mirage). Skip.

### 5. SSL/TLS → Overview

| Setting | Recommended | Notes |
|---|---|---|
| **Encryption mode** | **Full** (auto-managed) | CF auto-picks. For a Pages-fronted zone, the origin IS Cloudflare's edge, so Full vs Full (Strict) makes no practical difference. Don't downgrade to Flexible (would re-encrypt SSL→origin as plaintext, breaking PWA + service worker behavior). |
| Edge Certificates | **Auto-managed** | CF rotates Let's Encrypt + Google Trust Services certs. No action. |
| Advanced Certificate Manager | Paid upsell | Skip. |

### 6. Security → Overview

CF surfaces **recommendations**. Triage by category — most should be dismissed for an OSS public game:

| Recommendation | Take | Rationale |
|---|---|---|
| Block AI bots from accessing your assets | **Dismiss** | We **want** AI crawlers indexing OSS content (Claude/GPT/Perplexity will cite + answer questions about the game). |
| Detect and mitigate automated traffic with Bot Fight Mode | **Dismiss** | Would soft-block legit MP WebSocket upgrades + mobile traffic with unusual fingerprints. |
| Disrupt unwanted AI crawlers with AI Labyrinth | **Dismiss** | Same reason as the AI bot block — we want the content in AI training. |
| Configure your website's Security.txt | **Adopt** | RFC 9116 standard. Already shipped at `public/.well-known/security.txt` (commit `f0a8822`). |

### 7. Security → AI Crawl Control → Crawlers

This page shows per-bot crawl stats (last 24h). All bots should be in the **Allow** action state. Confirm:

- **Googlebot** is healthy (allowed > 0, unsuccessful = 0).
- **ClaudeBot** + **Claude-User** + **GPTBot** + **PerplexityBot** + **Meta-ExternalAgent** + **Applebot** are allowed (even if 0 requests — keeps the door open).
- **Inactive crawlers** (0 bytes transferred) are fine to leave allowed; blocking them costs nothing but provides no benefit.

If any "Unsuccessful" count > 0 for Googlebot, investigate immediately — that's a deploy + crawl regression.

### 8. Sitemap submission (in Search Console, not CF dashboard)

Not strictly a CF action, but bundle it with the audit since they're related:

- After enabling Crawler Hints, the sitemap auto-pings on content updates. But Google + Bing also need to know the sitemap URL.
- In Search Console (`https://search.google.com/search-console?resource_id=sc-domain:sheepdogsim.com`) → Sitemaps → submit `https://sheepdogsim.com/sitemap.xml` (full URL — domain properties require the full URL, not just `sitemap.xml`).
- Status should flip to **Success** within minutes; "Discovered pages" should match the `<loc>` count in the sitemap.

## Don't-touch list

These are deliberate-OFF settings. Each has an explicit rationale; flipping them would break things or contradict the project's stated values.

| Setting | Why NEVER toggle |
|---|---|
| **Rocket Loader™** | Breaks Three.js + React mount. Documented above. |
| **Bot Fight Mode** | Soft-blocks legit MP WebSocket upgrades + mobile traffic. |
| **AI Labyrinth** | We want OSS content in AI training. PRESSKIT explicitly invites reuse. |
| **Block AI bots (per-bot block)** | Same reason. |
| **SSL/TLS Flexible mode** | Would re-encrypt SSL→origin as plaintext, breaking PWA + service worker behavior. |
| **Email Routing** | Not configured; not used. Don't enable without an email plan. |
| **Zero Trust / Cloudflare Access** | We're an OSS public game; gating routes behind auth would break the value prop. |
| **DNSSEC** *(at registrar level)* | Currently off. Enabling without coordinating with the registrar can break DNS resolution. |

## API operations worth knowing (for future automation)

```bash
# List zones
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=sheepdogsim.com"

# List Pages projects
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects"

# Workers script list
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts"

# Purge entire cache (use only when content is genuinely stale + can't wait for natural eviction)
curl -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/purge_cache"
```

## Reference

- Account ID: `56adffd40534f7fe110fc661a40bbf53` (in `~/.config/mk-agent/env` as `CLOUDFLARE_ACCOUNT_ID`)
- Zone ID: `08f6aca2579390fc14be2cfa39bd99ce` (sheepdogsim.com)
- API token: `~/.config/mk-agent/env` as `CLOUDFLARE_API_TOKEN` (limited scope; mint a new one with `Zone:Settings:Edit` if you need write access)
- D1 DB: `sds-db`, id `513aa937-e60a-4fb6-b499-9f3814149e88` (per `memory/reference_cloudflare.md`)
- Worker URL: `https://sds-worker.matt-m-kissinger.workers.dev`
- Pages project: `sds-frontend`
- See also: [`.claude/rules/multiplayer.md`](../../rules/multiplayer.md) for the Worker/DO/D1 contract; [`memory/reference_cloudflare.md`](file:///c/Users/Mattm/.claude/projects/C--Users-Mattm-X-games-3d-sds/memory/reference_cloudflare.md) for credential locations.
