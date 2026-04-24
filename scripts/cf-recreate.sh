#!/usr/bin/env bash
# cf-recreate.sh - idempotent Cloudflare resource bootstrap for SDS C-retry
#
# Runs from repo root. Creates the Worker, D1 database, and Pages project if
# they do not already exist. Applies the D1 schema. Does NOT attach the custom
# domain, issue the API token, or touch DNS - those remain manual per the
# runbook at docs/c-retry/cf-recreate.md.
#
# Destructive actions (deletes) are gated behind --force and require --yes.
#
# Usage:
#   bash scripts/cf-recreate.sh                # create-only, safe
#   bash scripts/cf-recreate.sh --dry-run      # print intended commands only
#   bash scripts/cf-recreate.sh --force --yes  # teardown (destructive)
#
# Runs on Linux and Windows Git Bash.

set -euo pipefail

ENV_FILE="${HOME}/.config/mk-agent/env"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER_DIR="${REPO_ROOT}/worker"
MIGRATION_FILE="${WORKER_DIR}/migrations/0001_init.sql"

WORKER_NAME="sds-worker"
D1_NAME="sds-db"
PAGES_NAME="sds-frontend"

DRY_RUN=0
FORCE=0
CONFIRM=0

# ----- arg parsing ---------------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force)   FORCE=1 ;;
    --yes)     CONFIRM=1 ;;
    -h|--help)
      sed -n '1,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ $FORCE -eq 1 && $CONFIRM -ne 1 ]]; then
  echo "ERROR: --force requires --yes to confirm destructive teardown." >&2
  exit 2
fi

# ----- helpers -------------------------------------------------------------
log()  { printf '[cf-recreate] %s\n' "$*"; }
plan() { printf '[cf-recreate] WILL RUN: %s\n' "$*"; }

run() {
  # Print then run. Respects --dry-run.
  plan "$*"
  if [[ $DRY_RUN -eq 1 ]]; then
    return 0
  fi
  eval "$@"
}

# Run a command and swallow the specific "already exists" error pattern.
run_allow_exists() {
  local cmd="$1"
  local pattern="$2"
  plan "$cmd  (treating \"$pattern\" as success)"
  if [[ $DRY_RUN -eq 1 ]]; then
    return 0
  fi
  local out
  if out="$(eval "$cmd" 2>&1)"; then
    printf '%s\n' "$out"
    return 0
  fi
  if printf '%s' "$out" | grep -qi -- "$pattern"; then
    log "resource already exists; treating as success"
    return 0
  fi
  printf '%s\n' "$out" >&2
  return 1
}

# ----- env -----------------------------------------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found at $ENV_FILE" >&2
  echo "Populate it with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID first." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID missing from $ENV_FILE" >&2
  exit 1
fi

log "account ${CLOUDFLARE_ACCOUNT_ID}, token ending in ...${CLOUDFLARE_API_TOKEN: -4}"

# ----- teardown branch -----------------------------------------------------
if [[ $FORCE -eq 1 ]]; then
  log "TEARDOWN mode (--force --yes). Destructive. Droplet must be authoritative."
  log "DNS CNAME flip is manual - do that FIRST in the dashboard."
  run "npx wrangler pages project delete \"$PAGES_NAME\" --yes || true"
  run "npx wrangler delete --name \"$WORKER_NAME\" --yes || true"
  run "npx wrangler d1 delete \"$D1_NAME\" --yes || true"
  log "API token revocation and GitHub secret removal are manual; see runbook section 5."
  exit 0
fi

# ----- create branch -------------------------------------------------------
log "CREATE mode. No destructive commands will run."
log "This script will NOT attach the custom domain or issue API tokens - those are manual."

# D1 database - create
run_allow_exists \
  "npx wrangler d1 create \"$D1_NAME\"" \
  "already exists"

# Schema apply - non-idempotent unless migration uses IF NOT EXISTS.
# Skip if migration file missing so the script stays honest.
if [[ -f "$MIGRATION_FILE" ]]; then
  run_allow_exists \
    "npx wrangler d1 execute \"$D1_NAME\" --file \"$MIGRATION_FILE\" --remote" \
    "already exists"
else
  log "SKIP schema apply: $MIGRATION_FILE not present. Re-run after worker scaffold."
fi

# Worker deploy - needs worker/wrangler.toml in place.
if [[ -f "${WORKER_DIR}/wrangler.toml" ]]; then
  run "(cd \"$WORKER_DIR\" && npx wrangler deploy)"
else
  log "SKIP worker deploy: ${WORKER_DIR}/wrangler.toml not present. Re-run after worker scaffold."
fi

# Pages project - create
run_allow_exists \
  "npx wrangler pages project create \"$PAGES_NAME\" --production-branch main" \
  "already exists"

log "done. Manual follow-ups: custom domain, JWT_SECRET, API token (see runbook)."
