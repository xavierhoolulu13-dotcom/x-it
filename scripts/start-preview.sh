#!/usr/bin/env bash
#
# One-command bootstrap + production preview for X-IT.
#
# Safe to re-run at any time: it installs dependencies when missing, builds when
# there is no production build (or when SKIP_BUILD is unset and sources changed),
# warms the Chromium binary used by browser automation, then serves the app on
# 0.0.0.0 so sandbox/preview proxies can reach it.
#
#   bash scripts/start-preview.sh              # install → build → serve on :3100
#   PORT=3000 FORCE_BUILD=1 bash scripts/start-preview.sh
#   X_IT_DEMO_AUTOLOGIN=true bash scripts/start-preview.sh
#
# Environment (all optional, sensible defaults for a hosted preview):
#   PORT                  listen port                          (default 3100)
#   X_IT_DEMO_AUTOLOGIN   sign visitors straight into the demo  (default true)
#   SANDBOX_BACKEND       auto | docker | local                 (default auto)
#   X_IT_API_TOKEN        bearer token for machine API access   (default unset)
#   FORCE_BUILD=1         rebuild even if .next exists
#   SKIP_INSTALL=1        never run npm ci
#   SKIP_CHROMIUM=1       skip the Chromium warm-up
set -euo pipefail

cd "$(dirname "$0")/.."
PORT="${PORT:-3100}"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
export X_IT_DEMO_AUTOLOGIN="${X_IT_DEMO_AUTOLOGIN:-true}"
export SANDBOX_BACKEND="${SANDBOX_BACKEND:-auto}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

log() { printf '\033[1;36m[x-it]\033[0m %s\n' "$*"; }

# 1. Dependencies ------------------------------------------------------------
if [ ! -d node_modules ] && [ "${SKIP_INSTALL:-0}" != "1" ]; then
  log "installing dependencies (npm ci)…"
  npm ci --prefer-offline --no-audit --no-fund \
    --fetch-retries=8 --fetch-retry-mintimeout=4000 \
    --fetch-retry-maxtimeout=120000 --fetch-timeout=600000 --maxsockets=2
fi

# 2. Production build --------------------------------------------------------
if [ "${FORCE_BUILD:-0}" = "1" ] || [ ! -f .next/BUILD_ID ]; then
  log "building for production…"
  npm run build
fi

# 3. Chromium (browser automation) -------------------------------------------
if [ "${SKIP_CHROMIUM:-0}" != "1" ]; then
  log "resolving Chromium…"
  node scripts/prepare-chromium.mjs >/dev/null 2>&1 || log "Chromium unavailable — browser tools will report an error"
fi

# 4. Serve -------------------------------------------------------------------
log "starting X-IT on http://0.0.0.0:${PORT} (demo auto-login: ${X_IT_DEMO_AUTOLOGIN})"
exec npx next start -p "${PORT}" -H 0.0.0.0
