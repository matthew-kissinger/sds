---
description: Run the project validation suite — tests, build, last-deploy check. Terse PASS/FAIL output.
argument-hint: [quick|full]
---

Run validation and report concisely.

Mode from `$1`:
- `quick` (default) — tests + build + last-deploy state
- `full` — tests + build + last-deploy + live-site smoke

## Steps (parallel where possible)

1. `npm test 2>&1 | tail -10` — vitest suite
2. `npm run build 2>&1 | tail -10` — production build
3. `gh run list --limit 1 --json conclusion,headBranch,displayTitle` — last deploy
4. `full` only: `curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://sheepdogsim.com/` — live-site smoke

## Report shape

Print exactly this shape, substituting actual values:

```
tests:   PASS (74/74) | FAIL (X failing — first: <file>:<line>)
build:   PASS | FAIL (<first error line>)
deploy:  <conclusion> on <branch> — <displayTitle>
[smoke:  <http code> in <seconds>]   # only on full

Verdict: ship | hold (<one-line reason if hold>)
```

## Don't

- Don't invent numbers. If a command times out, say so explicitly.
- Don't paste full vitest output — `tail -10` and the verdict line are enough.
- Don't auto-fix failures. This command reports state; fixing is a separate decision.
